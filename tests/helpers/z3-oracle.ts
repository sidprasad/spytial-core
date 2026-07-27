/**
 * Z3 correctness oracle for cross-checking IConstraintValidator.
 *
 * Compiles an InstanceLayout into Z3 assertions over unbounded integers
 * and checks satisfiability. Uses the z3-solver npm package (WASM build),
 * so no system binary is required.
 */

import { init } from 'z3-solver';
import {
    InstanceLayout,
    LayoutConstraint,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    DisjunctiveConstraint,
    BoundingBoxConstraint,
    GroupBoundaryConstraint,
    isLeftConstraint,
    isTopConstraint,
    isAlignmentConstraint,
    isBoundingBoxConstraint,
    isGroupBoundaryConstraint,
} from '../../src/layout/interfaces';

const MIN_PADDING = 15;

// ─── Z3 types (extracted after init) ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Z3Context: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let z3Ctx: any;
// Full init() result ({ Context, Z3, em, ... }) — kept for diagnostics:
// Z3.get_estimated_alloc_size() reports Z3's own allocator usage inside the
// fixed-size Emscripten heap, which HEAPU8.length cannot show.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let z3Api: any;
let z3Initialized = false;

// ─── Diagnostics ─────────────────────────────────────────────────────────
//
// The WASM build of Z3 has a FIXED 2 GiB heap (no ALLOW_MEMORY_GROWTH).
// When malloc exhausts it, Emscripten abort()s and the whole module is dead:
// the in-flight solver.check() promise never settles (the pthread dies
// without rejecting it) and every later call into Z3 — including AST
// construction in buildModel — throws RuntimeError immediately. Without the
// bookkeeping below, that surfaces as one 120s test timeout followed by a
// cascade of instant, meaningless "disagreements" on trivially-SAT inputs
// (observed in CI run 30188347391 attempt 1). Track allocator growth and
// mark the runtime as dead on the first abort so every subsequent failure
// names the real cause instead of fabricating counterexamples.

export class Z3OracleError extends Error {}

/**
 * Z3 answered 'unknown' (or raised) while the WASM runtime stayed alive —
 * resource ceiling, timeout, or cancellation. Unlike runtime death these are
 * safe to retry once on a fresh module (see runSolve).
 */
class Z3UnknownError extends Z3OracleError {}

let solveCount = 0;
let lastSolveMs = -1;
let poisonedBy: string | null = null;

export interface OracleStats {
    /** Total solver.check() calls since the suite started (survives recycles). */
    solveCount: number;
    /** Wall time of the most recent completed check, in ms (-1 if none). */
    lastSolveMs: number;
    /** Z3's estimate of its allocated bytes (-1 if unavailable/dead). */
    estimatedAllocBytes: number;
    /** Total Emscripten heap size in bytes (-1 if unavailable/dead). */
    heapBytes: number;
    /** How many times the WASM module was proactively recycled (see below). */
    recycles: number;
    /** Set once the WASM runtime aborts; all results after this are garbage. */
    poisonedBy: string | null;
}

export function oracleStats(): OracleStats {
    let estimatedAllocBytes = -1;
    let heapBytes = -1;
    try {
        estimatedAllocBytes = Number(z3Api.Z3.get_estimated_alloc_size());
        heapBytes = z3Api.em.HEAPU8.length;
    } catch {
        // Runtime dead or not initialized — stats stay at -1.
    }
    return { solveCount, lastSolveMs, estimatedAllocBytes, heapBytes, recycles: recycleCount, poisonedBy };
}

export function describeOracleStats(): string {
    const s = oracleStats();
    const mb = (b: number) => b < 0 ? '?' : (b / (1024 * 1024)).toFixed(1);
    return `solve #${s.solveCount}, z3 alloc ≈ ${mb(s.estimatedAllocBytes)} MB / heap ${mb(s.heapBytes)} MB, recycles ${s.recycles}`;
}

function assertNotPoisoned(): void {
    if (poisonedBy) {
        throw new Z3OracleError(
            `Z3 WASM runtime is dead; this and every later oracle result is meaningless. ` +
            `Root cause: ${poisonedBy}`
        );
    }
}

function poison(context: string, e: unknown): void {
    poisonedBy = `${context}: ${e} (${describeOracleStats()})`;
    // eslint-disable-next-line no-console
    console.error(`[z3-oracle] RUNTIME DEAD — ${poisonedBy}`);
}

function looksLikeRuntimeDeath(e: unknown): boolean {
    return e instanceof WebAssembly.RuntimeError || /Aborted|abort\(|OOM|unreachable/i.test(String(e));
}

// ─── OOM prevention ──────────────────────────────────────────────────────
//
// Two distinct mechanisms can exhaust the fixed 2 GiB WASM heap:
//
// 1. GRADUAL RATCHET: z3-solver frees Z3 ASTs via FinalizationRegistry — i.e.
//    only when the JS GC happens to run finalizers — so allocation climbs
//    ~0.8 MB/solve across the suite (run 30188347391). Countered by recycling
//    the whole module once the estimate crosses RECYCLE_ALLOC_BYTES.
//
// 2. SINGLE MONSTER SOLVE: one hard instance can allocate its way to the
//    cliff mid-search regardless of a clean starting point. On CI run
//    30227554187 a solve died with a native abort at only ~325 MB *estimated*
//    alloc — the real arena hit 2 GiB at a ~6× fragmentation/overhead
//    multiplier. Countered by Z3's own 'memory_max_size' ceiling (Z3 tracks
//    exactly the counter we read here and returns a clean 'unknown' instead
//    of letting malloc fail and kill the runtime), plus a 'timeout' so a
//    grinder surfaces as 'unknown' before vitest's 120s test timeout.
//
// The numbers hang together: recycling at 128 MB guarantees ≥ 128 MB of
// estimated headroom below the 256 MB ceiling for every solve, and the
// ceiling caps worst-case real arena at ~6.3 × 256 MB ≈ 1.6 GiB < 2 GiB.
// 45s timeout + one fresh-module retry (see runSolve) stays under the 120s
// vitest limit. A recycle costs ~1s; expect a handful per run.

const RECYCLE_ALLOC_BYTES = 128 * 1024 * 1024;
const Z3_MEMORY_MAX_MB = 256;
const Z3_TIMEOUT_MS = 45_000;
let recycleCount = 0;

async function recycleZ3(reason: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[z3-oracle] recycling WASM module: ${reason}`);
    terminateThreads();
    z3Api = null;
    Z3Context = null;
    z3Ctx = null;
    z3Initialized = false;
    recycleCount++;
    await freshModule();
}

async function maybeRecycle(): Promise<void> {
    if (!z3Initialized) return;
    const alloc = oracleStats().estimatedAllocBytes;
    if (alloc >= RECYCLE_ALLOC_BYTES) {
        const mb = (b: number) => (b / (1024 * 1024)).toFixed(1);
        await recycleZ3(`alloc ${mb(alloc)} MB ≥ ${mb(RECYCLE_ALLOC_BYTES)} MB after ${solveCount} solves`);
    }
}

/** Terminate the old module's pthread workers so it can be garbage-collected. */
function terminateThreads(): void {
    try {
        z3Api?.em?.PThread?.terminateAllThreads?.();
    } catch {
        // Best effort — a dead runtime may throw here.
    }
}

// ─── Initialization ──────────────────────────────────────────────────────

export async function isZ3Available(): Promise<boolean> {
    try {
        await initZ3();
        return true;
    } catch {
        return false;
    }
}

async function freshModule(): Promise<void> {
    z3Api = await init();
    // Resource ceilings are global per module, so re-apply after every init.
    z3Api.Z3.global_param_set('memory_max_size', String(Z3_MEMORY_MAX_MB));
    z3Api.Z3.global_param_set('timeout', String(Z3_TIMEOUT_MS));
    Z3Context = z3Api.Context;
    z3Ctx = new Z3Context('oracle');
    z3Initialized = true;
    // A fresh init() instantiates a new WASM module, so prior death is cured.
    poisonedBy = null;
}

export async function initZ3(): Promise<void> {
    if (z3Initialized) return;
    await freshModule();
}

export function shutdownZ3(): void {
    terminateThreads();
    z3Initialized = false;
    z3Ctx = null;
    Z3Context = null;
    z3Api = null;
}

// ─── ID sanitization ────────────────────────────────────────────────────

function varName(id: string, suffix: string): string {
    return `${id.replace(/[^a-zA-Z0-9_]/g, '_')}_${suffix}`;
}

// ─── Group helpers ──────────────────────────────────────────────────────

function isSubGroup(a: LayoutGroup, b: LayoutGroup): boolean {
    const bSet = new Set(b.nodeIds);
    return a.nodeIds.every(id => bSet.has(id));
}

function groupIntersection(a: LayoutGroup, b: LayoutGroup): string[] {
    const bSet = new Set(b.nodeIds);
    return a.nodeIds.filter(id => bSet.has(id));
}

// ─── Constraint compilation ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Arith = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bool = any;

interface VarMap {
    get(name: string): Arith;
}

function compileAtomicConstraint(c: LayoutConstraint, vars: VarMap): Bool | null {
    if (isLeftConstraint(c)) {
        const lc = c as LeftConstraint;
        // left.x + left.width + minDistance <= right.x
        return vars.get(varName(lc.left.id, 'x')).add(lc.left.width + lc.minDistance)
            .le(vars.get(varName(lc.right.id, 'x')));
    }
    if (isTopConstraint(c)) {
        const tc = c as TopConstraint;
        // top.y + top.height + minDistance <= bottom.y
        return vars.get(varName(tc.top.id, 'y')).add(tc.top.height + tc.minDistance)
            .le(vars.get(varName(tc.bottom.id, 'y')));
    }
    if (isAlignmentConstraint(c)) {
        const ac = c as AlignmentConstraint;
        if (ac.axis === 'x') {
            return vars.get(varName(ac.node1.id, 'x')).eq(vars.get(varName(ac.node2.id, 'x')));
        } else {
            return vars.get(varName(ac.node1.id, 'y')).eq(vars.get(varName(ac.node2.id, 'y')));
        }
    }
    if (isBoundingBoxConstraint(c)) {
        const bc = c as BoundingBoxConstraint;
        const gLeft   = vars.get(varName(bc.group.name, 'gleft'));
        const gRight  = vars.get(varName(bc.group.name, 'gright'));
        const gTop    = vars.get(varName(bc.group.name, 'gtop'));
        const gBottom = vars.get(varName(bc.group.name, 'gbottom'));
        switch (bc.side) {
            case 'left':   return vars.get(varName(bc.node.id, 'x')).add(bc.node.width + bc.minDistance).le(gLeft);
            case 'right':  return gRight.add(bc.minDistance).le(vars.get(varName(bc.node.id, 'x')));
            case 'top':    return vars.get(varName(bc.node.id, 'y')).add(bc.node.height + bc.minDistance).le(gTop);
            case 'bottom': return gBottom.add(bc.minDistance).le(vars.get(varName(bc.node.id, 'y')));
        }
    }
    if (isGroupBoundaryConstraint(c)) {
        const gc = c as GroupBoundaryConstraint;
        const gARight  = vars.get(varName(gc.groupA.name, 'gright'));
        const gBLeft   = vars.get(varName(gc.groupB.name, 'gleft'));
        const gBRight  = vars.get(varName(gc.groupB.name, 'gright'));
        const gALeft   = vars.get(varName(gc.groupA.name, 'gleft'));
        const gABottom = vars.get(varName(gc.groupA.name, 'gbottom'));
        const gBTop    = vars.get(varName(gc.groupB.name, 'gtop'));
        const gBBottom = vars.get(varName(gc.groupB.name, 'gbottom'));
        const gATop    = vars.get(varName(gc.groupA.name, 'gtop'));
        switch (gc.side) {
            case 'left':   return gARight.add(gc.minDistance).le(gBLeft);
            case 'right':  return gBRight.add(gc.minDistance).le(gALeft);
            case 'top':    return gABottom.add(gc.minDistance).le(gBTop);
            case 'bottom': return gBBottom.add(gc.minDistance).le(gATop);
        }
    }
    return null;
}

// ─── Model building ─────────────────────────────────────────────────────

function buildModel(
    layout: InstanceLayout,
    constraintOverride?: LayoutConstraint[],
): { solver: any; vars: VarMap } {
    const ctx = z3Ctx;
    const solver = new ctx.Solver();
    const varMap = new Map<string, Arith>();

    function getOrCreate(name: string): Arith {
        if (!varMap.has(name)) {
            varMap.set(name, ctx.Int.const(name));
        }
        return varMap.get(name)!;
    }

    const vars: VarMap = { get: getOrCreate };

    // ── Node variable declarations (non-negative) ──────────────────────
    for (const node of layout.nodes) {
        solver.add(getOrCreate(varName(node.id, 'x')).ge(0));
        solver.add(getOrCreate(varName(node.id, 'y')).ge(0));
    }

    // ── Pairwise non-overlap ───────────────────────────────────────────
    for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
            const a = layout.nodes[i];
            const b = layout.nodes[j];
            const ax = getOrCreate(varName(a.id, 'x'));
            const bx = getOrCreate(varName(b.id, 'x'));
            const ay = getOrCreate(varName(a.id, 'y'));
            const by = getOrCreate(varName(b.id, 'y'));
            solver.add(ctx.Or(
                ax.add(a.width).le(bx),
                bx.add(b.width).le(ax),
                ay.add(a.height).le(by),
                by.add(b.height).le(ay),
            ));
        }
    }

    // ── Conjunctive constraints ────────────────────────────────────────
    const constraints = constraintOverride ?? layout.constraints;
    for (const c of constraints) {
        const expr = compileAtomicConstraint(c, vars);
        if (expr) solver.add(expr);
    }

    // If using constraint override (MFS verification), skip disjunctions and groups
    if (constraintOverride) {
        return { solver, vars };
    }

    // ── Disjunctive constraints ────────────────────────────────────────
    if (layout.disjunctiveConstraints) {
        for (const disj of layout.disjunctiveConstraints) {
            const compiled = compileDisjunction(disj, vars, ctx);
            if (compiled) solver.add(compiled);
        }
    }

    // ── Group expansion ────────────────────────────────────────────────
    const positiveGroups = layout.groups.filter(
        g => !g.negated && g.nodeIds.length > 1 && g.sourceConstraint
    );

    const nodeToGroups = new Map<string, Set<LayoutGroup>>();
    for (const node of layout.nodes) nodeToGroups.set(node.id, new Set());
    for (const group of positiveGroups) {
        for (const nodeId of group.nodeIds) {
            nodeToGroups.get(nodeId)?.add(group);
        }
    }

    const nodeById = new Map<string, LayoutNode>();
    for (const node of layout.nodes) nodeById.set(node.id, node);

    for (const group of positiveGroups) {
        const memberIds = new Set(group.nodeIds);

        // Declare group bounding box variables (non-negative)
        const gLeft = getOrCreate(varName(group.name, 'gleft'));
        const gRight = getOrCreate(varName(group.name, 'gright'));
        const gTop = getOrCreate(varName(group.name, 'gtop'));
        const gBottom = getOrCreate(varName(group.name, 'gbottom'));
        solver.add(gLeft.ge(0));
        solver.add(gRight.ge(0));
        solver.add(gTop.ge(0));
        solver.add(gBottom.ge(0));

        // Members must be inside the bounding box
        for (const nodeId of group.nodeIds) {
            const node = nodeById.get(nodeId);
            if (!node) continue;
            const nx = getOrCreate(varName(node.id, 'x'));
            const ny = getOrCreate(varName(node.id, 'y'));
            solver.add(gLeft.le(nx));
            solver.add(nx.add(node.width).le(gRight));
            solver.add(gTop.le(ny));
            solver.add(ny.add(node.height).le(gBottom));
        }

        // Non-members must be outside (4-way disjunction)
        for (const node of layout.nodes) {
            if (memberIds.has(node.id)) continue;

            const nodeGroups = nodeToGroups.get(node.id);
            if (nodeGroups && nodeGroups.size > 0) {
                if (!group.overlapping) continue;
                const allHierarchical = [...nodeGroups].every(ng =>
                    ng === group ||
                    isSubGroup(ng, group) ||
                    isSubGroup(group, ng)
                );
                if (allHierarchical) continue;
            }

            const nx = getOrCreate(varName(node.id, 'x'));
            const ny = getOrCreate(varName(node.id, 'y'));
            solver.add(ctx.Or(
                nx.add(node.width + MIN_PADDING).le(gLeft),
                gRight.add(MIN_PADDING).le(nx),
                ny.add(node.height + MIN_PADDING).le(gTop),
                gBottom.add(MIN_PADDING).le(ny),
            ));
        }
    }

    // ── Negated groups ─────────────────────────────────────────────────
    const negatedBySource = new Map<object, LayoutGroup[]>();
    for (const group of layout.groups) {
        if (!group.negated || !group.sourceConstraint) continue;
        const key = group.sourceConstraint;
        if (!negatedBySource.has(key)) negatedBySource.set(key, []);
        negatedBySource.get(key)!.push(group);
    }

    for (const [, groups] of negatedBySource) {
        const altExprs: Bool[] = [];
        for (const group of groups) {
            const memberIds = new Set(group.nodeIds);
            const members = group.nodeIds
                .map(id => nodeById.get(id))
                .filter((n): n is LayoutNode => n !== undefined);
            const nonMembers = layout.nodes.filter(n => !memberIds.has(n.id));

            for (const n of nonMembers) {
                for (const mL of members) {
                    for (const mR of members) {
                        if (mL.id === mR.id) continue;
                        for (const mT of members) {
                            for (const mB of members) {
                                if (mT.id === mB.id) continue;
                                const nx = getOrCreate(varName(n.id, 'x'));
                                const ny = getOrCreate(varName(n.id, 'y'));
                                altExprs.push(ctx.And(
                                    getOrCreate(varName(mL.id, 'x')).add(mL.width).le(nx),
                                    nx.add(n.width).le(getOrCreate(varName(mR.id, 'x'))),
                                    getOrCreate(varName(mT.id, 'y')).add(mT.height).le(ny),
                                    ny.add(n.height).le(getOrCreate(varName(mB.id, 'y'))),
                                ));
                            }
                        }
                    }
                }
            }
        }

        if (altExprs.length > 0) {
            solver.add(ctx.Or(...altExprs));
        }
    }

    // ── Group-to-group separation ──────────────────────────────────────
    for (let i = 0; i < positiveGroups.length; i++) {
        for (let j = i + 1; j < positiveGroups.length; j++) {
            const gA = positiveGroups[i];
            const gB = positiveGroups[j];
            if (isSubGroup(gA, gB) || isSubGroup(gB, gA)) continue;
            if (groupIntersection(gA, gB).length > 0) continue;

            const gARight = getOrCreate(varName(gA.name, 'gright'));
            const gBLeft = getOrCreate(varName(gB.name, 'gleft'));
            const gBRight = getOrCreate(varName(gB.name, 'gright'));
            const gALeft = getOrCreate(varName(gA.name, 'gleft'));
            const gABottom = getOrCreate(varName(gA.name, 'gbottom'));
            const gBTop = getOrCreate(varName(gB.name, 'gtop'));
            const gBBottom = getOrCreate(varName(gB.name, 'gbottom'));
            const gATop = getOrCreate(varName(gA.name, 'gtop'));

            solver.add(ctx.Or(
                gARight.add(MIN_PADDING).le(gBLeft),
                gBRight.add(MIN_PADDING).le(gALeft),
                gABottom.add(MIN_PADDING).le(gBTop),
                gBBottom.add(MIN_PADDING).le(gATop),
            ));
        }
    }

    return { solver, vars };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compileDisjunction(disj: DisjunctiveConstraint, vars: VarMap, ctx: any): Bool | null {
    if (disj.alternatives.length === 0) return null;

    if (disj.alternatives.length === 1) {
        const exprs = disj.alternatives[0]
            .map(c => compileAtomicConstraint(c, vars))
            .filter((e): e is Bool => e !== null);
        if (exprs.length === 0) return null;
        if (exprs.length === 1) return exprs[0];
        return ctx.And(...exprs);
    }

    const altExprs = disj.alternatives.map(alt => {
        const exprs = alt
            .map(c => compileAtomicConstraint(c, vars))
            .filter((e): e is Bool => e !== null);
        if (exprs.length === 0) return ctx.Bool.val(true);
        if (exprs.length === 1) return exprs[0];
        return ctx.And(...exprs);
    });

    return ctx.Or(...altExprs);
}

// ─── Solving ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkedSolve(solver: any, what: string): Promise<boolean> {
    solveCount++;
    const solveNo = solveCount;
    const started = Date.now();
    let result: string;
    try {
        result = await solver.check();
    } catch (e) {
        const detail = `Z3 ${what} solve #${solveNo} threw after ${Date.now() - started}ms: ${e}`;
        if (looksLikeRuntimeDeath(e)) {
            poison(`${what} solve #${solveNo} threw after ${Date.now() - started}ms`, e);
            throw new Z3OracleError(detail);
        }
        // Z3 raised but the runtime survived (resource limits can surface as
        // exceptions rather than 'unknown') — same retry semantics as 'unknown'.
        throw new Z3UnknownError(detail);
    }
    lastSolveMs = Date.now() - started;
    if (result !== 'sat' && result !== 'unsat') {
        // NEVER map 'unknown' to UNSAT: that fabricates validator/oracle
        // disagreements out of solver limitations (timeout, interrupt, memout).
        let reason = 'reason unavailable';
        try {
            reason = solver.reasonUnknown();
        } catch {
            // Runtime may be dead; keep the placeholder.
        }
        const detail = `Z3 ${what} solve #${solveNo} returned '${result}' (${reason}) after ${lastSolveMs}ms — ${describeOracleStats()}`;
        // eslint-disable-next-line no-console
        console.error(`[z3-oracle] ${detail}`);
        throw new Z3UnknownError(detail);
    }
    return result === 'sat';
}

function buildModelChecked(
    layout: InstanceLayout,
    what: string,
    constraintOverride?: LayoutConstraint[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { solver: any; vars: VarMap } {
    try {
        return buildModel(layout, constraintOverride);
    } catch (e) {
        // Once the runtime has aborted, even AST construction throws — this is
        // the path that produced instant bogus "counterexamples" in CI.
        if (looksLikeRuntimeDeath(e)) {
            poison(`${what} buildModel threw`, e);
        }
        throw e;
    }
}

async function attemptSolve(
    layout: InstanceLayout,
    what: string,
    constraintOverride?: LayoutConstraint[],
): Promise<boolean> {
    const { solver } = buildModelChecked(layout, what, constraintOverride);
    return checkedSolve(solver, what);
}

async function runSolve(
    layout: InstanceLayout,
    what: string,
    constraintOverride?: LayoutConstraint[],
): Promise<boolean> {
    assertNotPoisoned();
    await maybeRecycle();
    try {
        return await attemptSolve(layout, what, constraintOverride);
    } catch (e) {
        if (!(e instanceof Z3UnknownError) || poisonedBy) throw e;
        // A clean 'unknown' (memory ceiling, timeout) from a part-filled heap
        // and a context polluted by hundreds of prior solves' AST interning
        // often solves instantly from a clean module — observed on CI run
        // 30227554187, where a deterministic instance that solves in ms
        // locally ground for 6s. Retry exactly once; a second 'unknown' is a
        // genuinely pathological instance and should fail loudly.
        // eslint-disable-next-line no-console
        console.error(`[z3-oracle] retrying ${what} on a fresh module after: ${e}`);
        await recycleZ3(`'unknown' during ${what}`);
        return attemptSolve(layout, what, constraintOverride);
    }
}

/**
 * Solve an InstanceLayout using Z3.
 * Returns true if SAT, false if UNSAT; throws Z3OracleError on 'unknown'
 * (after one fresh-module retry) or when the WASM runtime has died —
 * never a silent wrong answer.
 */
export async function solveZ3(layout: InstanceLayout): Promise<boolean> {
    return runSolve(layout, 'solveZ3');
}

/**
 * Verify that a subset of constraints is feasible.
 * Used to check that a reported MFS is actually satisfiable.
 */
export async function verifyFeasibleSubset(
    layout: InstanceLayout,
    subset: LayoutConstraint[],
): Promise<boolean> {
    return runSolve(layout, 'verifyFeasibleSubset', subset);
}
