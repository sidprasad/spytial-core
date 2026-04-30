import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  positionalConsistency,
  relativeConsistency,
  classifyChangeEmphasisStableSet,
  type EdgeKey,
} from '../src/evaluation';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';
import {
  arbAtomIds,
  arbLayoutState,
  arbLayoutStatePair,
  arbEdgeKeyArray,
} from './helpers/sequence-policy-arbitraries';

/**
 * Property-based tests for the pure metric functions in
 * `src/evaluation/penlloy-metrics.ts`.
 *
 * No solver, no policies — just mathematical invariants that should
 * hold for any input. Cheap (microseconds per trial) so trial counts
 * are 200 and the whole file runs in under a second.
 *
 * The example-based tests in `sequence-policy-consistency-metrics.test.ts`
 * are the next layer up; these defend the metric algebra those tests
 * rely on.
 */

const NUM_RUNS = 200;

const POS_TOL = 1e-6;

/** Translate every position in a LayoutState by `(dx, dy)`. */
const translate = (s: LayoutState, dx: number, dy: number): LayoutState => ({
  positions: s.positions.map(p => ({ id: p.id, x: p.x + dx, y: p.y + dy })),
  transform: s.transform,
});

// ──────────────────────────────────────────────────────────────────
// positionalConsistency
// ──────────────────────────────────────────────────────────────────

describe('positionalConsistency — algebraic invariants', () => {
  it('is non-negative for any input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))
        ),
        ({ prev, curr }) => {
          expect(positionalConsistency(prev, curr)).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('is symmetric: positional(D, D′) === positional(D′, D)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))
        ),
        ({ prev, curr }) => {
          const a = positionalConsistency(prev, curr);
          const b = positionalConsistency(curr, prev);
          expect(Math.abs(a - b)).toBeLessThanOrEqual(POS_TOL);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('is invariant under shared translation: positional(D+t, D′+t) === positional(D, D′)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n => arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))),
        fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
        ({ prev, curr }, dx, dy) => {
          const base = positionalConsistency(prev, curr);
          const translated = positionalConsistency(translate(prev, dx, dy), translate(curr, dx, dy));
          // Use a relative tolerance scaled by the magnitude — float
          // ε grows with displacement squared.
          expect(Math.abs(base - translated)).toBeLessThanOrEqual(Math.max(POS_TOL, base * 1e-9 + 1e-6));
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('restrict-to subset is monotone: subset metric ≤ full metric', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids =>
            fc.tuple(
              arbLayoutStatePair(ids),
              fc.subarray(ids, { minLength: 0, maxLength: ids.length })
            )
          )
        ),
        ([{ prev, curr }, subsetIds]) => {
          const subset = new Set(subsetIds);
          const full = positionalConsistency(prev, curr);
          const restricted = positionalConsistency(prev, curr, subset);
          expect(restricted).toBeLessThanOrEqual(full + POS_TOL);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// relativeConsistency
// ──────────────────────────────────────────────────────────────────

describe('relativeConsistency — algebraic invariants', () => {
  it('is non-negative for any input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids =>
            fc.tuple(
              arbLayoutStatePair(ids),
              arbEdgeKeyArray(ids),
              arbEdgeKeyArray(ids)
            )
          )
        ),
        ([{ prev, curr }, prevEdges, currEdges]) => {
          const m = relativeConsistency(prev, prevEdges, curr, currEdges);
          expect(m).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('is invariant under shared translation of either frame (edge vectors are differences)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids =>
            fc.tuple(arbLayoutStatePair(ids), arbEdgeKeyArray(ids), arbEdgeKeyArray(ids))
          )
        ),
        fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
        ([{ prev, curr }, prevEdges, currEdges], dx, dy) => {
          const base = relativeConsistency(prev, prevEdges, curr, currEdges);
          const shifted = relativeConsistency(translate(prev, dx, dy), prevEdges, translate(curr, dx, dy), currEdges);
          expect(Math.abs(base - shifted)).toBeLessThanOrEqual(Math.max(POS_TOL, base * 1e-9 + 1e-6));
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('disjoint edge sets yield zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain(n => arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))),
        ({ prev, curr }) => {
          // Make the two edge sets clearly disjoint by using different `rel` values.
          const ids = prev.positions.map(p => p.id);
          const prevEdges: EdgeKey[] = ids.length >= 2
            ? [{ source: ids[0], target: ids[1], rel: 'PREV_ONLY' }]
            : [];
          const currEdges: EdgeKey[] = ids.length >= 2
            ? [{ source: ids[0], target: ids[1], rel: 'CURR_ONLY' }]
            : [];
          expect(relativeConsistency(prev, prevEdges, curr, currEdges)).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('restrictToNodes subset is monotone: subset metric ≤ full metric', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }).chain(n =>
          arbAtomIds(n).chain(ids =>
            fc.tuple(
              arbLayoutStatePair(ids),
              arbEdgeKeyArray(ids),
              arbEdgeKeyArray(ids),
              fc.subarray(ids, { minLength: 0, maxLength: ids.length })
            )
          )
        ),
        ([{ prev, curr }, prevEdges, currEdges, subsetIds]) => {
          const subset = new Set(subsetIds);
          const full = relativeConsistency(prev, prevEdges, curr, currEdges);
          const restricted = relativeConsistency(prev, prevEdges, curr, currEdges, subset);
          expect(restricted).toBeLessThanOrEqual(full + POS_TOL);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

// ──────────────────────────────────────────────────────────────────
// classifyChangeEmphasisStableSet
// ──────────────────────────────────────────────────────────────────

describe('classifyChangeEmphasisStableSet — invariants', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))
        ),
        ({ prev, curr }) => {
          const a = classifyChangeEmphasisStableSet(prev, curr);
          const b = classifyChangeEmphasisStableSet(prev, curr);
          expect([...a].sort()).toEqual([...b].sort());
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('every classified id appears in the prior frame', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))
        ),
        ({ prev, curr }) => {
          const stable = classifyChangeEmphasisStableSet(prev, curr);
          const priorIds = new Set(prev.positions.map(p => p.id));
          for (const id of stable) {
            expect(priorIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('classified ids are exactly those within the per-axis tolerance ball', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).chain(n =>
          arbAtomIds(n).chain(ids => arbLayoutStatePair(ids))
        ),
        fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }),
        ({ prev, curr }, tol) => {
          const stable = classifyChangeEmphasisStableSet(prev, curr, tol);
          const priorById = new Map(prev.positions.map(p => [p.id, p]));

          // Every classified id is within tolerance on both axes.
          for (const id of stable) {
            const p = priorById.get(id)!;
            const q = curr.positions.find(c => c.id === id)!;
            expect(Math.abs(p.x - q.x)).toBeLessThanOrEqual(tol);
            expect(Math.abs(p.y - q.y)).toBeLessThanOrEqual(tol);
          }

          // Conversely: every id with both positions within tolerance is classified.
          for (const q of curr.positions) {
            const p = priorById.get(q.id);
            if (!p) continue;
            const within = Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol;
            if (within) {
              expect(stable.has(q.id)).toBe(true);
            }
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});

// Silence unused-import warnings (the module is imported for type only,
// but TS strict-mode catches it).
void (null as unknown as LayoutState | null);
void (null as unknown as ReturnType<typeof arbLayoutState> | null);
