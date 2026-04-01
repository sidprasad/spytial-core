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
let z3Initialized = false;

// ─── Initialization ──────────────────────────────────────────────────────

export async function isZ3Available(): Promise<boolean> {
    try {
        await initZ3();
        return true;
    } catch {
        return false;
    }
}

export async function initZ3(): Promise<void> {
    if (z3Initialized) return;
    const { Context } = await init();
    Z3Context = Context;
    z3Ctx = new Z3Context('oracle');
    z3Initialized = true;
}

export function shutdownZ3(): void {
    z3Initialized = false;
    z3Ctx = null;
    Z3Context = null;
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
        const gx = vars.get(varName(bc.group.name, 'gx'));
        const gy = vars.get(varName(bc.group.name, 'gy'));
        switch (bc.side) {
            case 'left':   return vars.get(varName(bc.node.id, 'x')).add(bc.node.width + bc.minDistance).le(gx);
            case 'right':  return gx.add(bc.minDistance).le(vars.get(varName(bc.node.id, 'x')));
            case 'top':    return vars.get(varName(bc.node.id, 'y')).add(bc.node.height + bc.minDistance).le(gy);
            case 'bottom': return gy.add(bc.minDistance).le(vars.get(varName(bc.node.id, 'y')));
        }
    }
    if (isGroupBoundaryConstraint(c)) {
        const gc = c as GroupBoundaryConstraint;
        const gAx = vars.get(varName(gc.groupA.name, 'gx'));
        const gBx = vars.get(varName(gc.groupB.name, 'gx'));
        const gAy = vars.get(varName(gc.groupA.name, 'gy'));
        const gBy = vars.get(varName(gc.groupB.name, 'gy'));
        switch (gc.side) {
            case 'left':   return gAx.add(gc.minDistance).le(gBx);
            case 'right':  return gBx.add(gc.minDistance).le(gAx);
            case 'top':    return gAy.add(gc.minDistance).le(gBy);
            case 'bottom': return gBy.add(gc.minDistance).le(gAy);
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

/**
 * Solve an InstanceLayout using Z3.
 * Returns true if SAT, false if UNSAT.
 */
export async function solveZ3(layout: InstanceLayout): Promise<boolean> {
    const { solver } = buildModel(layout);
    const result = await solver.check();
    return result === 'sat';
}

/**
 * Verify that a subset of constraints is feasible.
 * Used to check that a reported MFS is actually satisfiable.
 */
export async function verifyFeasibleSubset(
    layout: InstanceLayout,
    subset: LayoutConstraint[],
): Promise<boolean> {
    const { solver } = buildModel(layout, subset);
    const result = await solver.check();
    return result === 'sat';
}
