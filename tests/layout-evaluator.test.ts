import { describe, it, expect } from 'vitest';
import { LayoutEvaluator, LayoutEvaluatorResult } from '../src/evaluators/layout-evaluator';
import type { InstanceLayout, LayoutNode, LayoutConstraint, TopConstraint, LeftConstraint, AlignmentConstraint, LayoutGroup } from '../src/layout/interfaces';
import { DisjunctiveConstraint } from '../src/layout/interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint } from '../src/layout/layoutspec';

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
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B', 'C']);
        });

        it('must.rightOf(B) returns only C', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'B' });
            expect(result.selectedAtoms()).toEqual(['C']);
        });

        it('must.rightOf(C) returns empty (leaf of chain)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'C' });
            expect(result.noResult()).toBe(true);
        });

        it('must.leftOf(C) returns A and B (transitive)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'C' });
            expect(result.selectedAtoms()).toEqual(['A', 'B']);
        });

        it('must.leftOf(A) returns empty', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'A' });
            expect(result.noResult()).toBe(true);
        });

        it('must.below(A) returns D', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'below', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['D']);
        });

        it('must.above(D) returns A', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'above', nodeId: 'D' });
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('must.above(A) returns empty (nothing above root)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'above', nodeId: 'A' });
            expect(result.noResult()).toBe(true);
        });

        it('must.rightOf with transitive=false returns only immediate neighbors', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'A', transitive: false });
            expect(result.selectedAtoms()).toEqual(['B']);
        });

        it('isolated node has no must relations', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(isolatedLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'Z' });
            expect(result.noResult()).toBe(true);
        });

        it('D has no horizontal relations (only vertical)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            expect(ev.must({ relation: 'leftOf', nodeId: 'D' }).noResult()).toBe(true);
            expect(ev.must({ relation: 'rightOf', nodeId: 'D' }).noResult()).toBe(true);
        });
    });

    // ─── Phase 1: cannot — antisymmetry ─────────────────────────��────────

    describe('Phase 1: cannot — antisymmetry of ordering', () => {
        it('cannot.leftOf(A) returns B, C, and A itself', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'A' });
            // A cannot be left of: things to its right (B, C) plus itself
            expect(result.selectedAtoms()).toEqual(['A', 'B', 'C']);
        });

        it('cannot.rightOf(C) returns A, B, and C itself', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.cannot({ relation: 'rightOf', nodeId: 'C' });
            expect(result.selectedAtoms()).toEqual(['A', 'B', 'C']);
        });

        it('cannot.above(D) includes D itself and things below D', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.cannot({ relation: 'above', nodeId: 'D' });
            // D has nothing below it, so just D itself
            expect(result.selectedAtoms()).toEqual(['D']);
        });

        it('cannot.below(A) includes A itself', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.cannot({ relation: 'below', nodeId: 'A' });
            // Things above A: none. Plus A itself.
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('cannot.leftOf(C) only includes C (nothing to its left is "to its right")', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.cannot({ relation: 'leftOf', nodeId: 'C' });
            // must.rightOf(C) = {} (nothing right of C), so cannot.leftOf(C) = {C}
            expect(result.selectedAtoms()).toEqual(['C']);
        });
    });

    // ─── Phase 1: Alignment ───────────────���──────────────────────────────

    describe('Phase 1: must/cannot — alignment', () => {
        it('must.xAligned(E) returns F and G (transitive equivalence class)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'E' });
            expect(result.selectedAtoms()).toEqual(['F', 'G']);
        });

        it('must.xAligned(G) returns E and F (symmetric)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'G' });
            expect(result.selectedAtoms()).toEqual(['E', 'F']);
        });

        it('must.yAligned(H) returns I', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'H' });
            expect(result.selectedAtoms()).toEqual(['I']);
        });

        it('must.xAligned for non-aligned node returns empty', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            const result = ev.must({ relation: 'xAligned', nodeId: 'H' });
            expect(result.noResult()).toBe(true);
        });

        it('cannot.yAligned(E) includes H (E is above H, strict ordering)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            const result = ev.cannot({ relation: 'yAligned', nodeId: 'E' });
            // E is above H, so H cannot be y-aligned with E. Plus E itself.
            expect(result.selectedAtoms()).toContain('H');
            expect(result.selectedAtoms()).toContain('E');
        });

        it('cannot.xAligned for node with no horizontal ordering returns just self', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignLayout);
            // H has no left/right constraints
            const result = ev.cannot({ relation: 'xAligned', nodeId: 'H' });
            expect(result.selectedAtoms()).toEqual(['H']);
        });
    });

    // ─── Phase 1: Groups ───────────────────────────────���─────────────────

    describe('Phase 1: must — groups', () => {
        it('must.grouped(A) returns B (co-member of G1)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B']);
        });

        it('must.grouped(B) returns A (symmetric)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'B' });
            expect(result.selectedAtoms()).toEqual(['A']);
        });

        it('must.grouped(C) returns empty (not in any group)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'grouped', nodeId: 'C' });
            expect(result.noResult()).toBe(true);
        });

        it('must.contains(A) returns B (A is key node of G1)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'contains', nodeId: 'A' });
            expect(result.selectedAtoms()).toEqual(['B']);
        });

        it('must.contains(B) returns empty (B is not a key node)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'contains', nodeId: 'B' });
            expect(result.noResult()).toBe(true);
        });
    });

    // ─── Error cases ──────────────────────────────────────────────���──────

    describe('error handling', () => {
        it('must with unknown node returns error result', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'UNKNOWN' });
            expect(result.isError()).toBe(true);
            expect(result.prettyPrint()).toContain('Unknown node');
        });

        it('cannot with unknown node returns error result', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
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
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
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
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'Root' });
            // L is left of Root, LL is left of L → both transitively left of Root.
            // LR is to the RIGHT of L, so it's not in the leftOf chain from Root.
            expect(result.selectedAtoms()).toEqual(['L', 'LL']);
        });

        it('must.rightOf(Root) returns R', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'rightOf', nodeId: 'Root' });
            expect(result.selectedAtoms()).toEqual(['R']);
        });

        it('must.below(Root) returns L, LL, LR, R (all descendants)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'below', nodeId: 'Root' });
            expect(result.selectedAtoms()).toEqual(['L', 'LL', 'LR', 'R']);
        });

        it('must.above(LL) returns L and Root (ancestors)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'above', nodeId: 'LL' });
            expect(result.selectedAtoms()).toEqual(['L', 'Root']);
        });

        it('must.yAligned(L) returns R (siblings)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'L' });
            expect(result.selectedAtoms()).toEqual(['R']);
        });

        it('must.yAligned(LL) returns LR (siblings)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'LL' });
            expect(result.selectedAtoms()).toEqual(['LR']);
        });

        it('cannot.yAligned(Root) includes L and R (Root is above them)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
            const result = ev.cannot({ relation: 'yAligned', nodeId: 'Root' });
            const atoms = result.selectedAtoms();
            expect(atoms).toContain('L');
            expect(atoms).toContain('R');
            expect(atoms).toContain('LL');
            expect(atoms).toContain('LR');
            expect(atoms).toContain('Root');
        });

        it('cannot.leftOf(LL) includes LL and everything to its right', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(bstLayout);
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

    // ─── Phase 2: can — disjunctive alternatives ────────────────────────

    describe('Phase 2: can — disjunctive constraints', () => {
        // Fixture: A and B with no conjunctive ordering, but a disjunction:
        // either A is left of B, or B is left of A.
        const P = makeNode('P');
        const Q = makeNode('Q');
        const R2 = makeNode('R2');

        const disjSource = new CyclicOrientationConstraint('clockwise', 'test');

        const disjLayout: InstanceLayout = {
            nodes: [P, Q, R2],
            edges: [],
            constraints: [
                // R2 is definitely to the right of P (conjunctive)
                leftConstraint(P, R2),
            ],
            groups: [],
            disjunctiveConstraints: [
                new DisjunctiveConstraint(disjSource, [
                    // Alternative 1: P left of Q
                    [leftConstraint(P, Q)],
                    // Alternative 2: Q left of P
                    [leftConstraint(Q, P)],
                ]),
            ],
        };

        it('can.leftOf(Q) includes P (via alternative 2: Q left of P → P right of Q → not leftOf)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(disjLayout);
            const result = ev.can({ relation: 'leftOf', nodeId: 'Q' });
            // Alt 1: P is left of Q → P is in leftOf(Q) ✓
            // Alt 2: Q is left of P → nothing is left of Q from this alt
            expect(result.selectedAtoms()).toContain('P');
        });

        it('can.rightOf(Q) includes P and R2 (via alternative 2: Q left of P)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(disjLayout);
            const result = ev.can({ relation: 'rightOf', nodeId: 'Q' });
            // Alt 2: Q left of P, P left of R2 → rightOf(Q) = {P, R2}
            expect(result.selectedAtoms()).toContain('P');
            expect(result.selectedAtoms()).toContain('R2');
        });

        it('must.leftOf(Q) returns empty (neither alt is conjunctively entailed)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(disjLayout);
            const result = ev.must({ relation: 'leftOf', nodeId: 'Q' });
            // No conjunctive constraint says anything is left of Q
            expect(result.noResult()).toBe(true);
        });

        it('can includes must results (must ⊆ can)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(disjLayout);
            const mustRight = ev.must({ relation: 'rightOf', nodeId: 'P' }).selectedAtoms();
            const canRight = ev.can({ relation: 'rightOf', nodeId: 'P' }).selectedAtoms();
            // must.rightOf(P) = {R2} from conjunctive constraint
            expect(mustRight).toEqual(['R2']);
            // can.rightOf(P) ⊇ must.rightOf(P)
            for (const m of mustRight) {
                expect(canRight).toContain(m);
            }
        });

        it('can with unknown node returns error', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(disjLayout);
            const result = ev.can({ relation: 'leftOf', nodeId: 'UNKNOWN' });
            expect(result.isError()).toBe(true);
        });

        // Fixture: cyclic disjunction (3 rotations) — A→B→C clockwise
        // Alt 1: A < B, B < C  (A leftmost)
        // Alt 2: B < C, C < A  (B leftmost)
        // Alt 3: C < A, A < B  (C leftmost)
        const CA = makeNode('CA');
        const CB = makeNode('CB');
        const CC = makeNode('CC');

        const cyclicLayout: InstanceLayout = {
            nodes: [CA, CB, CC],
            edges: [],
            constraints: [], // No conjunctive constraints
            groups: [],
            disjunctiveConstraints: [
                new DisjunctiveConstraint(disjSource, [
                    [leftConstraint(CA, CB), leftConstraint(CB, CC)],
                    [leftConstraint(CB, CC), leftConstraint(CC, CA)],
                    [leftConstraint(CC, CA), leftConstraint(CA, CB)],
                ]),
            ],
        };

        it('can.leftOf(CB) includes CA and CC (different alts make each possible)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(cyclicLayout);
            const result = ev.can({ relation: 'leftOf', nodeId: 'CB' });
            // Alt 1: A < B → A is left of B ✓
            // Alt 2: C < A (and B < C, so via transitivity through augmented graph: nothing left of B directly)
            //   Actually alt 2: B < C, C < A → leftOf(CB) = {} (B is the leftmost)
            // Alt 3: C < A, A < B → C is left of A, A is left of B → leftOf(CB) = {CA, CC}
            expect(result.selectedAtoms()).toContain('CA');
            expect(result.selectedAtoms()).toContain('CC');
        });

        it('must.leftOf with cyclic disjunction returns empty (no conjunctive entailment)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(cyclicLayout);
            expect(ev.must({ relation: 'leftOf', nodeId: 'CB' }).noResult()).toBe(true);
            expect(ev.must({ relation: 'leftOf', nodeId: 'CA' }).noResult()).toBe(true);
            expect(ev.must({ relation: 'leftOf', nodeId: 'CC' }).noResult()).toBe(true);
        });

        // Fixture: infeasible alternative pruning
        // Conjunctive: A is left of B.
        // Disjunction: Alt 1: B left of A (cycle! infeasible), Alt 2: A above B (feasible)
        const X1 = makeNode('X1');
        const X2 = makeNode('X2');

        const pruneLayout: InstanceLayout = {
            nodes: [X1, X2],
            edges: [],
            constraints: [leftConstraint(X1, X2)],
            groups: [],
            disjunctiveConstraints: [
                new DisjunctiveConstraint(disjSource, [
                    // Alt 1: X2 left of X1 → cycle with conjunctive X1 left of X2 → infeasible
                    [leftConstraint(X2, X1)],
                    // Alt 2: X1 above X2 → feasible
                    [topConstraint(X1, X2)],
                ]),
            ],
        };

        it('can.below(X1) includes X2 via feasible alt, not via infeasible cycle alt', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(pruneLayout);
            const result = ev.can({ relation: 'below', nodeId: 'X1' });
            expect(result.selectedAtoms()).toEqual(['X2']);
        });

        it('can.leftOf(X2) does NOT include X2-left-of-X1 from infeasible alt', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(pruneLayout);
            const result = ev.can({ relation: 'leftOf', nodeId: 'X2' });
            // The only alt that makes something left of X2 is alt 1 (X2 left of X1),
            // but that's infeasible. Conjunctive: X1 is left of X2 → leftOf(X2) = {X1}.
            // Actually X1 IS left of X2 conjunctively.
            expect(result.selectedAtoms()).toEqual(['X1']);
        });

        // Fixture: no disjunctions — can = must
        it('can equals must when there are no disjunctive constraints', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(chainLayout);
            const mustResult = ev.must({ relation: 'rightOf', nodeId: 'A' }).selectedAtoms();
            const canResult = ev.can({ relation: 'rightOf', nodeId: 'A' }).selectedAtoms();
            expect(canResult).toEqual(mustResult);
        });

        // Disjunctive alignment
        const Y1 = makeNode('Y1');
        const Y2 = makeNode('Y2');
        const Y3 = makeNode('Y3');

        const alignDisjLayout: InstanceLayout = {
            nodes: [Y1, Y2, Y3],
            edges: [],
            constraints: [topConstraint(Y1, Y2)], // Y1 above Y2 (conjunctive)
            groups: [],
            disjunctiveConstraints: [
                new DisjunctiveConstraint(disjSource, [
                    // Alt 1: Y2 and Y3 are y-aligned
                    [alignConstraint('y', Y2, Y3)],
                    // Alt 2: Y1 and Y3 are y-aligned
                    [alignConstraint('y', Y1, Y3)],
                ]),
            ],
        };

        it('can.yAligned(Y2) includes Y3 (via alt 1)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignDisjLayout);
            const result = ev.can({ relation: 'yAligned', nodeId: 'Y2' });
            expect(result.selectedAtoms()).toContain('Y3');
        });

        it('can.yAligned(Y1) includes Y3 (via alt 2)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignDisjLayout);
            const result = ev.can({ relation: 'yAligned', nodeId: 'Y1' });
            expect(result.selectedAtoms()).toContain('Y3');
        });

        it('must.yAligned(Y2) does NOT include Y3 (disjunctive, not entailed)', () => {
            const ev = new LayoutEvaluator();
            ev.initialize(alignDisjLayout);
            const result = ev.must({ relation: 'yAligned', nodeId: 'Y2' });
            expect(result.noResult()).toBe(true);
        });
    });
});
