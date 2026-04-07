import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint } from '../src/layout/layoutspec';
import { LayoutEvaluator, LayoutEvaluatorResult } from '../src/evaluators/layout-evaluator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [],
        attributes: {}, width: 100, height: 60,
        mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

function leftOf(left: LayoutNode, right: LayoutNode): LeftConstraint {
    const src = new RelativeOrientationConstraint(['left'], `${left.id}->${right.id}`);
    return { left, right, minDistance: 15, sourceConstraint: src };
}

function above(top: LayoutNode, bottom: LayoutNode): TopConstraint {
    const src = new RelativeOrientationConstraint(['above'], `${top.id}->${bottom.id}`);
    return { top, bottom, minDistance: 15, sourceConstraint: src };
}

function aligned(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y'): AlignmentConstraint {
    const src = new RelativeOrientationConstraint(
        [axis === 'x' ? 'directlyAbove' : 'directlyLeft'],
        `${node1.id}->${node2.id}`
    );
    return { axis, node1, node2, sourceConstraint: src };
}

function layout(
    nodes: LayoutNode[],
    constraints: any[] = [],
    disjunctiveConstraints?: DisjunctiveConstraint[],
    groups: LayoutGroup[] = []
): InstanceLayout {
    return { nodes, edges: [], constraints, groups, disjunctiveConstraints };
}

function cyclic(dirs: string[], sel: string): CyclicOrientationConstraint {
    return new CyclicOrientationConstraint(dirs, sel);
}

function disjunction(src: CyclicOrientationConstraint | RelativeOrientationConstraint, alts: any[][]): DisjunctiveConstraint {
    return new DisjunctiveConstraint(src, alts);
}

/** Validate and return validator (asserts SAT). */
function validate(l: InstanceLayout): QualitativeConstraintValidator {
    const v = new QualitativeConstraintValidator(l);
    const err = v.validateConstraints();
    expect(err).toBeNull();
    return v;
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('Modal spatial queries (must/can/cannot)', () => {

    describe('Conjunctive-only layouts', () => {
        it('A left B left C: must.rightOf(A) includes B and C', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

            expect(v.getMust('A', 'rightOf')).toEqual(new Set(['B', 'C']));
            expect(v.getMust('B', 'rightOf')).toEqual(new Set(['C']));
            expect(v.getMust('C', 'rightOf')).toEqual(new Set());
        });

        it('A left B left C: must.leftOf(C) includes A and B (transitivity)', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

            expect(v.getMust('C', 'leftOf')).toEqual(new Set(['A', 'B']));
        });

        it('cannot is complement of must + alignment for directional queries', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

            // A cannot be to the right of B or C (it's left of them)
            const cannotRightOf_A = v.getCannot('A', 'rightOf');
            expect(cannotRightOf_A.has('A')).toBe(true); // reflexive
            // A is already leftOf B and C, so adding B→A or C→A would cycle
            // So A cannot be rightOf B or C? No — rightOf(A, B) means "B is to the right of A"
            // Wait: getMust('A', 'rightOf') = {B, C} means B and C are to the right of A
            // getCannot('A', 'rightOf') = nodes Y where "Y cannot be to the right of A"
            // = nodes Y where adding leftOf(A, Y) is infeasible
            // Since A is already left of B, adding leftOf(A, B) is fine (redundant), not infeasible
            // Since B is already left of C... Hmm let me think about this differently.
            //
            // getCannot('A', 'leftOf') = nodes Y where "Y cannot be to the left of A"
            //   = adding leftOf(Y, A) infeasible = canReach(A, Y) in mustHGraph
            //   A→B→C so canReach(A, B)=true, canReach(A, C)=true
            //   So B and C cannot be to the left of A. That's correct!
            const cannotLeftOf_A = v.getCannot('A', 'leftOf');
            expect(cannotLeftOf_A).toEqual(new Set(['A', 'B', 'C']));
        });

        it('can = ¬cannot', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

            const can = v.getCan('A', 'leftOf');
            const cannot = v.getCannot('A', 'leftOf');
            const allIds = new Set(['A', 'B', 'C']);

            // can ∪ cannot = allNodes
            const union = new Set([...can, ...cannot]);
            expect(union).toEqual(allIds);

            // can ∩ cannot = ∅
            for (const x of can) {
                expect(cannot.has(x)).toBe(false);
            }
        });

        it('must ⊆ can', () => {
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(createNode);
            const v = validate(layout([a, b, c, d], [leftOf(a, b), above(c, d)]));

            for (const nodeId of ['A', 'B', 'C', 'D']) {
                for (const rel of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                    const must = v.getMust(nodeId, rel);
                    const can = v.getCan(nodeId, rel);
                    for (const m of must) {
                        expect(can.has(m)).toBe(true);
                    }
                }
            }
        });

        it('must ∩ cannot = ∅', () => {
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(createNode);
            const v = validate(layout([a, b, c, d], [leftOf(a, b), leftOf(b, c), above(a, d)]));

            for (const nodeId of ['A', 'B', 'C', 'D']) {
                for (const rel of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                    const must = v.getMust(nodeId, rel);
                    const cannot = v.getCannot(nodeId, rel);
                    for (const m of must) {
                        expect(cannot.has(m)).toBe(false);
                    }
                }
            }
        });
    });

    describe('Alignment queries', () => {
        it('aligned nodes appear in mustAligned', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [aligned(a, b, 'x'), leftOf(a, c)]));

            expect(v.getMustAligned('A', 'x')).toEqual(new Set(['B']));
            expect(v.getMustAligned('B', 'x')).toEqual(new Set(['A']));
        });

        it('cannotAligned includes strictly-ordered nodes', () => {
            const [a, b] = ['A', 'B'].map(createNode);
            const v = validate(layout([a, b], [leftOf(a, b)]));

            // A and B have a strict horizontal ordering, so they cannot be x-aligned
            expect(v.getCannotAligned('A', 'x').has('B')).toBe(true);
            expect(v.getCannotAligned('B', 'x').has('A')).toBe(true);

            // But they CAN be y-aligned (no vertical constraint)
            expect(v.getCanAligned('A', 'y').has('B')).toBe(true);
        });

        it('mustAligned ∩ cannotAligned = ∅', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [aligned(a, b, 'x'), leftOf(b, c)]));

            for (const nodeId of ['A', 'B', 'C']) {
                for (const axis of ['x', 'y'] as const) {
                    const must = v.getMustAligned(nodeId, axis);
                    const cannot = v.getCannotAligned(nodeId, axis);
                    for (const m of must) {
                        expect(cannot.has(m)).toBe(false);
                    }
                }
            }
        });
    });

    describe('Disjunctive layouts', () => {
        it('disjunction where ALL alternatives force A left of B → must.rightOf(A) includes B', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            // Disjunction: (A left B AND C above A) OR (A left B AND C below A)
            // Both alternatives include A left B, so must.rightOf(A) should include B
            const src = cyclic(['left'], 'A->B');
            const disj = disjunction(src, [
                [leftOf(a, b), above(c, a)],
                [leftOf(a, b), above(a, c)],
            ]);

            const v = validate(layout([a, b, c], [], [disj]));
            expect(v.getMust('A', 'rightOf').has('B')).toBe(true);
        });

        it('disjunction with disagreement: A left B OR B left A → neither in must', () => {
            const [a, b] = ['A', 'B'].map(createNode);
            const src = cyclic(['left', 'right'], 'A->B');
            const disj = disjunction(src, [
                [leftOf(a, b)],
                [leftOf(b, a)],
            ]);

            const v = validate(layout([a, b], [], [disj]));
            // Neither direction is must — the solver chose one, but the other was possible
            // Actually: must comes from the conjunctive base + disjunction intersection.
            // The conjunctive base has no directional constraints (all are in the disjunction).
            // The intersection: alt1 forces A<B, alt2 forces B<A. No common pair.
            // So must.rightOf(A) should NOT include B, and vice versa.
            // But CAN should include B for both directions.
            expect(v.getMust('A', 'rightOf').has('B')).toBe(false);
            expect(v.getMust('B', 'rightOf').has('A')).toBe(false);
            expect(v.getCan('A', 'rightOf').has('B')).toBe(true);
            expect(v.getCan('B', 'rightOf').has('A')).toBe(true);
        });

        it('conjunctive + disjunctive: must from conjunctive part is preserved', () => {
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(createNode);
            // Conjunctive: A left B
            // Disjunctive: C left D OR D left C
            const src = cyclic(['left', 'right'], 'C->D');
            const disj = disjunction(src, [
                [leftOf(c, d)],
                [leftOf(d, c)],
            ]);

            const v = validate(layout([a, b, c, d], [leftOf(a, b)], [disj]));
            // A left B is conjunctive → must
            expect(v.getMust('A', 'rightOf').has('B')).toBe(true);
            // C-D direction is uncertain
            expect(v.getMust('C', 'rightOf').has('D')).toBe(false);
            expect(v.getMust('D', 'rightOf').has('C')).toBe(false);
        });
    });

    describe('Disjunction-strengthened cannot (P1 fix)', () => {
        it('unanimous disjunction ordering is reflected in cannot, not just must', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            // Disjunction: (A left B AND A left C) OR (A left B AND C left A)
            // Both alternatives force A left B, so must.rightOf(A) includes B.
            // Because must graphs are strengthened, cannot.leftOf(B) should include A
            // (B cannot be to the left of A, since A must be left of B).
            const src = cyclic(['left'], 'A->B');
            const disj = disjunction(src, [
                [leftOf(a, b), leftOf(a, c)],
                [leftOf(a, b), leftOf(c, a)],
            ]);

            const v = validate(layout([a, b, c], [], [disj]));
            expect(v.getMust('A', 'rightOf').has('B')).toBe(true);
            // P1: getCannot must agree — B cannot be left of A
            expect(v.getCannot('A', 'leftOf').has('B')).toBe(true);
            // And the converse: A can be left of B (it's already must)
            expect(v.getCan('A', 'leftOf').has('B')).toBe(false); // cannot, not can
            // must ⊆ can still holds
            expect(v.getCan('A', 'rightOf').has('B')).toBe(true);
        });
    });

    describe('Disjunction-strengthened alignment (P2 fix)', () => {
        it('unanimous disjunction alignment appears in mustAligned', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            // Disjunction: (A aligned-x B AND A left C) OR (A aligned-x B AND C left A)
            // Both alternatives force A aligned-x with B.
            const src = cyclic(['left'], 'A->C');
            const disj = disjunction(src, [
                [aligned(a, b, 'x'), leftOf(a, c)],
                [aligned(a, b, 'x'), leftOf(c, a)],
            ]);

            const v = validate(layout([a, b, c], [], [disj]));
            // P2: mustAligned should include the unanimous alignment
            expect(v.getMustAligned('A', 'x').has('B')).toBe(true);
            expect(v.getMustAligned('B', 'x').has('A')).toBe(true);
        });
    });

    describe('Feasibility-based cannot', () => {
        it('cannot detects infeasibility via zero-weight alignment chains', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            // A aligned-x with B (zero-weight edges A↔B), B left C
            // So A→B (zero-weight) and B→C (positive-weight) means canReach(A, C) = true
            // Adding C→A (leftOf(C, A)) would create cycle → C cannot be left of A
            const v = validate(layout([a, b, c], [aligned(a, b, 'x'), leftOf(b, c)]));

            // C cannot be to the left of A (because B is aligned with A and left of C)
            expect(v.getCannot('A', 'leftOf').has('C')).toBe(true);
        });
    });

    describe('Resolved model queries', () => {
        it('getReachable returns nodes ordered in resolved model', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

            const reachable = v.getReachable('A', 'rightOf');
            expect(reachable).toEqual(new Set(['B', 'C']));
        });

        it('getAlignedWith returns alignment class', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(createNode);
            const v = validate(layout([a, b, c], [aligned(a, b, 'x'), leftOf(a, c)]));

            expect(v.getAlignedWith('A', 'x')).toEqual(new Set(['B']));
            expect(v.getAlignedWith('B', 'x')).toEqual(new Set(['A']));
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('LayoutEvaluator', () => {
    it('parses and evaluates directional modal queries', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));
        const ev = new LayoutEvaluator(v, layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

        const result = ev.evaluate('must.rightOf(A)');
        expect(result.isError()).toBe(false);
        expect(result.selectedAtoms()).toEqual(['B', 'C']);
    });

    it('parses alignment queries', () => {
        const [a, b] = ['A', 'B'].map(createNode);
        const v = validate(layout([a, b], [aligned(a, b, 'x')]));
        const ev = new LayoutEvaluator(v, layout([a, b], [aligned(a, b, 'x')]));

        const result = ev.evaluate('must.aligned.x(A)');
        expect(result.isError()).toBe(false);
        expect(result.selectedAtoms()).toEqual(['B']);
    });

    it('returns error for unknown node', () => {
        const [a, b] = ['A', 'B'].map(createNode);
        const v = validate(layout([a, b], [leftOf(a, b)]));
        const ev = new LayoutEvaluator(v, layout([a, b], [leftOf(a, b)]));

        const result = ev.evaluate('must.leftOf(Z)');
        expect(result.isError()).toBe(true);
    });

    it('returns error for unparseable expression', () => {
        const [a] = ['A'].map(createNode);
        const v = validate(layout([a], []));
        const ev = new LayoutEvaluator(v, layout([a], []));

        const result = ev.evaluate('nonsense query');
        expect(result.isError()).toBe(true);
    });

    it('handles group queries', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const group: LayoutGroup = {
            name: 'G1', nodeIds: ['A', 'B'], keyNodeId: 'A',
            showLabel: true,
        };
        const l = layout([a, b, c], [], undefined, [group]);
        const v = validate(l);
        const ev = new LayoutEvaluator(v, l);

        const containsResult = ev.evaluate('contains(G1)');
        expect(containsResult.selectedAtoms()).toEqual(['A', 'B']);

        const groupedResult = ev.evaluate('grouped(A)');
        expect(groupedResult.selectedAtoms()).toEqual(['G1']);

        const notGrouped = ev.evaluate('grouped(C)');
        expect(notGrouped.noResult()).toBe(true);
    });

    it('getAllNodeIds returns all non-auxiliary node ids', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], []));
        const ev = new LayoutEvaluator(v, layout([a, b, c], []));

        expect(ev.getAllNodeIds()).toEqual(new Set(['A', 'B', 'C']));
    });

    it('grouped(A, B) returns groups containing both A and B', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const g1: LayoutGroup = { name: 'G1', nodeIds: ['A', 'B'], keyNodeId: 'A', showLabel: true };
        const g2: LayoutGroup = { name: 'G2', nodeIds: ['B', 'C'], keyNodeId: 'B', showLabel: true };
        const l = layout([a, b, c], [], undefined, [g1, g2]);
        const v = validate(l);
        const ev = new LayoutEvaluator(v, l);

        // A and B are both in G1
        const result = ev.evaluate('grouped(A, B)');
        expect(result.selectedAtoms()).toEqual(['G1']);

        // B and C are both in G2
        const result2 = ev.evaluate('grouped(B, C)');
        expect(result2.selectedAtoms()).toEqual(['G2']);

        // A and C share no group
        const result3 = ev.evaluate('grouped(A, C)');
        expect(result3.noResult()).toBe(true);

        // B is in both groups
        const result4 = ev.evaluate('grouped(B)');
        expect(result4.selectedAtoms()).toEqual(['G1', 'G2']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('Provenance (whyMust / whyCannot)', () => {
    it('whyMust returns source constraints for a must-entailed ordering', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

        // A must be left of C (transitively via B)
        const why = v.whyMust('A', 'rightOf', 'C');
        expect(why).not.toBeNull();
        expect(why!.length).toBeGreaterThanOrEqual(1);
        // The provenance should trace through the A→B→C path
    });

    it('whyMust returns null for non-must relations', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], [leftOf(a, b)]));

        // A and C have no horizontal ordering
        expect(v.whyMust('A', 'rightOf', 'C')).toBeNull();
    });

    it('whyCannot returns source constraints for an infeasible relation', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], [leftOf(a, b), leftOf(b, c)]));

        // C cannot be left of A (path A→B→C would become cycle)
        const why = v.whyCannot('A', 'leftOf', 'C');
        expect(why).not.toBeNull();
        expect(why!.length).toBeGreaterThanOrEqual(1);
    });

    it('whyCannot returns null for feasible relations', () => {
        const [a, b, c] = ['A', 'B', 'C'].map(createNode);
        const v = validate(layout([a, b, c], [leftOf(a, b)]));

        // C can be left of A (no constraints prevent it)
        expect(v.whyCannot('A', 'leftOf', 'C')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════

describe('Modal query PBT properties', () => {
    // Generate random conjunctive layouts and verify invariants

    function randomConjunctiveLayout(n: number, seed: number) {
        const nodes = Array.from({ length: n }, (_, i) => createNode(`N${i}`));
        const constraints: any[] = [];

        // Use a simple seeded PRNG
        let s = seed;
        const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

        // Add random directional constraints (avoiding obvious cycles)
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const r = rand();
                if (r < 0.3) {
                    constraints.push(leftOf(nodes[i], nodes[j]));
                } else if (r < 0.5) {
                    constraints.push(above(nodes[i], nodes[j]));
                }
                // else: no constraint
            }
        }

        return { nodes, constraints };
    }

    for (let seed = 0; seed < 20; seed++) {
        it(`PBT seed=${seed}: must⊆can, must∩cannot=∅, can∪cannot=allNodes`, () => {
            const { nodes, constraints } = randomConjunctiveLayout(5, seed);
            const l = layout(nodes, constraints);
            const v = new QualitativeConstraintValidator(l);
            const err = v.validateConstraints();

            if (err !== null) return; // skip infeasible layouts

            const nodeIds = nodes.map(n => n.id);

            for (const nodeId of nodeIds) {
                for (const rel of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                    const must = v.getMust(nodeId, rel);
                    const can = v.getCan(nodeId, rel);
                    const cannot = v.getCannot(nodeId, rel);

                    // must ⊆ can
                    for (const m of must) {
                        expect(can.has(m)).toBe(true);
                    }

                    // must ∩ cannot = ∅
                    for (const m of must) {
                        expect(cannot.has(m)).toBe(false);
                    }

                    // can ∪ cannot ⊇ allNodes (actually = allNodes)
                    const union = new Set([...can, ...cannot]);
                    for (const id of nodeIds) {
                        expect(union.has(id)).toBe(true);
                    }
                }

                for (const axis of ['x', 'y'] as const) {
                    const mustA = v.getMustAligned(nodeId, axis);
                    const canA = v.getCanAligned(nodeId, axis);
                    const cannotA = v.getCannotAligned(nodeId, axis);

                    // mustAligned ⊆ canAligned
                    for (const m of mustA) {
                        expect(canA.has(m)).toBe(true);
                    }

                    // mustAligned ∩ cannotAligned = ∅
                    for (const m of mustA) {
                        expect(cannotA.has(m)).toBe(false);
                    }
                }
            }
        });
    }

    // PBT with disjunctions
    for (let seed = 0; seed < 10; seed++) {
        it(`PBT disjunctive seed=${seed}: must⊆can, must∩cannot=∅`, () => {
            const nodes = Array.from({ length: 4 }, (_, i) => createNode(`N${i}`));
            let s = seed + 100;
            const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

            // Create 1-2 disjunctions
            const disjs: DisjunctiveConstraint[] = [];
            for (let d = 0; d < 2; d++) {
                const i = Math.floor(rand() * 4);
                let j = Math.floor(rand() * 4);
                if (j === i) j = (j + 1) % 4;

                const src = cyclic(['left', 'right'], `N${i}->N${j}`);
                disjs.push(disjunction(src, [
                    [leftOf(nodes[i], nodes[j])],
                    [leftOf(nodes[j], nodes[i])],
                ]));
            }

            const l = layout(nodes, [], disjs);
            const v = new QualitativeConstraintValidator(l);
            const err = v.validateConstraints();
            if (err !== null) return;

            const nodeIds = nodes.map(n => n.id);
            for (const nodeId of nodeIds) {
                for (const rel of ['leftOf', 'rightOf', 'above', 'below'] as const) {
                    const must = v.getMust(nodeId, rel);
                    const can = v.getCan(nodeId, rel);
                    const cannot = v.getCannot(nodeId, rel);

                    for (const m of must) {
                        expect(can.has(m)).toBe(true);
                    }
                    for (const m of must) {
                        expect(cannot.has(m)).toBe(false);
                    }
                    const union = new Set([...can, ...cannot]);
                    for (const id of nodeIds) {
                        expect(union.has(id)).toBe(true);
                    }
                }
            }
        });
    }
});
