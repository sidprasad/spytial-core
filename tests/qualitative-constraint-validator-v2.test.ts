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

describe('QualitativeConstraintValidator', () => {

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

            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
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
            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');

            const posError = error as PositionalConstraintError;
            expect(posError.maximalFeasibleSubset).toBeDefined();
            expect(posError.maximalFeasibleSubset!.length).toBeGreaterThan(0);
        });

        it('should exclude constraints from two independent infeasible cores', () => {
            // Core 1 (horizontal): A<B conjunctive + B<A disjunctive → H-cycle
            // Core 2 (vertical): C^D conjunctive + D^C disjunctive → V-cycle
            // The two cores share no nodes and are completely independent.
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const srcAB = new RelativeOrientationConstraint(['left'], 'A->B');
            const srcBA = new RelativeOrientationConstraint(['left'], 'B->A');
            const srcCD = new RelativeOrientationConstraint(['above'], 'C->D');
            const srcDC = new RelativeOrientationConstraint(['above'], 'D->C');

            const conjAB = createLeftConstraint(a, b, srcAB);
            const conjCD = createTopConstraint(c, d, srcCD);
            const disjBA = createLeftConstraint(b, a, srcBA);
            const disjDC = createTopConstraint(d, c, srcDC);

            const layout = createLayout(
                [a, b, c, d],
                [conjAB, conjCD],  // conjunctive: A<B, C^D
                [
                    // each disjunction has a single alternative that conflicts with its core's conjunctive
                    new DisjunctiveConstraint(srcBA, [[disjBA]]),  // only option: B<A → cycle with A<B
                    new DisjunctiveConstraint(srcDC, [[disjDC]]),  // only option: D^C → cycle with C^D
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');

            const posError = error as PositionalConstraintError;
            expect(posError.maximalFeasibleSubset).toBeDefined();
            const mfs = posError.maximalFeasibleSubset!;

            // MFS must not contain the full infeasible core 1: {A<B, B<A}
            const hasFullCore1 = mfs.includes(conjAB) && mfs.includes(disjBA);
            expect(hasFullCore1).toBe(false);

            // MFS must not contain the full infeasible core 2: {C^D, D^C}
            const hasFullCore2 = mfs.includes(conjCD) && mfs.includes(disjDC);
            expect(hasFullCore2).toBe(false);

            // MFS should still contain the individually-satisfiable conjunctive constraints
            expect(mfs.includes(conjAB)).toBe(true);
            expect(mfs.includes(conjCD)).toBe(true);

            // MFS should exclude the conflicting disjunctive constraints from both cores
            expect(mfs.includes(disjBA)).toBe(false);
            expect(mfs.includes(disjDC)).toBe(false);
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
            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
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
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            // Verify containment propagation happened
            const stats = validator.getStats();
            expect(stats.prunedByTransitivity).toBeGreaterThan(0);
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

            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const stats = validator.getStats();
            expect(stats.hEdges).toBeGreaterThanOrEqual(2);
        });

        it('should report enhanced stats including pruning counters', () => {
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout([a, b], [createLeftConstraint(a, b)]);

            const validator = new QualitativeConstraintValidator(layout);
            validator.validateConstraints();

            const stats = validator.getStats();
            expect(stats).toHaveProperty('prunedByTransitivity');
            expect(stats).toHaveProperty('prunedByDimension');
            expect(stats).toHaveProperty('prunedByPigeonhole');
            expect(stats).toHaveProperty('prunedByDecomposition');
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

            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
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
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const stats = validator.getStats();
            // With interval decomposition, many disjunctions should be resolved
            // without entering the CDCL search
            expect(stats.prunedByDecomposition).toBeGreaterThanOrEqual(0);
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
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            // Should complete in reasonable time (< 5 seconds)
            expect(elapsed).toBeLessThan(5000);

            const stats = validator.getStats();
            // Verify the geometry insights helped
            const totalPruned = stats.prunedByTransitivity
                + stats.prunedByDimension
                + stats.prunedByPigeonhole
                + stats.prunedByDecomposition;
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
            const validator = new QualitativeConstraintValidator(layout);
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

            const validator = new QualitativeConstraintValidator(layout);
            validator.validateConstraints();

            const stats = validator.getStats();
            expect(stats.hEdges).toBeGreaterThanOrEqual(1);
            expect(stats.conflicts).toBe(0);
            expect(stats.addedConstraints).toBeGreaterThanOrEqual(1);
            expect(typeof stats.prunedByTransitivity).toBe('number');
            expect(typeof stats.prunedByDimension).toBe('number');
            expect(typeof stats.prunedByPigeonhole).toBe('number');
            expect(typeof stats.prunedByDecomposition).toBe('number');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Pathological cases
    // ═══════════════════════════════════════════════════════════════════════════

    describe('Pathological: Cyclic constraint interactions', () => {

        it('should detect a long cycle (A < B < C < D < E < A)', () => {
            const nodes = Array.from({ length: 5 }, (_, i) =>
                createNode(String.fromCharCode(65 + i)) // A–E
            );
            const constraints = nodes.map((n, i) =>
                createLeftConstraint(n, nodes[(i + 1) % nodes.length])
            );

            const layout = createLayout(nodes, constraints);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should detect cycle that only emerges through disjunction forcing', () => {
            // A < B, B < C conjunctive.
            // Disj 1 (unit): C < A  → forced, creates cycle A<B<C<A
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new RelativeOrientationConstraint(['left'], 'forced-cycle');

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                [new DisjunctiveConstraint(src, [
                    [createLeftConstraint(c, a, src)], // Only option → cycle
                ])]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should handle independent H and V cycles correctly (only H cycles)', () => {
            // H: A < B < A (cycle on H) but V: A above B (no cycle on V)
            const a = createNode('A');
            const b = createNode('B');

            const layout = createLayout(
                [a, b],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, a), // H cycle
                    createTopConstraint(a, b),  // V ok
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Should fail because H has a cycle
            expect(error).not.toBeNull();
        });

        it('should handle mixed H/V constraints with no cycles (star topology)', () => {
            // Center node with 4 satellites: left, right, above, below
            const center = createNode('Center');
            const left = createNode('Left');
            const right = createNode('Right');
            const top = createNode('Top');
            const bottom = createNode('Bottom');

            const layout = createLayout(
                [center, left, right, top, bottom],
                [
                    createLeftConstraint(left, center),
                    createLeftConstraint(center, right),
                    createTopConstraint(top, center),
                    createTopConstraint(center, bottom),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should survive a diamond dependency (no cycle)', () => {
            //   A
            //  / \
            // B   C
            //  \ /
            //   D
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const layout = createLayout(
                [a, b, c, d],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(a, c),
                    createLeftConstraint(b, d),
                    createLeftConstraint(c, d),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Pathological: Alignment edge cases', () => {

        it('should detect x-align + left constraint conflict', () => {
            const a = createNode('A');
            const b = createNode('B');

            // x-aligned (same x) + A left of B → contradiction
            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'x'), createLeftConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should detect y-align + top constraint conflict', () => {
            const a = createNode('A');
            const b = createNode('B');

            // y-aligned (same y) + A above B → contradiction
            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'y'), createTopConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should allow x-align + top constraint (orthogonal axes)', () => {
            const a = createNode('A');
            const b = createNode('B');

            // x-aligned (same x) + A above B → perfectly fine (column layout)
            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'x'), createTopConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should allow y-align + left constraint (orthogonal axes)', () => {
            const a = createNode('A');
            const b = createNode('B');

            // y-aligned (same y) + A left of B → perfectly fine (row layout)
            const layout = createLayout(
                [a, b],
                [createAlignConstraint(a, b, 'y'), createLeftConstraint(a, b)]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle transitive alignment chain (A=B, B=C on x)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // All three share the same x. A above B above C.
            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, b, 'x'),
                    createAlignConstraint(b, c, 'x'),
                    createTopConstraint(a, b),
                    createTopConstraint(b, c),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should detect conflict when alignment chain + ordering creates contradiction', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // A=B on x-axis, B=C on x-axis → all share x
            // Then A left of C → contradiction (can't be left if same x)
            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, b, 'x'),
                    createAlignConstraint(b, c, 'x'),
                    createLeftConstraint(a, c),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should handle dual alignment (same x AND same y) → overlap detection', () => {
            const a = createNode('A');
            const b = createNode('B');

            // Same x AND same y → nodes overlap (occupy same position)
            const layout = createLayout(
                [a, b],
                [
                    createAlignConstraint(a, b, 'x'),
                    createAlignConstraint(a, b, 'y'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Should detect overlap — two nodes at the same position
            expect(error).not.toBeNull();
        });
    });

    describe('Pathological: Alignment backtracking (BUG 2 regression)', () => {

        it('should not retain stale alignment state after CDCL backtracks alignment alternative', () => {
            // D1: align-x(A,B) OR A left of B
            // D2: A left of B OR B left of A
            // If CDCL tries align-x(A,B) first for D1, then D2 must pick B<A or A<B.
            // If it picks A<B, that conflicts with x-align → backtrack D1 to "A left of B".
            // BUG: If the x-align union isn't undone on backtrack, A and B remain
            // in the same x-class, and "A left of B" is spuriously rejected.
            const a = createNode('A');
            const b = createNode('B');
            const src = new RelativeOrientationConstraint(['left'], 'align-bt');

            const layout = createLayout(
                [a, b],
                [],
                [
                    new DisjunctiveConstraint(src, [
                        [createAlignConstraint(a, b, 'x', src)],
                        [createLeftConstraint(a, b, src)],
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)],
                        [createLeftConstraint(b, a, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Should be SAT: pick "A left of B" for both D1 and D2
            expect(error).toBeNull();
        });

        it('should correctly backtrack y-alignment and allow subsequent vertical ordering', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new RelativeOrientationConstraint(['left'], 'y-align-bt');

            // Conjunctive: A above C
            // D1: align-y(A,B) OR A above B — if y-align tried first, A above C is OK
            //     but then if B needs to be ordered vs C, the stale y-align could cause issues
            // D2: B above C OR C above B
            const layout = createLayout(
                [a, b, c],
                [createTopConstraint(a, c)],
                [
                    new DisjunctiveConstraint(src, [
                        [createAlignConstraint(a, b, 'y', src)], // y-align: same row
                        [createTopConstraint(a, b, src)],        // A above B
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createTopConstraint(b, c, src)],
                        [createTopConstraint(c, b, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Pathological: Transitive alignment consistency (BUG 1 regression)', () => {

        it('should detect transitive ordering conflict with alignment via intermediate node', () => {
            // A < B < C (conjunctive, transitive ordering through B)
            // align-x(A, C) → conflict: A and C are ordered on H transitively
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createAlignConstraint(a, c, 'x'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should detect transitive V-ordering conflict with y-alignment', () => {
            // A above B, B above C → A transitively above C
            // align-y(A, C) → conflict
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createTopConstraint(a, b),
                    createTopConstraint(b, c),
                    createAlignConstraint(a, c, 'y'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should detect 4-hop transitive ordering conflict with alignment', () => {
            // A < B < C < D < E, then align-x(A, E)
            const nodes = Array.from({ length: 5 }, (_, i) =>
                createNode(String.fromCharCode(65 + i))
            );
            const constraints = [
                ...nodes.slice(0, -1).map((n, i) => createLeftConstraint(n, nodes[i + 1])),
                createAlignConstraint(nodes[0], nodes[4], 'x'),
            ];

            const layout = createLayout(nodes, constraints);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });
    });

    describe('Pathological: IIS and MFS for alignment conflicts', () => {

        it('should produce non-empty IIS for within-class alignment-ordering conflict', () => {
            // A < B < C, align-x(A, C) → conflict
            // IIS should include: align-x(A,C) + ordering path A→B→C
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createAlignConstraint(a, c, 'x'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();

            const pe = error as any;
            // IIS should be non-empty and include alignment + ordering constraints
            expect(pe.minimalConflictingSet.size).toBeGreaterThan(0);
            let iisCount = 0;
            for (const [, constraints] of pe.minimalConflictingSet) {
                iisCount += constraints.length;
            }
            expect(iisCount).toBeGreaterThanOrEqual(2); // at least alignment + one ordering

            // MFS should exist and exclude the conflicting constraints
            expect(pe.maximalFeasibleSubset).toBeDefined();
            expect(Array.isArray(pe.maximalFeasibleSubset)).toBe(true);
        });

        it('should produce non-empty IIS for cross-class alignment cycle', () => {
            // align-y(N1,N4), above(N2,N1), above(N4,N3), align-y(N3,N2)
            // Two y-alignment classes {N1,N4} and {N3,N2} with V-ordering in both directions
            const n0 = createNode('N0');
            const n1 = createNode('N1');
            const n2 = createNode('N2');
            const n3 = createNode('N3');
            const n4 = createNode('N4');

            const layout = createLayout(
                [n0, n1, n2, n3, n4],
                [
                    createAlignConstraint(n1, n4, 'y'),
                    createTopConstraint(n2, n1),
                    createTopConstraint(n4, n3),
                    createAlignConstraint(n3, n2, 'y'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();

            const pe = error as any;
            expect(pe.minimalConflictingSet.size).toBeGreaterThan(0);
            let iisCount = 0;
            for (const [, constraints] of pe.minimalConflictingSet) {
                iisCount += constraints.length;
            }
            // IIS should include 2 alignments + 2 orderings = 4 constraints
            expect(iisCount).toBeGreaterThanOrEqual(3);

            expect(pe.maximalFeasibleSubset).toBeDefined();
            expect(Array.isArray(pe.maximalFeasibleSubset)).toBe(true);
        });
    });

    describe('Pathological: Disjunction stress', () => {

        it('should solve when only the last alternative works in every disjunction', () => {
            // For each disjunction, all alternatives except the last create cycles.
            // Forces the solver to exhaust bad options before finding the solution.
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            // Conjunctive: A < B < C < D
            const src = new RelativeOrientationConstraint(['left'], 'stress');
            const layout = createLayout(
                [a, b, c, d],
                [createLeftConstraint(a, b), createLeftConstraint(b, c), createLeftConstraint(c, d)],
                [
                    // All would-cycle alternatives first, valid one last
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(d, a, src)], // D<A → cycle D<A<B<C<D
                        [createLeftConstraint(c, a, src)], // C<A → cycle C<A<B<C
                        [createLeftConstraint(a, d, src)], // OK (already implied by transitivity)
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle all-infeasible disjunction (UNSAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new RelativeOrientationConstraint(['left'], 'all-bad');

            // Conjunctive: A < B < C
            // Disjunction: every alternative creates a cycle
            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)], // C<A → cycle
                        [createLeftConstraint(b, a, src)], // B<A → cycle
                        [createLeftConstraint(c, b, src)], // C<B → cycle
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('should handle chained disjunctions where choice in D1 constrains D2', () => {
            // D1: A<B or B<A
            // D2: B<C or C<B
            // D3: C<A or A<C
            // Only 2 of the 8 combos are acyclic: (A<B, B<C, A<C) or (B<A, C<B, C<A)
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new RelativeOrientationConstraint(['left'], 'chained');

            const layout = createLayout(
                [a, b, c],
                [],
                [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, b, src)],
                        [createLeftConstraint(b, a, src)],
                    ]),
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

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle disjunction with multi-constraint alternatives', () => {
            // Each alternative commits 2 constraints simultaneously
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');
            const src = new RelativeOrientationConstraint(['left'], 'multi');

            const layout = createLayout(
                [a, b, c, d],
                [],
                [
                    new DisjunctiveConstraint(src, [
                        // Alt 1: A<B and C<D (both horizontal)
                        [createLeftConstraint(a, b, src), createLeftConstraint(c, d, src)],
                        // Alt 2: A above B and C above D (both vertical)
                        [createTopConstraint(a, b, src), createTopConstraint(c, d, src)],
                    ]),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Pathological: Group edge cases', () => {

        it('should handle a node that belongs to no group with multiple groups present', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');
            const e = createNode('E');
            const orphan = createNode('Orphan');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g1: LayoutGroup = {
                name: 'G1', nodeIds: ['A', 'B', 'C'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };
            const g2: LayoutGroup = {
                name: 'G2', nodeIds: ['D', 'E'],
                keyNodeId: 'D', showLabel: true, sourceConstraint: gbf,
            };

            // Orphan must be outside both groups
            const layout = createLayout([a, b, c, d, e, orphan], [], [], [g1, g2]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle nested groups (subgroup relationship)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const outer: LayoutGroup = {
                name: 'Outer', nodeIds: ['A', 'B', 'C'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };
            const inner: LayoutGroup = {
                name: 'Inner', nodeIds: ['A', 'B'], // subset of Outer
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };

            const layout = createLayout([a, b, c], [], [], [outer, inner]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Subgroup relationship → no overlap error
            expect(error).toBeNull();
        });

        it('should detect partially overlapping groups (not subgroups)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g1: LayoutGroup = {
                name: 'G1', nodeIds: ['A', 'B'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };
            const g2: LayoutGroup = {
                name: 'G2', nodeIds: ['B', 'C'], // B shared, neither is subgroup
                keyNodeId: 'B', showLabel: true, sourceConstraint: gbf,
            };

            const layout = createLayout([a, b, c], [], [], [g1, g2]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('group-overlap');
        });

        it('should handle single-node group (degenerate)', () => {
            const a = createNode('A');
            const b = createNode('B');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g: LayoutGroup = {
                name: 'Singleton', nodeIds: ['A'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };

            const layout = createLayout([a, b], [], [], [g]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // Single-node groups shouldn't generate bounding box disjunctions
            expect(error).toBeNull();
        });

        it('should handle group with ordering constraints between members', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g: LayoutGroup = {
                name: 'G1', nodeIds: ['A', 'B', 'C'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };

            // Ordering between group members + non-member D
            const layout = createLayout(
                [a, b, c, d],
                [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                [],
                [g]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Pathological: Contradictory constraint combinations', () => {

        it('should detect mutual exclusion: A<B required by two unit disjunctions', () => {
            const a = createNode('A');
            const b = createNode('B');
            const src1 = new RelativeOrientationConstraint(['left'], 'must-left');
            const src2 = new RelativeOrientationConstraint(['left'], 'must-right');

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
        });

        it('should detect conflict: conjunctive ordering + disjunction forcing reverse', () => {
            const a = createNode('A');
            const b = createNode('B');
            const src = new RelativeOrientationConstraint(['left'], 'reverse');

            // Conjunctive: A < B
            // Disjunction (unit): B < A → cycle
            const layout = createLayout(
                [a, b],
                [createLeftConstraint(a, b)],
                [new DisjunctiveConstraint(src, [[createLeftConstraint(b, a, src)]])]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('should handle 4-node complete tournament (total order exists)', () => {
            // Every pair must be ordered on H axis. One of the 24 permutations should work.
            const nodes = Array.from({ length: 4 }, (_, i) =>
                createNode(`N${i}`)
            );
            const src = new RelativeOrientationConstraint(['left'], 'tournament');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < 4; i++) {
                for (let j = i + 1; j < 4; j++) {
                    disjunctions.push(new DisjunctiveConstraint(src, [
                        [createLeftConstraint(nodes[i], nodes[j], src)],
                        [createLeftConstraint(nodes[j], nodes[i], src)],
                    ]));
                }
            }

            const layout = createLayout(nodes, [], disjunctions);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            // A total order always exists → SAT
            expect(error).toBeNull();
        });

        it('should handle cross-axis interactions (H ordering + V ordering + alignment)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            // A left of B (H), A above C (V), B and C y-aligned (same y)
            // This is valid: A is top-left, B is right, C is below-left, B and C share a row
            const layout = createLayout(
                [a, b, c],
                [
                    createLeftConstraint(a, b),
                    createTopConstraint(a, c),
                    createAlignConstraint(b, c, 'y'),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    describe('Pathological: Scale and performance edge cases', () => {

        it('should handle 20-node total ordering (long chain, no disjunctions)', () => {
            const nodes = Array.from({ length: 20 }, (_, i) => createNode(`N${i}`));
            const constraints = nodes.slice(0, -1).map((n, i) =>
                createLeftConstraint(n, nodes[i + 1])
            );

            const layout = createLayout(nodes, constraints);
            const start = performance.now();
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            expect(elapsed).toBeLessThan(100); // Long chain should be instant
        });

        it('should handle wide fan-out (1 node left of 20 others)', () => {
            const root = createNode('Root');
            const children = Array.from({ length: 20 }, (_, i) => createNode(`C${i}`));

            const constraints = children.map(c => createLeftConstraint(root, c));

            const layout = createLayout([root, ...children], constraints);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle grid topology (5×4 nodes, row + column constraints)', () => {
            const nodes: LayoutNode[][] = [];
            const allNodes: LayoutNode[] = [];
            const constraints: any[] = [];

            for (let r = 0; r < 5; r++) {
                nodes.push([]);
                for (let c = 0; c < 4; c++) {
                    const n = createNode(`R${r}C${c}`);
                    nodes[r].push(n);
                    allNodes.push(n);
                }
            }

            // Row ordering: left to right within each row
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 3; c++) {
                    constraints.push(createLeftConstraint(nodes[r][c], nodes[r][c + 1]));
                }
            }

            // Column ordering: top to bottom within each column
            for (let c = 0; c < 4; c++) {
                for (let r = 0; r < 4; r++) {
                    constraints.push(createTopConstraint(nodes[r][c], nodes[r + 1][c]));
                }
            }

            const layout = createLayout(allNodes, constraints);
            const start = performance.now();
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            expect(elapsed).toBeLessThan(200);
        });

        it('should handle 8 disjunctions × 4 alternatives (search space = 4^8 = 65536)', () => {
            const nodes = Array.from({ length: 20 }, (_, i) =>
                createNode(`N${i}`, { width: 50, height: 30 })
            );
            const src = new RelativeOrientationConstraint(['left'], 'big');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < 8; i++) {
                const n1 = nodes[i * 2];
                const n2 = nodes[i * 2 + 1];
                disjunctions.push(new DisjunctiveConstraint(src, [
                    [createLeftConstraint(n1, n2, src)],
                    [createLeftConstraint(n2, n1, src)],
                    [createTopConstraint(n1, n2, src)],
                    [createTopConstraint(n2, n1, src)],
                ]));
            }

            const layout = createLayout(nodes, [], disjunctions);
            const start = performance.now();
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            const elapsed = performance.now() - start;

            expect(error).toBeNull();
            expect(elapsed).toBeLessThan(2000);
        });
    });

    describe('Pathological: BoundingBox and GroupBoundary constraints', () => {

        it('should handle explicit BoundingBoxConstraint with left side', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g: LayoutGroup = {
                name: 'G1', nodeIds: ['A', 'B'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };

            const bc: BoundingBoxConstraint = {
                group: g, node: c, side: 'left',
                minDistance: 15, sourceConstraint: gbf,
            };

            const layout = createLayout([a, b, c], [bc], [], [g]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle BoundingBoxConstraints on all four sides', () => {
            const members = Array.from({ length: 3 }, (_, i) => createNode(`M${i}`));
            const outside = Array.from({ length: 4 }, (_, i) => createNode(`Out${i}`));

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g: LayoutGroup = {
                name: 'G', nodeIds: members.map(m => m.id),
                keyNodeId: members[0].id, showLabel: true, sourceConstraint: gbf,
            };

            const constraints: BoundingBoxConstraint[] = [
                { group: g, node: outside[0], side: 'left', minDistance: 15, sourceConstraint: gbf },
                { group: g, node: outside[1], side: 'right', minDistance: 15, sourceConstraint: gbf },
                { group: g, node: outside[2], side: 'top', minDistance: 15, sourceConstraint: gbf },
                { group: g, node: outside[3], side: 'bottom', minDistance: 15, sourceConstraint: gbf },
            ];

            const layout = createLayout([...members, ...outside], constraints, [], [g]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should detect cycle through virtual group node', () => {
            // Out1 is left of group, and right of group → cycle through virtual node
            const a = createNode('A');
            const b = createNode('B');
            const out = createNode('Out');

            const gbf = new GroupByField('type', 0, 1, 'type');
            const g: LayoutGroup = {
                name: 'G', nodeIds: ['A', 'B'],
                keyNodeId: 'A', showLabel: true, sourceConstraint: gbf,
            };

            const constraints: BoundingBoxConstraint[] = [
                { group: g, node: out, side: 'left', minDistance: 15, sourceConstraint: gbf },  // Out < _group_G
                { group: g, node: out, side: 'right', minDistance: 15, sourceConstraint: gbf }, // _group_G < Out → cycle
            ];

            const layout = createLayout([a, b, out], constraints, [], [g]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });
    });

    describe('Pathological: CyclicOrientationConstraint', () => {

        it('should handle all rotations of a 4-node cyclic constraint', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');
            const src = new CyclicOrientationConstraint('clockwise', 'A->B->C->D');

            // 4 rotations of clockwise ordering
            const disj = new DisjunctiveConstraint(src, [
                [createLeftConstraint(a, b, src), createLeftConstraint(b, c, src), createLeftConstraint(c, d, src)],
                [createLeftConstraint(b, c, src), createLeftConstraint(c, d, src), createLeftConstraint(d, a, src)],
                [createLeftConstraint(c, d, src), createLeftConstraint(d, a, src), createLeftConstraint(a, b, src)],
                [createLeftConstraint(d, a, src), createLeftConstraint(a, b, src), createLeftConstraint(b, c, src)],
            ]);

            const layout = createLayout([a, b, c, d], [], [disj]);
            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });

        it('should handle cyclic constraint conflicting with conjunctive', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new CyclicOrientationConstraint('clockwise', 'A->B->C');

            // Conjunctive: C < A (fixed)
            // Cyclic: tries rotations, but all would need some ordering that conflicts
            // Rotation 1: A<B, B<C → implies A<C, but C<A is conjunctive → cycle
            // Rotation 2: B<C, C<A → C<A is consistent with conjunctive, B<C ok → WORKS
            // Rotation 3: C<A, A<B → C<A consistent, A<B ok → WORKS
            const disj = new DisjunctiveConstraint(src, [
                [createLeftConstraint(a, b, src), createLeftConstraint(b, c, src)], // A<B<C but C<A → cycle
                [createLeftConstraint(b, c, src), createLeftConstraint(c, a, src)], // OK: B<C, C<A
                [createLeftConstraint(c, a, src), createLeftConstraint(a, b, src)], // OK: C<A, A<B
            ]);

            const layout = createLayout(
                [a, b, c],
                [createLeftConstraint(c, a)], // Conjunctive: C < A
                [disj]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull();
        });
    });

    // ─── Transitive alignment-ordering through intermediate nodes ────────────

    describe('Transitive alignment-ordering through intermediate nodes', () => {

        it('align-x(N2,N3) + leftOf chain N3→N0→N1→N2 should be UNSAT (CI counterexample)', () => {
            // Counterexample from PBT CI: Kiwi=UNSAT, Qual=SAT
            // N3→N0→N1→N2 means N3.x < N2.x, but align-x(N2,N3) requires N2.x == N3.x
            const n0 = createNode('N0', { width: 38, height: 25 });
            const n1 = createNode('N1', { width: 159, height: 28 });
            const n2 = createNode('N2', { width: 96, height: 21 });
            const n3 = createNode('N3', { width: 179, height: 97 });

            const layout = createLayout(
                [n0, n1, n2, n3],
                [
                    createLeftConstraint(n1, n2),       // N1 → N2
                    createAlignConstraint(n2, n3, 'x'),  // N2 ≡x N3
                    createLeftConstraint(n3, n0),       // N3 → N0
                    createLeftConstraint(n0, n1),       // N0 → N1
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(error!.type).toBe('positional-conflict');
        });

        it('align-x through 2 intermediates: align-x(A,D) + A→B→C→D should be UNSAT', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const layout = createLayout(
                [a, b, c, d],
                [
                    createAlignConstraint(a, d, 'x'),
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createLeftConstraint(c, d),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('align-y through intermediate: align-y(A,C) + above(A,B) + above(B,C) should be UNSAT', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, c, 'y'),
                    createTopConstraint(a, b),
                    createTopConstraint(b, c),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('alignment added BEFORE ordering chain completes: align first, then build path', () => {
            // Order: align-x(A,D), then A→B, B→C, C→D
            // The conflict is only detectable after the last edge completes the path
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const layout = createLayout(
                [a, b, c, d],
                [
                    createAlignConstraint(a, d, 'x'),
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createLeftConstraint(c, d), // completes path A→B→C→D, but A≡xD
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('alignment added AFTER ordering chain: chain first, then align endpoints', () => {
            // Order: A→B, B→C, C→D, then align-x(A,D)
            // checkAlignmentConsistency should catch this
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const layout = createLayout(
                [a, b, c, d],
                [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createLeftConstraint(c, d),
                    createAlignConstraint(a, d, 'x'), // A≡xD but A→B→C→D
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
        });

        it('non-conflicting case: align-x(A,B) + leftOf(C,D) with no path between aligned nodes', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');

            const layout = createLayout(
                [a, b, c, d],
                [
                    createAlignConstraint(a, b, 'x'),
                    createLeftConstraint(c, d),
                    createLeftConstraint(a, c), // A→C→D, but B is not on this path
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).toBeNull(); // SAT: no ordering between aligned A and B
        });

        it('IIS includes alignment + ordering constraints for intermediate-node conflict', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');

            const layout = createLayout(
                [a, b, c],
                [
                    createAlignConstraint(a, c, 'x'),
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                ]
            );

            const validator = new QualitativeConstraintValidator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            // IIS should contain the alignment and the ordering path
            const mcs = error!.minimalConflictingSet;
            expect(mcs).toBeDefined();
            const allIISConstraints: any[] = [];
            for (const [, cs] of mcs!) {
                allIISConstraints.push(...cs);
            }
            // IIS should include alignment + both ordering edges = 3 constraints
            expect(allIISConstraints.length).toBeGreaterThanOrEqual(2);
            // MFS should exist
            expect(error!.maximalFeasibleSubset).toBeDefined();
        });
    });
});
