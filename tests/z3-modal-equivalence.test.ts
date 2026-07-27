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
 *     x_Y + w_Y < x_X. The system is pure difference bounds (no upper
 *     bounds), so a model with x_Y < x_X can always be stretched into one
 *     with proper separation — "can be strictly before" ⟺ "can be
 *     properly before" — which makes this probe exact, not conservative.
 *     Both probes are STRICT, so properBefore and notProperBefore are exact
 *     complements. A non-strict ≤ would admit a touching pair
 *     (x_Y + w_Y = x_X) as "before" on the can-side while the must-side
 *     refutation treats the same model as NOT before. Zero-gap orderings
 *     force exactly that model, so the gap is reachable, not academic —
 *     'oracle probes are exact complements' below pins it down.
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

/**
 * Property size and seed. Defaults are the CI gate: deterministic, and sized
 * so the whole file stays well inside the Z3 module's recycle budget. Raise
 * both to search rather than to regression-test, e.g.
 *   Z3_MODAL_RUNS=400 Z3_MODAL_SEED=$RANDOM npx vitest run tests/z3-modal-equivalence.test.ts
 */
const MODAL_RUNS = Number(process.env.Z3_MODAL_RUNS ?? 30);
const MODAL_SEED = Number(process.env.Z3_MODAL_SEED ?? 20260727);

// A modal case costs one Z3 solve per node pair per axis, so run time is
// roughly linear in MODAL_RUNS. A fixed ceiling would turn any raise of
// MODAL_RUNS into a timeout that reads like a hang, so scale with it and keep
// 120s as the floor for the default size.
vi.setConfig({ testTimeout: Math.max(120_000, MODAL_RUNS * 4_000) });
import * as fc from 'fast-check';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { InstanceLayout, LayoutGroup } from '../src/layout/interfaces';
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
    makeNode,
    leftOf,
    aboveOf,
    alignOnX,
    alignOnY,
    negativeLeftOf,
    GBF,
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

    // ── getReachable (resolved model) vs getMust (all models) ──────────
    // getReachable answers over the constraint set the CDCL committed to;
    // getMust answers over the whole program. With no disjunctions and no
    // groups there is nothing to commit, so the two sets are IDENTICAL — and
    // since every getMust claim is Z3-checked below, this pins getReachable to
    // Z3 too, for free. #524 rewrote all four of its cases and nothing else
    // covers them.
    // (With disjunctions the committed set is a strengthening, so getReachable
    // is a superset and only ⊇ would hold — not asserted here.)
    const resolvedIsFullProgram =
        !layout.disjunctiveConstraints?.length && !layout.groups?.length;
    if (resolvedIsFullProgram) {
        for (const rel of ['leftOf', 'rightOf', 'above', 'below'] as const) {
            for (const X of ids) {
                const reach = validator.getReachable(X, rel);
                const must = validator.getMust(X, rel);
                expect([...reach].sort()).toEqual([...must].sort());
            }
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

    // ─── The zero-gap (touching) boundary ───────────────────────────────
    // A minDistance=0 ordering forces exactly one box of separation:
    //   x_a + w_a ≤ x_b.
    // So the pair may TOUCH, and a touching pair is not "left of" under the
    // mechanized definition (leftOf b₁ b₂ := b₁.x_tl + b₁.width < b₂.x_tl).
    // isProperlyBefore requires maxWeight > size, and here maxWeight = size
    // exactly — the single point where the comparison's strictness decides the
    // answer. No generator emitted zero gaps into the modal suite before this.

    it('oracle probes are exact complements (properBefore / notProperBefore)', async () => {
        // Guards the oracle itself, not the validator. A non-strict properBefore
        // (≤) overlaps notProperBefore (≥) at coord_a + size_a = coord_b, which
        // a zero-gap ordering makes reachable — so asserting both at once must
        // be UNSAT. If this ever passes with a ≤ encoding, the can-side
        // exactness check below is silently testing a weaker relation.
        const a = makeNode('a', 100, 60), b = makeNode('b', 100, 60);
        const layout = buildLayout([a, b], [negativeLeftOf(a, b)]);
        expect(await solveZ3With(layout, [
            { kind: 'properBefore', axis: 'x', a: 'a', b: 'b' },
            { kind: 'notProperBefore', axis: 'x', a: 'a', b: 'b' },
        ])).toBe(false);
    });

    it('zero-gap ordering permits touching, so it is not a must-leftOf', async () => {
        const a = makeNode('a', 100, 60), b = makeNode('b', 100, 60);
        const layout = buildLayout([a, b], [negativeLeftOf(a, b)]);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        // Forced separation is exactly w_a, which does not CLEAR b.
        expect(v.getMust('b', 'leftOf').has('a')).toBe(false);
        // But nothing caps the separation, so it remains achievable.
        expect(v.getCannot('b', 'leftOf').has('a')).toBe(false);
        // The reverse is genuinely impossible, and the validator knows it.
        expect(v.getCannot('a', 'leftOf').has('b')).toBe(true);

        // Z3 confirms both halves.
        expect(await solveZ3With(layout, [{ kind: 'notProperBefore', axis: 'x', a: 'a', b: 'b' }])).toBe(true);
        expect(await solveZ3With(layout, [{ kind: 'properBefore', axis: 'x', a: 'a', b: 'b' }])).toBe(true);
    });

    it('one unit of gap crosses the boundary into a must-leftOf', async () => {
        // Same shape as above with minDistance=1: separation is now w_a + 1,
        // which clears b. The pair of tests brackets the comparison exactly.
        const a = makeNode('a', 100, 60), b = makeNode('b', 100, 60);
        const layout = buildLayout([a, b], [leftOf(a, b, 1)]);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('b', 'leftOf').has('a')).toBe(true);
    });

    // ─── Separation accumulated along a chain ───────────────────────────
    // The non-uniform case above has a path of length 1, so it only tests
    // "one hop's weight vs one node's size". These walk a 3-hop path where the
    // total is what decides, with the gap as the only difference between a
    // false and a true answer.

    it('accumulated separation below the wide node stays out of must-leftOf', async () => {
        // W is x-aligned with N, so it inherits N's outgoing path: two hops of
        // (20 + 15) = 70 total. W is 300 wide, so W still spans across X.
        const W = makeNode('W', 300, 60), N = makeNode('N', 20, 60);
        const M = makeNode('M', 20, 60), X = makeNode('X', 100, 60);
        const layout = buildLayout([W, N, M, X], [
            alignOnX(W, N), leftOf(N, M, 15), leftOf(M, X, 15),
        ]);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('X', 'leftOf').has('N')).toBe(true);  // 20 wide, 70 of run-up
        expect(v.getMust('X', 'leftOf').has('W')).toBe(false); // 300 wide, same 70
    });

    it('accumulated separation above the wide node enters must-leftOf', async () => {
        // Identical except the gap: two hops of (20 + 200) = 440 > 300, so the
        // same W now does clear X. Only the arithmetic changed.
        const W = makeNode('W', 300, 60), N = makeNode('N', 20, 60);
        const M = makeNode('M', 20, 60), X = makeNode('X', 100, 60);
        const layout = buildLayout([W, N, M, X], [
            alignOnX(W, N), leftOf(N, M, 200), leftOf(M, X, 200),
        ]);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('X', 'leftOf').has('W')).toBe(true);
    });

    it('the same gap holds on the vertical axis through a y-alignment class', async () => {
        // Mirror of the horizontal case: T is y-aligned with S (20 tall) and is
        // itself 300 tall, so S clears C vertically and T does not. Exercises
        // the vertical graph and height-based sizes.
        const T = makeNode('T', 60, 300), S = makeNode('S', 60, 20), C = makeNode('C', 60, 60);
        const layout = buildLayout([T, S, C], [alignOnY(T, S), aboveOf(S, C, 15)]);
        expect(await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true })).toBe(true);

        const v = new QualitativeConstraintValidator(cloneLayout(layout));
        expect(v.validateConstraints()).toBeNull();
        expect(v.getMust('C', 'above').has('S')).toBe(true);
        expect(v.getMust('C', 'above').has('T')).toBe(false);
    });

    // ─── Randomized ─────────────────────────────────────────────────────
    // Fixed seed by default so PR CI is a deterministic regression gate. A
    // fixed-seed property explores the SAME systems on every run and can never
    // find anything new, so both knobs are overridable: run with
    // Z3_MODAL_SEED=$RANDOM (and a larger Z3_MODAL_RUNS) to actually search.

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
        ), { numRuns: MODAL_RUNS, seed: MODAL_SEED, timeout: 120_000 });
    });

    it('random conjunctive systems on 5 nodes: modal queries exactly match Z3', async () => {
        // Wider than the 4-node property: three-hop paths only exist from 5
        // nodes up, and accumulated separation is what isProperlyBefore reads.
        await fc.assert(fc.asyncProperty(
            arbNodePool(5).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbConjunctive(nodes), { minLength: 2, maxLength: 7 }),
                )
            ),
            async ([nodes, constraints]) => {
                const layout = buildLayout(nodes, constraints);
                await checkModalAgainstOracle(layout, { canExactOrdering: true, canExactAlignment: true });
            }
        ), { numRuns: MODAL_RUNS, seed: MODAL_SEED, timeout: 120_000 });
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
        ), { numRuns: MODAL_RUNS, seed: MODAL_SEED, timeout: 120_000 });
    });

    it('random systems with groups: modal claims are sound', async () => {
        // Groups add bounding-box variables and Rule C member edges, so must
        // paths can now run THROUGH a bbox. Nothing randomized covered that.
        // Soundness only: the bbox inclusion disjunction has the same
        // per-disjunction limit as any other (see KNOWN INCOMPLETENESS below).
        await fc.assert(fc.asyncProperty(
            arbNodePool(5).chain(nodes =>
                fc.tuple(
                    fc.constant(nodes),
                    fc.array(arbOrdering(nodes), { minLength: 0, maxLength: 4 }),
                    fc.integer({ min: 2, max: 3 }),
                )
            ),
            async ([nodes, constraints, gSize]) => {
                const memberIds = nodes.slice(0, gSize).map(n => n.id);
                const group: LayoutGroup = {
                    name: 'G0', nodeIds: memberIds, keyNodeId: memberIds[0],
                    showLabel: true, sourceConstraint: GBF,
                };
                const layout = buildLayout(nodes, constraints, undefined, [group]);
                await checkModalAgainstOracle(layout, { canExactOrdering: false, canExactAlignment: false });
            }
        ), { numRuns: MODAL_RUNS, seed: MODAL_SEED, timeout: 120_000 });
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
