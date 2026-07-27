/**
 * Entailment cross-checks between the validator's modal query API
 * (getMust / getCannot / getCan / getMustAligned / getCannotAligned)
 * and the Z3 oracle.
 *
 * The modal contracts are exact claims over the ORIGINAL constraint program
 * (all valid layouts, not the one the CDCL happened to commit):
 *   getMust(X, rel)    — nodes in `rel` to X in ALL valid layouts
 *   getCannot(X, rel)  — nodes in `rel` to X in NO valid layout
 *   getCan(X, rel)     — complement of getCannot
 * Z3 decides these directly on the full model:
 *   must P    ⟺  UNSAT(model ∧ ¬P)
 *   cannot P  ⟺  UNSAT(model ∧ P)
 *
 * Propositions:
 *   - must "Y left of X" is probed at full strength, as proper placement:
 *     UNSAT(x_Y + w_Y ≥ x_X). The weaker coord reading UNSAT(x_Y ≥ x_X) is
 *     NOT enough — it accepts a Y that starts before X while still spanning
 *     across it, which is not "left of" in any sense the query language means.
 *     The two readings agree only when every node is the same size on the
 *     axis, so a uniform-size fixture cannot tell them apart.
 *   - cannot/can "Y left of X" is probed as proper placement:
 *     x_Y + w_Y ≤ x_X. The system is pure difference bounds (no upper
 *     bounds), so a model with x_Y < x_X can always be stretched into one
 *     with proper separation — "can be strictly before" ⟺ "can be
 *     properly before" — which makes this probe exact, not conservative.
 *
 * Soundness (claimed must/cannot facts hold per Z3) is always asserted.
 * Exactness of the can-side (no over-claimed "can") is asserted only where
 * the theory guarantees the must-graph is complete: conjunctive systems,
 * where reachability in the difference graph plus the dual-axis overlap
 * rule exactly characterize entailment. With disjunctions the
 * per-disjunction intersection strengthening misses joint entailment —
 * see the KNOWN INCOMPLETENESS ledger at the bottom.
 */

import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';

vi.setConfig({ testTimeout: 120_000 });
import * as fc from 'fast-check';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { InstanceLayout } from '../src/layout/interfaces';
import {
    isZ3Available,
    shutdownZ3,
    solveZ3With,
    describeOracleStats,
    OracleProp,
} from './helpers/z3-oracle';
import {
    cloneLayout,
    describeLayout,
    parseConstraintSpec,
} from './helpers/constraint-dsl';
import {
    arbNodePool,
    arbConjunctive,
    arbOrdering,
    arbDisjunction,
    buildLayout,
} from './helpers/constraint-arbitraries';

// ─── Helpers ─────────────────────────────────────────────────────────────────

class ModalDisagreement extends Error {}

function fail(layout: InstanceLayout, claim: string): never {
    const detail = `Modal disagreement: ${claim}\n  ${describeLayout(layout)}`;
    // Log directly — fast-check wraps predicate errors and the reporter can
    // drop the cause chain (same rationale as in z3-equivalence.test.ts).
    console.error(`[z3-oracle] ${detail}`);
    throw new ModalDisagreement(detail);
}

/**
 * Validate `layout`, then cross-check every modal claim against Z3.
 * Returns false (checking nothing) when the layout is UNSAT — modal
 * queries are only defined for feasible layouts.
 *
 * `canExactOrdering` / `canExactAlignment` additionally assert that the
 * can-side does not over-claim (every ¬cannot is Z3-SAT), separately for
 * ordering and alignment claims — the two have different completeness
 * frontiers (see the KNOWN INCOMPLETENESS tests).
 */
async function checkModalAgainstOracle(
    layout: InstanceLayout,
    opts: { canExactOrdering: boolean; canExactAlignment: boolean },
): Promise<boolean> {
    const layoutV = cloneLayout(layout);
    const validator = new QualitativeConstraintValidator(layoutV);
    if (validator.validateConstraints() !== null) return false;

    const ids = layout.nodes.map(n => n.id);

    // ── Structural coherence (no Z3): mirror relations must agree ──────
    for (const X of ids) {
        expect(validator.getCannot(X, 'leftOf').has(X)).toBe(true); // reflexive
        expect(validator.getCannot(X, 'above').has(X)).toBe(true);
        for (const Y of ids) {
            if (X === Y) continue;
            expect(validator.getMust(X, 'leftOf').has(Y)).toBe(validator.getMust(Y, 'rightOf').has(X));
            expect(validator.getMust(X, 'above').has(Y)).toBe(validator.getMust(Y, 'below').has(X));
            expect(validator.getCannot(X, 'leftOf').has(Y)).toBe(validator.getCannot(Y, 'rightOf').has(X));
            expect(validator.getCannot(X, 'above').has(Y)).toBe(validator.getCannot(Y, 'below').has(X));
            expect(validator.getMustAligned(X, 'x').has(Y)).toBe(validator.getMustAligned(Y, 'x').has(X));
            expect(validator.getMustAligned(X, 'y').has(Y)).toBe(validator.getMustAligned(Y, 'y').has(X));
        }
    }

    // ── Entailment probes ──────────────────────────────────────────────
    for (const axis of ['x', 'y'] as const) {
        const rel = axis === 'x' ? 'leftOf' as const : 'above' as const;

        for (const X of ids) {
            const must = validator.getMust(X, rel);
            const cannot = validator.getCannot(X, rel);
            for (const Y of ids) {
                if (Y === X) continue;

                if (must.has(Y)) {
                    // Claim: Y sits entirely before X on this axis in ALL models.
                    const refuted: OracleProp = { kind: 'notProperBefore', axis, a: Y, b: X };
                    if (await solveZ3With(layout, [refuted])) {
                        fail(layout, `getMust(${X}, ${rel}) claims ${Y}, but Z3 found a model where ${Y} does not clear ${X} on ${axis}`);
                    }
                }

                const placement: OracleProp = { kind: 'properBefore', axis, a: Y, b: X };
                if (cannot.has(Y)) {
                    // Claim: no model places Y properly before X.
                    if (await solveZ3With(layout, [placement])) {
                        fail(layout, `getCannot(${X}, ${rel}) claims ${Y}, but Z3 placed ${Y} properly before ${X} on ${axis}`);
                    }
                } else if (opts.canExactOrdering) {
                    // Claim (via getCan = ¬getCannot): some model places Y properly before X.
                    if (!(await solveZ3With(layout, [placement]))) {
                        fail(layout, `getCan(${X}, ${rel}) claims ${Y}, but Z3 proved ${Y} can never be properly before ${X} on ${axis}`);
                    }
                }
            }
        }

        // Alignment claims are symmetric — probe unordered pairs once.
        for (let i = 0; i < ids.length; i++) {
            const X = ids[i];
            const mustA = validator.getMustAligned(X, axis);
            const cannotA = validator.getCannotAligned(X, axis);
            for (let j = i + 1; j < ids.length; j++) {
                const Y = ids[j];

                if (mustA.has(Y)) {
                    const refuted: OracleProp = { kind: 'coordNeq', axis, a: X, b: Y };
                    if (await solveZ3With(layout, [refuted])) {
                        fail(layout, `getMustAligned(${X}, ${axis}) claims ${Y}, but Z3 found a model with ${axis}_${X} ≠ ${axis}_${Y}`);
                    }
                }

                const aligned: OracleProp = { kind: 'coordEq', axis, a: X, b: Y };
                if (cannotA.has(Y)) {
                    if (await solveZ3With(layout, [aligned])) {
                        fail(layout, `getCannotAligned(${X}, ${axis}) claims ${Y}, but Z3 aligned them`);
                    }
                } else if (opts.canExactAlignment) {
                    if (!(await solveZ3With(layout, [aligned]))) {
                        fail(layout, `getCanAligned(${X}, ${axis}) claims ${Y}, but Z3 proved alignment impossible`);
                    }
                }
            }
        }
    }
    return true;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

const available = await isZ3Available();

afterAll(() => {
    if (available) shutdownZ3();
});

afterEach((ctx) => {
    if (!available) return;
    console.log(`[z3-oracle] after "${ctx.task.name}": ${describeOracleStats()}`);
});

describe.runIf(available)('Modal query entailment vs Z3', () => {

    // ─── Deterministic cases (exhaustive pair probes) ───────────────────

    it('transitive chain: modal queries exactly match Z3', async () => {
        const layout = parseConstraintSpec('a <x b, b <x c');
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        // Spot-check the expected transitive facts surfaced at all.
        const layoutV = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(layoutV);
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('c', 'leftOf').has('a')).toBe(true);
        expect(v.getCannot('a', 'leftOf').has('c')).toBe(true);
    });

    it('alignment chain: aligned nodes cannot order, mustAligned is transitive', async () => {
        const layout = parseConstraintSpec('a =x b, b =x c, a <y b');
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const layoutV = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(layoutV);
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMustAligned('a', 'x').has('c')).toBe(true);
        expect(v.getCannot('a', 'leftOf').has('b')).toBe(true);
    });

    it('disjunction with a common consequence yields a must fact', async () => {
        // Both alternatives contain a <x b, so the intersection strengthening
        // must surface must(a before b) even though the constraint is disjunctive.
        // Alignment exactness is off: every alternative x-separates b and c, so
        // b/c can never be x-aligned, but cannot-aligned facts are not derived
        // from disjunction intersection (see KNOWN INCOMPLETENESS below).
        const layout = parseConstraintSpec('[a <x b & b <x c | a <x b & c <x b]');
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: false })).toBe(true);

        const layoutV = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(layoutV);
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('b', 'leftOf').has('a')).toBe(true);
    });

    it('group bounding-box disjunctions leave modal claims exact', async () => {
        const layout = parseConstraintSpec('x <x a1, x <x a2, {A: a1, a2}');
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);
    });

    it('non-uniform sizes: sharing a column with a narrow node is not "left of"', async () => {
        // W shares a column with the narrow N, and N is left of X. That forces
        // only N's own width of separation, which says nothing about whether
        // the far wider W clears X — and it does not: W spans right across it.
        // getMust used to claim it, because reachability alone establishes only
        // x_W < x_X. Sizes must differ to expose this: at equal widths any
        // forced separation already exceeds a box, so the readings coincide.
        const dims = {
            W: [300, 60] as [number, number],
            N: [20, 60] as [number, number],
            X: [100, 60] as [number, number],
        };
        const layout = parseConstraintSpec('W =x N, N <x X', dims);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('X', 'leftOf').has('N')).toBe(true);  // N (20 wide) clears X
        expect(v.getMust('X', 'leftOf').has('W')).toBe(false); // W (300 wide) does not
        // The weaker reading still holds for W — that is exactly the gap.
        expect(await solveZ3With(layout, [{ kind: 'coordGe', axis: 'x', a: 'W', b: 'X' }])).toBe(false);
    });

    // ─── Randomized (fixed seed → deterministic in CI) ──────────────────

    it('random conjunctive systems: modal queries exactly match Z3', async () => {
        await fc.assert(fc.asyncProperty(
            arbNodePool(4).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbConjunctive(nodes), { minLength: 0, maxLength: 5 }),
                )
            ),
            async ([nodes, constraints]) => {
                const layout = buildLayout(nodes, constraints);
                await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true });
            }
        ), { numRuns: 8, seed: 20260727, timeout: 120_000 });
    });

    it('random ordering + disjunction systems: modal claims are sound', async () => {
        await fc.assert(fc.asyncProperty(
            arbNodePool(4).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 3 }),
                    fc.array(arbDisjunction(nodes), { minLength: 1, maxLength: 2 }),
                )
            ),
            async ([nodes, constraints, disjunctions]) => {
                const layout = buildLayout(nodes, constraints, disjunctions);
                // Soundness only: with disjunctions the can-side may over-claim
                // (see KNOWN INCOMPLETENESS below).
                await checkModalAgainstOracle(layout, { canExactOrdering: false, canExactAlignment: false });
            }
        ), { numRuns: 8, seed: 20260727, timeout: 120_000 });
    });

    // ─── Known incompleteness ledger ────────────────────────────────────
    // Each specimen has a passing ground-truth test (Z3 proves the fact,
    // and everything the validator DOES claim stays sound) and an it.fails
    // test asserting the exact modal semantics. If an it.fails test starts
    // PASSING, the validator learned that inference — delete the .fails
    // modifier and fold the case into the exactness suites above.

    // Specimen 1: joint entailment across two disjunctions. Any model
    // violating a <x b must satisfy BOTH c <x d and d <x c — impossible —
    // so a <x b is entailed jointly, and "b left of a" is impossible. The
    // per-disjunction intersection strengthening cannot see this (each
    // disjunction's alternatives share no common consequence).

    it('joint-entailment ground truth: Z3 proves b can never be left of a', async () => {
        const layout = parseConstraintSpec('[a <x b | c <x d], [a <x b | d <x c]');
        expect(await solveZ3With(layout, [{ kind: 'properBefore', axis: 'x', a: 'b', b: 'a' }])).toBe(false);
        // Soundness of what IS claimed still holds on this layout.
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: false, canExactAlignment: false })).toBe(true);
    });

    it.fails('joint entailment across two disjunctions is not captured (KNOWN INCOMPLETENESS)', async () => {
        const layout = parseConstraintSpec('[a <x b | c <x d], [a <x b | d <x c]');
        const layoutV = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(layoutV);
        expect(v.validateConstraints()).toBeNull();
        expect(v.getCannot('a', 'leftOf').has('b')).toBe(true);
    });

    // Specimen 2: disjunction-forced alignment impossibility. Every
    // alternative of [a <x b | b <x a] separates a and b on x, so they can
    // never be x-aligned — but cannot-aligned facts are derived only from
    // the must graphs (strict orders + dual-axis overlap), not from
    // disjunction intersection, so getCanAligned over-claims here.

    it('disjunction-forced ground truth: Z3 proves a and b can never be x-aligned', async () => {
        const layout = parseConstraintSpec('[a <x b | b <x a]');
        expect(await solveZ3With(layout, [{ kind: 'coordEq', axis: 'x', a: 'a', b: 'b' }])).toBe(false);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: false })).toBe(true);
    });

    it.fails('disjunction-forced alignment impossibility is not captured (KNOWN INCOMPLETENESS)', async () => {
        const layout = parseConstraintSpec('[a <x b | b <x a]');
        const layoutV = cloneLayout(layout);
        const v = new QualitativeConstraintValidator(layoutV);
        expect(v.validateConstraints()).toBeNull();
        expect(v.getCannotAligned('a', 'x').has('b')).toBe(true);
    });
});
