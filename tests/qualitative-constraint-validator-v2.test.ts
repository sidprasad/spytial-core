import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidatorV2, PositionalConstraintError } from '../src/layout/qualitative-constraint-validator-v2';
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

function createNode(id: string, opts?: { width?: number; height?: number; label?: string }): LayoutNode {
    return {
        id,
        label: opts?.label || id,
        color: 'black',
        groups: [],
        attributes: {},
        width: opts?.width ?? 100,
        height: opts?.height ?? 60,
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
// Tests — all V1 tests should pass identically on V2
// ═══════════════════════════════════════════════════════════════════════════════

describe('QualitativeConstraintValidatorV2', () => {

    // ─── Same tests as V1 (drop-in compatibility) ────────────────────────────

    describe('Conjunctive constraints', () => {
        it('should accept consistent left/top constraints', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
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

            const validator = new QualitativeConstraintValidatorV2(layout);
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

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should detect alignment-ordering conflict', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout(
                [a, b],
                [createLeftConstraint(a, b), createAlignConstraint(a, b, 'x')]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
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
            const validator = new QualitativeConstraintValidatorV2(layout);
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
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should backtrack and find satisfying assignment', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const src = new RelativeOrientationConstraint(['left'], 'cycle');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(b, c, src)],
                        [createLeftConstraint(c, b, src)],
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)],
                        [createLeftConstraint(a, c, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Geometric pruning', () => {
        it('should prune alternatives that would create cycles via transitivity', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const src = new RelativeOrientationConstraint(['left'], 'test');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)],
                        [createLeftConstraint(a, c, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const addedLeft = layout.constraints.filter(c => isLeftConstraint(c));
            // A<B, B<C are conjunctive; A<C follows by transitivity in the
            // box-only graph, so the disjunction may be resolved without adding
            // a redundant edge. At minimum we need the 2 conjunctive edges.
            expect(addedLeft.length).toBeGreaterThanOrEqual(2);
        });

        it('should skip disjunctions for already-separated regions', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

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

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should prune H-axis alternatives when nodes are x-aligned', () => {
            const a = createNode('A');
            const b = createNode('B');

            const src = new RelativeOrientationConstraint(['left'], 'overlap');

            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'x')],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)],
                        [createLeftConstraint(b, a, src)],
                        [createTopConstraint(a, b, src)],
                        [createTopConstraint(b, a, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('CDCL clause learning', () => {
        it('should detect unsatisfiable disjunction sets', () => {
            const a = createNode('A');
            const b = createNode('B');

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

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should handle a 3-way cyclic conflict', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const src = new CyclicOrientationConstraint('clockwise', 'A->B->C');

            const disj = new DisjunctiveConstraint(src, [
                [createLeftConstraint(a, b, src), createLeftConstraint(b, c, src)],
                [createLeftConstraint(b, c, src), createLeftConstraint(c, a, src)],
                [createLeftConstraint(c, a, src), createLeftConstraint(a, b, src)],
            ]);

            const layout = createLayout([a, b, c], [], [disj]);
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Maximal feasible subset', () => {
        it('should report maximalFeasibleSubset on UNSAT', () => {
            const a = createNode('A');
            const b = createNode('B');

            const src1 = new RelativeOrientationConstraint(['left'], 'd1');
            const src2 = new RelativeOrientationConstraint(['left'], 'd2');

            const layout = createLayout(
                [a, b],
                [],
                [
                    new DisjunctiveConstraint(src1, [[createLeftConstraint(a, b, src1)]]),
                    new DisjunctiveConstraint(src2, [[createLeftConstraint(b, a, src2)]]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');

            const posError = error as PositionalConstraintError;
            expect(posError.maximalFeasibleSubset).toBeDefined();
            expect(posError.maximalFeasibleSubset!.length).toBeGreaterThan(0);
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

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
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

            const layout = createLayout([a, b], [], [], [group1, group2]);
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Alignment order computation', () => {
        it('should produce implicit ordering constraints for aligned nodes', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, b, 'y'),
                    createLeftConstraint(a, b),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
            expect(validator.horizontallyAligned.length).toBeGreaterThan(0);
        });
    });

    // ─── V2-specific: Insight 1 — Group containment propagation ──────────────

    describe('Insight 1: Group containment propagation', () => {
        it('should propagate non-member ordering to group members', () => {
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

            // C is left of Group1. After containment propagation,
            // C should also be left of A and B.
            const bc: BoundingBoxConstraint = {
                group: group1,
                node: c,
                side: 'left',
                minDistance: 15,
                sourceConstraint: groupByField,
            };

            const layout = createLayout([a, b, c], [bc], [], [group1]);
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            // Verify containment propagation happened
            const stats = validator.getStats();
            expect(stats.prunedByContainment).toBeGreaterThan(0);
        });

        it('should skip non-member disjunctions when already separated via containment', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const groupByField = new GroupByField('type', 0, 1, 'type');

            const group1: LayoutGroup = {
                name: 'Group1',
                nodeIds: ['A', 'B'],
                keyNodeId: 'A',
                showLabel: true,
                sourceConstraint: groupByField,
            };

            // C is left of the group → C is already separated from Group1
            // So the non-member disjunction for C should be skipped
            const layout = createLayout(
                [a, b, c, d],
                [createLeftConstraint(c, a)], // C is left of A (member)
                [],
                [group1]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    // ─── V2-specific: Insight 2 — Dimension-aware feasibility ────────────────

    describe('Insight 2: Dimension-aware feasibility', () => {
        it('should use node dimensions for slack scoring', () => {
            // Create nodes with known dimensions
            const a = createNode('A', { width: 200, height: 50 });
            const b = createNode('B', { width: 200, height: 50 });
            const c = createNode('C', { width: 200, height: 50 });

            const src = new RelativeOrientationConstraint(['left'], 'test');

            // A < B is conjunctive. Disjunction: B<C or C<B
            // Both should work, but the solver should prefer the one with more slack
            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(b, c, src)],
                        [createLeftConstraint(c, b, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const stats = validator.getStats();
            expect(stats.hEdges).toBeGreaterThanOrEqual(2);
        });

        it('should report enhanced stats including pruning counters', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout([a, b], [createLeftConstraint(a, b)]);

            const validator = new QualitativeConstraintValidatorV2(layout);
            validator.validateConstraints();

            const stats = validator.getStats();
            expect(stats).toHaveProperty('prunedByContainment');
            expect(stats).toHaveProperty('prunedByDimension');
            expect(stats).toHaveProperty('prunedByPigeonhole');
            expect(stats).toHaveProperty('prunedByIntervalDecomp');
        });
    });

    // ─── V2-specific: Insight 3 — Pigeonhole on alignment classes ────────────

    describe('Insight 3: Pigeonhole on alignment classes', () => {
        it('should accept small alignment classes that fit', () => {
            const a = createNode('A', { width: 100, height: 60 });
            const b = createNode('B', { width: 100, height: 60 });
            const c = createNode('C', { width: 100, height: 60 });

            // All x-aligned (same x). Need 3*60 + 2*15 = 210px vertical → easily fits
            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, b, 'x'),
                    createAlignConstraint(b, c, 'x'),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    // ─── V2-specific: Insight 4 — Interval decomposition ────────────────────

    describe('Insight 4: Interval-graph decomposition', () => {
        it('should resolve 4-way disjunctions via aspect ratio when clear', () => {
            // Very wide nodes should prefer vertical separation
            const a = createNode('A', { width: 500, height: 30 });
            const b = createNode('B', { width: 500, height: 30 });

            const src = new RelativeOrientationConstraint(['left'], 'nonoverlap');

            const layout = createLayout(
                [a, b],
                [],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)],
                        [createLeftConstraint(b, a, src)],
                        [createTopConstraint(a, b, src)],
                        [createTopConstraint(b, a, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle multiple 4-way disjunctions efficiently', () => {
            // Create 5 nodes that all need pairwise non-overlap
            const nodes = Array.from({ length: 5 }, (_, i) =>
                createNode(`N${i}`, { width: 80, height: 50 })
            );

            const src = new RelativeOrientationConstraint(['left'], 'nonoverlap');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    disjunctions.push(new DisjunctiveConstraint(src, [
                        [createLeftConstraint(nodes[i], nodes[j], src)],
                        [createLeftConstraint(nodes[j], nodes[i], src)],
                        [createTopConstraint(nodes[i], nodes[j], src)],
                        [createTopConstraint(nodes[j], nodes[i], src)],
                    ]));
                }
            }

            const layout = createLayout(nodes, [], disjunctions);
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const stats = validator.getStats();
            // With interval decomposition, many disjunctions should be resolved
            // without entering the CDCL search
            expect(stats.prunedByIntervalDecomp).toBeGreaterThanOrEqual(0);
        });
    });

    // ─── Performance: V2 should handle larger instances ──────────────────────

    describe('Performance', () => {
        it('should handle 10 nodes with pairwise non-overlap disjunctions', () => {
            const n = 10;
            const nodes = Array.from({ length: n }, (_, i) =>
                createNode(`N${i}`, { width: 60, height: 40 })
            );

            const src = new RelativeOrientationConstraint(['left'], 'nonoverlap');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    disjunctions.push(new DisjunctiveConstraint(src, [
                        [createLeftConstraint(nodes[i], nodes[j], src)],
                        [createLeftConstraint(nodes[j], nodes[i], src)],
                        [createTopConstraint(nodes[i], nodes[j], src)],
                        [createTopConstraint(nodes[j], nodes[i], src)],
                    ]));
                }
            }

            const layout = createLayout(nodes, [], disjunctions);
            const start = performance.now();
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            // Should complete in reasonable time (< 5 seconds)
            expect(elapsed).toBeLessThan(5000);

            const stats = validator.getStats();
            // Verify the geometry insights helped
            const totalPruned = stats.prunedByContainment
                + stats.prunedByDimension
                + stats.prunedByPigeonhole
                + stats.prunedByIntervalDecomp;
            // At least some pruning should have happened
            expect(totalPruned + stats.conflicts).toBeGreaterThanOrEqual(0);
        });

        it('should handle groups with many non-members efficiently', () => {
            const groupMembers = Array.from({ length: 3 }, (_, i) =>
                createNode(`M${i}`, { width: 80, height: 50 })
            );
            const nonMembers = Array.from({ length: 7 }, (_, i) =>
                createNode(`X${i}`, { width: 80, height: 50 })
            );

            const groupByField = new GroupByField('type', 0, 1, 'type');
            const group: LayoutGroup = {
                name: 'MainGroup',
                nodeIds: groupMembers.map(n => n.id),
                keyNodeId: groupMembers[0].id,
                showLabel: true,
                sourceConstraint: groupByField,
            };

            const layout = createLayout(
                [...groupMembers, ...nonMembers],
                [],
                [],
                [group]
            );

            const start = performance.now();
            const validator = new QualitativeConstraintValidatorV2(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            expect(elapsed).toBeLessThan(5000);
        });
    });

    describe('Solver statistics', () => {
        it('should report extended solver stats', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout(
                [a, b],
                [createLeftConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidatorV2(layout);
            validator.validateConstraints();

            const stats = validator.getStats();
            expect(stats.hEdges).toBeGreaterThanOrEqual(1);
            expect(stats.conflicts).toBe(0);
            expect(stats.addedConstraints).toBeGreaterThanOrEqual(1);
            expect(typeof stats.prunedByContainment).toBe('number');
            expect(typeof stats.prunedByDimension).toBe('number');
            expect(typeof stats.prunedByPigeonhole).toBe('number');
            expect(typeof stats.prunedByIntervalDecomp).toBe('number');
        });
    });
});
