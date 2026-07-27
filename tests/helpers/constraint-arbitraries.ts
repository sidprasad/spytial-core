/**
 * Fast-check arbitraries for constraint validator PBT.
 *
 * Generates random constraint systems (nodes, orderings, alignments,
 * disjunctions, groups) for property-based testing.
 */

import * as fc from 'fast-check';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LayoutConstraint,
} from '../../src/layout/interfaces';
import { makeNode, leftOf, aboveOf, alignOnX, alignOnY, negativeLeftOf, negativeAboveOf, SRC, GBF } from './constraint-dsl';

// ─── Node pool ──────────────────────────────────────────────────────────────

/** Pool of N independently-sized nodes. */
function arbVariedNodePool(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.tuple(
        ...Array.from({ length: n }, (_, i) =>
            fc.record({
                w: fc.integer({ min: 20, max: 200 }),
                h: fc.integer({ min: 20, max: 120 }),
            }).map(({ w, h }) => makeNode(`N${i}`, w, h))
        )
    );
}

/** Pool of N nodes that all share one size. */
function arbUniformNodePool(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.record({
        w: fc.integer({ min: 20, max: 200 }),
        h: fc.integer({ min: 20, max: 120 }),
    }).map(({ w, h }) =>
        Array.from({ length: n }, (_, i) => makeNode(`N${i}`, w, h))
    );
}

/**
 * Generate a pool of N nodes.
 *
 * Mostly varied sizes, which is what real diagrams have (box width comes from
 * label text) and what separates the "starts before" and "clears" readings of
 * an ordering. A minority are UNIFORM: drawing independently from 20..200 makes
 * an all-equal pool vanishingly unlikely, yet that is the degenerate case where
 * the two readings coincide, so it needs to be hit on purpose rather than left
 * to chance.
 */
export function arbNodePool(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.oneof(
        { arbitrary: arbVariedNodePool(n), weight: 4 },
        { arbitrary: arbUniformNodePool(n), weight: 1 },
    );
}

// ─── Pair selection ─────────────────────────────────────────────────────────

/** Random distinct pair (i, j) where i !== j from a pool of size n. */
export function arbPair(n: number): fc.Arbitrary<[number, number]> {
    return fc.integer({ min: 0, max: n - 1 }).chain(i =>
        fc.integer({ min: 0, max: n - 2 }).map(j => {
            const jj = j >= i ? j + 1 : j;
            return [i, jj] as [number, number];
        })
    );
}

// ─── Atomic constraint generators ───────────────────────────────────────────

/**
 * Random separation gap.
 *
 * The DSL builders default to 15 and `negativeLeftOf` hard-codes 0, so before
 * this the whole generated suite used exactly two gap values. That matters most
 * for the modal queries: `isProperlyBefore` compares a summed path weight
 * against a single node size, so it is the gap-to-size ratio that decides the
 * answer, and node sizes range over 20..200. 0 is included deliberately — it is
 * the boundary where the forced separation is exactly one box, so the pair
 * touches and is NOT "before" under the strict mechanized definition.
 */
export const arbGap: fc.Arbitrary<number> = fc.oneof(
    { arbitrary: fc.constant(0), weight: 1 },   // touching: the strictness boundary
    { arbitrary: fc.constant(15), weight: 2 },  // the historical default
    { arbitrary: fc.integer({ min: 1, max: 40 }), weight: 3 },
);

/** Random ordering constraint: A <x B, B <x A, A <y B, or B <y A. */
export function arbOrdering(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 0, max: 3 }), arbGap).map(([[i, j], type, gap]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j], gap);
            case 1: return leftOf(nodes[j], nodes[i], gap);
            case 2: return aboveOf(nodes[i], nodes[j], gap);
            case 3: return aboveOf(nodes[j], nodes[i], gap);
            default: return leftOf(nodes[i], nodes[j], gap);
        }
    });
}

/** Random negative (zero-gap) ordering constraint. */
export function arbNegativeOrdering(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 0, max: 3 })).map(([[i, j], type]) => {
        switch (type) {
            case 0: return negativeLeftOf(nodes[i], nodes[j]);
            case 1: return negativeLeftOf(nodes[j], nodes[i]);
            case 2: return negativeAboveOf(nodes[i], nodes[j]);
            case 3: return negativeAboveOf(nodes[j], nodes[i]);
            default: return negativeLeftOf(nodes[i], nodes[j]);
        }
    });
}

/** Random ordering, positive or negative (zero-gap). */
export function arbMixedOrdering(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.boolean().chain(positive =>
        positive ? arbOrdering(nodes) : arbNegativeOrdering(nodes)
    );
}

/** Random alignment constraint: =x or =y. */
export function arbAlignment(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.boolean()).map(([[i, j], isX]) =>
        isX ? alignOnX(nodes[i], nodes[j]) : alignOnY(nodes[i], nodes[j])
    );
}

/** Random conjunctive constraint (ordering or alignment). */
export function arbConjunctive(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 0, max: 3 }), arbGap).map(([[i, j], type, gap]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j], gap);
            case 1: return aboveOf(nodes[i], nodes[j], gap);
            case 2: return alignOnX(nodes[i], nodes[j]);
            case 3: return alignOnY(nodes[i], nodes[j]);
            default: return leftOf(nodes[i], nodes[j], gap);
        }
    });
}

// ─── Disjunction generators ─────────────────────────────────────────────────

/** Random disjunction with 2–4 ordering alternatives between a pair. */
export function arbDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 2, max: 4 }), arbGap).map(([[i, j], numAlts, gap]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j], gap)],
            [leftOf(nodes[j], nodes[i], gap)],
            [aboveOf(nodes[i], nodes[j], gap)],
            [aboveOf(nodes[j], nodes[i], gap)],
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

/** Random disjunction that may include alignment alternatives. */
export function arbRichDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 2, max: 5 }), arbGap).map(([[i, j], numAlts, gap]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j], gap)],
            [leftOf(nodes[j], nodes[i], gap)],
            [aboveOf(nodes[i], nodes[j], gap)],
            [aboveOf(nodes[j], nodes[i], gap)],
            [alignOnX(nodes[i], nodes[j])],
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

/**
 * Random disjunction whose alternatives are CONJUNCTIONS of two orderings over
 * two different pairs.
 *
 * arbDisjunction and arbRichDisjunction both emit singleton alternatives over a
 * single pair, so no generated disjunction could ever fail partway through an
 * alternative: the first constraint either went in or it did not. Multi-
 * constraint alternatives are what reach the partial-assignment undo path —
 * add constraint 1, reject constraint 2, roll back constraint 1 — which is
 * where #520's edge-deletion bug lived. Only a hand-written generator covered
 * it before.
 *
 * Alternatives deliberately reuse the same pairs in different directions, so
 * some rollbacks release an edge another alternative or the base set still
 * claims.
 */
export function arbCompoundDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    return fc.tuple(
        arbPair(nodes.length),
        arbPair(nodes.length),
        fc.integer({ min: 2, max: 3 }),
        arbGap,
        arbGap,
    ).map(([[i, j], [k, l], numAlts, gap1, gap2]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j], gap1), aboveOf(nodes[k], nodes[l], gap2)],
            [leftOf(nodes[j], nodes[i], gap1), aboveOf(nodes[l], nodes[k], gap2)],
            [aboveOf(nodes[i], nodes[j], gap2), leftOf(nodes[l], nodes[k], gap1)],
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

// ─── Group generators ───────────────────────────────────────────────────────

/** Random group containing 2+ nodes from the pool. */
export function arbGroup(nodes: LayoutNode[]): fc.Arbitrary<LayoutGroup> {
    const n = nodes.length;
    return fc.tuple(
        fc.integer({ min: 0, max: 99 }),  // group index for unique naming
        fc.shuffledSubarray(
            Array.from({ length: n }, (_, i) => i),
            { minLength: 2, maxLength: Math.min(n, 4) }
        ),
        fc.boolean(),  // negated?
    ).map(([gIdx, indices, negated]) => {
        const memberIds = indices.map(i => nodes[i].id);
        return {
            name: `G${gIdx}`,
            nodeIds: memberIds,
            keyNodeId: memberIds[0],
            showLabel: true,
            sourceConstraint: GBF,
            negated,
        };
    });
}

// ─── Full system generators ─────────────────────────────────────────────────

/** Build an InstanceLayout from generated parts. */
export function buildLayout(
    nodes: LayoutNode[],
    constraints: LayoutConstraint[],
    disjunctions?: DisjunctiveConstraint[],
    groups?: LayoutGroup[],
): InstanceLayout {
    return {
        nodes,
        edges: [],
        constraints,
        groups: groups ?? [],
        disjunctiveConstraints: disjunctions && disjunctions.length > 0 ? disjunctions : undefined,
    };
}

/** Generate a random constraint system with orderings only. */
export function arbOrderingSystem(nodeCount: number, maxConstraints: number): fc.Arbitrary<InstanceLayout> {
    return arbNodePool(nodeCount).chain(nodes =>
        fc.array(arbOrdering(nodes), { minLength: 1, maxLength: maxConstraints })
            .map(constraints => buildLayout(nodes, constraints))
    );
}

/** Generate a random constraint system with orderings + alignments. */
export function arbMixedSystem(nodeCount: number, maxConstraints: number): fc.Arbitrary<InstanceLayout> {
    return arbNodePool(nodeCount).chain(nodes =>
        fc.array(arbConjunctive(nodes), { minLength: 1, maxLength: maxConstraints })
            .map(constraints => buildLayout(nodes, constraints))
    );
}

/** Generate a random constraint system with conjunctive + disjunctive constraints. */
export function arbDisjunctiveSystem(nodeCount: number, maxConj: number, maxDisj: number): fc.Arbitrary<InstanceLayout> {
    return arbNodePool(nodeCount).chain(nodes =>
        fc.tuple(
            fc.array(arbConjunctive(nodes), { minLength: 0, maxLength: maxConj }),
            fc.array(arbRichDisjunction(nodes), { minLength: 1, maxLength: maxDisj }),
        ).map(([constraints, disjunctions]) =>
            buildLayout(nodes, constraints, disjunctions)
        )
    );
}

/** Generate a random constraint system with groups. */
export function arbGroupSystem(nodeCount: number, maxConstraints: number): fc.Arbitrary<InstanceLayout> {
    return arbNodePool(nodeCount).chain(nodes =>
        fc.tuple(
            fc.array(arbOrdering(nodes), { minLength: 0, maxLength: maxConstraints }),
            fc.array(arbGroup(nodes), { minLength: 1, maxLength: 2 }),
        ).map(([constraints, groups]) =>
            buildLayout(nodes, constraints, undefined, groups)
        )
    );
}

/** Generate a full random constraint system (conjunctive + disjunctive + groups). */
export function arbFullSystem(nodeCount: number): fc.Arbitrary<InstanceLayout> {
    return arbNodePool(nodeCount).chain(nodes =>
        fc.tuple(
            fc.array(arbConjunctive(nodes), { minLength: 0, maxLength: 6 }),
            fc.array(arbRichDisjunction(nodes), { minLength: 0, maxLength: 3 }),
            fc.array(arbGroup(nodes), { minLength: 0, maxLength: 2 }),
        ).map(([constraints, disjunctions, groups]) =>
            buildLayout(nodes, constraints, disjunctions.length > 0 ? disjunctions : undefined, groups)
        )
    );
}
