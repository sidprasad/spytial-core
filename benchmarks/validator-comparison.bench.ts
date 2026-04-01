/**
 * Performance benchmark: Kiwi ConstraintValidator vs QualitativeConstraintValidator
 *
 * Run with:  npm run bench
 *
 * NOT included in CI — this is for local profiling only.
 * Measures wall-clock time, backtracks/conflicts, and solver stats
 * across a range of problem sizes and shapes.
 */

import { describe, it } from 'vitest';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    LayoutConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, w = 100, h = 60): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width: w, height: h, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

const SRC = new RelativeOrientationConstraint(['left'], 'bench');

function leftOf(a: LayoutNode, b: LayoutNode): LeftConstraint {
    return { left: a, right: b, minDistance: 15, sourceConstraint: SRC };
}
function aboveOf(a: LayoutNode, b: LayoutNode): TopConstraint {
    return { top: a, bottom: b, minDistance: 15, sourceConstraint: SRC };
}
function alignX(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'x', node1: a, node2: b, sourceConstraint: SRC };
}
function alignY(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'y', node1: a, node2: b, sourceConstraint: SRC };
}

function cloneLayout(layout: InstanceLayout): InstanceLayout {
    return {
        nodes: layout.nodes,
        edges: layout.edges,
        constraints: [...layout.constraints],
        groups: layout.groups,
        disjunctiveConstraints: layout.disjunctiveConstraints
            ? layout.disjunctiveConstraints.map(d =>
                new DisjunctiveConstraint(d.sourceConstraint, d.alternatives.map(a => [...a])))
            : undefined,
    };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

interface BenchResult {
    name: string;
    sat: boolean;
    timeMs: number;
    stats?: ReturnType<QualitativeConstraintValidator['getStats']>;
}

function runKiwi(layout: InstanceLayout, warmup = 1, trials = 5): BenchResult {
    // Warmup
    for (let i = 0; i < warmup; i++) {
        const l = cloneLayout(layout);
        new ConstraintValidator(l).validateConstraints();
    }

    const times: number[] = [];
    let sat = false;
    for (let i = 0; i < trials; i++) {
        const l = cloneLayout(layout);
        const t0 = performance.now();
        const err = new ConstraintValidator(l).validateConstraints();
        times.push(performance.now() - t0);
        sat = err === null;
    }
    const median = times.sort((a, b) => a - b)[Math.floor(trials / 2)];
    return { name: 'Kiwi', sat, timeMs: median };
}

function runQualitative(layout: InstanceLayout, warmup = 1, trials = 5): BenchResult {
    // Warmup
    for (let i = 0; i < warmup; i++) {
        const l = cloneLayout(layout);
        new QualitativeConstraintValidator(l).validateConstraints();
    }

    const times: number[] = [];
    let sat = false;
    let stats: ReturnType<QualitativeConstraintValidator['getStats']> | undefined;
    for (let i = 0; i < trials; i++) {
        const l = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(l);
        const t0 = performance.now();
        const err = v.validateConstraints();
        times.push(performance.now() - t0);
        sat = err === null;
        stats = v.getStats();
    }
    const median = times.sort((a, b) => a - b)[Math.floor(trials / 2)];
    return { name: 'Qualitative', sat, timeMs: median, stats };
}

function bench(label: string, layout: InstanceLayout, warmup = 2, trials = 7) {
    const kiwi = runKiwi(layout, warmup, trials);
    const qual = runQualitative(layout, warmup, trials);

    const speedup = kiwi.timeMs / Math.max(qual.timeMs, 0.01);
    const agree = kiwi.sat === qual.sat;

    console.log(`\n  ┌─ ${label}`);
    console.log(`  │  Kiwi:        ${kiwi.timeMs.toFixed(2)}ms  (${kiwi.sat ? 'SAT' : 'UNSAT'})`);
    console.log(`  │  Qualitative: ${qual.timeMs.toFixed(2)}ms  (${qual.sat ? 'SAT' : 'UNSAT'})`);
    console.log(`  │  Speedup:     ${speedup.toFixed(1)}×  ${agree ? '✓ agree' : '✗ DISAGREE'}`);
    if (qual.stats) {
        const s = qual.stats;
        console.log(`  │  Stats: ${s.hEdges}H + ${s.vEdges}V edges, ${s.conflicts} conflicts, ${s.learnedClauses} learned clauses`);
        console.log(`  │  Pruned: ${s.prunedByTransitivity} transitivity, ${s.prunedByDecomposition} decomposition`);
    }
    console.log(`  └─`);

    return { kiwi, qual, speedup, agree };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Benchmarks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validator Comparison Benchmarks', () => {

    // ─── Scaling: pure chains ───────────────────────────────────────────────

    describe('Conjunctive chains (no search)', () => {
        for (const n of [10, 25, 50, 100]) {
            it(`chain of ${n} nodes`, () => {
                const nodes = Array.from({ length: n }, (_, i) => makeNode(`N${i}`));
                const constraints = nodes.slice(0, -1).map((nd, i) => leftOf(nd, nodes[i + 1]));
                const layout: InstanceLayout = { nodes, edges: [], constraints, groups: [] };
                const r = bench(`chain-${n}`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Scaling: pairwise non-overlap ──────────────────────────────────────

    describe('Pairwise non-overlap (N*(N-1)/2 four-way disjunctions)', () => {
        for (const n of [4, 6, 8, 10, 12]) {
            it(`${n} nodes → ${n*(n-1)/2} disjunctions`, () => {
                const nodes = Array.from({ length: n }, (_, i) => makeNode(`N${i}`, 60, 40));
                const disjs: DisjunctiveConstraint[] = [];
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        disjs.push(new DisjunctiveConstraint(SRC, [
                            [leftOf(nodes[i], nodes[j])],
                            [leftOf(nodes[j], nodes[i])],
                            [aboveOf(nodes[i], nodes[j])],
                            [aboveOf(nodes[j], nodes[i])],
                        ]));
                    }
                }
                const layout: InstanceLayout = {
                    nodes, edges: [], constraints: [], groups: [],
                    disjunctiveConstraints: disjs,
                };
                const r = bench(`pairwise-${n}`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Scaling: groups ────────────────────────────────────────────────────

    describe('Groups (bounding box disjunctions)', () => {
        for (const [nGroups, membersPerGroup] of [[2, 3], [3, 3], [5, 4], [8, 5], [10, 5]]) {
            const totalNodes = nGroups * membersPerGroup;
            it(`${nGroups} groups × ${membersPerGroup} members (${totalNodes} nodes)`, () => {
                const nodes = Array.from({ length: totalNodes }, (_, i) => makeNode(`N${i}`));
                const groups: LayoutGroup[] = [];
                for (let g = 0; g < nGroups; g++) {
                    const gbf = new GroupByField(`f${g}`, 0, 1);
                    const ids = nodes.slice(g * membersPerGroup, (g + 1) * membersPerGroup).map(nd => nd.id);
                    groups.push({
                        name: `G${g}`, nodeIds: ids,
                        keyNodeId: ids[0], showLabel: true, sourceConstraint: gbf,
                    });
                }
                const layout: InstanceLayout = { nodes, edges: [], constraints: [], groups };
                const r = bench(`groups-${nGroups}×${membersPerGroup}`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Scaling: disjunctions ──────────────────────────────────────────────

    describe('Independent binary disjunctions (search space = 2^N)', () => {
        for (const nDisj of [4, 8, 12, 16]) {
            it(`${nDisj} binary disjunctions (space = 2^${nDisj} = ${2**nDisj})`, () => {
                const nodes = Array.from({ length: nDisj * 2 }, (_, i) => makeNode(`N${i}`));
                const disjs = Array.from({ length: nDisj }, (_, i) =>
                    new DisjunctiveConstraint(SRC, [
                        [leftOf(nodes[i * 2], nodes[i * 2 + 1])],
                        [leftOf(nodes[i * 2 + 1], nodes[i * 2])],
                    ])
                );
                const layout: InstanceLayout = {
                    nodes, edges: [], constraints: [], groups: [],
                    disjunctiveConstraints: disjs,
                };
                const r = bench(`binary-disj-${nDisj}`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Forced backtracking ────────────────────────────────────────────────

    describe('Forced backtracking (chain + dependent disjunctions)', () => {
        for (const chainLen of [5, 10, 20]) {
            it(`chain of ${chainLen} + 5 interleaved disjunctions`, () => {
                const nodes = Array.from({ length: chainLen + 10 }, (_, i) => makeNode(`N${i}`));
                const constraints = nodes.slice(0, chainLen - 1).map((nd, i) => leftOf(nd, nodes[i + 1]));

                const disjs: DisjunctiveConstraint[] = [];
                for (let i = 0; i < 5; i++) {
                    const free = nodes[chainLen + i * 2];
                    const free2 = nodes[chainLen + i * 2 + 1];
                    const chainNode = nodes[Math.min(i * Math.floor(chainLen / 5), chainLen - 1)];
                    disjs.push(new DisjunctiveConstraint(SRC, [
                        [leftOf(free, chainNode), leftOf(chainNode, free2)],
                        [leftOf(chainNode, free), leftOf(free2, chainNode)],
                        [aboveOf(free, chainNode), aboveOf(free2, chainNode)],
                    ]));
                }

                const layout: InstanceLayout = {
                    nodes, edges: [], constraints, groups: [],
                    disjunctiveConstraints: disjs,
                };
                const r = bench(`chain${chainLen}-5disj`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Alignment-heavy (cyclic-like) ──────────────────────────────────────

    describe('Cyclic-like rotations with alignment', () => {
        for (const n of [3, 4, 5]) {
            it(`${n}-node cyclic rotation disjunction`, () => {
                const nodes = Array.from({ length: n }, (_, i) => makeNode(`N${i}`));
                const radius = 100;
                const alternatives: LayoutConstraint[][] = [];

                for (let rot = 0; rot < n; rot++) {
                    const alt: LayoutConstraint[] = [];
                    const angleStep = (2 * Math.PI) / n;
                    const positions = nodes.map((_, i) => {
                        const theta = (i + rot) * angleStep;
                        return { x: radius * Math.cos(theta), y: radius * Math.sin(theta) };
                    });

                    for (let i = 0; i < n; i++) {
                        for (let j = i + 1; j < n; j++) {
                            const dx = positions[i].x - positions[j].x;
                            const dy = positions[i].y - positions[j].y;
                            if (Math.abs(dx) > 1) {
                                alt.push(dx < 0 ? leftOf(nodes[i], nodes[j]) : leftOf(nodes[j], nodes[i]));
                            } else {
                                alt.push(alignX(nodes[i], nodes[j]));
                            }
                            if (Math.abs(dy) > 1) {
                                alt.push(dy < 0 ? aboveOf(nodes[j], nodes[i]) : aboveOf(nodes[i], nodes[j]));
                            } else {
                                alt.push(alignY(nodes[i], nodes[j]));
                            }
                        }
                    }
                    alternatives.push(alt);
                }

                const disj = new DisjunctiveConstraint(SRC, alternatives);
                const layout: InstanceLayout = {
                    nodes, edges: [], constraints: [], groups: [],
                    disjunctiveConstraints: [disj],
                };
                const r = bench(`cyclic-${n}`, layout);
                expect(r.agree).toBe(true);
            });
        }
    });

    // ─── Groups + ordering + disjunctions (realistic) ───────────────────────

    describe('Realistic: groups + orderings + disjunctions', () => {
        it('3 groups × 4 members + 4 free nodes + orderings', () => {
            const nodes = Array.from({ length: 16 }, (_, i) => makeNode(`N${i}`));
            const groups: LayoutGroup[] = [];
            for (let g = 0; g < 3; g++) {
                const gbf = new GroupByField(`f${g}`, 0, 1);
                const ids = nodes.slice(g * 4, (g + 1) * 4).map(nd => nd.id);
                groups.push({
                    name: `G${g}`, nodeIds: ids,
                    keyNodeId: ids[0], showLabel: true, sourceConstraint: gbf,
                });
            }
            // Orderings between free nodes and some group members
            const constraints = [
                leftOf(nodes[12], nodes[0]),
                leftOf(nodes[13], nodes[4]),
                aboveOf(nodes[14], nodes[8]),
                leftOf(nodes[12], nodes[13]),
            ];
            // A couple disjunctions between free nodes
            const disjs = [
                new DisjunctiveConstraint(SRC, [
                    [leftOf(nodes[14], nodes[15])],
                    [leftOf(nodes[15], nodes[14])],
                    [aboveOf(nodes[14], nodes[15])],
                    [aboveOf(nodes[15], nodes[14])],
                ]),
            ];
            const layout: InstanceLayout = {
                nodes, edges: [], constraints, groups,
                disjunctiveConstraints: disjs,
            };
            const r = bench('realistic-3g4m-4free', layout);
            expect(r.agree).toBe(true);
        });

        it('5 groups × 3 members + 5 free + orderings + 3 disjunctions', () => {
            const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`N${i}`));
            const groups: LayoutGroup[] = [];
            for (let g = 0; g < 5; g++) {
                const gbf = new GroupByField(`f${g}`, 0, 1);
                const ids = nodes.slice(g * 3, (g + 1) * 3).map(nd => nd.id);
                groups.push({
                    name: `G${g}`, nodeIds: ids,
                    keyNodeId: ids[0], showLabel: true, sourceConstraint: gbf,
                });
            }
            const constraints = [
                leftOf(nodes[15], nodes[0]),
                aboveOf(nodes[16], nodes[3]),
                leftOf(nodes[17], nodes[6]),
            ];
            const disjs: DisjunctiveConstraint[] = [];
            for (let i = 0; i < 3; i++) {
                const f1 = nodes[15 + i];
                const f2 = nodes[15 + ((i + 1) % 5)];
                disjs.push(new DisjunctiveConstraint(SRC, [
                    [leftOf(f1, f2)],
                    [leftOf(f2, f1)],
                    [aboveOf(f1, f2)],
                    [aboveOf(f2, f1)],
                ]));
            }
            const layout: InstanceLayout = {
                nodes, edges: [], constraints, groups,
                disjunctiveConstraints: disjs,
            };
            const r = bench('realistic-5g3m-5free', layout);
            expect(r.agree).toBe(true);
        });
    });

    // ─── UNSAT instances ────────────────────────────────────────────────────

    describe('UNSAT detection speed', () => {
        it('3-cycle (trivial UNSAT)', () => {
            const [a, b, c] = [makeNode('A'), makeNode('B'), makeNode('C')];
            const layout: InstanceLayout = {
                nodes: [a, b, c], edges: [],
                constraints: [leftOf(a, b), leftOf(b, c), leftOf(c, a)],
                groups: [],
            };
            const r = bench('unsat-3cycle', layout);
            expect(r.agree).toBe(true);
            expect(r.kiwi.sat).toBe(false);
        });

        it('all-infeasible disjunction (must prove UNSAT through search)', () => {
            const [a, b, c] = [makeNode('A'), makeNode('B'), makeNode('C')];
            const layout: InstanceLayout = {
                nodes: [a, b, c], edges: [],
                constraints: [leftOf(a, b), leftOf(b, c)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(SRC, [
                        [leftOf(c, a)], // cycle
                        [leftOf(b, a)], // cycle
                        [leftOf(c, b)], // cycle
                    ]),
                ],
            };
            const r = bench('unsat-all-infeasible', layout);
            expect(r.agree).toBe(true);
            expect(r.kiwi.sat).toBe(false);
        });

        it('alignment + ordering contradiction (subtle UNSAT)', () => {
            const [a, b, c] = [makeNode('A'), makeNode('B'), makeNode('C')];
            const layout: InstanceLayout = {
                nodes: [a, b, c], edges: [],
                constraints: [alignX(a, c), leftOf(a, b), leftOf(b, c)],
                groups: [],
            };
            const r = bench('unsat-align-transitive', layout);
            expect(r.agree).toBe(true);
            expect(r.kiwi.sat).toBe(false);
        });
    });

    // ─── Summary ────────────────────────────────────────────────────────────

    it('--- SUMMARY ---', () => {
        // This test just prints a separator; the real output is in the console logs above.
        console.log('\n  ═══ Benchmark complete ═══\n');
    });
});
