/**
 * Property-based equivalence tests between the QualitativeConstraintValidator
 * and a Z3 correctness oracle.
 *
 * Uses fast-check to generate random constraint problems and verify that
 * both the custom solver and Z3 agree on SAT/UNSAT.
 *
 * Z3 runs as a WASM module — no system binary required.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000 });
import * as fc from 'fast-check';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { isPositionalConstraintError } from '../src/layout/constraint-types';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';
import {
    isZ3Available,
    shutdownZ3,
    solveZ3,
    verifyFeasibleSubset,
} from './helpers/z3-oracle';
import {
    cloneLayout,
    describeLayout,
    leftOf,
    aboveOf,
    alignOnX,
    alignOnY,
    parseConstraintSpec,
    SRC,
} from './helpers/constraint-dsl';
import {
    arbNodePool,
    arbOrdering,
    arbConjunctive,
    arbDisjunction,
    arbRichDisjunction,
    arbFullSystem,
} from './helpers/constraint-arbitraries';
import type { LayoutGroup } from '../src/layout/interfaces';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkAgainstOracle(layout: InstanceLayout): Promise<{
    validatorSat: boolean;
    oracleSat: boolean;
}> {
    const layoutV = cloneLayout(layout);
    const validator = new QualitativeConstraintValidator(layoutV);
    const error = validator.validateConstraints();
    const validatorSat = error === null;
    const oracleSat = await solveZ3(layout);
    return { validatorSat, oracleSat };
}

function assertAgreement(
    layout: InstanceLayout,
    validatorSat: boolean,
    oracleSat: boolean,
): void {
    if (validatorSat !== oracleSat) {
        throw new Error(
            `Disagreement! Validator=${validatorSat ? 'SAT' : 'UNSAT'}, ` +
            `Z3=${oracleSat ? 'SAT' : 'UNSAT'}\n  ${describeLayout(layout)}`
        );
    }
}

// ─── Test suite ──────────────────────────────────────────────────────────────

const available = await isZ3Available();

afterAll(() => {
    if (available) shutdownZ3();
});

describe.runIf(available)('Z3 Oracle Equivalence (Property-Based)', () => {

    const NUM_RUNS = 50;
    const TIMEOUT = 120_000;

    // ─── Pure ordering (no alignment, no groups) ────────────────────────

    describe('Conjunctive orderings only', () => {

        it('random orderings on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 6 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random orderings on 6 nodes (denser)', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(6).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 2, maxLength: 10 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Mixed orderings + alignments ───────────────────────────────────

    describe('Conjunctive orderings + alignments', () => {

        it('random mixed constraints on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbConjunctive(nodes), { minLength: 1, maxLength: 5 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random mixed constraints on 5 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbConjunctive(nodes), { minLength: 2, maxLength: 8 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Disjunctive (ordering-only alternatives) ───────────────────────

    describe('Ordering disjunctions', () => {

        it('random ordering disjunctions on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                        fc.array(arbDisjunction(nodes), { minLength: 1, maxLength: 3 })
                    )
                ),
                async ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('pairwise non-overlap on 4 nodes (6 four-way disjunctions)', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4),
                async (nodes) => {
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [aboveOf(nodes[i], nodes[j])],
                                [aboveOf(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, [], disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 30, timeout: TIMEOUT });
        });
    });

    // ─── Rich disjunctions (with alignment alternatives) ────────────────

    describe('Rich disjunctions (with alignment alternatives)', () => {

        it('alignment-containing disjunctions on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 2 }),
                        fc.array(arbRichDisjunction(nodes), { minLength: 1, maxLength: 3 })
                    )
                ),
                async ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Groups ─────────────────────────────────────────────────────────

    describe('Group constraints', () => {

        it('random groups on 6 nodes', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            const arbGroupLayout = arbNodePool(6).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.integer({ min: 2, max: 3 }),
                    fc.boolean(),
                    fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                ).map(([nodes, g1Size, hasG2, constraints]) => {
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
                })
            );

            await fc.assert(fc.asyncProperty(arbGroupLayout, async (layout) => {
                const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                assertAgreement(layout, validatorSat, oracleSat);
            }), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        // ── Group containment invariants (deterministic, cross-checked with Z3) ──
        // Being ordered relative to ONE member must NOT imply being ordered
        // relative to the entire group.

        it('x left of one member does not force x left of group (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('x right of one member does not force x right of group (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('x left of two members (not all) does not force x left of group (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, x <x a2, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('x left of ALL members is outside group — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, x <x a2, x <x a3, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('x between members horizontally can escape vertically — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, x <x a2, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('x trapped inside group on both axes — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, x <x a2, a1 <y x, x <y a2, {A: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('x trapped inside 4-member group on both axes — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, x <x a2, a3 <y x, x <y a4, {A: a1, a2, a3, a4}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        // ── Negated group cross-checks (bbox encoding, M > 5) ──────────

        it('negated 6-member group with free non-member — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, {!G: a1, a2, a3, a4, a5, a6}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('non-member between 6-member group members — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, x <x a2, a3 <y x, x <y a4, {!G: a1, a2, a3, a4, a5, a6}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('sole non-member forced outside 6-member group — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, x <x a2, x <x a3, x <x a4, x <x a5, x <x a6, {!G: a1, a2, a3, a4, a5, a6}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('one non-member forced out, another free — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, x <x a2, x <x a3, x <x a4, x <x a5, x <x a6, a1 <x y, {!G: a1, a2, a3, a4, a5, a6}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        // NOTE: M=8 negated group Z3 cross-checks omitted — Z3 WASM OOMs on CI
        // constructing the M⁴ formula (3136 alternatives + 36 pairwise non-overlap).
        // Correctness at M=8 is covered by deterministic unit tests in constraint-dsl.test.ts.

        it('groups + ordering disjunctions on 6 nodes', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            const arbLayout = arbNodePool(6).chain(nodes => {
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

            await fc.assert(fc.asyncProperty(arbLayout, async (layout) => {
                const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                assertAgreement(layout, validatorSat, oracleSat);
            }), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Cyclic rotation patterns ───────────────────────────────────────

    describe('Cyclic rotation patterns', () => {

        it('3-node cyclic rotations', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(3),
                async (nodes) => {
                    const [a, b, c] = nodes;
                    const rotations: LayoutConstraint[][] = [];
                    const perms = [[a, b, c], [b, c, a], [c, a, b]];
                    for (const [n0, n1, n2] of perms) {
                        rotations.push([
                            leftOf(n1, n0),
                            leftOf(n2, n0),
                            aboveOf(n1, n2),
                        ]);
                    }
                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, [], [disj]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 50, timeout: TIMEOUT });
        });

        it('4-node cyclic rotations with alignment alternatives', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4),
                async (nodes) => {
                    const [a, b, c, d] = nodes;
                    const rotations: LayoutConstraint[][] = [
                        [leftOf(c, a), aboveOf(b, d), alignOnY(a, c), alignOnX(b, d)],
                        [leftOf(d, b), aboveOf(c, a), alignOnY(b, d), alignOnX(c, a)],
                        [leftOf(a, c), aboveOf(d, b), alignOnY(c, a), alignOnX(d, b)],
                        [leftOf(b, d), aboveOf(a, c), alignOnY(d, b), alignOnX(a, c)],
                    ];
                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, [], [disj]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 50, timeout: TIMEOUT });
        });

        it('cyclic rotation + conjunctive ordering', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(3).chain(nodes =>
                    fc.tuple(fc.constant(nodes), fc.integer({ min: 0, max: 3 }))
                ),
                async ([nodes, conjType]) => {
                    const [a, b, c] = nodes;
                    const rotations: LayoutConstraint[][] = [
                        [leftOf(b, a), leftOf(c, a), aboveOf(b, c)],
                        [leftOf(c, b), leftOf(a, b), aboveOf(c, a)],
                        [leftOf(a, c), leftOf(b, c), aboveOf(a, b)],
                    ];
                    const conjunctive: LayoutConstraint[] = [];
                    switch (conjType) {
                        case 0: conjunctive.push(leftOf(a, b)); break;
                        case 1: conjunctive.push(aboveOf(a, b)); break;
                        case 2: conjunctive.push(leftOf(b, c)); break;
                        case 3: conjunctive.push(aboveOf(c, a)); break;
                    }
                    const disj = new DisjunctiveConstraint(SRC, rotations);
                    const layout = buildLayout(nodes, conjunctive, [disj]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 50, timeout: TIMEOUT });
        });
    });

    // ─── Tournament (total order) ───────────────────────────────────────

    describe('Tournament (complete pairwise ordering)', () => {

        it('every pair must be ordered on one axis', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4),
                async (nodes) => {
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [aboveOf(nodes[i], nodes[j])],
                                [aboveOf(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, [], disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    // Both should say SAT (total order always exists)
                    expect(validatorSat).toBe(true);
                    expect(oracleSat).toBe(true);
                }
            ), { numRuns: 30, timeout: TIMEOUT });
        });

        it('tournament + extra conjunctive constraints', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 1, maxLength: 4 }),
                    )
                ),
                async ([nodes, extra]) => {
                    const disjs: DisjunctiveConstraint[] = [];
                    for (let i = 0; i < 4; i++) {
                        for (let j = i + 1; j < 4; j++) {
                            disjs.push(new DisjunctiveConstraint(SRC, [
                                [leftOf(nodes[i], nodes[j])],
                                [leftOf(nodes[j], nodes[i])],
                                [aboveOf(nodes[i], nodes[j])],
                                [aboveOf(nodes[j], nodes[i])],
                            ]));
                        }
                    }
                    const layout = buildLayout(nodes, extra, disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Larger random instances ────────────────────────────────────────

    describe('Larger random instances', () => {

        it('8 nodes, random orderings + disjunctions', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(8).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 6 }),
                        fc.array(arbDisjunction(nodes), { minLength: 0, maxLength: 4 }),
                    )
                ),
                async ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs.length > 0 ? disjs : undefined);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 30, timeout: TIMEOUT });
        });

        it('6 nodes + group + disjunctions (full feature combo)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            const arbFullLayout = arbNodePool(6).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbConjunctive(nodes), { minLength: 0, maxLength: 4 }),
                    fc.array(arbDisjunction(nodes), { minLength: 0, maxLength: 3 }),
                    fc.integer({ min: 2, max: 3 }),
                ).map(([nodes, conj, disjs, gSize]) => {
                    const group: LayoutGroup = {
                        name: 'G0', nodeIds: nodes.slice(0, gSize).map(n => n.id),
                        keyNodeId: nodes[0].id, showLabel: true, sourceConstraint: gbf,
                    };
                    return buildLayout(nodes, conj, disjs.length > 0 ? disjs : undefined, [group]);
                })
            );

            await fc.assert(fc.asyncProperty(arbFullLayout, async (layout) => {
                const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                assertAgreement(layout, validatorSat, oracleSat);
            }), { numRuns: 30, timeout: TIMEOUT });
        });
    });

    // ─── MFS verification ───────────────────────────────────────────────

    describe('MFS correctness', () => {

        it('MFS reported by validator is feasible according to Z3', async () => {
            await fc.assert(fc.asyncProperty(
                arbFullSystem(5),
                async (layout) => {
                    const layoutV = cloneLayout(layout);
                    const validator = new QualitativeConstraintValidator(layoutV);
                    const error = validator.validateConstraints();

                    if (error && isPositionalConstraintError(error) && error.maximalFeasibleSubset) {
                        const mfsFeasible = await verifyFeasibleSubset(
                            layout,
                            error.maximalFeasibleSubset,
                        );
                        if (!mfsFeasible) {
                            throw new Error(
                                `MFS is NOT feasible according to Z3!\n` +
                                `  Layout: ${describeLayout(layout)}\n` +
                                `  MFS size: ${error.maximalFeasibleSubset.length}`
                            );
                        }
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });
});

// ─── Re-export buildLayout from constraint-arbitraries ──────────────────────

import { buildLayout } from './helpers/constraint-arbitraries';
