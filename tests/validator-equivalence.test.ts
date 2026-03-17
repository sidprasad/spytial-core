/**
 * Property-based equivalence tests between the Kiwi ConstraintValidator
 * and the QualitativeConstraintValidator.
 *
 * Uses fast-check to generate random constraint problems and verify that
 * both solvers agree on SAT/UNSAT. Disagreements are shrunk to minimal
 * counterexamples automatically.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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

function makeNode(id: string, width: number, height: number): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width, height, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

const SRC = new RelativeOrientationConstraint(['left'], 'pbt');

function leftOf(a: LayoutNode, b: LayoutNode): LeftConstraint {
    return { left: a, right: b, minDistance: 15, sourceConstraint: SRC };
}

function above(a: LayoutNode, b: LayoutNode): TopConstraint {
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

function runBoth(layout: InstanceLayout): { kiwiSat: boolean; qualSat: boolean } {
    const layoutK = cloneLayout(layout);
    const layoutQ = cloneLayout(layout);

    const kiwiErr = new ConstraintValidator(layoutK).validateConstraints();
    const qualErr = new QualitativeConstraintValidator(layoutQ).validateConstraints();

    return { kiwiSat: kiwiErr === null, qualSat: qualErr === null };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Generate a pool of N nodes with random dimensions.
 */
function arbNodes(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.tuple(
        ...Array.from({ length: n }, (_, i) =>
            fc.record({
                w: fc.integer({ min: 20, max: 200 }),
                h: fc.integer({ min: 20, max: 120 }),
            }).map(({ w, h }) => makeNode(`N${i}`, w, h))
        )
    );
}

/**
 * Given a node pool, generate a random pair index (i < j).
 */
function arbPair(n: number): fc.Arbitrary<[number, number]> {
    return fc.integer({ min: 0, max: n - 1 }).chain(i =>
        fc.integer({ min: 0, max: n - 2 }).map(j => {
            const jj = j >= i ? j + 1 : j;
            return [i, jj] as [number, number];
        })
    );
}

/**
 * Random conjunctive constraint between two nodes from the pool.
 * Types: leftOf, above, alignX, alignY.
 */
function arbConjunctive(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    const n = nodes.length;
    return fc.tuple(arbPair(n), fc.integer({ min: 0, max: 3 })).map(([[i, j], type]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j]);
            case 1: return above(nodes[i], nodes[j]);
            case 2: return alignX(nodes[i], nodes[j]);
            case 3: return alignY(nodes[i], nodes[j]);
            default: return leftOf(nodes[i], nodes[j]);
        }
    });
}

/**
 * Random ordering constraint (no alignment) between two nodes.
 */
function arbOrdering(nodes: LayoutNode[]): fc.Arbitrary<LayoutConstraint> {
    const n = nodes.length;
    return fc.tuple(arbPair(n), fc.integer({ min: 0, max: 3 })).map(([[i, j], type]) => {
        switch (type) {
            case 0: return leftOf(nodes[i], nodes[j]);
            case 1: return leftOf(nodes[j], nodes[i]);
            case 2: return above(nodes[i], nodes[j]);
            case 3: return above(nodes[j], nodes[i]);
            default: return leftOf(nodes[i], nodes[j]);
        }
    });
}

/**
 * Random disjunction: 2–4 ordering alternatives between a pair.
 */
function arbDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    const n = nodes.length;
    return fc.tuple(
        arbPair(n),
        fc.integer({ min: 2, max: 4 })
    ).map(([[i, j], numAlts]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j])],
            [leftOf(nodes[j], nodes[i])],
            [above(nodes[i], nodes[j])],
            [above(nodes[j], nodes[i])],
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

/**
 * Random disjunction that may include alignment alternatives (like cyclic constraints produce).
 */
function arbRichDisjunction(nodes: LayoutNode[]): fc.Arbitrary<DisjunctiveConstraint> {
    const n = nodes.length;
    return fc.tuple(
        arbPair(n),
        fc.integer({ min: 2, max: 5 })
    ).map(([[i, j], numAlts]) => {
        const allAlts: LayoutConstraint[][] = [
            [leftOf(nodes[i], nodes[j])],
            [leftOf(nodes[j], nodes[i])],
            [above(nodes[i], nodes[j])],
            [above(nodes[j], nodes[i])],
            [alignX(nodes[i], nodes[j]), above(nodes[i], nodes[j])], // same column
        ];
        return new DisjunctiveConstraint(SRC, allAlts.slice(0, numAlts));
    });
}

/**
 * Build a layout from generated parts.
 */
function buildLayout(
    nodes: LayoutNode[],
    constraints: LayoutConstraint[],
    disjunctions?: DisjunctiveConstraint[],
    groups?: LayoutGroup[],
): InstanceLayout {
    return {
        nodes, edges: [], constraints,
        groups: groups ?? [],
        disjunctiveConstraints: disjunctions,
    };
}

// ─── Formatting for failure messages ─────────────────────────────────────────

function describeConstraint(c: LayoutConstraint): string {
    if ('left' in c && 'right' in c) return `leftOf(${(c as LeftConstraint).left.id}, ${(c as LeftConstraint).right.id})`;
    if ('top' in c && 'bottom' in c) return `above(${(c as TopConstraint).top.id}, ${(c as TopConstraint).bottom.id})`;
    if ('axis' in c && 'node1' in c) return `align-${(c as AlignmentConstraint).axis}(${(c as AlignmentConstraint).node1.id}, ${(c as AlignmentConstraint).node2.id})`;
    return JSON.stringify(c);
}

function describeLayout(layout: InstanceLayout): string {
    const lines: string[] = [];
    lines.push(`Nodes: [${layout.nodes.map(n => `${n.id}(${n.width}×${n.height})`).join(', ')}]`);
    if (layout.constraints.length > 0) {
        lines.push(`Conjunctive: [${layout.constraints.map(describeConstraint).join(', ')}]`);
    }
    if (layout.disjunctiveConstraints?.length) {
        for (const d of layout.disjunctiveConstraints) {
            const alts = d.alternatives.map(a => `[${a.map(describeConstraint).join(', ')}]`).join(' | ');
            lines.push(`Disjunction: ${alts}`);
        }
    }
    if (layout.groups.length > 0) {
        lines.push(`Groups: [${layout.groups.map(g => `${g.name}{${g.nodeIds.join(',')}}`).join(', ')}]`);
    }
    return lines.join('\n  ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Properties
// ═══════════════════════════════════════════════════════════════════════════════

describe('Validator Equivalence (Property-Based)', () => {

    const NUM_RUNS = 200;
    const TIMEOUT = 60_000;

    // ─── Pure ordering (no alignment, no groups) ────────────────────────────

    describe('Conjunctive orderings only', () => {

        it('random orderings on 4 nodes', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 6 })
                    )
                ),
                ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random orderings on 6 nodes (denser)', () => {
            fc.assert(fc.property(
                arbNodes(6).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 2, maxLength: 10 })
                    )
                ),
                ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Mixed orderings + alignments ───────────────────────────────────────

    describe('Conjunctive orderings + alignments', () => {

        it('random mixed constraints on 4 nodes', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbConjunctive(nodes), { minLength: 1, maxLength: 5 })
                    )
                ),
                ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random mixed constraints on 5 nodes (more alignment pressure)', () => {
            fc.assert(fc.property(
                arbNodes(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbConjunctive(nodes), { minLength: 2, maxLength: 8 })
                    )
                ),
                ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Disjunctive (ordering-only alternatives) ───────────────────────────

    describe('Ordering disjunctions', () => {

        it('random ordering disjunctions on 4 nodes', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                        fc.array(arbDisjunction(nodes), { minLength: 1, maxLength: 3 })
                    )
                ),
                ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('pairwise non-overlap on 4 nodes (6 four-way disjunctions)', () => {
            fc.assert(fc.property(
                arbNodes(4),
                (nodes) => {
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [above(nodes[i], nodes[j])],
                                [above(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, [], disjs);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 50, timeout: TIMEOUT });
        });
    });

    // ─── Disjunctions with alignment alternatives (cyclic-like) ─────────────

    describe('Rich disjunctions (with alignment alternatives)', () => {

        it('alignment-containing disjunctions on 4 nodes', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 2 }),
                        fc.array(arbRichDisjunction(nodes), { minLength: 1, maxLength: 3 })
                    )
                ),
                ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Groups ─────────────────────────────────────────────────────────────

    describe('Group constraints', () => {

        it('random groups on 6 nodes', () => {
            // Generate 1–2 non-overlapping groups from 6 nodes
            const arbGroupLayout = arbNodes(6).chain(nodes => {
                // Group 1: first 2-3 nodes, Group 2: next 2-3 nodes
                return fc.tuple(
                    fc.constant(nodes),
                    fc.integer({ min: 2, max: 3 }),
                    fc.boolean(), // whether to include second group
                    fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                ).map(([nodes, g1Size, hasG2, constraints]) => {
                    const gbf = new GroupByField('type', 0, 1, 'type');
                    const groups: LayoutGroup[] = [];

                    const g1Ids = nodes.slice(0, g1Size).map(n => n.id);
                    groups.push({
                        name: 'G0', nodeIds: g1Ids,
                        keyNodeId: g1Ids[0], showLabel: true, sourceConstraint: gbf,
                    });

                    if (hasG2) {
                        const g2Ids = nodes.slice(g1Size, g1Size + 2).map(n => n.id);
                        groups.push({
                            name: 'G1', nodeIds: g2Ids,
                            keyNodeId: g2Ids[0], showLabel: true, sourceConstraint: gbf,
                        });
                    }

                    return buildLayout(nodes, constraints, undefined, groups);
                });
            });

            fc.assert(fc.property(arbGroupLayout, (layout) => {
                const { kiwiSat, qualSat } = runBoth(layout);
                if (kiwiSat !== qualSat) {
                    throw new Error(
                        `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                    );
                }
            }), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('groups + ordering disjunctions on 6 nodes', () => {
            const arbLayout = arbNodes(6).chain(nodes => {
                const gbf = new GroupByField('type', 0, 1, 'type');
                const group: LayoutGroup = {
                    name: 'G0', nodeIds: [nodes[0].id, nodes[1].id, nodes[2].id],
                    keyNodeId: nodes[0].id, showLabel: true, sourceConstraint: gbf,
                };

                return fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                    fc.array(arbDisjunction(nodes), { minLength: 0, maxLength: 2 }),
                ).map(([nodes, constraints, disjs]) =>
                    buildLayout(nodes, constraints, disjs.length > 0 ? disjs : undefined, [group])
                );
            });

            fc.assert(fc.property(arbLayout, (layout) => {
                const { kiwiSat, qualSat } = runBoth(layout);
                if (kiwiSat !== qualSat) {
                    throw new Error(
                        `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                    );
                }
            }), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Cyclic-like patterns ───────────────────────────────────────────────

    describe('Cyclic rotation patterns', () => {

        it('3-node cyclic rotations (like CyclicOrientationConstraint produces)', () => {
            // For 3 nodes, generate the 3 rotations of a clockwise ordering.
            // Each rotation specifies pairwise left/above/align constraints
            // based on angular positions on a circle — same as layoutinstance.ts does.
            fc.assert(fc.property(
                arbNodes(3),
                (nodes) => {
                    const [a, b, c] = nodes;
                    // 3 rotations of a triangle at angles 0°, 120°, 240°
                    const rotations: LayoutConstraint[][] = [];
                    const perms = [[a, b, c], [b, c, a], [c, a, b]];

                    for (const [n0, n1, n2] of perms) {
                        // n0 at 0° (right), n1 at 120° (upper-left), n2 at 240° (lower-left)
                        // n1 is left of n0, n2 is left of n0, n1 is above n2
                        rotations.push([
                            leftOf(n1, n0),
                            leftOf(n2, n0),
                            above(n1, n2),
                        ]);
                    }

                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, [], [disj]);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 100, timeout: TIMEOUT });
        });

        it('4-node cyclic rotations with alignment alternatives', () => {
            // 4 nodes placed at 0°, 90°, 180°, 270° on a circle.
            // At 90° intervals, some pairs share the same x or y coordinate,
            // producing alignment constraints in the alternatives.
            fc.assert(fc.property(
                arbNodes(4),
                (nodes) => {
                    const [a, b, c, d] = nodes;
                    // 4 rotations. Each places nodes at cardinal directions.
                    // Rotation 0: a=right(0°), b=top(90°), c=left(180°), d=bottom(270°)
                    //   a right of c, b above d, a and c y-aligned, b and d x-aligned
                    const rotations: LayoutConstraint[][] = [
                        [leftOf(c, a), above(b, d), alignY(a, c), alignX(b, d)],
                        [leftOf(d, b), above(c, a), alignY(b, d), alignX(c, a)],
                        [leftOf(a, c), above(d, b), alignY(c, a), alignX(d, b)],
                        [leftOf(b, d), above(a, c), alignY(d, b), alignX(a, c)],
                    ];

                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, [], [disj]);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 100, timeout: TIMEOUT });
        });

        it('cyclic rotation + conjunctive ordering (forces specific rotation)', () => {
            fc.assert(fc.property(
                arbNodes(3).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.integer({ min: 0, max: 3 }), // which conjunctive constraint to add
                    )
                ),
                ([nodes, conjType]) => {
                    const [a, b, c] = nodes;

                    // 3 rotations of clockwise triangle
                    const rotations: LayoutConstraint[][] = [
                        [leftOf(b, a), leftOf(c, a), above(b, c)],
                        [leftOf(c, b), leftOf(a, b), above(c, a)],
                        [leftOf(a, c), leftOf(b, c), above(a, b)],
                    ];

                    // Add a conjunctive constraint that restricts which rotations are valid
                    const conjunctive: LayoutConstraint[] = [];
                    switch (conjType) {
                        case 0: conjunctive.push(leftOf(a, b)); break;  // a is right of b? Limits rotations
                        case 1: conjunctive.push(above(a, b)); break;
                        case 2: conjunctive.push(leftOf(b, c)); break;
                        case 3: conjunctive.push(above(c, a)); break;
                    }

                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, conjunctive, [disj]);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 100, timeout: TIMEOUT });
        });
    });

    // ─── Tournament (total order) ───────────────────────────────────────────

    describe('Tournament (complete pairwise ordering)', () => {

        it('every pair must be ordered on one axis', () => {
            fc.assert(fc.property(
                arbNodes(4),
                (nodes) => {
                    // For every pair, one of: i<j, j<i, i above j, j above i
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [above(nodes[i], nodes[j])],
                                [above(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, [], disjs);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    // A total order always exists
                    expect(kiwiSat).toBe(true);
                    expect(qualSat).toBe(true);
                }
            ), { numRuns: 50, timeout: TIMEOUT });
        });

        it('tournament + extra conjunctive constraints', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 1, maxLength: 4 }),
                    )
                ),
                ([nodes, extra]) => {
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [above(nodes[i], nodes[j])],
                                [above(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, extra, disjs);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Stress: larger random instances ─────────────────────────────────────

    describe('Larger random instances', () => {

        it('8 nodes, random orderings + disjunctions', () => {
            fc.assert(fc.property(
                arbNodes(8).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 6 }),
                        fc.array(arbDisjunction(nodes), { minLength: 0, maxLength: 4 }),
                    )
                ),
                ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs.length > 0 ? disjs : undefined);
                    const { kiwiSat, qualSat } = runBoth(layout);
                    if (kiwiSat !== qualSat) {
                        throw new Error(
                            `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                        );
                    }
                }
            ), { numRuns: 100, timeout: TIMEOUT });
        });

        it('6 nodes + group + disjunctions (full feature combo)', () => {
            const arbFullLayout = arbNodes(6).chain(nodes => {
                const gbf = new GroupByField('type', 0, 1, 'type');
                return fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbConjunctive(nodes), { minLength: 0, maxLength: 4 }),
                    fc.array(arbDisjunction(nodes), { minLength: 0, maxLength: 3 }),
                    fc.integer({ min: 2, max: 3 }), // group size
                ).map(([nodes, conj, disjs, gSize]) => {
                    const group: LayoutGroup = {
                        name: 'G0', nodeIds: nodes.slice(0, gSize).map(n => n.id),
                        keyNodeId: nodes[0].id, showLabel: true, sourceConstraint: gbf,
                    };
                    return buildLayout(nodes, conj, disjs.length > 0 ? disjs : undefined, [group]);
                });
            });

            fc.assert(fc.property(arbFullLayout, (layout) => {
                const { kiwiSat, qualSat } = runBoth(layout);
                if (kiwiSat !== qualSat) {
                    throw new Error(
                        `Disagreement! Kiwi=${kiwiSat ? 'SAT' : 'UNSAT'}, Qual=${qualSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
                    );
                }
            }), { numRuns: 100, timeout: TIMEOUT });
        });
    });

});
