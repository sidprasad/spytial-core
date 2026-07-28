/**
 * Property-based equivalence tests between the QualitativeConstraintValidator
 * and a Z3 correctness oracle.
 *
 * Uses fast-check to generate random constraint problems and verify that
 * both the custom solver and Z3 agree on SAT/UNSAT.
 *
 * Z3 runs as a WASM module — no system binary required.
 */

import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';

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
    oracleStats,
    describeOracleStats,
} from './helpers/z3-oracle';
import {
    cloneLayout,
    describeConstraint,
    describeLayout,
    leftOf,
    aboveOf,
    alignOnX,
    alignOnY,
    makeNode,
    parseConstraintSpec,
    SRC,
} from './helpers/constraint-dsl';
import {
    arbNodePool,
    arbPair,
    arbOrdering,
    arbConjunctive,
    arbDisjunction,
    arbRichDisjunction,
    arbFullSystem,
    arbMixedSystem,
    arbNegativeOrdering,
    arbMixedOrdering,
    arbGroup,
    arbCompoundDisjunction,
} from './helpers/constraint-arbitraries';
import type { LayoutGroup, LayoutNode } from '../src/layout/interfaces';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkAgainstOracle(layout: InstanceLayout): Promise<{
    validatorSat: boolean;
    oracleSat: boolean;
}> {
    const layoutV = cloneLayout(layout);
    const validator = new QualitativeConstraintValidator(layoutV);
    const error = validator.validateConstraints();
    const validatorSat = error === null;
    let oracleSat: boolean;
    let committedSat = true;
    try {
        oracleSat = await solveZ3(layout);

        // On SAT the validator has committed its chosen disjunct alternatives
        // plus implicit alignment orders into layoutV.constraints. Boolean
        // agreement alone would miss a solver that answers SAT while committing
        // an inconsistent set — so verify the committed conjunctive system too.
        // (Group bbox variables are unconstrained in this relaxed check, so it
        // can only under-report inconsistency, never false-alarm.)
        if (validatorSat) {
            committedSat = await verifyFeasibleSubset(layoutV, layoutV.constraints);
        }
    } catch (e) {
        // Log the real cause directly: fast-check wraps predicate errors and
        // the reporter can drop the cause chain, leaving only a meaningless
        // shrunk counterexample in CI output (see run 30188347391 attempt 1).
        console.error(
            `[z3-oracle] oracle threw (validator said ${validatorSat ? 'SAT' : 'UNSAT'}): ${e}\n` +
            `  ${describeLayout(layout)}`
        );
        throw e;
    }
    if (!committedSat) {
        const detail =
            `Validator said SAT but its committed constraint set is UNSAT per Z3 ` +
            `(${layoutV.constraints.length} constraints)\n  ${describeLayout(layout)}`;
        console.error(`[z3-oracle] ${detail}`);
        throw new Error(detail);
    }
    return { validatorSat, oracleSat };
}

function assertAgreement(
    layout: InstanceLayout,
    validatorSat: boolean,
    oracleSat: boolean,
): void {
    if (validatorSat !== oracleSat) {
        const detail =
            `Disagreement! Validator=${validatorSat ? 'SAT' : 'UNSAT'}, ` +
            `Z3=${oracleSat ? 'SAT' : 'UNSAT'} ` +
            `(z3 solve took ${oracleStats().lastSolveMs}ms; ${describeOracleStats()})\n` +
            `  ${describeLayout(layout)}`;
        // Also log directly — see checkAgainstOracle for why.
        console.error(`[z3-oracle] ${detail}`);
        throw new Error(detail);
    }
}

// ─── Test suite ──────────────────────────────────────────────────────────────

const available = await isZ3Available();

afterAll(() => {
    if (available) shutdownZ3();
});

// One line per test tracking Z3's allocator inside its FIXED 2 GiB WASM heap.
// Cleanup of Z3 ASTs is FinalizationRegistry-driven (JS GC), so allocation
// can ratchet up across the suite; when it crosses 2 GiB the runtime aborts
// and poisons everything after it. This log turns "flaky OOM" into a curve.
afterEach((ctx) => {
    if (!available) return;
    console.log(`[z3-oracle] after "${ctx.task.name}": ${describeOracleStats()}`);
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

    // ─── Negative (zero-gap) orderings ───────────────────────────────────

    describe('Negative orientation constraints (minDistance=0)', () => {

        it('pure negative orderings on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbNegativeOrdering(nodes), { minLength: 1, maxLength: 6 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('mixed positive + negative orderings on 5 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbMixedOrdering(nodes), { minLength: 2, maxLength: 8 })
                    )
                ),
                async ([nodes, constraints]) => {
                    const layout = buildLayout(nodes, constraints);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('mixed orderings + alignments on 4 nodes', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(fc.oneof(arbMixedOrdering(nodes), fc.oneof(
                            fc.tuple(fc.constant(nodes), arbPair(nodes.length)).map(([ns, [i, j]]) => alignOnX(ns[i], ns[j])),
                            fc.tuple(fc.constant(nodes), arbPair(nodes.length)).map(([ns, [i, j]]) => alignOnY(ns[i], ns[j])),
                        )), { minLength: 2, maxLength: 6 })
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

        // ── Duplicate-pair alternatives (edge undo integrity) ──────────
        // Alternatives that DUPLICATE a base constraint's pair (with an equal
        // or smaller distance) exercise addEdge's redundant path; combined
        // with a cycle-closing reversal in the same alternative, the undo of
        // the failed tryAssign used to blind-delete the shared base edge,
        // corrupting the graph mid-search (SAT verdicts with cyclic committed
        // sets). The plain generators above never emit duplicate pairs, which
        // is how this survived them.

        it('duplicate + cycle-closer alternative deletes no base edge — UNSAT (Z3 cross-check)', async () => {
            const N0 = makeNode('N0', 52, 89), N3 = makeNode('N3', 89, 85);
            const N1 = makeNode('N1', 60, 40), N2 = makeNode('N2', 60, 40);
            const dup = (a: LayoutNode, b: LayoutNode, d: number): LayoutConstraint =>
                ({ left: a, right: b, minDistance: d, sourceConstraint: SRC });
            const layout = buildLayout(
                [N0, N1, N2, N3],
                [dup(N0, N3, 20)],
                [new DisjunctiveConstraint(SRC, [
                    [dup(N0, N3, 13), dup(N3, N0, 5)],
                    [dup(N3, N0, 5), dup(N1, N2, 5)],
                ])],
            );
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('random duplicate-pair and reversed-pair alternatives (Z3 cross-check)', async () => {
            const dupOf = (c: LayoutConstraint, delta: number): LayoutConstraint => {
                const anyC = c as any;
                return anyC.left
                    ? { left: anyC.left, right: anyC.right, minDistance: Math.max(0, anyC.minDistance - delta), sourceConstraint: SRC }
                    : { top: anyC.top, bottom: anyC.bottom, minDistance: Math.max(0, anyC.minDistance - delta), sourceConstraint: SRC };
            };
            const revOf = (c: LayoutConstraint, d: number): LayoutConstraint => {
                const anyC = c as any;
                return anyC.left
                    ? { left: anyC.right, right: anyC.left, minDistance: d, sourceConstraint: SRC }
                    : { top: anyC.bottom, bottom: anyC.top, minDistance: d, sourceConstraint: SRC };
            };
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 1, maxLength: 2 }),
                        fc.array(fc.record({
                            baseIdx: fc.nat(3),
                            dupDelta: fc.nat(15),
                            revDist: fc.nat(20),
                            benign: arbOrdering(nodes),
                            benignOnlySecond: fc.boolean(),
                        }), { minLength: 1, maxLength: 3 }),
                    )
                ),
                async ([nodes, base, specs]) => {
                    const disjs = specs.map(spec => {
                        const target = base[spec.baseIdx % base.length];
                        const altA = [dupOf(target, spec.dupDelta), revOf(target, spec.revDist)];
                        const altB = spec.benignOnlySecond
                            ? [spec.benign, dupOf(target, spec.dupDelta)]
                            : [revOf(target, spec.revDist), spec.benign];
                        return new DisjunctiveConstraint(SRC, [altA, altB]);
                    });
                    const layout = buildLayout(nodes, base, disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 30, timeout: TIMEOUT });
        });

        // ── Multi-constraint alternatives (partial-assignment undo) ────
        // Every other generator emits SINGLETON alternatives, so an
        // alternative could never fail halfway: constraint 1 either went in or
        // it did not. These carry two constraints over two pairs, so the
        // solver regularly adds the first, rejects the second, and must roll
        // the first back cleanly — the path #520's blind edge-delete corrupted.

        it('random compound (2-constraint) alternatives on 4 nodes (Z3 cross-check)', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                        fc.array(arbCompoundDisjunction(nodes), { minLength: 1, maxLength: 3 }),
                    )
                ),
                async ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random compound alternatives on 5 nodes, denser (Z3 cross-check)', async () => {
            await fc.assert(fc.asyncProperty(
                arbNodePool(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 1, maxLength: 4 }),
                        fc.array(arbCompoundDisjunction(nodes), { minLength: 2, maxLength: 4 }),
                    )
                ),
                async ([nodes, constraints, disjs]) => {
                    const layout = buildLayout(nodes, constraints, disjs);
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

        // ── Randomized negated group cross-checks (small M) ──────────

        it('random negated group with 2 members on 4 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(4).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                        fc.shuffledSubarray(
                            Array.from({ length: 4 }, (_, i) => i),
                            { minLength: 2, maxLength: 2 },
                        ),
                    )
                ),
                async ([nodes, constraints, memberIndices]) => {
                    const memberIds = memberIndices.map(i => nodes[i].id);
                    const group: LayoutGroup = {
                        name: 'NG0', nodeIds: memberIds,
                        keyNodeId: memberIds[0], showLabel: true,
                        sourceConstraint: gbf, negated: true,
                    };
                    const layout = buildLayout(nodes, constraints, undefined, [group]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random negated group with 3 members on 5 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                        fc.shuffledSubarray(
                            Array.from({ length: 5 }, (_, i) => i),
                            { minLength: 3, maxLength: 3 },
                        ),
                    )
                ),
                async ([nodes, constraints, memberIndices]) => {
                    const memberIds = memberIndices.map(i => nodes[i].id);
                    const group: LayoutGroup = {
                        name: 'NG0', nodeIds: memberIds,
                        keyNodeId: memberIds[0], showLabel: true,
                        sourceConstraint: gbf, negated: true,
                    };
                    const layout = buildLayout(nodes, constraints, undefined, [group]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random negated group with 4 members on 6 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(6).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                        fc.shuffledSubarray(
                            Array.from({ length: 6 }, (_, i) => i),
                            { minLength: 4, maxLength: 4 },
                        ),
                    )
                ),
                async ([nodes, constraints, memberIndices]) => {
                    const memberIds = memberIndices.map(i => nodes[i].id);
                    const group: LayoutGroup = {
                        name: 'NG0', nodeIds: memberIds,
                        keyNodeId: memberIds[0], showLabel: true,
                        sourceConstraint: gbf, negated: true,
                    };
                    const layout = buildLayout(nodes, constraints, undefined, [group]);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 25, timeout: TIMEOUT });
        });

        // ── Multiple negated groups from ONE source constraint ─────────
        // Both the validator and the oracle merge same-source negated groups
        // into a single disjunction: at least ONE group must be violated
        // (some non-member sits inside its members' span), not all of them.
        // No prior test exercised this path with more than one group.

        it('two same-source negated groups, either can be violated — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x a2, a3 <x a4, {!A: a1, a2}, {!B: a3, a4}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('same-source negated groups need only ONE violated (Or, not And) — SAT (Z3 cross-check)', async () => {
            // The total order a1 < a2 < a3 < a4 makes {!B} impossible to violate
            // (nothing can sit between a3 and a4's span from the left), but a2 or
            // a3 can still sit inside span(a1, a4), violating {!A}. Under Or
            // semantics this is SAT; under (wrong) And semantics it would be UNSAT.
            const layout = parseConstraintSpec('a1 <x a2, a2 <x a3, a3 <x a4, {!A: a1, a4}, {!B: a3, a4}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('total horizontal order starves both negated groups — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x a2, a2 <x a3, a3 <x a4, {!A: a1, a2}, {!B: a3, a4}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('random pair of same-source negated 2-member groups on 5 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(5).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                        fc.shuffledSubarray(
                            Array.from({ length: 5 }, (_, i) => i),
                            { minLength: 2, maxLength: 2 },
                        ),
                        fc.shuffledSubarray(
                            Array.from({ length: 5 }, (_, i) => i),
                            { minLength: 2, maxLength: 2 },
                        ),
                    )
                ),
                async ([nodes, constraints, indicesA, indicesB]) => {
                    const groups: LayoutGroup[] = [indicesA, indicesB].map((indices, g) => {
                        const memberIds = indices.map(i => nodes[i].id);
                        return {
                            name: `NG${g}`, nodeIds: memberIds,
                            keyNodeId: memberIds[0], showLabel: true,
                            sourceConstraint: gbf, negated: true,
                        };
                    });
                    const layout = buildLayout(nodes, constraints, undefined, groups);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: 25, timeout: TIMEOUT });
        });

        // ── Degenerate negated groups ──────────────────────────────────
        // ¬group is false when the group has 0 non-members (a rectangle around
        // everything always exists) or fewer than 2 members (non-overlap keeps
        // every non-member out of a single member's box). The validator pushes
        // the merged inclusion disjunction unconditionally, so an all-degenerate
        // source yields an EMPTY disjunction → UNSAT; the oracle asserts false
        // for the same case.

        it('negated group covering all nodes — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('{!G: a1, a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('negated group with a single member — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x b, {!G: a1}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('degenerate group does not poison a same-source non-degenerate one — SAT (Z3 cross-check)', async () => {
            // {!A} alone would be UNSAT, but same-source merging means only ONE
            // group must be violated, and {!B} can be (a1 inside span(a2, a3)).
            const layout = parseConstraintSpec('{!A: a1}, {!B: a2, a3}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

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

    // ─── Nested and overlapping groups ──────────────────────────────────
    // Subgroup pairs (B ⊂ A) are allowed and skip group-to-group separation;
    // partially overlapping pairs get `overlapping: true` stamped by the
    // validator (on the SHARED group objects, so the oracle sees it too).
    // Neither shape was covered before.

    describe('Nested and overlapping groups', () => {

        it('nested group (B inside A) — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x a2, {A: a1, a2, a3}, {B: a1, a2}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('outsider trapped inside nested inner group — UNSAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x x, x <x a2, a1 <y x, x <y a2, {A: a1, a2, a3}, {B: a1, a2}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(false);
        });

        it('outsider left of all members escapes both nested groups — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('x <x a1, x <x a2, x <x a3, {A: a1, a2, a3}, {B: a1, a2}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('shared member trapped inside one of two overlapping groups — SAT (Z3 cross-check)', async () => {
            const layout = parseConstraintSpec('a1 <x s, s <x a2, a1 <y s, s <y a2, {A: a1, a2, s}, {B: s, b1, b2}');
            const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
            assertAgreement(layout, validatorSat, oracleSat);
            expect(validatorSat).toBe(true);
        });

        it('random nested groups on 6 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(6).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.integer({ min: 3, max: 5 }),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                    )
                ),
                async ([nodes, outerSize, constraints]) => {
                    const outerIds = nodes.slice(0, outerSize).map(n => n.id);
                    const innerIds = outerIds.slice(0, 2);
                    const groups: LayoutGroup[] = [
                        {
                            name: 'G0', nodeIds: outerIds,
                            keyNodeId: outerIds[0], showLabel: true, sourceConstraint: gbf,
                        },
                        {
                            name: 'G1', nodeIds: innerIds,
                            keyNodeId: innerIds[0], showLabel: true, sourceConstraint: gbf,
                        },
                    ];
                    const layout = buildLayout(nodes, constraints, undefined, groups);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('random partially-overlapping groups on 6 nodes (Z3 cross-check)', async () => {
            const gbf = new GroupByField('type', 0, 1, 'type');
            await fc.assert(fc.asyncProperty(
                arbNodePool(6).chain(nodes =>
                    fc.tuple(
                        fc.constant(nodes),
                        fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                    )
                ),
                async ([nodes, constraints]) => {
                    // G0 = {0,1,2}, G1 = {2,3,4}: share node 2, neither subsumes.
                    const g0Ids = nodes.slice(0, 3).map(n => n.id);
                    const g1Ids = nodes.slice(2, 5).map(n => n.id);
                    const groups: LayoutGroup[] = [
                        {
                            name: 'G0', nodeIds: g0Ids,
                            keyNodeId: g0Ids[0], showLabel: true, sourceConstraint: gbf,
                        },
                        {
                            name: 'G1', nodeIds: g1Ids,
                            keyNodeId: g1Ids[0], showLabel: true, sourceConstraint: gbf,
                        },
                    ];
                    const layout = buildLayout(nodes, constraints, undefined, groups);
                    const { validatorSat, oracleSat } = await checkAgainstOracle(layout);
                    assertAgreement(layout, validatorSat, oracleSat);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
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
                        let mfsFeasible: boolean;
                        try {
                            mfsFeasible = await verifyFeasibleSubset(
                                layout,
                                error.maximalFeasibleSubset,
                            );
                        } catch (e) {
                            console.error(
                                `[z3-oracle] MFS verification threw: ${e}\n  ${describeLayout(layout)}`
                            );
                            throw e;
                        }
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

        // On conjunctive-only systems the validator's model coincides with the
        // oracle's subset model (nodes + non-overlap + the given constraints),
        // and the MFS comes from the global greedy builder — so maximality is
        // checkable: adding back ANY excluded constraint must be Z3-UNSAT.
        // (With groups/disjunctions in play the subset model is a relaxation
        // and a SAT verdict on an excluded constraint would prove nothing.)
        it('MFS on conjunctive-only systems is feasible AND maximal per Z3', async () => {
            await fc.assert(fc.asyncProperty(
                arbMixedSystem(5, 8),
                async (layout) => {
                    const layoutV = cloneLayout(layout);
                    const validator = new QualitativeConstraintValidator(layoutV);
                    const error = validator.validateConstraints();
                    if (!error || !isPositionalConstraintError(error) || !error.maximalFeasibleSubset) {
                        return;
                    }
                    const mfs = error.maximalFeasibleSubset;
                    // cloneLayout shares constraint object identity, so the
                    // excluded set is computable from the original array
                    // (the validator replaces layoutV.constraints, not ours).
                    const mfsSet = new Set(mfs);
                    const excluded = layout.constraints.filter(c => !mfsSet.has(c));

                    const feasible = await verifyFeasibleSubset(layout, mfs);
                    if (!feasible) {
                        const detail =
                            `MFS is NOT feasible according to Z3!\n` +
                            `  MFS: ${mfs.map(describeConstraint).join(', ')}\n` +
                            `  ${describeLayout(layout)}`;
                        console.error(`[z3-oracle] ${detail}`);
                        throw new Error(detail);
                    }

                    for (const c of excluded) {
                        const stillFeasible = await verifyFeasibleSubset(layout, [...mfs, c]);
                        if (stillFeasible) {
                            const detail =
                                `MFS is not maximal: adding back "${describeConstraint(c)}" is still feasible per Z3\n` +
                                `  MFS: ${mfs.map(describeConstraint).join(', ')}\n` +
                                `  ${describeLayout(layout)}`;
                            console.error(`[z3-oracle] ${detail}`);
                            throw new Error(detail);
                        }
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });
});

// ─── Re-export buildLayout from constraint-arbitraries ──────────────────────

import { buildLayout } from './helpers/constraint-arbitraries';
