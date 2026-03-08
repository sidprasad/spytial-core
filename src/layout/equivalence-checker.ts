import { Solver, Variable, Expression, Strength, Operator, Constraint as KiwiConstraint } from 'kiwi.js';
import { IDataInstance } from '../data-instance/interfaces';
import {
    LayoutConstraint, InstanceLayout, LayoutNode,
    LeftConstraint, TopConstraint, AlignmentConstraint,
    DisjunctiveConstraint,
    isLeftConstraint, isTopConstraint, isAlignmentConstraint,
} from './interfaces';
import {
    ConstraintValidator,
    isPositionalConstraintError,
    type PositionalConstraintError,
} from './constraint-validator';
import { LayoutInstance } from './layoutinstance';

// ---------------------------------------------------------------------------
// Abstract constraint representation
// ---------------------------------------------------------------------------

/**
 * Type of topological relationship between two nodes.
 * Captures the *abstract* ordering/alignment without distances.
 */
export type AbstractConstraintType = 'left-of' | 'above' | 'align-x' | 'align-y';

/**
 * A geometry-free representation of a pairwise constraint.
 * Two AbstractConstraints are equal iff they have the same type and node pair
 * (order-sensitive for ordering constraints, order-insensitive for alignment).
 */
export interface AbstractConstraint {
    type: AbstractConstraintType;
    nodeA: string;
    nodeB: string;
    /** The spec-level rule that produced this constraint (for reporting). */
    sourceDescription: string;
}

/**
 * Canonical string key for an AbstractConstraint.
 * Alignment keys normalise node order; ordering keys preserve it.
 */
function abstractKey(ac: AbstractConstraint): string {
    if (ac.type === 'align-x' || ac.type === 'align-y') {
        const [n1, n2] = [ac.nodeA, ac.nodeB].sort();
        return `${ac.type}|${n1}|${n2}`;
    }
    return `${ac.type}|${ac.nodeA}|${ac.nodeB}`;
}

/**
 * Extract an AbstractConstraint from a LayoutConstraint, stripping distances.
 */
function toAbstract(c: LayoutConstraint): AbstractConstraint | null {
    const desc = c.sourceConstraint?.toHTML?.() ?? '';
    if (isLeftConstraint(c)) {
        return { type: 'left-of', nodeA: c.left.id, nodeB: c.right.id, sourceDescription: desc };
    }
    if (isTopConstraint(c)) {
        return { type: 'above', nodeA: c.top.id, nodeB: c.bottom.id, sourceDescription: desc };
    }
    if (isAlignmentConstraint(c)) {
        const t: AbstractConstraintType = c.axis === 'x' ? 'align-x' : 'align-y';
        return { type: t, nodeA: c.node1.id, nodeB: c.node2.id, sourceDescription: desc };
    }
    return null;
}

/**
 * Build a deduplicated set of AbstractConstraints from a layout's conjunctive
 * constraints, keyed by their canonical key.
 */
function abstractConstraintSet(
    constraints: LayoutConstraint[],
): Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }> {
    const map = new Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>();
    for (const c of constraints) {
        const ac = toAbstract(c);
        if (!ac) continue;
        const key = abstractKey(ac);
        if (!map.has(key)) map.set(key, { abstract: ac, concrete: c });
    }
    return map;
}

// ---------------------------------------------------------------------------
// Standalone Kiwi solver for extracting concrete positions
// ---------------------------------------------------------------------------

/** A concrete assignment of node ids to (x, y) positions. */
export type Realization = Map<string, { x: number; y: number }>;

/**
 * Build a fresh Kiwi solver from the given nodes and constraints, solve,
 * and return the resulting positions.  Returns `null` if the system is
 * infeasible.
 *
 * Only handles Left, Top, and Alignment constraints (the types that the
 * abstract layer cares about).
 */
function solveForPositions(
    nodes: LayoutNode[],
    constraints: LayoutConstraint[],
): Realization | null {
    const solver = new Solver();
    const vars = new Map<string, { x: Variable; y: Variable }>();

    // Create variables
    for (const n of nodes) {
        vars.set(n.id, { x: new Variable(`${n.id}_x`), y: new Variable(`${n.id}_y`) });
    }

    // Convert and add constraints
    for (const c of constraints) {
        try {
            if (isLeftConstraint(c)) {
                const lv = vars.get(c.left.id);
                const rv = vars.get(c.right.id);
                if (!lv || !rv) continue;
                const minDist = c.left.width;
                // left.x + left.width <= right.x
                const expr = new Expression(lv.x, minDist);
                solver.addConstraint(new KiwiConstraint(expr, Operator.Le, rv.x, Strength.required));
            } else if (isTopConstraint(c)) {
                const tv = vars.get(c.top.id);
                const bv = vars.get(c.bottom.id);
                if (!tv || !bv) continue;
                const minDist = c.top.height;
                // top.y + top.height <= bottom.y
                const expr = new Expression(tv.y, minDist);
                solver.addConstraint(new KiwiConstraint(expr, Operator.Le, bv.y, Strength.required));
            } else if (isAlignmentConstraint(c)) {
                const v1 = vars.get(c.node1.id);
                const v2 = vars.get(c.node2.id);
                if (!v1 || !v2) continue;
                const axis = c.axis;
                solver.addConstraint(new KiwiConstraint(v1[axis], Operator.Eq, v2[axis], Strength.required));
            }
        } catch {
            // Infeasible — constraint could not be added
            return null;
        }
    }

    try {
        solver.updateVariables();
    } catch {
        return null;
    }

    const positions: Realization = new Map();
    for (const n of nodes) {
        const v = vars.get(n.id)!;
        positions.set(n.id, { x: v.x.value(), y: v.y.value() });
    }
    return positions;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** A constraint tagged with which system it originated from. */
export interface TaggedConstraint {
    constraint: LayoutConstraint;
    abstract: AbstractConstraint;
    source: 'first' | 'second';
}

/**
 * Describes a conflict found when merging two constraint systems.
 */
export interface ConflictDetail {
    /** The constraint that triggered infeasibility when added. */
    triggeringConstraint: TaggedConstraint;
    /** Minimal set of constraints that conflict with the triggering constraint. */
    minimalConflictingSet: TaggedConstraint[];
}

/**
 * Result of comparing two layout constraint systems.
 */
export type EquivalenceResult =
    | { equivalent: true }
    | {
        equivalent: false;
        /** How the two systems relate to each other. */
        relationship:
            | 'incompatible'
            | 'first-strictly-contains-second'
            | 'second-strictly-contains-first'
            | 'overlapping';
        /** Conflict details — constraints from one system that make the other infeasible. */
        conflicts: ConflictDetail[];
        /**
         * Abstract constraints unique to the first system that are *not*
         * implied by the second (genuine extras, not redundant).
         */
        genuineExtrasInFirst: AbstractConstraint[];
        /**
         * Abstract constraints unique to the second system that are *not*
         * implied by the first.
         */
        genuineExtrasInSecond: AbstractConstraint[];
        /**
         * A concrete assignment of node positions that witnesses the
         * non-equivalence.  For 'incompatible' / 'first-strictly-contains-second' /
         * 'overlapping' this is a point in L(A) \ L(B).  For
         * 'second-strictly-contains-first' it is a point in L(B) \ L(A).
         *
         * May be `undefined` if the solver cannot produce one (should not
         * happen under normal circumstances).
         */
        separatingRealization?: Realization;
        /**
         * Which system the separating realization satisfies.
         * 'first' means it is in L(A) but not L(B), etc.
         */
        realizationSatisfies?: 'first' | 'second';
    };

// ---------------------------------------------------------------------------
// Syntactic diff at the abstract level
// ---------------------------------------------------------------------------

interface AbstractDiff {
    onlyInA: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>;
    onlyInB: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>;
    shared: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>;
}

function diffAbstractSets(
    setA: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
    setB: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
): AbstractDiff {
    const onlyInA = new Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>();
    const shared = new Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>();
    const onlyInB = new Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>();

    for (const [key, val] of setA) {
        if (setB.has(key)) shared.set(key, val);
        else onlyInA.set(key, val);
    }
    for (const [key, val] of setB) {
        if (!setA.has(key)) onlyInB.set(key, val);
    }
    return { onlyInA, onlyInB, shared };
}

// ---------------------------------------------------------------------------
// Semantic implication check
// ---------------------------------------------------------------------------

/**
 * Result of checking whether an extra constraint is implied by a base set.
 * When `implied` is false, `realization` is a concrete position assignment
 * that satisfies the base set but violates the extra constraint.
 */
interface ImplicationResult {
    implied: boolean;
    /** A position assignment satisfying the base set + negated extra (witnesses non-implication). */
    realization?: Realization;
}

/**
 * Given a base set of constraints and an extra constraint, check whether the
 * extra constraint is *implied* by the base set by attempting to satisfy the
 * base set together with the **negation** of the extra.  If every negation
 * alternative is infeasible, the extra is implied.  Otherwise, the solver's
 * solution is a separating realization.
 */
function checkImplication(
    nodes: LayoutNode[],
    baseConstraints: LayoutConstraint[],
    extra: LayoutConstraint,
): ImplicationResult {
    const negated = negateConstraint(extra, nodes);
    if (negated.length === 0) return { implied: false };

    for (const alt of negated) {
        const allConstraints = [...baseConstraints, ...alt];
        const merged: InstanceLayout = {
            nodes,
            edges: [],
            constraints: allConstraints,
            groups: [],
        };
        const validator = new ConstraintValidator(merged);
        const error = validator.validatePositionalConstraints();
        if (!error) {
            // This negation alternative is satisfiable → extra is NOT implied.
            // Solve again with the standalone solver to extract positions.
            const realization = solveForPositions(nodes, allConstraints);
            return { implied: false, realization: realization ?? undefined };
        }
    }
    return { implied: true };
}

/** Backwards-compatible wrapper used internally. */
function isImpliedByBaseSet(
    nodes: LayoutNode[],
    baseConstraints: LayoutConstraint[],
    extra: LayoutConstraint,
): boolean {
    return checkImplication(nodes, baseConstraints, extra).implied;
}

/**
 * Produce one or more *alternative* constraint sets whose conjunction
 * represents the negation of the given constraint.
 *
 * - `left-of` (A.x + A.width ≤ B.x)  →  negation is B.x + ε ≤ A.x
 *   (B must be to the left of A — approximates A.x + A.width > B.x)
 * - `above` (A.y + A.height ≤ B.y)  →  negation is B.y + ε ≤ A.y
 * - `align-x` (A.x = B.x)  →  disjunction: A.x + ε ≤ B.x  OR  B.x + ε ≤ A.x
 *   (returned as two separate alternatives)
 * - `align-y` (A.y = B.y)  →  same pattern on y
 *
 * Each alternative is an array of LayoutConstraint[].  The negation holds
 * iff *at least one* alternative is satisfiable.
 */
function negateConstraint(
    constraint: LayoutConstraint,
    nodes: LayoutNode[],
): LayoutConstraint[][] {
    // We need concrete LayoutNode references for the negated constraints.
    const nodeMap = new Map<string, LayoutNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    if (isLeftConstraint(constraint)) {
        // Original: left.x + left.width ≤ right.x
        // Negation: right.x + 1 ≤ left.x  (i.e. right is strictly left of left)
        const right = nodeMap.get(constraint.right.id);
        const left = nodeMap.get(constraint.left.id);
        if (!right || !left) return [];
        const neg: LeftConstraint = {
            left: right, right: left, minDistance: 1,
            sourceConstraint: constraint.sourceConstraint,
        };
        return [[neg]];
    }

    if (isTopConstraint(constraint)) {
        // Original: top.y + top.height ≤ bottom.y
        // Negation: bottom.y + 1 ≤ top.y
        const bottom = nodeMap.get(constraint.bottom.id);
        const top = nodeMap.get(constraint.top.id);
        if (!bottom || !top) return [];
        const neg: TopConstraint = {
            top: bottom, bottom: top, minDistance: 1,
            sourceConstraint: constraint.sourceConstraint,
        };
        return [[neg]];
    }

    if (isAlignmentConstraint(constraint)) {
        // Original: node1[axis] = node2[axis]
        // Negation: node1[axis] ≠ node2[axis]
        //   = (node1[axis] < node2[axis]) OR (node2[axis] < node1[axis])
        // Expressed as two alternatives using ordering constraints.
        const n1 = nodeMap.get(constraint.node1.id);
        const n2 = nodeMap.get(constraint.node2.id);
        if (!n1 || !n2) return [];

        if (constraint.axis === 'x') {
            // Alternative 1: n1 left-of n2
            const alt1: LeftConstraint = {
                left: n1, right: n2, minDistance: 1,
                sourceConstraint: constraint.sourceConstraint,
            };
            // Alternative 2: n2 left-of n1
            const alt2: LeftConstraint = {
                left: n2, right: n1, minDistance: 1,
                sourceConstraint: constraint.sourceConstraint,
            };
            return [[alt1], [alt2]];
        } else {
            // axis === 'y'
            const alt1: TopConstraint = {
                top: n1, bottom: n2, minDistance: 1,
                sourceConstraint: constraint.sourceConstraint,
            };
            const alt2: TopConstraint = {
                top: n2, bottom: n1, minDistance: 1,
                sourceConstraint: constraint.sourceConstraint,
            };
            return [[alt1], [alt2]];
        }
    }

    return [];
}

// ---------------------------------------------------------------------------
// Cross-system conflict detection (via merged solver)
// ---------------------------------------------------------------------------

/**
 * Try to find a constraint from system B that conflicts with system A.
 *
 * Constructs a merged InstanceLayout with A's constraints first, then B's,
 * and runs the standard ConstraintValidator.  If a positional conflict is
 * found the error already carries the IIS extracted by the validator.
 */
function findDirectionalConflict(
    nodes: LayoutNode[],
    constraintsA: LayoutConstraint[],
    constraintsB: LayoutConstraint[],
    setA: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
    setB: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
): ConflictDetail | null {
    const mergedConstraints = [...constraintsA, ...constraintsB];
    const boundaryIndex = constraintsA.length;

    const merged: InstanceLayout = {
        nodes,
        edges: [],
        constraints: mergedConstraints,
        groups: [],
    };

    const validator = new ConstraintValidator(merged);
    const error = validator.validatePositionalConstraints();

    if (error && isPositionalConstraintError(error)) {
        return tagIISConstraints(error, mergedConstraints, boundaryIndex, setA, setB);
    }
    return null;
}

/**
 * Tag constraints from a PositionalConstraintError with source labels,
 * using abstract keys to identify which system each constraint belongs to.
 */
function tagIISConstraints(
    error: PositionalConstraintError,
    allConstraints: LayoutConstraint[],
    boundaryIndex: number,
    setA: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
    setB: Map<string, { abstract: AbstractConstraint; concrete: LayoutConstraint }>,
): ConflictDetail {
    const tagOne = (c: LayoutConstraint, idx: number): TaggedConstraint => {
        const ac = toAbstract(c);
        const source: 'first' | 'second' = idx < boundaryIndex ? 'first' : 'second';
        return {
            constraint: c,
            abstract: ac ?? { type: 'left-of', nodeA: '', nodeB: '', sourceDescription: '' },
            source,
        };
    };

    const triggerIdx = allConstraints.indexOf(error.conflictingConstraint);
    const trigger = tagOne(error.conflictingConstraint, triggerIdx);

    const tagged: TaggedConstraint[] = [];
    for (const [, layoutConstraints] of error.minimalConflictingSet) {
        for (const lc of layoutConstraints) {
            const idx = allConstraints.indexOf(lc);
            tagged.push(tagOne(lc, idx >= 0 ? idx : 0));
        }
    }

    return { triggeringConstraint: trigger, minimalConflictingSet: tagged };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare the constraint sets generated by two LayoutInstances on the same
 * data instance.  Works at the **abstract constraint level** — strips
 * distances and compares the topological ordering/alignment requirements.
 *
 * When constraints unique to one system are found, a semantic implication
 * check determines whether they are genuinely new (narrow the feasible
 * region) or merely redundant (already implied by the other system).
 *
 * @param li1 - First LayoutInstance
 * @param li2 - Second LayoutInstance
 * @param data - The data instance to generate layouts from
 */
export function checkEquivalence(
    li1: LayoutInstance,
    li2: LayoutInstance,
    data: IDataInstance,
): EquivalenceResult {
    const result1 = li1.generateLayout(data);
    const result2 = li2.generateLayout(data);
    return checkLayoutEquivalence(result1.layout, result2.layout);
}

/**
 * Compare two InstanceLayouts directly (without going through LayoutInstance).
 * Useful when you already have generated layouts.
 */
export function checkLayoutEquivalence(
    layoutA: InstanceLayout,
    layoutB: InstanceLayout,
): EquivalenceResult {
    const nodes = layoutA.nodes;

    // 1. Abstract both constraint sets
    const setA = abstractConstraintSet(layoutA.constraints);
    const setB = abstractConstraintSet(layoutB.constraints);

    // 2. Syntactic diff at abstract level
    const diff = diffAbstractSets(setA, setB);

    if (diff.onlyInA.size === 0 && diff.onlyInB.size === 0) {
        return { equivalent: true };
    }

    // 3. Check for Kiwi-level conflicts (cross-system infeasibility)
    const conflictAB = findDirectionalConflict(
        nodes, layoutA.constraints, layoutB.constraints, setA, setB,
    );
    const conflictBA = findDirectionalConflict(
        nodes, layoutB.constraints, layoutA.constraints, setB, setA,
    );

    const conflicts: ConflictDetail[] = [];
    if (conflictAB) conflicts.push(conflictAB);
    if (conflictBA) conflicts.push(flipConflictLabels(conflictBA));

    // 4. Semantic implication check for extras, collecting separating realizations.
    //    For each constraint unique to A, check if B's constraints already imply it.
    //    If not, the solver yields a realization in L(B) \ L(A) (satisfies B, violates A's extra).
    const genuineExtrasInFirst: AbstractConstraint[] = [];
    let realizationForSecond: Realization | undefined; // in L(B) \ L(A)
    for (const [, { abstract: ac, concrete }] of diff.onlyInA) {
        const result = checkImplication(nodes, layoutB.constraints, concrete);
        if (!result.implied) {
            genuineExtrasInFirst.push(ac);
            if (!realizationForSecond && result.realization) {
                realizationForSecond = result.realization;
            }
        }
    }

    //    For each constraint unique to B, check if A's constraints already imply it.
    //    If not, the solver yields a realization in L(A) \ L(B) (satisfies A, violates B's extra).
    const genuineExtrasInSecond: AbstractConstraint[] = [];
    let realizationForFirst: Realization | undefined; // in L(A) \ L(B)
    for (const [, { abstract: ac, concrete }] of diff.onlyInB) {
        const result = checkImplication(nodes, layoutA.constraints, concrete);
        if (!result.implied) {
            genuineExtrasInSecond.push(ac);
            if (!realizationForFirst && result.realization) {
                realizationForFirst = result.realization;
            }
        }
    }

    // 5. If no conflicts and no genuine extras, the systems are equivalent
    if (conflicts.length === 0 &&
        genuineExtrasInFirst.length === 0 &&
        genuineExtrasInSecond.length === 0) {
        return { equivalent: true };
    }

    // 6. Classify relationship and pick separating realization
    const hasConflicts = conflicts.length > 0;
    const hasExtrasInFirst = genuineExtrasInFirst.length > 0;
    const hasExtrasInSecond = genuineExtrasInSecond.length > 0;

    // Choose the best realization to report.
    // Prefer one in L(A)\L(B) when available; fall back to L(B)\L(A).
    let separatingRealization: Realization | undefined;
    let realizationSatisfies: 'first' | 'second' | undefined;

    if (hasConflicts) {
        // Incompatible: any point in L(A) works as a witness in L(A)\L(B)
        // since L(A) ∩ L(B) = ∅.
        const r = solveForPositions(nodes, layoutA.constraints);
        if (r) {
            separatingRealization = r;
            realizationSatisfies = 'first';
        }
    } else if (realizationForFirst) {
        separatingRealization = realizationForFirst;
        realizationSatisfies = 'first';
    } else if (realizationForSecond) {
        separatingRealization = realizationForSecond;
        realizationSatisfies = 'second';
    }

    let relationship: EquivalenceResult & { equivalent: false };
    if (hasConflicts) {
        return {
            equivalent: false,
            relationship: 'incompatible',
            conflicts,
            genuineExtrasInFirst,
            genuineExtrasInSecond,
            separatingRealization,
            realizationSatisfies,
        };
    }
    if (hasExtrasInFirst && !hasExtrasInSecond) {
        return {
            equivalent: false,
            relationship: 'first-strictly-contains-second',
            conflicts: [],
            genuineExtrasInFirst,
            genuineExtrasInSecond: [],
            separatingRealization: realizationForSecond,
            realizationSatisfies: realizationForSecond ? 'second' as const : undefined,
        };
    }
    if (!hasExtrasInFirst && hasExtrasInSecond) {
        return {
            equivalent: false,
            relationship: 'second-strictly-contains-first',
            conflicts: [],
            genuineExtrasInFirst: [],
            genuineExtrasInSecond,
            separatingRealization: realizationForFirst,
            realizationSatisfies: realizationForFirst ? 'first' as const : undefined,
        };
    }
    return {
        equivalent: false,
        relationship: 'overlapping',
        conflicts: [],
        genuineExtrasInFirst,
        genuineExtrasInSecond,
        separatingRealization,
        realizationSatisfies,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Swap 'first'↔'second' labels in a ConflictDetail. */
function flipConflictLabels(detail: ConflictDetail): ConflictDetail {
    const flip = (s: 'first' | 'second') => (s === 'first' ? 'second' : 'first');
    return {
        triggeringConstraint: {
            ...detail.triggeringConstraint,
            source: flip(detail.triggeringConstraint.source),
        },
        minimalConflictingSet: detail.minimalConflictingSet.map(tc => ({
            ...tc,
            source: flip(tc.source),
        })),
    };
}

// Re-export utilities for testing / downstream use
export { abstractKey, toAbstract, abstractConstraintSet, diffAbstractSets, negateConstraint, solveForPositions };
