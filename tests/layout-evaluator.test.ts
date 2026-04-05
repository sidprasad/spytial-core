import { describe, it, expect } from 'vitest';
import { LayoutEvaluator, LayoutEvaluatorResult } from '../src/evaluators/layout-evaluator';
import type { InstanceLayout, LayoutNode, LayoutConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, LayoutGroup } from '../src/layout/interfaces';
import { DisjunctiveConstraint } from '../src/layout/interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint } from '../src/layout/layoutspec';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';

// ─── Helpers ──────────────────────────���──────────────────────────────────���────

function makeNode(id: string, label?: string): LayoutNode {
    return {
        id,
        label: label ?? id,
        color: '#000',
        width: 50,
        height: 50,
        mostSpecificType: 'Node',
        types: ['Node'],
        showLabels: true,
    };
}

const dummySource = new RelativeOrientationConstraint(['left'], 'Node', false);

function leftConstraint(left: LayoutNode, right: LayoutNode): LeftConstraint {
    return { left, right, minDistance: 30, sourceConstraint: dummySource };
}

function topConstraint(top: LayoutNode, bottom: LayoutNode): TopConstraint {
    return { top, bottom, minDistance: 30, sourceConstraint: dummySource };
}

function alignConstraint(axis: 'x' | 'y', node1: LayoutNode, node2: LayoutNode): AlignmentConstraint {
    return { axis, node1, node2, sourceConstraint: dummySource };
}

function makeLayout(
    nodes: LayoutNode[],
    constraints: LayoutConstraint[],
    groups: LayoutGroup[] = [],
): InstanceLayout {
    return { nodes, edges: [], constraints, groups };
}

/** Create a LayoutEvaluator backed by the qualitative solver. */
function makeEvaluator(layout: InstanceLayout): LayoutEvaluator {
    // Clone constraints since the validator mutates them
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

// ─── Fixtures ───────────────────────────────────────────────���─────────────────
//
// Chain fixture:  A ← B ← C  (left constraints: A is left of B, B is left of C)
//                 A above D
//                 Group G1 = {A, B}, key node = A
//
//  Spatial arrangement:
//      A — B — C
//      |
//      D

const A = makeNode('A');
const B = makeNode('B');
const C = makeNode('C');
const D = makeNode('D');

const chainLayout = makeLayout(
    [A, B, C, D],
    [
        leftConstraint(A, B),
        leftConstraint(B, C),
        topConstraint(A, D),
    ],
    [
        {
            name: 'G1',
            nodeIds: ['A', 'B'],
            keyNodeId: 'A',
            showLabel: true,
        },
    ],
);

// Alignment fixture: E, F, G all x-aligned; H, I y-aligned
const E = makeNode('E');
const F = makeNode('F');
const G = makeNode('G');
const H = makeNode('H');
const I = makeNode('I');

const alignLayout = makeLayout(
    [E, F, G, H, I],
    [
        alignConstraint('x', E, F),
        alignConstraint('x', F, G),
        alignConstraint('y', H, I),
        topConstraint(E, H), // E is above H — so E cannot be y-aligned with H
    ],
);

// Isolated node fixture: single node, no constraints
const Z = makeNode('Z');
const isolatedLayout = makeLayout([Z], []);

// ─── Phase 1: Directional must (transitive closure) ──────────────────────────

describe('LayoutEvaluator', () => {
    describe('Phase 1: must — directional constraints', () => {
        it('must.rightOf(A) returns B and C (transitive closure)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B', 'C']);
        });

        it('must.rightOf(B) returns only C', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'B' });
            expect(result.selectedAtoms()).toEqual(['C']);
        });

        it('must.rightOf(C) returns empty (leaf of chain)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'C' });
            expect(result.noResult()).toBe(true);
        });

        it('must.leftOf(C) returns A and B (transitive)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'C' });
            expect(result.selectedAtoms()).toEqual(['A', 'B']);
        });

        it('must.leftOf(A) returns empty', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'A' });
            expect(result.noResult()).toBe(true);
        });

        it('must.below(A) returns D', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'below', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['D']);
        });

        it('must.above(D) returns A', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'above', nodeId: 'D' });
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('must.above(A) returns empty (nothing above root)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'above', nodeId: 'A' });
            expect(result.noResult()).toBe(true);
        });

        it('must.rightOf with transitive=false still returns transitive results (solver always resolves transitively)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'A', transitive: false });
            // The solver's DCG always resolves transitive reachability
            expect(result.selectedAtoms()).toEqual(['B', 'C']);
        });

        it('isolated node has no must relations', () => {
            const ev = makeEvaluator(isolatedLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'Z' });
            expect(result.noResult()).toBe(true);
        });

        it('D has no horizontal relations (only vertical)', () => {
            const ev = makeEvaluator(chainLayout);
            expect(ev.must({ relation: 'leftOf', nodeId: 'D' }).noResult()).toBe(true);
            expect(ev.must({ relation: 'rightOf', nodeId: 'D' }).noResult()).toBe(true);
        });
    });

    // ─── Phase 1: cannot — antisymmetry ─────────────────────────��────────

    describe('Phase 1: cannot — antisymmetry of ordering', () => {
        it('cannot.leftOf(A) returns B, C, and A itself', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'A' });
            // A cannot be left of: things to its right (B, C) plus itself
            expect(result.selectedAtoms()).toEqual(['A', 'B', 'C']);
        });

        it('cannot.rightOf(C) returns A, B, and C itself', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'rightOf', nodeId: 'C' });
            expect(result.selectedAtoms()).toEqual(['A', 'B', 'C']);
        });

        it('cannot.above(D) includes D itself and things below D', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'above', nodeId: 'D' });
            // D has nothing below it, so just D itself
            expect(result.selectedAtoms()).toEqual(['D']);
        });

        it('cannot.below(A) includes A itself', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'below', nodeId: 'A' });
            // Things above A: none. Plus A itself.
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('cannot.leftOf(C) only includes C (nothing to its left is "to its right")', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'C' });
            // must.rightOf(C) = {} (nothing right of C), so cannot.leftOf(C) = {C}
            expect(result.selectedAtoms()).toEqual(['C']);
        });
    });

    // ─── Phase 1: Alignment ───────────────���──────────────────────────────

    describe('Phase 1: must/cannot — alignment', () => {
        it('must.xAligned(E) returns F and G (transitive equivalence class)', () => {
            const ev = makeEvaluator(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'E' });
            expect(result.selectedAtoms()).toEqual(['F', 'G']);
        });

        it('must.xAligned(G) returns E and F (symmetric)', () => {
            const ev = makeEvaluator(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'G' });
            expect(result.selectedAtoms()).toEqual(['E', 'F']);
        });

        it('must.yAligned(H) returns I', () => {
            const ev = makeEvaluator(alignLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'H' });
            expect(result.selectedAtoms()).toEqual(['I']);
        });

        it('must.xAligned for non-aligned node returns empty', () => {
            const ev = makeEvaluator(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'H' });
            expect(result.noResult()).toBe(true);
        });

        it('cannot.yAligned(E) includes H (E is above H, strict ordering)', () => {
            const ev = makeEvaluator(alignLayout);
            const result = ev.cannot({ relation: 'yAligned', nodeId: 'E' });
            // E is above H, so H cannot be y-aligned with E. Plus E itself.
            expect(result.selectedAtoms()).toContain('H');
            expect(result.selectedAtoms()).toContain('E');
        });

        it('cannot.xAligned for node with no horizontal ordering returns just self', () => {
            const ev = makeEvaluator(alignLayout);
            // H has no left/right constraints
            const result = ev.cannot({ relation: 'xAligned', nodeId: 'H' });
            expect(result.selectedAtoms()).toEqual(['H']);
        });
    });

    // ─── Phase 1: Groups ───────────────────────────────���─────────────────

    describe('Phase 1: must — groups', () => {
        it('must.grouped(A) returns B (co-member of G1)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B']);
        });

        it('must.grouped(B) returns A (symmetric)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'B' });
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('must.grouped(C) returns empty (not in any group)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'C' });
            expect(result.noResult()).toBe(true);
        });

        it('must.contains(A) returns B (A is key node of G1)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'contains', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B']);
        });

        it('must.contains(B) returns empty (B is not a key node)', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'contains', nodeId: 'B' });
            expect(result.noResult()).toBe(true);
        });
    });

    // ─── Error cases ──────────────────────────────────────────────���──────

    describe('error handling', () => {
        it('must with unknown node returns error result', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'UNKNOWN' });
            expect(result.isError()).toBe(true);
            expect(result.prettyPrint()).toContain('Unknown node');
        });

        it('cannot with unknown node returns error result', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'UNKNOWN' });
            expect(result.isError()).toBe(true);
        });

        it('throws when not initialized', () => {
            const ev = new LayoutEvaluator();
            expect(() => ev.must({ relation: 'leftOf', nodeId: 'A' })).toThrow('not initialized');
        });

        it('isReady returns false before init, true after', () => {
            const ev = new LayoutEvaluator();
            expect(ev.isReady()).toBe(false);
            ev.initialize(chainLayout);
            expect(ev.isReady()).toBe(true);
        });

        it('can() works after Phase 2 implementation', () => {
            const ev = makeEvaluator(chainLayout);
            // With no disjunctions, can = must
            const result = ev.can({ relation: 'leftOf', nodeId: 'A' });
            expect(result.noResult()).toBe(true);
        });
    });

    // ─── LayoutEvaluatorResult ───────────────────────────────────────────

    describe('LayoutEvaluatorResult', () => {
        it('prettyPrint formats atoms as comma-separated', () => {
            const result = LayoutEvaluatorResult.of(['B', 'C'], 'test');
            expect(result.prettyPrint()).toBe('B, C');
        });

        it('prettyPrint shows (empty) for no results', () => {
            const result = LayoutEvaluatorResult.of([], 'test');
            expect(result.prettyPrint()).toBe('(empty)');
        });

        it('prettyPrint shows error message', () => {
            const result = LayoutEvaluatorResult.error('test', 'bad node');
            expect(result.prettyPrint()).toBe('Error: bad node');
        });

        it('selectedAtoms throws on error result', () => {
            const result = LayoutEvaluatorResult.error('test', 'bad');
            expect(() => result.selectedAtoms()).toThrow();
        });

        it('getRawResult returns error structure for errors', () => {
            const result = LayoutEvaluatorResult.error('test', 'bad');
            const raw = result.getRawResult();
            expect(raw).toHaveProperty('error');
        });

        it('getRawResult returns tuples for normal results', () => {
            const result = LayoutEvaluatorResult.of(['A', 'B'], 'test');
            const raw = result.getRawResult();
            expect(Array.isArray(raw)).toBe(true);
        });

        it('getExpression returns the query expression', () => {
            const result = LayoutEvaluatorResult.of(['A'], 'must { x | leftOf(x, Node0) }');
            expect(result.getExpression()).toBe('must { x | leftOf(x, Node0) }');
        });
    });

    // ─── BST-like fixture ───────────────────────────────���────────────────
    //
    //        Root
    //       /    \
    //      L      R
    //     / \
    //   LL   LR
    //
    // Constraints: left children go left, right children go right, children go below parent

    describe('BST-like layout', () => {
        const Root = makeNode('Root');
        const L = makeNode('L');
        const R = makeNode('R');
        const LL = makeNode('LL');
        const LR = makeNode('LR');

        const bstLayout = makeLayout(
            [Root, L, R, LL, LR],
            [
                // Horizontal: left children to the left, right children to the right
                leftConstraint(L, Root),
                leftConstraint(Root, R),
                leftConstraint(LL, L),
                leftConstraint(L, LR),
                // Vertical: children below parent
                topConstraint(Root, L),
                topConstraint(Root, R),
                topConstraint(L, LL),
                topConstraint(L, LR),
                // Siblings aligned on y
                alignConstraint('y', L, R),
                alignConstraint('y', LL, LR),
            ],
        );

        it('must.leftOf(Root) returns L and LL (transitively left via constraints)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'Root' });
            // L is left of Root, LL is left of L → both transitively left of Root.
            // LR is to the RIGHT of L, so it's not in the leftOf chain from Root.
            expect(result.selectedAtoms()).toEqual(['L', 'LL']);
        });

        it('must.rightOf(Root) returns R', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'Root' });
            expect(result.selectedAtoms()).toEqual(['R']);
        });

        it('must.below(Root) returns L, LL, LR, R (all descendants)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'below', nodeId: 'Root' });
            expect(result.selectedAtoms()).toEqual(['L', 'LL', 'LR', 'R']);
        });

        it('must.above(LL) returns L, R, and Root (R is y-aligned with L, so also above LL)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'above', nodeId: 'LL' });
            // R is y-aligned with L (same vertical position), and L is above LL,
            // so the solver correctly infers R is also above LL.
            expect(result.selectedAtoms()).toEqual(['L', 'R', 'Root']);
        });

        it('must.yAligned(L) returns R (siblings)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'L' });
            expect(result.selectedAtoms()).toEqual(['R']);
        });

        it('must.yAligned(LL) returns LR (siblings)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'LL' });
            expect(result.selectedAtoms()).toEqual(['LR']);
        });

        it('cannot.yAligned(Root) includes L and R (Root is above them)', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.cannot({ relation: 'yAligned', nodeId: 'Root' });
            const atoms = result.selectedAtoms();
            expect(atoms).toContain('L');
            expect(atoms).toContain('R');
            expect(atoms).toContain('LL');
            expect(atoms).toContain('LR');
            expect(atoms).toContain('Root');
        });

        it('cannot.leftOf(LL) includes LL and everything to its right', () => {
            const ev = makeEvaluator(bstLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'LL' });
            const atoms = result.selectedAtoms();
            // LL is left of L, which is left of LR and Root, which is left of R
            // So rightOf(LL) transitively = {L, LR, Root, R}
            expect(atoms).toContain('LL');
            expect(atoms).toContain('L');
            expect(atoms).toContain('LR');
            expect(atoms).toContain('Root');
            expect(atoms).toContain('R');
        });
    });

    // ─── can = must (solver resolves disjunctions to a single assignment) ──

    describe('can — equals must after solver resolution', () => {
        const disjSource = new CyclicOrientationConstraint('clockwise', 'test');

        it('can equals must when there are no disjunctive constraints', () => {
            const ev = makeEvaluator(chainLayout);
            const mustResult = ev.must({ relation: 'rightOf', nodeId: 'A' }).selectedAtoms();
            const canResult = ev.can({ relation: 'rightOf', nodeId: 'A' }).selectedAtoms();
            expect(canResult).toEqual(mustResult);
        });

        it('can equals must for all directional relations on chain layout', () => {
            const ev = makeEvaluator(chainLayout);
            for (const relation of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                for (const nodeId of ['A', 'B', 'C', 'D']) {
                    const mustAtoms = ev.must({ relation, nodeId }).selectedAtoms();
                    const canAtoms = ev.can({ relation, nodeId }).selectedAtoms();
                    expect(canAtoms).toEqual(mustAtoms);
                }
            }
        });

        it('can with unknown node returns error', () => {
            const ev = makeEvaluator(chainLayout);
            const result = ev.can({ relation: 'leftOf', nodeId: 'UNKNOWN' });
            expect(result.isError()).toBe(true);
        });

        it('can = must even with disjunctive constraints present', () => {
            // Conjunctive: X1 left of X2.
            // Disjunction: Alt 1: X2 left of X1 (cycle → infeasible), Alt 2: X1 above X2 (feasible)
            const X1 = makeNode('X1');
            const X2 = makeNode('X2');

            const pruneLayout: InstanceLayout = {
                nodes: [X1, X2],
                edges: [],
                constraints: [leftConstraint(X1, X2)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(disjSource, [
                        [leftConstraint(X2, X1)],   // infeasible (cycle)
                        [topConstraint(X1, X2)],     // feasible
                    ]),
                ],
            };

            const ev = makeEvaluator(pruneLayout);
            // Conjunctive constraint is always visible
            expect(ev.must({ relation: 'leftOf', nodeId: 'X2' }).selectedAtoms()).toEqual(['X1']);
            // can = must for all queries
            for (const relation of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                for (const nodeId of ['X1', 'X2']) {
                    expect(ev.can({ relation, nodeId }).selectedAtoms())
                        .toEqual(ev.must({ relation, nodeId }).selectedAtoms());
                }
            }
        });

        it('solver resolves disjunctive alignment to one alternative', () => {
            const Y1 = makeNode('Y1');
            const Y2 = makeNode('Y2');
            const Y3 = makeNode('Y3');

            const alignDisjLayout: InstanceLayout = {
                nodes: [Y1, Y2, Y3],
                edges: [],
                constraints: [topConstraint(Y1, Y2)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(disjSource, [
                        [alignConstraint('y', Y2, Y3)],
                        [alignConstraint('y', Y1, Y3)],
                    ]),
                ],
            };

            const ev = makeEvaluator(alignDisjLayout);
            // Solver picks one alt — whichever it picks, can = must
            const canY1 = ev.can({ relation: 'yAligned', nodeId: 'Y1' }).selectedAtoms();
            const mustY1 = ev.must({ relation: 'yAligned', nodeId: 'Y1' }).selectedAtoms();
            expect(canY1).toEqual(mustY1);
        });
    });
});
