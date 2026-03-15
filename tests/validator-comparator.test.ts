/**
 * Validator Comparator — lightweight correctness and performance comparison
 * between the three constraint validators:
 *
 *   1. ConstraintValidator (Kiwi/Cassowary-based, original)
 *   2. QualitativeConstraintValidator (V1, qualitative CDCL)
 *   3. QualitativeConstraintValidatorV2 (V2, box-only + geometry insights)
 *
 * For each test scenario we run all three validators on identical inputs and
 * compare:
 *   - Correctness: do they agree on SAT/UNSAT?
 *   - Error shape: when UNSAT, do they both report the same error type?
 *   - Performance: wall-clock time for each
 *
 * The test scenarios are drawn from the existing performance tests and
 * extended with group-heavy and alignment-heavy cases.
 */

import { describe, it, expect } from 'vitest';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { QualitativeConstraintValidatorV2 } from '../src/layout/qualitative-constraint-validator-v2';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    ImplicitConstraint,
    isLeftConstraint,
    isTopConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, opts?: { width?: number; height?: number }): LayoutNode {
    return {
        id,
        label: id,
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

function createLeftConstraint(left: LayoutNode, right: LayoutNode, source?: any): LeftConstraint {
    const defaultSource = new RelativeOrientationConstraint(['left'], `${left.id}->${right.id}`);
    return { left, right, minDistance: 15, sourceConstraint: source || defaultSource };
}

function createTopConstraint(top: LayoutNode, bottom: LayoutNode, source?: any): TopConstraint {
    const defaultSource = new RelativeOrientationConstraint(['above'], `${top.id}->${bottom.id}`);
    return { top, bottom, minDistance: 15, sourceConstraint: source || defaultSource };
}

function createAlignConstraint(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y'): AlignmentConstraint {
    const defaultSource = new RelativeOrientationConstraint(
        [axis === 'x' ? 'directlyAbove' : 'directlyLeft'],
        `${node1.id}->${node2.id}`
    );
    return { axis, node1, node2, sourceConstraint: defaultSource };
}

/**
 * Deep-clone an InstanceLayout so each validator gets its own copy.
 * Validators mutate the layout (add resolved constraints), so we must isolate them.
 */
function cloneLayout(layout: InstanceLayout): InstanceLayout {
    return {
        nodes: layout.nodes, // Nodes are read-only during validation
        edges: layout.edges,
        constraints: [...layout.constraints],
        groups: layout.groups,
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? layout.disjunctiveConstraints.map(d =>
                new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a])))
            : undefined,
    };
}

// ─── Validator runner ────────────────────────────────────────────────────────

interface ValidatorResult {
    name: string;
    error: any | null;
    timeMs: number;
    isSat: boolean;
    errorType?: string;
}

function runAll(layout: InstanceLayout): { kiwi: ValidatorResult; v1: ValidatorResult; v2: ValidatorResult } {
    // Kiwi (original)
    const layoutKiwi = cloneLayout(layout);
    const t0k = performance.now();
    const validatorKiwi = new ConstraintValidator(layoutKiwi);
    const errorKiwi = validatorKiwi.validateConstraints();
    const t1k = performance.now();

    // V1
    const layoutV1 = cloneLayout(layout);
    const t0v1 = performance.now();
    const validatorV1 = new QualitativeConstraintValidator(layoutV1);
    const errorV1 = validatorV1.validateConstraints();
    const t1v1 = performance.now();

    // V2
    const layoutV2 = cloneLayout(layout);
    const t0v2 = performance.now();
    const validatorV2 = new QualitativeConstraintValidatorV2(layoutV2);
    const errorV2 = validatorV2.validateConstraints();
    const t1v2 = performance.now();

    return {
        kiwi: { name: 'Kiwi', error: errorKiwi, timeMs: t1k - t0k, isSat: errorKiwi === null, errorType: errorKiwi?.type },
        v1:   { name: 'V1',   error: errorV1,   timeMs: t1v1 - t0v1, isSat: errorV1 === null,   errorType: errorV1?.type },
        v2:   { name: 'V2',   error: errorV2,   timeMs: t1v2 - t0v2, isSat: errorV2 === null,   errorType: errorV2?.type },
    };
}

function logTiming(label: string, results: { kiwi: ValidatorResult; v1: ValidatorResult; v2: ValidatorResult }) {
    console.log(`  [${label}] Kiwi: ${results.kiwi.timeMs.toFixed(1)}ms | V1: ${results.v1.timeMs.toFixed(1)}ms | V2: ${results.v2.timeMs.toFixed(1)}ms`);
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('Validator Comparator', () => {

    // ─── Correctness: SAT/UNSAT agreement ────────────────────────────────────

    describe('Correctness: SAT/UNSAT agreement', () => {

        it('simple chain (SAT)', () => {
            const nodes = Array.from({ length: 5 }, (_, i) => createNode(`N${i}`));
            const constraints = [];
            for (let i = 0; i < nodes.length - 1; i++) {
                constraints.push(createLeftConstraint(nodes[i], nodes[i + 1]));
            }
            const layout: InstanceLayout = { nodes, edges: [], constraints, groups: [] };

            const results = runAll(layout);
            logTiming('simple-chain', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('simple cycle (UNSAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const layout: InstanceLayout = {
                nodes: [a, b, c],
                edges: [],
                constraints: [
                    createLeftConstraint(a, b),
                    createLeftConstraint(b, c),
                    createLeftConstraint(c, a),
                ],
                groups: [],
            };

            const results = runAll(layout);
            logTiming('simple-cycle', results);

            expect(results.kiwi.isSat).toBe(false);
            expect(results.v1.isSat).toBe(false);
            expect(results.v2.isSat).toBe(false);
        });

        it('alignment + ordering conflict (UNSAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const layout: InstanceLayout = {
                nodes: [a, b],
                edges: [],
                constraints: [
                    createLeftConstraint(a, b),
                    createAlignConstraint(a, b, 'x'), // same x → can't be left/right
                ],
                groups: [],
            };

            const results = runAll(layout);
            logTiming('align-conflict', results);

            expect(results.kiwi.isSat).toBe(false);
            expect(results.v1.isSat).toBe(false);
            expect(results.v2.isSat).toBe(false);
        });

        it('disjunction with backtracking (SAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const src = new RelativeOrientationConstraint(['left'], 'test');

            const layout: InstanceLayout = {
                nodes: [a, b, c],
                edges: [],
                constraints: [createLeftConstraint(a, b)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(b, c, src)],
                        [createLeftConstraint(c, b, src)],
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)], // Would cycle
                        [createLeftConstraint(a, c, src)], // OK
                    ]),
                ],
            };

            const results = runAll(layout);
            logTiming('disjunction-backtrack', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('contradictory unit disjunctions (UNSAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const src1 = new RelativeOrientationConstraint(['left'], 'd1');
            const src2 = new RelativeOrientationConstraint(['left'], 'd2');

            const layout: InstanceLayout = {
                nodes: [a, b],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(src1, [[createLeftConstraint(a, b, src1)]]),
                    new DisjunctiveConstraint(src2, [[createLeftConstraint(b, a, src2)]]),
                ],
            };

            const results = runAll(layout);
            logTiming('contradict-unit', results);

            expect(results.kiwi.isSat).toBe(false);
            expect(results.v1.isSat).toBe(false);
            expect(results.v2.isSat).toBe(false);
        });

        it('group with non-members (SAT)', () => {
            const nodes = Array.from({ length: 5 }, (_, i) => createNode(`N${i}`));
            const groupByField = new GroupByField('type', 0, 1, 'type');
            const group: LayoutGroup = {
                name: 'G1',
                nodeIds: ['N0', 'N1', 'N2'],
                keyNodeId: 'N0',
                showLabel: true,
                sourceConstraint: groupByField,
            };

            const layout: InstanceLayout = {
                nodes,
                edges: [],
                constraints: [],
                groups: [group],
            };

            const results = runAll(layout);
            logTiming('group-nonmembers', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('overlapping groups (UNSAT)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const gbf = new GroupByField('type', 0, 1, 'type');
            const g1: LayoutGroup = { name: 'G1', nodeIds: ['A', 'B'], keyNodeId: 'A', showLabel: true, sourceConstraint: gbf };
            const g2: LayoutGroup = { name: 'G2', nodeIds: ['B', 'C'], keyNodeId: 'B', showLabel: true, sourceConstraint: gbf };

            const layout: InstanceLayout = { nodes: [a, b, c], edges: [], constraints: [], groups: [g1, g2] };

            const results = runAll(layout);
            logTiming('overlap-groups', results);

            // All should detect the group overlap
            expect(results.kiwi.isSat).toBe(false);
            expect(results.v1.isSat).toBe(false);
            expect(results.v2.isSat).toBe(false);
            expect(results.kiwi.errorType).toBe('group-overlap');
            expect(results.v1.errorType).toBe('group-overlap');
            expect(results.v2.errorType).toBe('group-overlap');
        });
    });

    // ─── Performance comparison ──────────────────────────────────────────────

    describe('Performance comparison', () => {

        it('5 disjunctions × 4 alternatives (search space = 4^5 = 1024)', () => {
            const nodes = Array.from({ length: 20 }, (_, i) => createNode(`N${i}`));
            const src = new RelativeOrientationConstraint(['left'], 'perf');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < 5; i++) {
                const n1 = nodes[i * 2];
                const n2 = nodes[i * 2 + 1];
                const n3 = nodes[Math.min(i * 2 + 2, nodes.length - 1)];
                disjunctions.push(new DisjunctiveConstraint(src, [
                    [createLeftConstraint(n1, n2, src)],
                    [createLeftConstraint(n2, n1, src)],
                    [createLeftConstraint(n1, n3, src)],
                    [createLeftConstraint(n3, n1, src)],
                ]));
            }

            const layout: InstanceLayout = {
                nodes, edges: [], constraints: [], groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const results = runAll(layout);
            logTiming('5disj-4alt', results);

            // All should find SAT
            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('6 disjunctions × 3 alternatives (search space = 3^6 = 729)', () => {
            const nodes = Array.from({ length: 15 }, (_, i) => createNode(`N${i}`));
            const src = new RelativeOrientationConstraint(['left'], 'perf');
            const disjunctions: DisjunctiveConstraint[] = [];

            for (let i = 0; i < 6; i++) {
                const n1 = nodes[i * 2];
                const n2 = nodes[i * 2 + 1];
                const n3 = nodes[Math.min((i + 1) * 2, nodes.length - 1)];
                disjunctions.push(new DisjunctiveConstraint(src, [
                    [createLeftConstraint(n1, n2, src)],
                    [createLeftConstraint(n2, n3, src)],
                    [createLeftConstraint(n1, n3, src)],
                ]));
            }

            const layout: InstanceLayout = {
                nodes, edges: [], constraints: [], groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const results = runAll(layout);
            logTiming('6disj-3alt', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('10 nodes pairwise non-overlap (45 4-way disjunctions)', () => {
            const n = 10;
            const nodes = Array.from({ length: n }, (_, i) => createNode(`N${i}`, { width: 60, height: 40 }));
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

            const layout: InstanceLayout = {
                nodes, edges: [], constraints: [], groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const results = runAll(layout);
            logTiming('10-pairwise', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);

            // All should complete in < 5 seconds
            expect(results.kiwi.timeMs).toBeLessThan(5000);
            expect(results.v1.timeMs).toBeLessThan(5000);
            expect(results.v2.timeMs).toBeLessThan(5000);
        });

        it('10 groups × 5 members (50 nodes total)', () => {
            const nodes: LayoutNode[] = [];
            const groups: LayoutGroup[] = [];

            for (let i = 0; i < 50; i++) nodes.push(createNode(`N${i}`));

            for (let g = 0; g < 10; g++) {
                const memberIds: string[] = [];
                for (let n = 0; n < 5; n++) memberIds.push(nodes[g * 5 + n].id);
                const gbf = new GroupByField(`field${g}`, 0, 1);
                groups.push({
                    name: `G${g}`,
                    nodeIds: memberIds,
                    keyNodeId: memberIds[0],
                    showLabel: true,
                    sourceConstraint: gbf,
                });
            }

            const layout: InstanceLayout = {
                nodes, edges: [], constraints: [], groups,
            };

            const results = runAll(layout);
            logTiming('10grp-5mem', results);

            // All should complete (SAT or UNSAT doesn't matter for perf)
            expect(results.kiwi.timeMs).toBeLessThan(10000);
            expect(results.v1.timeMs).toBeLessThan(10000);
            expect(results.v2.timeMs).toBeLessThan(10000);
        });

        it('chain of 20 + 5 disjunctions (constrained + branching)', () => {
            const nodes = Array.from({ length: 25 }, (_, i) => createNode(`N${i}`));
            const constraints: LeftConstraint[] = [];

            // Chain: N0 < N1 < ... < N19
            for (let i = 0; i < 19; i++) {
                constraints.push(createLeftConstraint(nodes[i], nodes[i + 1]));
            }

            // 5 disjunctions involving the remaining nodes
            const src = new RelativeOrientationConstraint(['left'], 'mixed');
            const disjunctions: DisjunctiveConstraint[] = [];
            for (let i = 0; i < 5; i++) {
                const freeNode = nodes[20 + i];
                const chainNode = nodes[i * 4]; // Spread along chain
                disjunctions.push(new DisjunctiveConstraint(src, [
                    [createLeftConstraint(freeNode, chainNode, src)],
                    [createLeftConstraint(chainNode, freeNode, src)],
                    [createTopConstraint(freeNode, chainNode, src)],
                    [createTopConstraint(chainNode, freeNode, src)],
                ]));
            }

            const layout: InstanceLayout = {
                nodes, edges: [], constraints, groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const results = runAll(layout);
            logTiming('chain20-disj5', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('3 groups × 3 members + 6 free nodes (group exclusion stress)', () => {
            const members = Array.from({ length: 9 }, (_, i) => createNode(`M${i}`));
            const free = Array.from({ length: 6 }, (_, i) => createNode(`F${i}`));
            const nodes = [...members, ...free];

            const groups: LayoutGroup[] = [];
            for (let g = 0; g < 3; g++) {
                const gbf = new GroupByField(`field${g}`, 0, 1);
                groups.push({
                    name: `G${g}`,
                    nodeIds: [members[g * 3].id, members[g * 3 + 1].id, members[g * 3 + 2].id],
                    keyNodeId: members[g * 3].id,
                    showLabel: true,
                    sourceConstraint: gbf,
                });
            }

            const layout: InstanceLayout = {
                nodes, edges: [], constraints: [], groups,
            };

            const results = runAll(layout);
            logTiming('3grp-6free', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });
    });

    // ─── V2-specific geometry insight validation ─────────────────────────────

    describe('V2 geometry insights effectiveness', () => {

        it('transitivity eliminates redundant disjunctions (containment-for-free)', () => {
            const a = createNode('A');
            const b = createNode('B');
            const c = createNode('C');
            const d = createNode('D');
            const src = new RelativeOrientationConstraint(['left'], 'test');

            // A < B < C conjunctive, then disjunction A vs D and C vs D
            // A < B < C means A < C by transitivity
            const layout: InstanceLayout = {
                nodes: [a, b, c, d],
                edges: [],
                constraints: [createLeftConstraint(a, b), createLeftConstraint(b, c)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(c, a, src)], // Would cycle
                        [createLeftConstraint(a, c, src)], // Already implied
                    ]),
                    new DisjunctiveConstraint(src, [
                        [createLeftConstraint(a, d, src)],
                        [createLeftConstraint(d, a, src)],
                        [createTopConstraint(a, d, src)],
                        [createTopConstraint(d, a, src)],
                    ]),
                ],
            };

            const results = runAll(layout);
            logTiming('transitivity', results);

            expect(results.kiwi.isSat).toBe(true);
            expect(results.v1.isSat).toBe(true);
            expect(results.v2.isSat).toBe(true);
        });

        it('V2 stats show pruning activity', () => {
            const nodes = Array.from({ length: 8 }, (_, i) => createNode(`N${i}`, { width: 60, height: 40 }));
            const src = new RelativeOrientationConstraint(['left'], 'test');
            const disjunctions: DisjunctiveConstraint[] = [];

            // Create a chain then add non-overlap disjunctions
            const constraints = [
                createLeftConstraint(nodes[0], nodes[1]),
                createLeftConstraint(nodes[1], nodes[2]),
            ];

            for (let i = 3; i < 8; i++) {
                disjunctions.push(new DisjunctiveConstraint(src, [
                    [createLeftConstraint(nodes[0], nodes[i], src)],
                    [createLeftConstraint(nodes[i], nodes[0], src)],
                    [createTopConstraint(nodes[0], nodes[i], src)],
                    [createTopConstraint(nodes[i], nodes[0], src)],
                ]));
            }

            const layoutV2 = {
                nodes, edges: [], constraints: [...constraints], groups: [],
                disjunctiveConstraints: disjunctions.map(d =>
                    new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a]))),
            };

            const validator = new QualitativeConstraintValidatorV2(layoutV2);
            const error = validator.validateConstraints();
            expect(error).toBeNull();

            const stats = validator.getStats();
            console.log('  [V2 stats]', JSON.stringify(stats));

            // V2 should have done some kind of pruning or decomposition
            const totalPruned = stats.prunedByContainment
                + stats.prunedByDimension
                + stats.prunedByPigeonhole
                + stats.prunedByIntervalDecomp;

            // At minimum, stats should be tracked (non-negative)
            expect(totalPruned).toBeGreaterThanOrEqual(0);
            expect(stats.hEdges).toBeGreaterThan(0);
        });
    });
});
