/**
 * Property-based tests for LayoutEvaluator.
 *
 * Uses fast-check with the existing constraint arbitraries to verify
 * structural invariants of the must/can/cannot modal operators.
 *
 * Properties tested:
 *   1. must ⊆ can (everything that must hold can hold)
 *   2. must ∩ cannot = ∅ (nothing can both must and cannot hold)
 *   3. Antisymmetry: if A ∈ must.leftOf(B), then B ∈ cannot.leftOf(A)
 *   4. Reflexive exclusion: X ∈ cannot.relation(X) for directional relations
 *   5. Monotonicity of must: adding constraints can only grow must sets
 *   6. can = must when no disjunctions
 *   7. Alignment symmetry: A ∈ must.xAligned(B) ↔ B ∈ must.xAligned(A)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LayoutEvaluator } from '../src/evaluators/layout-evaluator';
import type { SpatialRelation, SpatialQuery } from '../src/evaluators/interfaces';
import type { InstanceLayout } from '../src/layout/interfaces';
import { DisjunctiveConstraint } from '../src/layout/interfaces';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    arbOrderingSystem,
    arbMixedSystem,
    arbDisjunctiveSystem,
    arbGroupSystem,
    arbFullSystem,
    buildLayout,
    arbNodePool,
    arbOrdering,
    arbConjunctive,
} from './helpers/constraint-arbitraries';
import { describeLayout } from './helpers/constraint-dsl';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeEvaluator(layout: InstanceLayout): LayoutEvaluator {
    const cloned: InstanceLayout = {
        ...layout,
        constraints: [...layout.constraints],
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? layout.disjunctiveConstraints.map(d =>
                new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a])))
            : undefined,
    };
    const validator = new QualitativeConstraintValidator(cloned);
    validator.validateConstraints();
    const ev = new LayoutEvaluator();
    ev.initialize(cloned, validator);
    return ev;
}

function getAtoms(ev: LayoutEvaluator, modality: 'must' | 'can' | 'cannot', query: SpatialQuery): Set<string> {
    const result = modality === 'must' ? ev.must(query) :
                   modality === 'can' ? ev.can(query) :
                   ev.cannot(query);
    if (result.isError()) return new Set();
    return new Set(result.selectedAtoms());
}

/**
 * Check if a layout is contradictory (unsatisfiable).
 * Detects:
 *   - Ordering cycles (A<B, B<A)
 *   - Alignment+ordering conflicts (A above B AND A y-aligned with B)
 * Properties like must∩cannot=∅ only hold for satisfiable systems.
 */
function hasContradictions(layout: InstanceLayout): boolean {
    // Build adjacency for horizontal and vertical orderings
    const hAdj = new Map<string, Set<string>>(); // left→right
    const vAdj = new Map<string, Set<string>>(); // top→bottom
    // Collect alignment pairs
    const xAligned = new Set<string>(); // "A,B" pairs
    const yAligned = new Set<string>();

    for (const c of layout.constraints) {
        if ('left' in c && 'right' in c) {
            const l = (c as any).left.id, r = (c as any).right.id;
            if (!hAdj.has(l)) hAdj.set(l, new Set());
            hAdj.get(l)!.add(r);
        }
        if ('top' in c && 'bottom' in c) {
            const t = (c as any).top.id, b = (c as any).bottom.id;
            if (!vAdj.has(t)) vAdj.set(t, new Set());
            vAdj.get(t)!.add(b);
        }
        if ('axis' in c && 'node1' in c) {
            const a = (c as any).node1.id, b = (c as any).node2.id;
            const key = [a, b].sort().join(',');
            if ((c as any).axis === 'x') xAligned.add(key);
            else yAligned.add(key);
        }
    }

    // DFS cycle detection
    function hasCycle(adj: Map<string, Set<string>>): boolean {
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map<string, number>();
        for (const node of adj.keys()) color.set(node, WHITE);

        function dfs(u: string): boolean {
            color.set(u, GRAY);
            for (const v of adj.get(u) ?? []) {
                if (!color.has(v)) color.set(v, WHITE);
                if (color.get(v) === GRAY) return true;
                if (color.get(v) === WHITE && dfs(v)) return true;
            }
            color.set(u, BLACK);
            return false;
        }

        for (const node of adj.keys()) {
            if (color.get(node) === WHITE && dfs(node)) return true;
        }
        return false;
    }

    if (hasCycle(hAdj) || hasCycle(vAdj)) return true;

    // Check alignment+ordering conflicts:
    // x-aligned means same x-position, contradicts left/right ordering
    // y-aligned means same y-position, contradicts above/below ordering
    function getTransitiveReachable(start: string, adj: Map<string, Set<string>>): Set<string> {
        const visited = new Set<string>();
        const stack = [start];
        while (stack.length > 0) {
            const curr = stack.pop()!;
            if (visited.has(curr)) continue;
            visited.add(curr);
            for (const n of adj.get(curr) ?? []) {
                if (!visited.has(n)) stack.push(n);
            }
        }
        visited.delete(start);
        return visited;
    }

    // x-aligned pair with horizontal ordering = contradiction
    for (const pair of xAligned) {
        const [a, b] = pair.split(',');
        const rightOfA = getTransitiveReachable(a, hAdj);
        const rightOfB = getTransitiveReachable(b, hAdj);
        if (rightOfA.has(b) || rightOfB.has(a)) return true;
    }

    // y-aligned pair with vertical ordering = contradiction
    for (const pair of yAligned) {
        const [a, b] = pair.split(',');
        const belowA = getTransitiveReachable(a, vAdj);
        const belowB = getTransitiveReachable(b, vAdj);
        if (belowA.has(b) || belowB.has(a)) return true;
    }

    return false;
}

const DIRECTIONAL_RELATIONS: SpatialRelation[] = ['leftOf', 'rightOf', 'above', 'below'];
const ALIGNMENT_RELATIONS: SpatialRelation[] = ['xAligned', 'yAligned'];
const ALL_RELATIONS: SpatialRelation[] = [...DIRECTIONAL_RELATIONS, ...ALIGNMENT_RELATIONS, 'grouped', 'contains'];

const OPPOSITE: Record<string, SpatialRelation> = {
    leftOf: 'rightOf',
    rightOf: 'leftOf',
    above: 'below',
    below: 'above',
};

// ─── Properties ─────────────────────────────────────────────────────────────

describe('LayoutEvaluator PBT', () => {
    // Property 1: must ⊆ can
    describe('must ⊆ can', () => {
        it('for ordering systems', () => {
            fc.assert(fc.property(
                arbOrderingSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...ALL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    const canSet = getAtoms(ev, 'can', { relation, nodeId });
                    for (const m of mustSet) {
                        if (!canSet.has(m)) {
                            throw new Error(
                                `must ⊄ can: ${m} ∈ must.${relation}(${nodeId}) but ∉ can.${relation}(${nodeId})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });

        it('for disjunctive systems', () => {
            fc.assert(fc.property(
                arbDisjunctiveSystem(4, 3, 2),
                fc.integer({ min: 0, max: 3 }),
                fc.constantFrom(...DIRECTIONAL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    const canSet = getAtoms(ev, 'can', { relation, nodeId });
                    for (const m of mustSet) {
                        if (!canSet.has(m)) {
                            throw new Error(
                                `must ⊄ can: ${m} ∈ must.${relation}(${nodeId}) but ∉ can.${relation}(${nodeId})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 2: must ∩ cannot = ∅ (only for satisfiable/acyclic systems)
    describe('must ∩ cannot = ∅', () => {
        it('for mixed systems (orderings + alignments)', () => {
            fc.assert(fc.property(
                arbMixedSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...ALL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    fc.pre(!hasContradictions(layout)); // Skip unsatisfiable systems
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    const cannotSet = getAtoms(ev, 'cannot', { relation, nodeId });
                    for (const m of mustSet) {
                        if (cannotSet.has(m)) {
                            throw new Error(
                                `must ∩ cannot ≠ ∅: ${m} ∈ must.${relation}(${nodeId}) ∩ cannot.${relation}(${nodeId})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 300 });
        });

        it('for full systems', () => {
            fc.assert(fc.property(
                arbFullSystem(4),
                fc.integer({ min: 0, max: 3 }),
                fc.constantFrom(...DIRECTIONAL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    fc.pre(!hasContradictions(layout)); // Skip unsatisfiable systems
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    const cannotSet = getAtoms(ev, 'cannot', { relation, nodeId });
                    for (const m of mustSet) {
                        if (cannotSet.has(m)) {
                            throw new Error(
                                `must ∩ cannot ≠ ∅: ${m} ∈ must.${relation}(${nodeId}) ∩ cannot.${relation}(${nodeId})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 3: Antisymmetry for directional relations
    // If A ∈ must.leftOf(B), then B ∈ cannot.leftOf(A)
    describe('antisymmetry: must.R(X) ⊆ cannot.R⁻¹(each member)', () => {
        it('for ordering systems', () => {
            fc.assert(fc.property(
                arbOrderingSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...DIRECTIONAL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    // Each member of must.R(nodeId) should have nodeId in its cannot.R set
                    // because if A must be left of B, then B cannot be left of A
                    for (const member of mustSet) {
                        const cannotForMember = getAtoms(ev, 'cannot', { relation, nodeId: member });
                        if (!cannotForMember.has(nodeId)) {
                            throw new Error(
                                `Antisymmetry violated: ${member} ∈ must.${relation}(${nodeId}) ` +
                                `but ${nodeId} ∉ cannot.${relation}(${member})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 300 });
        });
    });

    // Property 4: Reflexive exclusion — X ∈ cannot.R(X) for directional relations
    describe('reflexive exclusion: X ∈ cannot.R(X) for directional relations', () => {
        it('for any system', () => {
            fc.assert(fc.property(
                arbMixedSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...DIRECTIONAL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const cannotSet = getAtoms(ev, 'cannot', { relation, nodeId });
                    if (!cannotSet.has(nodeId)) {
                        throw new Error(
                            `Reflexive exclusion violated: ${nodeId} ∉ cannot.${relation}(${nodeId})\n` +
                            `Layout: ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 5: X ∉ must.R(X) for any relation (no self-loops)
    describe('no self-loops: X ∉ must.R(X)', () => {
        it('for any system', () => {
            fc.assert(fc.property(
                arbFullSystem(4),
                fc.integer({ min: 0, max: 3 }),
                fc.constantFrom(...ALL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    if (mustSet.has(nodeId)) {
                        throw new Error(
                            `Self-loop: ${nodeId} ∈ must.${relation}(${nodeId})\n` +
                            `Layout: ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 6: can = must when no disjunctions
    describe('can = must when no disjunctions', () => {
        it('for ordering systems (no disjunctions)', () => {
            fc.assert(fc.property(
                arbOrderingSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...ALL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const mustSet = getAtoms(ev, 'must', { relation, nodeId });
                    const canSet = getAtoms(ev, 'can', { relation, nodeId });
                    // Without disjunctions, can should equal must
                    const mustArr = [...mustSet].sort();
                    const canArr = [...canSet].sort();
                    if (mustArr.join(',') !== canArr.join(',')) {
                        throw new Error(
                            `can ≠ must without disjunctions: ` +
                            `must.${relation}(${nodeId}) = {${mustArr.join(', ')}}, ` +
                            `can.${relation}(${nodeId}) = {${canArr.join(', ')}}\n` +
                            `Layout: ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 7: Alignment symmetry
    describe('alignment symmetry: A ∈ must.aligned(B) ↔ B ∈ must.aligned(A)', () => {
        it('for mixed systems', () => {
            fc.assert(fc.property(
                arbMixedSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...ALIGNMENT_RELATIONS),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const aligned = getAtoms(ev, 'must', { relation, nodeId });
                    for (const member of aligned) {
                        const reverse = getAtoms(ev, 'must', { relation, nodeId: member });
                        if (!reverse.has(nodeId)) {
                            throw new Error(
                                `Alignment asymmetry: ${member} ∈ must.${relation}(${nodeId}) ` +
                                `but ${nodeId} ∉ must.${relation}(${member})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 8: Directional transitivity (acyclic systems only)
    // If A ∈ must.leftOf(B) and B ∈ must.leftOf(C), then A ∈ must.leftOf(C)
    describe('transitivity of directional relations', () => {
        it('for ordering systems', () => {
            fc.assert(fc.property(
                arbOrderingSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom(...DIRECTIONAL_RELATIONS),
                (layout, nodeIdx, relation) => {
                    fc.pre(!hasContradictions(layout)); // Transitivity breaks in contradictory systems
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const oneHop = getAtoms(ev, 'must', { relation, nodeId });
                    for (const intermediate of oneHop) {
                        const twoHop = getAtoms(ev, 'must', { relation, nodeId: intermediate });
                        // Everything reachable from intermediate should also be reachable from nodeId
                        for (const target of twoHop) {
                            if (!oneHop.has(target)) {
                                throw new Error(
                                    `Transitivity violated: ${intermediate} ∈ must.${relation}(${nodeId}) ` +
                                    `and ${target} ∈ must.${relation}(${intermediate}) ` +
                                    `but ${target} ∉ must.${relation}(${nodeId})\n` +
                                    `Layout: ${describeLayout(layout)}`
                                );
                            }
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 9: Opposite direction consistency
    // A ∈ must.leftOf(B) ↔ B ∈ must.rightOf(A)
    describe('opposite direction: A ∈ must.R(B) ↔ B ∈ must.R⁻¹(A)', () => {
        it('for ordering systems', () => {
            fc.assert(fc.property(
                arbOrderingSystem(5, 6),
                fc.integer({ min: 0, max: 4 }),
                fc.constantFrom('leftOf' as SpatialRelation, 'above' as SpatialRelation),
                (layout, nodeIdx, relation) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const opposite = OPPOSITE[relation];
                    const ev = makeEvaluator(layout);
                    const forwardSet = getAtoms(ev, 'must', { relation, nodeId });
                    for (const member of forwardSet) {
                        const reverseSet = getAtoms(ev, 'must', { relation: opposite, nodeId: member });
                        if (!reverseSet.has(nodeId)) {
                            throw new Error(
                                `Opposite direction inconsistency: ${member} ∈ must.${relation}(${nodeId}) ` +
                                `but ${nodeId} ∉ must.${opposite}(${member})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });

    // Property 10: Group symmetry — grouped is symmetric
    describe('group symmetry: A ∈ must.grouped(B) ↔ B ∈ must.grouped(A)', () => {
        it('for group systems', () => {
            fc.assert(fc.property(
                arbGroupSystem(4, 3),
                fc.integer({ min: 0, max: 3 }),
                (layout, nodeIdx) => {
                    if (nodeIdx >= layout.nodes.length) return;
                    const nodeId = layout.nodes[nodeIdx].id;
                    const ev = makeEvaluator(layout);
                    const grouped = getAtoms(ev, 'must', { relation: 'grouped', nodeId });
                    for (const member of grouped) {
                        const reverse = getAtoms(ev, 'must', { relation: 'grouped', nodeId: member });
                        if (!reverse.has(nodeId)) {
                            throw new Error(
                                `Group asymmetry: ${member} ∈ must.grouped(${nodeId}) ` +
                                `but ${nodeId} ∉ must.grouped(${member})\n` +
                                `Layout: ${describeLayout(layout)}`
                            );
                        }
                    }
                }
            ), { numRuns: 200 });
        });
    });
});
