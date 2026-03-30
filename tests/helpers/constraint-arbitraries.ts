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
import { makeNode, leftOf, aboveOf, alignOnX, alignOnY, SRC, GBF } from './constraint-dsl';

// ─── Node pool ──────────────────────────────────────────────────────────────

/** Generate a pool of N nodes with random dimensions. */
export function arbNodePool(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.tuple(
        ...Array.from({ length: n }, (_, i) =>
            fc.record({
                w: fc.integer({ min: 20, max: 200 }),
                h: fc.integer({ min: 20, max: 120 }),
            }).map(({ w, h }) => makeNode(`N${i}`, w, h))
        )
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

/** Random ordering constraint: A <x B, B <x A, A <y B, or B <y A. */
export function arbOrdering(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 0, max: 3 })).map(([[i, j], type]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j]);
            case 1: return leftOf(nodes[j], nodes[i]);
            case 2: return aboveOf(nodes[i], nodes[j]);
            case 3: return aboveOf(nodes[j], nodes[i]);
            default: return leftOf(nodes[i], nodes[j]);
        }
    });
}

/** Random alignment constraint: =x or =y. */
export function arbAlignment(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.boolean()).map(([[i, j], isX]) =>
        isX ? alignOnX(nodes[i], nodes[j]) : alignOnY(nodes[i], nodes[j])
    );
}

/** Random conjunctive constraint (ordering or alignment). */
export function arbConjunctive(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 0, max: 3 })).map(([[i, j], type]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j]);
            case 1: return aboveOf(nodes[i], nodes[j]);
            case 2: return alignOnX(nodes[i], nodes[j]);
            case 3: return alignOnY(nodes[i], nodes[j]);
            default: return leftOf(nodes[i], nodes[j]);
        }
    });
}

// ─── Disjunction generators ─────────────────────────────────────────────────

/** Random disjunction with 2–4 ordering alternatives between a pair. */
export function arbDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 2, max: 4 })).map(([[i, j], numAlts]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j])],
            [leftOf(nodes[j], nodes[i])],
            [aboveOf(nodes[i], nodes[j])],
            [aboveOf(nodes[j], nodes[i])],
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

/** Random disjunction that may include alignment alternatives. */
export function arbRichDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    return fc.tuple(arbPair(nodes.length), fc.integer({ min: 2, max: 5 })).map(([[i, j], numAlts]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j])],
            [leftOf(nodes[j], nodes[i])],
            [aboveOf(nodes[i], nodes[j])],
            [aboveOf(nodes[j], nodes[i])],
            [alignOnX(nodes[i], nodes[j])],
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
