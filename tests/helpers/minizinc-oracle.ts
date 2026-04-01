/**
 * MiniZinc correctness oracle for cross-checking IConstraintValidator.
 *
 * Compiles an InstanceLayout to a MiniZinc model string and solves it
 * using the `minizinc` npm package (Node.js path, requires `minizinc` CLI).
 *
 * Install MiniZinc: `brew install minizinc` (macOS) or see https://www.minizinc.org/
 */

// Fully lazy import: the `minizinc` npm package spawns a child process at
// module init time that throws an uncaught SyntaxError when the binary is
// absent.  We gate the import behind a PATH check so the module is never
// loaded in environments without the CLI (e.g. the CI `test` job).
import { execSync } from 'child_process';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MznModel: any;
let mznInit: () => Promise<void>;
let mznShutdown: () => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mznSolvers: () => Promise<any[]>;
let mznLoaded = false;

function isMiniZincBinaryAvailable(): boolean {
    try {
        execSync('minizinc --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

async function loadMiniZinc(): Promise<boolean> {
    if (mznLoaded) return true;
    if (!isMiniZincBinaryAvailable()) return false;
    try {
        const mzn = await import('minizinc');
        MznModel = mzn.Model;
        mznInit = mzn.init;
        mznShutdown = mzn.shutdown;
        mznSolvers = mzn.solvers;
        mznLoaded = true;
        return true;
    } catch {
        return false;
    }
}
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
const MAX_COORD = 100000;

// Preferred solvers: Gecode (CP, best for our constraints), then MIP fallbacks
const PREFERRED_SOLVERS = ['gecode', 'cbc', 'coin-bc', 'coinbc', 'highs'];

// ─── Initialization ────────────────────────────────────────────────────────

let initialized = false;
let detectedSolver: string | null = null;

async function detectSolver(): Promise<string | null> {
    const available = await mznSolvers() as any[];
    const tags = new Set(available.flatMap((s: any) => s.tags || []));
    for (const pref of PREFERRED_SOLVERS) {
        if (tags.has(pref)) return pref;
    }
    if (available.length > 0) return (available[0] as any).tags?.[0] ?? null;
    return null;
}

/** Check if the minizinc CLI and a solver are available. */
export async function isMiniZincAvailable(): Promise<boolean> {
    try {
        if (!await loadMiniZinc()) return false;
        await mznInit();
        detectedSolver = await detectSolver();
        if (!detectedSolver) return false;
        // Smoke test: solve a trivial model to confirm the solver works
        const m = new MznModel();
        m.addString('var 0..1: x; solve satisfy;');
        const r: any= await m.solve({
            options: { solver: detectedSolver, 'time-limit': 5000 },
        });
        initialized = true;
        return r.status === 'SATISFIED';
    } catch {
        return false;
    }
}

export async function initMiniZinc(): Promise<void> {
    if (!initialized) {
        if (!await loadMiniZinc()) {
            throw new Error('MiniZinc module could not be loaded — is the CLI installed?');
        }
        await mznInit();
        if (!detectedSolver) detectedSolver = await detectSolver();
        initialized = true;
    }
}

export function shutdownMiniZinc(): void {
    mznShutdown();
    initialized = false;
}

// ─── ID sanitization ──────────────────────────────────────────────────────

/** Sanitize a node/group ID for use as a MiniZinc identifier. */
function mznId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function nodeXVar(node: LayoutNode): string { return `${mznId(node.id)}_x`; }
function nodeYVar(node: LayoutNode): string { return `${mznId(node.id)}_y`; }
function groupVar(group: LayoutGroup, suffix: string): string {
    return `grp_${mznId(group.name)}_${suffix}`;
}

// ─── Constraint compilation ───────────────────────────────────────────────

function compileAtomicConstraint(c: LayoutConstraint): string | null {
    if (isLeftConstraint(c)) {
        const lc = c as LeftConstraint;
        // left.x + left.width + minDistance <= right.x
        return `constraint ${nodeXVar(lc.left)} + ${lc.left.width} + ${lc.minDistance} <= ${nodeXVar(lc.right)};`;
    }
    if (isTopConstraint(c)) {
        const tc = c as TopConstraint;
        // top.y + top.height + minDistance <= bottom.y
        return `constraint ${nodeYVar(tc.top)} + ${tc.top.height} + ${tc.minDistance} <= ${nodeYVar(tc.bottom)};`;
    }
    if (isAlignmentConstraint(c)) {
        const ac = c as AlignmentConstraint;
        if (ac.axis === 'x') {
            return `constraint ${nodeXVar(ac.node1)} = ${nodeXVar(ac.node2)};`;
        } else {
            return `constraint ${nodeYVar(ac.node1)} = ${nodeYVar(ac.node2)};`;
        }
    }
    if (isBoundingBoxConstraint(c)) {
        const bc = c as BoundingBoxConstraint;
        // Validator uses a single virtual node per group; match that encoding
        const gx = groupVar(bc.group, 'x');
        const gy = groupVar(bc.group, 'y');
        switch (bc.side) {
            case 'left':   return `constraint ${nodeXVar(bc.node)} + ${bc.node.width} + ${bc.minDistance} <= ${gx};`;
            case 'right':  return `constraint ${gx} + ${bc.minDistance} <= ${nodeXVar(bc.node)};`;
            case 'top':    return `constraint ${nodeYVar(bc.node)} + ${bc.node.height} + ${bc.minDistance} <= ${gy};`;
            case 'bottom': return `constraint ${gy} + ${bc.minDistance} <= ${nodeYVar(bc.node)};`;
        }
    }
    if (isGroupBoundaryConstraint(c)) {
        const gc = c as GroupBoundaryConstraint;
        const gAx = groupVar(gc.groupA, 'x');
        const gBx = groupVar(gc.groupB, 'x');
        const gAy = groupVar(gc.groupA, 'y');
        const gBy = groupVar(gc.groupB, 'y');
        switch (gc.side) {
            case 'left':   return `constraint ${gAx} + ${gc.minDistance} <= ${gBx};`;
            case 'right':  return `constraint ${gBx} + ${gc.minDistance} <= ${gAx};`;
            case 'top':    return `constraint ${gAy} + ${gc.minDistance} <= ${gBy};`;
            case 'bottom': return `constraint ${gBy} + ${gc.minDistance} <= ${gAy};`;
        }
    }
    return null;
}

function compileAtomicAsExpr(c: LayoutConstraint): string | null {
    if (isLeftConstraint(c)) {
        const lc = c as LeftConstraint;
        return `${nodeXVar(lc.left)} + ${lc.left.width} + ${lc.minDistance} <= ${nodeXVar(lc.right)}`;
    }
    if (isTopConstraint(c)) {
        const tc = c as TopConstraint;
        return `${nodeYVar(tc.top)} + ${tc.top.height} + ${tc.minDistance} <= ${nodeYVar(tc.bottom)}`;
    }
    if (isAlignmentConstraint(c)) {
        const ac = c as AlignmentConstraint;
        if (ac.axis === 'x') {
            return `${nodeXVar(ac.node1)} = ${nodeXVar(ac.node2)}`;
        } else {
            return `${nodeYVar(ac.node1)} = ${nodeYVar(ac.node2)}`;
        }
    }
    if (isBoundingBoxConstraint(c)) {
        const bc = c as BoundingBoxConstraint;
        const gx = groupVar(bc.group, 'x');
        const gy = groupVar(bc.group, 'y');
        switch (bc.side) {
            case 'left':   return `${nodeXVar(bc.node)} + ${bc.node.width} + ${bc.minDistance} <= ${gx}`;
            case 'right':  return `${gx} + ${bc.minDistance} <= ${nodeXVar(bc.node)}`;
            case 'top':    return `${nodeYVar(bc.node)} + ${bc.node.height} + ${bc.minDistance} <= ${gy}`;
            case 'bottom': return `${gy} + ${bc.minDistance} <= ${nodeYVar(bc.node)}`;
        }
    }
    if (isGroupBoundaryConstraint(c)) {
        const gc = c as GroupBoundaryConstraint;
        const gAx = groupVar(gc.groupA, 'x');
        const gBx = groupVar(gc.groupB, 'x');
        const gAy = groupVar(gc.groupA, 'y');
        const gBy = groupVar(gc.groupB, 'y');
        switch (gc.side) {
            case 'left':   return `${gAx} + ${gc.minDistance} <= ${gBx}`;
            case 'right':  return `${gBx} + ${gc.minDistance} <= ${gAx}`;
            case 'top':    return `${gAy} + ${gc.minDistance} <= ${gBy}`;
            case 'bottom': return `${gBy} + ${gc.minDistance} <= ${gAy}`;
        }
    }
    return null;
}

// ─── Group helpers ────────────────────────────────────────────────────────

function isSubGroup(a: LayoutGroup, b: LayoutGroup): boolean {
    const bSet = new Set(b.nodeIds);
    return a.nodeIds.every(id => bSet.has(id));
}

function groupIntersection(a: LayoutGroup, b: LayoutGroup): string[] {
    const bSet = new Set(b.nodeIds);
    return a.nodeIds.filter(id => bSet.has(id));
}

// ─── Model compilation ───────────────────────────────────────────────────

/**
 * Compile an InstanceLayout to a MiniZinc model string.
 *
 * Replicates the same constraint expansion that QualitativeConstraintValidator
 * does internally for groups (bounding box disjunctions, group separation).
 */
export function compileToMiniZinc(layout: InstanceLayout): string {
    const lines: string[] = [];

    // ── Variable declarations ──────────────────────────────────────────
    for (const node of layout.nodes) {
        lines.push(`var 0..${MAX_COORD}: ${nodeXVar(node)};`);
        lines.push(`var 0..${MAX_COORD}: ${nodeYVar(node)};`);
    }
    lines.push('');

    // ── Pairwise non-overlap ────────────────────────────────────────────
    // Every pair of distinct nodes must not physically overlap.
    // This matches the validator's detectNodeOverlaps phase.
    for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
            const a = layout.nodes[i];
            const b = layout.nodes[j];
            lines.push(
                `constraint ${nodeXVar(a)} + ${a.width} <= ${nodeXVar(b)}` +
                ` \\/ ${nodeXVar(b)} + ${b.width} <= ${nodeXVar(a)}` +
                ` \\/ ${nodeYVar(a)} + ${a.height} <= ${nodeYVar(b)}` +
                ` \\/ ${nodeYVar(b)} + ${b.height} <= ${nodeYVar(a)};`
            );
        }
    }
    lines.push('');

    // ── Conjunctive constraints ────────────────────────────────────────
    for (const c of layout.constraints) {
        const line = compileAtomicConstraint(c);
        if (line) lines.push(line);
    }
    lines.push('');

    // ── Disjunctive constraints (from layout spec) ─────────────────────
    if (layout.disjunctiveConstraints) {
        for (const disj of layout.disjunctiveConstraints) {
            const compiled = compileDisjunction(disj);
            if (compiled) lines.push(compiled);
        }
        lines.push('');
    }

    // ── Group expansion ────────────────────────────────────────────────
    // Replicate the same group-to-constraint expansion that the validator does.
    const positiveGroups = layout.groups.filter(
        g => !g.negated && g.nodeIds.length > 1 && g.sourceConstraint
    );

    // Build node→groups map for the skip-grouped-nodes logic
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

        // Declare group bounding box variables
        const gLeft = groupVar(group, 'left');
        const gRight = groupVar(group, 'right');
        const gTop = groupVar(group, 'top');
        const gBottom = groupVar(group, 'bottom');
        lines.push(`var 0..${MAX_COORD}: ${gLeft};`);
        lines.push(`var 0..${MAX_COORD}: ${gRight};`);
        lines.push(`var 0..${MAX_COORD}: ${gTop};`);
        lines.push(`var 0..${MAX_COORD}: ${gBottom};`);

        // Members must be inside the bounding box
        for (const nodeId of group.nodeIds) {
            const node = nodeById.get(nodeId);
            if (!node) continue;
            lines.push(`constraint ${gLeft} <= ${nodeXVar(node)};`);
            lines.push(`constraint ${nodeXVar(node)} + ${node.width} <= ${gRight};`);
            lines.push(`constraint ${gTop} <= ${nodeYVar(node)};`);
            lines.push(`constraint ${nodeYVar(node)} + ${node.height} <= ${gBottom};`);
        }

        // Non-members must be outside (4-way disjunction)
        for (const node of layout.nodes) {
            if (memberIds.has(node.id)) continue;

            // Replicate the skip logic from the validator
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

            // Node must be outside group's bounding box
            const nx = nodeXVar(node);
            const ny = nodeYVar(node);
            lines.push(
                `constraint ${nx} + ${node.width} + ${MIN_PADDING} <= ${gLeft}` +
                ` \\/ ${gRight} + ${MIN_PADDING} <= ${nx}` +
                ` \\/ ${ny} + ${node.height} + ${MIN_PADDING} <= ${gTop}` +
                ` \\/ ${gBottom} + ${MIN_PADDING} <= ${ny};`
            );
        }
        lines.push('');
    }

    // ── Negated groups ─────────────────────────────────────────────────
    const negatedBySource = new Map<object, LayoutGroup[]>();
    for (const group of layout.groups) {
        if (!group.negated || !group.sourceConstraint) continue;
        const key = group.sourceConstraint;
        if (!negatedBySource.has(key)) negatedBySource.set(key, []);
        negatedBySource.get(key)!.push(group);
    }

    let negDisjIdx = 0;
    for (const [, groups] of negatedBySource) {
        const altExprs: string[] = [];
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
                                // mL.x <= n.x AND n.x + n.width <= mR.x + mR.width AND
                                // mT.y <= n.y AND n.y + n.height <= mB.y + mB.height
                                // But the validator uses LeftConstraint(mL, n, 0) → mL.x + mL.width + 0 <= n.x
                                // and LeftConstraint(n, mR, 0) → n.x + n.width + 0 <= mR.x
                                // and TopConstraint(mT, n, 0) → mT.y + mT.height + 0 <= n.y
                                // and TopConstraint(n, mB, 0) → n.y + n.height + 0 <= mB.y
                                altExprs.push(
                                    `(${nodeXVar(mL)} + ${mL.width} <= ${nodeXVar(n)}` +
                                    ` /\\ ${nodeXVar(n)} + ${n.width} <= ${nodeXVar(mR)}` +
                                    ` /\\ ${nodeYVar(mT)} + ${mT.height} <= ${nodeYVar(n)}` +
                                    ` /\\ ${nodeYVar(n)} + ${n.height} <= ${nodeYVar(mB)})`
                                );
                            }
                        }
                    }
                }
            }
        }

        if (altExprs.length > 0) {
            lines.push(`constraint ${altExprs.join(' \\/ ')};`);
        }
        negDisjIdx++;
    }

    // ── Group-to-group separation ──────────────────────────────────────
    for (let i = 0; i < positiveGroups.length; i++) {
        for (let j = i + 1; j < positiveGroups.length; j++) {
            const gA = positiveGroups[i];
            const gB = positiveGroups[j];
            if (isSubGroup(gA, gB) || isSubGroup(gB, gA)) continue;
            if (groupIntersection(gA, gB).length > 0) continue;

            const gARight = groupVar(gA, 'right');
            const gBLeft = groupVar(gB, 'left');
            const gBRight = groupVar(gB, 'right');
            const gALeft = groupVar(gA, 'left');
            const gABottom = groupVar(gA, 'bottom');
            const gBTop = groupVar(gB, 'top');
            const gBBottom = groupVar(gB, 'bottom');
            const gATop = groupVar(gA, 'top');

            lines.push(
                `constraint ${gARight} + ${MIN_PADDING} <= ${gBLeft}` +
                ` \\/ ${gBRight} + ${MIN_PADDING} <= ${gALeft}` +
                ` \\/ ${gABottom} + ${MIN_PADDING} <= ${gBTop}` +
                ` \\/ ${gBBottom} + ${MIN_PADDING} <= ${gATop};`
            );
        }
    }

    lines.push('');
    lines.push('solve satisfy;');

    return lines.join('\n');
}

function compileDisjunction(disj: DisjunctiveConstraint): string | null {
    if (disj.alternatives.length === 0) return null;

    if (disj.alternatives.length === 1) {
        // Single alternative → just emit its constraints conjunctively
        const exprs = disj.alternatives[0]
            .map(c => compileAtomicAsExpr(c))
            .filter((e): e is string => e !== null);
        if (exprs.length === 0) return null;
        return `constraint ${exprs.join(' /\\ ')};`;
    }

    // Multiple alternatives → disjunction
    const altExprs = disj.alternatives.map(alt => {
        const exprs = alt
            .map(c => compileAtomicAsExpr(c))
            .filter((e): e is string => e !== null);
        if (exprs.length === 0) return 'true';
        if (exprs.length === 1) return exprs[0];
        return `(${exprs.join(' /\\ ')})`;
    });

    return `constraint ${altExprs.join(' \\/ ')};`;
}

// ─── Solving ──────────────────────────────────────────────────────────────

/**
 * Solve an InstanceLayout using MiniZinc.
 * Returns true if SAT, false if UNSAT.
 */
export async function solveMiniZinc(layout: InstanceLayout): Promise<boolean> {
    const modelStr = compileToMiniZinc(layout);
    const model = new MznModel();
    model.addString(modelStr);

    const result: any= await model.solve({
        options: {
            solver: detectedSolver!,
            'time-limit': 30000,
        },
    });

    return result.status === 'SATISFIED' || result.status === 'ALL_SOLUTIONS';
}

/**
 * Verify that a subset of constraints is feasible.
 * Used to check that a reported MFS is actually satisfiable.
 *
 * The MFS from the validator can include:
 * - LeftConstraint, TopConstraint, AlignmentConstraint (atomic)
 * - BoundingBoxConstraint (node-to-group-bbox, from group expansion)
 * - GroupBoundaryConstraint (group-to-group separation)
 * - Constraints from chosen disjunction alternatives
 *
 * We compile the MFS directly as conjunctive constraints, declaring
 * group bounding-box variables as needed.
 */
export async function verifyFeasibleSubset(
    layout: InstanceLayout,
    subset: LayoutConstraint[],
): Promise<boolean> {
    const lines: string[] = [];

    // ── Node variable declarations ──────────────────────────────────
    for (const node of layout.nodes) {
        lines.push(`var 0..${MAX_COORD}: ${nodeXVar(node)};`);
        lines.push(`var 0..${MAX_COORD}: ${nodeYVar(node)};`);
    }

    // ── Discover group bounding-box variables needed by the MFS ─────
    const groupsReferenced = new Set<string>();
    for (const c of subset) {
        if (isBoundingBoxConstraint(c)) {
            groupsReferenced.add((c as BoundingBoxConstraint).group.name);
        }
        if (isGroupBoundaryConstraint(c)) {
            groupsReferenced.add((c as GroupBoundaryConstraint).groupA.name);
            groupsReferenced.add((c as GroupBoundaryConstraint).groupB.name);
        }
    }
    // Declare a single x,y variable per group virtual node (matching the
    // validator's encoding — one virtual node per group, not 4 bbox edges)
    for (const gName of groupsReferenced) {
        const g = { name: gName } as LayoutGroup;
        lines.push(`var 0..${MAX_COORD}: ${groupVar(g, 'x')};`);
        lines.push(`var 0..${MAX_COORD}: ${groupVar(g, 'y')};`);
    }
    lines.push('');

    // ── Pairwise non-overlap (same as full model) ───────────────────
    for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
            const a = layout.nodes[i];
            const b = layout.nodes[j];
            lines.push(
                `constraint ${nodeXVar(a)} + ${a.width} <= ${nodeXVar(b)}` +
                ` \\/ ${nodeXVar(b)} + ${b.width} <= ${nodeXVar(a)}` +
                ` \\/ ${nodeYVar(a)} + ${a.height} <= ${nodeYVar(b)}` +
                ` \\/ ${nodeYVar(b)} + ${b.height} <= ${nodeYVar(a)};`
            );
        }
    }
    lines.push('');

    // ── MFS constraints (all treated as conjunctive) ────────────────
    for (const c of subset) {
        const line = compileAtomicConstraint(c);
        if (line) lines.push(line);
    }

    lines.push('');
    lines.push('solve satisfy;');

    const modelStr = lines.join('\n');
    const model = new MznModel();
    model.addString(modelStr);

    const result: any= await model.solve({
        options: {
            solver: detectedSolver!,
            'time-limit': 30000,
        },
    });

    return result.status === 'SATISFIED' || result.status === 'ALL_SOLUTIONS';
}
