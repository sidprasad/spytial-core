/**
 * Property-based tests for the qualitative constraint validator.
 *
 * Tests standalone correctness properties — does NOT compare against
 * the Kiwi validator. Each property should hold for any valid constraint
 * system, regardless of implementation.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutConstraint,
    LayoutNode,
} from '../src/layout/interfaces';
import {
    cloneLayout,
    describeLayout,
    leftOf,
    aboveOf,
    alignOnX,
    alignOnY,
    makeNode,
    SRC,
} from './helpers/constraint-dsl';
import {
    arbNodePool,
    arbPair,
    arbOrdering,
    arbConjunctive,
    arbRichDisjunction,
    arbMixedSystem,
    arbDisjunctiveSystem,
    arbGroupSystem,
    arbFullSystem,
    buildLayout,
} from './helpers/constraint-arbitraries';

// ─── Config ─────────────────────────────────────────────────────────────────

const NUM_RUNS = 200;
const TIMEOUT = 60_000;

function runValidator(layout: InstanceLayout): { sat: boolean; error: ReturnType<QualitativeConstraintValidator['validateConstraints']> } {
    const copy = cloneLayout(layout);
    const validator = new QualitativeConstraintValidator(copy);
    const error = validator.validateConstraints();
    return { sat: error === null, error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Property 1: Cycle detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('cycle detection', { timeout: TIMEOUT }, () => {
    it('a direct 2-cycle on the x-axis is always UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(2),
            (nodes) => {
                const layout = buildLayout(nodes, [
                    leftOf(nodes[0], nodes[1]),
                    leftOf(nodes[1], nodes[0]),
                ]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT for 2-cycle:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('a direct 2-cycle on the y-axis is always UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(2),
            (nodes) => {
                const layout = buildLayout(nodes, [
                    aboveOf(nodes[0], nodes[1]),
                    aboveOf(nodes[1], nodes[0]),
                ]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT for 2-cycle:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('a 3-cycle is always UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const mk = useX ? leftOf : aboveOf;
                const layout = buildLayout(nodes, [
                    mk(nodes[0], nodes[1]),
                    mk(nodes[1], nodes[2]),
                    mk(nodes[2], nodes[0]),
                ]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT for 3-cycle:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 2: Alignment-ordering conflict
// ═══════════════════════════════════════════════════════════════════════════════

describe('alignment-ordering conflict', { timeout: TIMEOUT }, () => {
    it('ordering + same-axis alignment between the same pair is always UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(2),
            fc.boolean(),
            (nodes, useX) => {
                const order = useX ? leftOf(nodes[0], nodes[1]) : aboveOf(nodes[0], nodes[1]);
                const align = useX ? alignOnX(nodes[0], nodes[1]) : alignOnY(nodes[0], nodes[1]);
                const layout = buildLayout(nodes, [order, align]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT for ordering+alignment:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('ordering + cross-axis alignment is always SAT', () => {
        fc.assert(fc.property(
            arbNodePool(2),
            fc.boolean(),
            (nodes, useX) => {
                const order = useX ? leftOf(nodes[0], nodes[1]) : aboveOf(nodes[0], nodes[1]);
                const align = useX ? alignOnY(nodes[0], nodes[1]) : alignOnX(nodes[0], nodes[1]);
                const layout = buildLayout(nodes, [order, align]);
                const { sat } = runValidator(layout);
                if (!sat) throw new Error(`Expected SAT for cross-axis order+align:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('transitive ordering + alignment is UNSAT (A <x B, B <x C, A =x C)', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const mk = useX ? leftOf : aboveOf;
                const al = useX ? alignOnX : alignOnY;
                const layout = buildLayout(nodes, [
                    mk(nodes[0], nodes[1]),
                    mk(nodes[1], nodes[2]),
                    al(nodes[0], nodes[2]),
                ]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT for transitive order+align:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 3: Monotonicity
// ═══════════════════════════════════════════════════════════════════════════════

describe('monotonicity', { timeout: TIMEOUT }, () => {
    it('adding a constraint to an UNSAT system keeps it UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(4).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbConjunctive(nodes), { minLength: 2, maxLength: 6 }),
                    arbConjunctive(nodes),
                )
            ),
            ([nodes, constraints, extra]) => {
                const base = buildLayout(nodes, constraints);
                const baseResult = runValidator(base);
                if (!baseResult.sat) {
                    // Base is UNSAT — adding more constraints should also be UNSAT
                    const extended = buildLayout(nodes, [...constraints, extra]);
                    const extResult = runValidator(extended);
                    if (extResult.sat) {
                        throw new Error(
                            `Monotonicity violation! Base UNSAT but extended SAT:\n` +
                            `  Base: ${describeLayout(base)}\n` +
                            `  Extra: added constraint\n` +
                            `  Extended: ${describeLayout(extended)}`
                        );
                    }
                }
            }
        ), { numRuns: NUM_RUNS });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 4: Disjunction soundness
// ═══════════════════════════════════════════════════════════════════════════════

describe('disjunction soundness', { timeout: TIMEOUT }, () => {
    it('if every alternative of a disjunction creates a cycle, the system is UNSAT', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const mk = useX ? leftOf : aboveOf;
                // Conjunctive: A < B < C (chain)
                const chain = [mk(nodes[0], nodes[1]), mk(nodes[1], nodes[2])];

                // Disjunction: C < A (creates 3-cycle) OR C < B (creates 2-cycle with B < C)
                const disj = new DisjunctiveConstraint(SRC, [
                    [mk(nodes[2], nodes[0])],  // C < A: 3-cycle A < B < C < A
                    [mk(nodes[2], nodes[1])],  // C < B: 2-cycle B < C < B
                ]);

                const layout = buildLayout(nodes, chain, [disj]);
                const { sat } = runValidator(layout);
                if (sat) throw new Error(`Expected UNSAT when all disjunction alts create cycles:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('a disjunction with at least one non-conflicting alternative can be SAT', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const mk = useX ? leftOf : aboveOf;
                // Conjunctive: A < B
                const conj = [mk(nodes[0], nodes[1])];

                // Disjunction: B < C (compatible) OR C < A (also compatible)
                const disj = new DisjunctiveConstraint(SRC, [
                    [mk(nodes[1], nodes[2])],
                    [mk(nodes[2], nodes[0])],
                ]);

                const layout = buildLayout(nodes, conj, [disj]);
                const { sat } = runValidator(layout);
                if (!sat) throw new Error(`Expected SAT when disjunction has feasible alternative:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 5: Alignment transitivity
// ═══════════════════════════════════════════════════════════════════════════════

describe('alignment transitivity', { timeout: TIMEOUT }, () => {
    it('A =x B, B =x C is always SAT (alignment is transitive)', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const al = useX ? alignOnX : alignOnY;
                const layout = buildLayout(nodes, [al(nodes[0], nodes[1]), al(nodes[1], nodes[2])]);
                const { sat } = runValidator(layout);
                if (!sat) throw new Error(`Expected SAT for transitive alignment:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('A =x B, B =x C, A =x C is always SAT (consistent transitive closure)', () => {
        fc.assert(fc.property(
            arbNodePool(3),
            fc.boolean(),
            (nodes, useX) => {
                const al = useX ? alignOnX : alignOnY;
                const layout = buildLayout(nodes, [
                    al(nodes[0], nodes[1]),
                    al(nodes[1], nodes[2]),
                    al(nodes[0], nodes[2]),
                ]);
                const { sat } = runValidator(layout);
                if (!sat) throw new Error(`Expected SAT for consistent transitive alignment:\n  ${describeLayout(layout)}`);
            }
        ), { numRuns: NUM_RUNS });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Property 6: Stress tests on mixed systems
// ═══════════════════════════════════════════════════════════════════════════════

describe('mixed system stress', { timeout: TIMEOUT }, () => {
    it('random ordering systems do not crash', () => {
        fc.assert(fc.property(
            arbNodePool(5).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbOrdering(nodes), { minLength: 1, maxLength: 8 }),
                )
            ),
            ([nodes, constraints]) => {
                const layout = buildLayout(nodes, constraints);
                // Just ensure it doesn't throw
                runValidator(layout);
            }
        ), { numRuns: NUM_RUNS });
    });

    it('random mixed systems (orderings + alignments) do not crash', () => {
        fc.assert(fc.property(
            arbMixedSystem(5, 8),
            (layout) => { runValidator(layout); }
        ), { numRuns: NUM_RUNS });
    });

    it('random disjunctive systems do not crash', () => {
        fc.assert(fc.property(
            arbDisjunctiveSystem(4, 4, 3),
            (layout) => { runValidator(layout); }
        ), { numRuns: NUM_RUNS });
    });

    it('random group systems do not crash', () => {
        fc.assert(fc.property(
            arbGroupSystem(5, 4),
            (layout) => { runValidator(layout); }
        ), { numRuns: NUM_RUNS });
    });

    it('random full systems do not crash', () => {
        fc.assert(fc.property(
            arbFullSystem(5),
            (layout) => { runValidator(layout); }
        ), { numRuns: NUM_RUNS });
    });
});
