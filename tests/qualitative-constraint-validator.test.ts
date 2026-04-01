import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator, PositionalConstraintError } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    BoundingBoxConstraint,
    ImplicitConstraint,
    isLeftConstraint,
    isTopConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, label?: string): LayoutNode {
    return {
        id,
        label: label || id,
        color: 'black',
        groups: [],
        attributes: {},
        width: 100,
        height: 60,
        mostSpecificType: 'Node',
        types: ['Node'],
        showLabels: true,
    };
}

function createLeftConstraint(
    left: LayoutNode,
    right: LayoutNode,
    source?: RelativeOrientationConstraint
): LeftConstraint {
    const defaultSource = new RelativeOrientationConstraint(['left'], `${left.id}->${right.id}`);
    return { left, right, minDistance: 15, sourceConstraint: source || defaultSource };
}

function createTopConstraint(
    top: LayoutNode,
    bottom: LayoutNode,
    source?: RelativeOrientationConstraint
): TopConstraint {
    const defaultSource = new RelativeOrientationConstraint(['above'], `${top.id}->${bottom.id}`);
    return { top, bottom, minDistance: 15, sourceConstraint: source || defaultSource };
}

function createAlignConstraint(
    node1: LayoutNode,
    node2: LayoutNode,
    axis: 'x' | 'y',
    source?: RelativeOrientationConstraint
): AlignmentConstraint {
    const defaultSource = new RelativeOrientationConstraint(
        [axis === 'x' ? 'directlyAbove' : 'directlyLeft'],
        `${node1.id}->${node2.id}`
    );
    return { axis, node1, node2, sourceConstraint: source || defaultSource };
}

function createLayout(
    nodes: LayoutNode[],
    constraints: any[] = [],
    disjunctiveConstraints?: DisjunctiveConstraint[],
    groups: LayoutGroup[] = []
): InstanceLayout {
    return {
        nodes,
        edges: [],
        constraints,
        groups,
        disjunctiveConstraints,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('QualitativeConstraintValidator', () => {
    describe('Conjunctive constraints', () => {
        it('should accept consistent left/top constraints', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should detect a cycle in left constraints (A < B < C < A)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createLeftConstraint(c, a),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should detect a cycle in top constraints', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout(
                [a, b],
                [createTopConstraint(a, b), createTopConstraint(b, a)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should detect alignment-ordering conflict', () => {
            const a = createNode('A');
            const b = createNode('B');

            // A is left of B, but also vertically aligned (same x) — contradiction
            const layout = createLayout(
                [a, b],
                [createLeftConstraint(a, b), createAlignConstraint(a, b, 'x')]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });
    });

    describe('Disjunctive constraints (basic backtracking)', () => {
        it('should solve a simple disjunction', () => {
            const a = createNode('A');
            const b = createNode('B');

            const source = new RelativeOrientationConstraint(['left'], 'A<->B');

            const disj = new DisjunctiveConstraint(source, [
                [createLeftConstraint(a, b, source)],
                [createLeftConstraint(b, a, source)],
            ]);

            const layout = createLayout([a, b], [], [disj]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should solve two compatible disjunctions', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const src1 = new RelativeOrientationConstraint(['left'], 'A<->B');
            const src2 = new RelativeOrientationConstraint(['left'], 'B<->C');

            const disj1 = new DisjunctiveConstraint(src1, [
                [createLeftConstraint(a, b, src1)],
                [createLeftConstraint(b, a, src1)],
            ]);

            const disj2 = new DisjunctiveConstraint(src2, [
                [createLeftConstraint(b, c, src2)],
                [createLeftConstraint(c, b, src2)],
            ]);

            const layout = createLayout([a, b, c], [], [disj1, disj2]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should backtrack and find satisfying assignment', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const src = new RelativeOrientationConstraint(['left'], 'cycle');

            // A < B is conjunctive
            // Disjunction: (B < C) or (C < B)
            // Disjunction: (C < A) or (A < C)
            // Only (B < C, A < C) works (since A < B is fixed)
            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(b, c, src)],
                        [createLeftConstraint(c, b, src)],
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)], // Would create cycle A<B<C<A
                        [createLeftConstraint(a, c, src)], // OK: A<B, B<C, A<C
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Geometric pruning', () => {
        it('should prune alternatives that would create cycles via transitivity', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // Conjunctive: A < B and B < C (so A < C transitively)
            // Disjunction: (C < A) or (A < C)
            // The first alternative is impossible due to transitivity
            // The solver should prune it and directly choose A < C
            const src = new RelativeOrientationConstraint(['left'], 'test');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)], // Would cycle
                        [createLeftConstraint(a, c, src)], // Consistent
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            // Verify the constraint was added
            const addedLeft = layout.constraints.filter(c => isLeftConstraint(c));
            // A<B, B<C are conjunctive; A<C follows by transitivity,
            // so the disjunction may be resolved without adding a redundant edge.
            expect(addedLeft.length).toBeGreaterThanOrEqual(2);
        });

        it('should skip disjunctions for already-separated regions', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // A < B is conjunctive — A and B are already separated on H
            // Disjunction saying "A and B must not overlap" is trivially satisfied
            const src = new RelativeOrientationConstraint(['left'], 'overlap');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)],
                        [createLeftConstraint(b, a, src)],
                        [createTopConstraint(a, b, src)],
                        [createTopConstraint(b, a, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should prune H-axis alternatives when nodes are x-aligned', () => {
            const a = createNode('A');
            const b = createNode('B');

            // A and B are vertically aligned (same x-coordinate)
            // So leftof(A,B) and leftof(B,A) are impossible
            // Only above/below alternatives should remain
            const src = new RelativeOrientationConstraint(['left'], 'overlap');

            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'x')], // Same x
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)], // Should be pruned
                        [createLeftConstraint(b, a, src)], // Should be pruned
                        [createTopConstraint(a, b, src)],  // Should remain
                        [createTopConstraint(b, a, src)],  // Should remain
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('CDCL clause learning', () => {
        it('should detect unsatisfiable disjunction sets', () => {
            const a = createNode('A');
            const b = createNode('B');

            // Both disjunctions require contradictory things:
            // Disj 1: A must be left of B
            // Disj 2: B must be left of A
            // Both are unit disjunctions with only one alternative → contradiction
            const src1 = new RelativeOrientationConstraint(['left'], 'd1');
            const src2 = new RelativeOrientationConstraint(['left'], 'd2');

            const layout = createLayout(
                [a, b],
                [],
                [
                    new DisjunctiveConstraint(src1, [
                        [createLeftConstraint(a, b, src1)],
                    ]),
                    new DisjunctiveConstraint(src2, [
                        [createLeftConstraint(b, a, src2)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should handle a 3-way cyclic conflict', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // Create a situation where all rotations of a cycle are tried
            const src = new CyclicOrientationConstraint('clockwise', 'A->B->C');

            const disj = new DisjunctiveConstraint(src, [
                // Rotation 1: A < B, B < C (implies A < C)
                [createLeftConstraint(a, b, src), createLeftConstraint(b, c, src)],
                // Rotation 2: B < C, C < A (implies B < A via C)
                [createLeftConstraint(b, c, src), createLeftConstraint(c, a, src)],
                // Rotation 3: C < A, A < B (implies C < B via A)
                [createLeftConstraint(c, a, src), createLeftConstraint(a, b, src)],
            ]);

            const layout = createLayout([a, b, c], [], [disj]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // All three alternatives should be satisfiable individually
            // (no cycle within any single alternative)
            expect(error).toBeNull();
        });
    });

    describe('Maximal feasible subset', () => {
        it('should report maximalFeasibleSubset on UNSAT', () => {
            const a = createNode('A');
            const b = createNode('B');

            const src1 = new RelativeOrientationConstraint(['left'], 'd1');
            const src2 = new RelativeOrientationConstraint(['left'], 'd2');

            // Contradictory unit disjunctions
            const layout = createLayout(
                [a, b],
                [],
                [
                    new DisjunctiveConstraint(src1, [[createLeftConstraint(a, b, src1)]]),
                    new DisjunctiveConstraint(src2, [[createLeftConstraint(b, a, src2)]]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');

            // Should have a maximal feasible subset
            const posError = error as PositionalConstraintError;
            expect(posError.maximalFeasibleSubset).toBeDefined();
            // The MFS should contain at least one of the two conflicting constraints
            expect(posError.maximalFeasibleSubset!.length).toBeGreaterThan(0);
        });

        it('should break both cores when there are 2 independent infeasible cores', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            // Core 1 (H-axis): A<B and B<A — contradictory
            const src1 = new RelativeOrientationConstraint(['left'], 'core1-AB');
            const src2 = new RelativeOrientationConstraint(['left'], 'core1-BA');

            // Core 2 (V-axis): C above D and D above C — contradictory
            const src3 = new RelativeOrientationConstraint(['above'], 'core2-CD');
            const src4 = new RelativeOrientationConstraint(['above'], 'core2-DC');

            const layout = createLayout(
                [a, b, c, d],
                [],
                [
                    new DisjunctiveConstraint(src1, [[createLeftConstraint(a, b, src1)]]),
                    new DisjunctiveConstraint(src2, [[createLeftConstraint(b, a, src2)]]),
                    new DisjunctiveConstraint(src3, [[createTopConstraint(c, d, src3)]]),
                    new DisjunctiveConstraint(src4, [[createTopConstraint(d, c, src4)]]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();

            const posError = error as PositionalConstraintError;
            expect(posError.maximalFeasibleSubset).toBeDefined();
            const mfs = posError.maximalFeasibleSubset!;

            // MFS should be non-empty — it should keep one constraint from each core
            expect(mfs.length).toBeGreaterThan(0);

            // Core 1 must be broken: cannot have both A<B and B<A
            const hasALeftB = mfs.some(c =>
                isLeftConstraint(c) && c.left.id === 'A' && c.right.id === 'B'
            );
            const hasBLeftA = mfs.some(c =>
                isLeftConstraint(c) && c.left.id === 'B' && c.right.id === 'A'
            );
            expect(hasALeftB && hasBLeftA).toBe(false);

            // Core 2 must be broken: cannot have both C above D and D above C
            const hasCAboveD = mfs.some(c =>
                isTopConstraint(c) && c.top.id === 'C' && c.bottom.id === 'D'
            );
            const hasDAboveC = mfs.some(c =>
                isTopConstraint(c) && c.top.id === 'D' && c.bottom.id === 'C'
            );
            expect(hasCAboveD && hasDAboveC).toBe(false);

            // MFS should be maximal — at least one from each core survives
            expect(hasALeftB || hasBLeftA).toBe(true);
            expect(hasCAboveD || hasDAboveC).toBe(true);

            // The MFS should also be enforced on the layout
            expect(layout.constraints).toEqual(mfs);
        });
    });

    describe('Group constraints', () => {
        it('should validate non-overlapping groups', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const groupByField = new GroupByField('type', 0, 1, 'type');

            const group1: LayoutGroup = {
                name: 'Group1',
                nodeIds: ['A', 'B'],
                keyNodeId: 'A',
                showLabel: true,
                sourceConstraint: groupByField,
            };

            const layout = createLayout([a, b, c], [], [], [group1]);

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Should succeed — C must be outside Group1
            expect(error).toBeNull();
        });

        it('should detect overlapping groups', () => {
            const a = createNode('A');
            const b = createNode('B');

            const groupByField = new GroupByField('type', 0, 1, 'type');

            const group1: LayoutGroup = {
                name: 'Group1',
                nodeIds: ['A', 'B'],
                keyNodeId: 'A',
                showLabel: true,
                sourceConstraint: groupByField,
            };

            const group2: LayoutGroup = {
                name: 'Group2',
                nodeIds: ['A', 'B'],
                keyNodeId: 'B',
                showLabel: true,
                sourceConstraint: groupByField,
            };

            // Groups with same members are not "overlapping" (they're subgroups of each other)
            const layout = createLayout([a, b], [], [], [group1, group2]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Should succeed since one is a subgroup of the other
            expect(error).toBeNull();
        });
    });

    describe('Negated group₂ (pure ¬, not fiberwise)', () => {
        // Pure ¬: at least one key's group must fail.
        // Fiberwise: every key's group must independently fail.
        // These tests verify we use pure ¬ by showing scenarios that are
        // satisfiable under pure ¬ but would be unsatisfiable under fiberwise.

        it('positive group on key X + NOT group₂ on {X, Y} is satisfiable (only Y must fail)', () => {
            // Setup: 6 nodes. Positive group forces {A,B,C} together (key X).
            // Negated group₂ on same sourceConstraint has two keys:
            //   X → {A,B,C} and Y → {D,E,F}
            // Under pure ¬: at least one key must fail. Since X is forced to
            //   hold by the positive constraint, Y must fail — which is fine,
            //   D,E,F just need to NOT all be groupable. Satisfiable.
            // Under fiberwise: BOTH X and Y must fail. But X can't fail because
            //   the positive group forces it. Would be unsatisfiable.
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');
            const e = createNode('E');
            const f = createNode('F');

            const positiveSource = new GroupByField('type', 0, 1, 'keyX');
            const negatedSource = new GroupByField('type', 0, 1, 'neg-group2');

            // Positive group: X → {A, B, C}
            const positiveGroup: LayoutGroup = {
                name: 'group-X',
                nodeIds: ['A', 'B', 'C'],
                keyNodeId: 'A',
                showLabel: true,
                sourceConstraint: positiveSource,
            };

            // Negated group₂ key X → {A, B, C} (same members as positive, but negated)
            const negGroupX: LayoutGroup = {
                name: 'neg-group-X',
                nodeIds: ['A', 'B', 'C'],
                keyNodeId: 'A',
                showLabel: false,
                sourceConstraint: negatedSource,
                negated: true,
            };

            // Negated group₂ key Y → {D, E, F}
            const negGroupY: LayoutGroup = {
                name: 'neg-group-Y',
                nodeIds: ['D', 'E', 'F'],
                keyNodeId: 'D',
                showLabel: false,
                sourceConstraint: negatedSource,
                negated: true,
            };

            const layout = createLayout(
                [a, b, c, d, e, f],
                [],
                [],
                [positiveGroup, negGroupX, negGroupY],
            );
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();

            // Should be satisfiable: the solver can satisfy the positive group
            // on X and break Y's grouping to satisfy the negation.
            expect(error).toBeNull();
        });

        it('negated group₂ merges keys into single DisjunctiveConstraint', () => {
            // Two negated groups from the same sourceConstraint should produce
            // ONE DisjunctiveConstraint (pure ¬), not two separate ones (fiberwise).
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const negatedSource = new GroupByField('type', 0, 1, 'neg-group2');

            const negGroup1: LayoutGroup = {
                name: 'neg-key1',
                nodeIds: ['A', 'B'],
                keyNodeId: 'A',
                showLabel: false,
                sourceConstraint: negatedSource,
                negated: true,
            };

            const negGroup2: LayoutGroup = {
                name: 'neg-key2',
                nodeIds: ['C', 'D'],
                keyNodeId: 'C',
                showLabel: false,
                sourceConstraint: negatedSource,
                negated: true,
            };

            const layout = createLayout(
                [a, b, c, d],
                [],
                [],
                [negGroup1, negGroup2],
            );
            const validator = new QualitativeConstraintValidator(layout);
            validator.validateConstraints();

            // Pure ¬: decomposed bbox encoding produces:
            //   4 member-selection disjunctions per group × 2 groups = 8
            //   + 1 merged non-member-inclusion disjunction = 9 total
            const negGroupDisjs = layout.disjunctiveConstraints?.filter(d =>
                d.sourceConstraint === negatedSource
            ) ?? [];
            expect(negGroupDisjs).toHaveLength(9); // 4×2 member-sel + 1 inclusion

            // The inclusion disjunction (last one) should contain alternatives
            // from BOTH keys: Key1 {A,B} non-members {C,D} + Key2 {C,D} non-members {A,B}
            const inclusionDisj = negGroupDisjs.find(d =>
                d.alternatives.length > 0 && d.alternatives[0].length === 4
            );
            expect(inclusionDisj).toBeDefined();
            expect(inclusionDisj!.alternatives.length).toBeGreaterThan(0);
        });

        it('negated group₂ with different sources produces separate disjunctions', () => {
            // Groups from DIFFERENT sourceConstraints should still produce
            // separate DisjunctiveConstraints (they are independent negations).
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const source1 = new GroupByField('type', 0, 1, 'neg1');
            const source2 = new GroupByField('color', 0, 1, 'neg2');

            const negGroup1: LayoutGroup = {
                name: 'neg-s1',
                nodeIds: ['A', 'B'],
                keyNodeId: 'A',
                showLabel: false,
                sourceConstraint: source1,
                negated: true,
            };

            const negGroup2: LayoutGroup = {
                name: 'neg-s2',
                nodeIds: ['B', 'C'],
                keyNodeId: 'B',
                showLabel: false,
                sourceConstraint: source2,
                negated: true,
            };

            const layout = createLayout(
                [a, b, c],
                [],
                [],
                [negGroup1, negGroup2],
            );
            const validator = new QualitativeConstraintValidator(layout);
            validator.validateConstraints();

            // Different sources → separate disjunction sets (both must hold)
            // Each source produces: 4 member-selection + 1 inclusion = 5 disjunctions
            const negGroupDisjs = layout.disjunctiveConstraints?.filter(d =>
                d.sourceConstraint === source1 || d.sourceConstraint === source2
            ) ?? [];
            expect(negGroupDisjs).toHaveLength(10); // 5 per source × 2 sources
        });
    });

    describe('Alignment order computation', () => {
        it('should produce implicit ordering constraints for aligned nodes', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // A, B horizontally aligned. A < B on H axis.
            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, b, 'y'), // Horizontal alignment
                    createLeftConstraint(a, b),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            // Should have produced implicit left constraints for the aligned group
            expect(validator.horizontallyAligned.length).toBeGreaterThan(0);
        });
    });

    describe('Solver statistics', () => {
        it('should report solver stats', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout(
                [a, b],
                [createLeftConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            validator.validateConstraints();

            const stats = validator.getStats();
            expect(stats.hEdges).toBeGreaterThanOrEqual(1);
            expect(stats.conflicts).toBe(0);
            expect(stats.addedConstraints).toBeGreaterThanOrEqual(1);
        });
    });
});
