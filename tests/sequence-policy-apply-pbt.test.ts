import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec, LayoutSpec } from '../src/layout/layoutspec';
import {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  type SequencePolicyContext,
} from '../src/translators/webcola/sequence-policy';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';
import { arbInstancePair, arbLayoutState } from './helpers/sequence-policy-arbitraries';

/**
 * Property-based tests for the four built-in sequence policies'
 * `apply` methods.
 *
 * No solver — these properties hit the policy layer only, so each
 * trial is microseconds. Trial counts are 100 per property; the file
 * runs in well under a second.
 *
 * The example-based tests in `sequence-policy-consistency-metrics.test.ts`
 * defend each policy on five hand-picked scenarios; these properties
 * do the same on randomly-generated inputs and surface the cases the
 * examples missed.
 */

const NUM_RUNS = 100;

// ──────────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────────

const trivialSpec: LayoutSpec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: next
      directions:
        - right
`);

const VIEWPORT_BOUNDS = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

/**
 * Build a complete SequencePolicyContext from a (prev, curr) instance
 * pair plus a generated prior LayoutState over the prev atoms. Supplies
 * an explicit viewport so policies that rely on it (changeEmphasis,
 * randomPositioning) get deterministic clamp behaviour.
 */
async function ctxFor(
  prev: IJsonDataInstance,
  curr: IJsonDataInstance,
  priorState: LayoutState
): Promise<SequencePolicyContext> {
  return {
    priorState,
    prevInstance: new JSONDataInstance(prev),
    currInstance: new JSONDataInstance(curr),
    spec: trivialSpec,
    viewportBounds: VIEWPORT_BOUNDS,
  };
}

/**
 * Reset stability's singleton closure cache before a trial. The
 * docstring on `stability` says: "An empty priorState signals a fresh
 * sequence start — clear all memory." We exploit that here.
 */
function resetStabilityCache() {
  const dummy = new JSONDataInstance({ atoms: [], relations: [] });
  stability.apply({
    priorState: { positions: [], transform: { k: 1, x: 0, y: 0 } },
    prevInstance: dummy,
    currInstance: dummy,
    spec: trivialSpec,
  });
}

/**
 * Generator for a complete (prev, curr, prior) triple that feeds any
 * policy's `apply`. The prior LayoutState is over prev atoms — the
 * realistic scenario for a sequence renderer.
 */
const arbPolicyInput = arbInstancePair({ minAtoms: 1, maxAtoms: 5 }).chain(pair => {
  const prevAtomIds = pair.prev.atoms.map(a => a.id);
  return arbLayoutState(prevAtomIds).map(priorState => ({ ...pair, priorState }));
});

// ──────────────────────────────────────────────────────────────────
// ignoreHistory
// ──────────────────────────────────────────────────────────────────

describe('ignoreHistory.apply — invariants', () => {
  it('always returns { undefined, false } regardless of context', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const result = ignoreHistory.apply(ctx);
        expect(result.effectivePriorState).toBeUndefined();
        expect(result.useReducedIterations).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// stability
// ──────────────────────────────────────────────────────────────────

describe('stability.apply — invariants', () => {
  it('preserves prior x,y exactly for atoms shared between prev and curr', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        resetStabilityCache();
        const ctx = await ctxFor(prev, curr, priorState);
        const result = stability.apply(ctx);

        // Per the docstring: stability "preserves node positions for
        // nodes present in the current step." For atoms in BOTH prev
        // (priorState) and curr, the output position must equal the
        // prior position EXACTLY.
        const priorById = new Map(priorState.positions.map(p => [p.id, p]));
        const currIds = new Set(curr.atoms.map(a => a.id));

        const out = result.effectivePriorState;
        expect(out).toBeDefined();
        const outById = new Map(out!.positions.map(p => [p.id, p]));

        for (const [id, p] of priorById) {
          if (!currIds.has(id)) continue; // not in curr, may be dropped
          const q = outById.get(id);
          expect(q, `shared atom ${id} should appear in stability output`).toBeDefined();
          expect(q!.x).toBe(p.x);
          expect(q!.y).toBe(p.y);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('useReducedIterations is true whenever effectivePriorState is defined', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        resetStabilityCache();
        const ctx = await ctxFor(prev, curr, priorState);
        const result = stability.apply(ctx);

        if (result.effectivePriorState !== undefined) {
          expect(result.useReducedIterations).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// changeEmphasis
// ──────────────────────────────────────────────────────────────────

/** Documented jitter radius range (sequence-policy.ts:279-282). */
const JITTER_MIN = 30.5; // 36 × 0.85, with epsilon for float
const JITTER_MAX = 76;   // 66 × 1.15, with epsilon

describe('changeEmphasis.apply — invariants', () => {
  it('is deterministic: same (prev, curr, prior) yields identical output', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const a = changeEmphasis.apply(ctx);
        const b = changeEmphasis.apply(ctx);
        expect(a.useReducedIterations).toBe(b.useReducedIterations);
        expect(a.effectivePriorState?.positions).toEqual(b.effectivePriorState?.positions);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('output positions all lie within the resolved viewport bounds', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const result = changeEmphasis.apply(ctx);
        if (!result.effectivePriorState) return;

        // The policy resolves bounds from priorState if our explicit
        // viewport is finite. We supplied finite bounds, so use those.
        for (const p of result.effectivePriorState.positions) {
          expect(p.x, `${p.id}.x out of bounds`).toBeGreaterThanOrEqual(VIEWPORT_BOUNDS.minX);
          expect(p.x, `${p.id}.x out of bounds`).toBeLessThanOrEqual(VIEWPORT_BOUNDS.maxX);
          expect(p.y, `${p.id}.y out of bounds`).toBeGreaterThanOrEqual(VIEWPORT_BOUNDS.minY);
          expect(p.y, `${p.id}.y out of bounds`).toBeLessThanOrEqual(VIEWPORT_BOUNDS.maxY);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('every node displaced from prior is displaced by a distance within the documented jitter range', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const result = changeEmphasis.apply(ctx);
        if (!result.effectivePriorState) return;

        const priorById = new Map(priorState.positions.map(p => [p.id, p]));
        for (const p of result.effectivePriorState.positions) {
          const q = priorById.get(p.id);
          if (!q) continue; // new atom — no prior to compare against
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          // Either unchanged (== 0) or displaced within jitter range.
          // Jitter is clamped to viewport bounds, so the LOWER bound
          // can be 0 if the unclamped jitter would have escaped the
          // viewport (the clamp pulls back). The UPPER bound is
          // always honoured: jitter never exceeds JITTER_MAX before
          // clamping, and clamping only shortens it.
          if (dist > 0) {
            expect(dist, `${p.id} displacement ${dist.toFixed(2)} > JITTER_MAX ${JITTER_MAX}`).toBeLessThanOrEqual(JITTER_MAX);
          }
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// randomPositioning
// ──────────────────────────────────────────────────────────────────

describe('randomPositioning.apply — invariants', () => {
  it('every atom in currInstance appears in the output exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const result = randomPositioning.apply(ctx);
        const out = result.effectivePriorState;
        expect(out).toBeDefined();

        const outIds = out!.positions.map(p => p.id);
        const currIds = curr.atoms.map(a => a.id);

        // Every curr atom appears.
        for (const id of currIds) {
          expect(outIds).toContain(id);
        }
        // No id appears more than once.
        expect(new Set(outIds).size).toBe(outIds.length);
        // No extra ids beyond curr atoms.
        expect(outIds.length).toBe(currIds.length);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('every output position lies within the requested viewport bounds', async () => {
    await fc.assert(
      fc.asyncProperty(arbPolicyInput, async ({ prev, curr, priorState }) => {
        const ctx = await ctxFor(prev, curr, priorState);
        const result = randomPositioning.apply(ctx);
        const out = result.effectivePriorState;
        expect(out).toBeDefined();

        for (const p of out!.positions) {
          expect(p.x).toBeGreaterThanOrEqual(VIEWPORT_BOUNDS.minX);
          expect(p.x).toBeLessThanOrEqual(VIEWPORT_BOUNDS.maxX);
          expect(p.y).toBeGreaterThanOrEqual(VIEWPORT_BOUNDS.minY);
          expect(p.y).toBeLessThanOrEqual(VIEWPORT_BOUNDS.maxY);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
