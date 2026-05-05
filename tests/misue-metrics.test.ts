/**
 * Tabletop unit tests for the Misue mental-map battery.
 *
 * Each test uses a 3-4 node fixture with hand-computed expected
 * values, asserted exactly. Property-based invariants (identity /
 * translation / shuffle baselines) live in
 * `sequence-policy-metrics-pbt.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  orthogonalOrderingPreservation,
  knnJaccard,
  edgeCrossings,
  edgeCrossingsDelta,
  directionalCoherence,
  stableQuietRatio,
  type CrossingEdge,
} from '../src/evaluation/consistency-metrics';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';

const IDENTITY_TRANSFORM = { k: 1, x: 0, y: 0 };

function state(entries: Array<[string, number, number]>): LayoutState {
  return {
    positions: entries.map(([id, x, y]) => ({ id, x, y })),
    transform: IDENTITY_TRANSFORM,
  };
}

// ──────────────────────────────────────────────────────────────────
// orthogonalOrderingPreservation
// ──────────────────────────────────────────────────────────────────

describe('orthogonalOrderingPreservation', () => {
  it('returns 1 when prev == curr (identity)', () => {
    const s = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10]]);
    expect(orthogonalOrderingPreservation(s, s)).toBe(1);
  });

  it('returns 1 under uniform translation', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10]]);
    const curr = state([['A', 100, 50], ['B', 110, 50], ['C', 100, 60]]);
    expect(orthogonalOrderingPreservation(prev, curr)).toBe(1);
  });

  it('counts a swapped pair as un-preserved', () => {
    // 3 nodes — 3 unordered pairs. Swap A↔B in x: (A,B) breaks,
    // (A,C) flips its x relation w.r.t. C, (B,C) flips its x relation
    // — only the (A,C) ↔ B swap matters. Concretely:
    //   prev:  A(0,0)  B(10,0)  C(0,10)        — 3 pairs ordered
    //   curr:  A(10,0) B(0,0)   C(0,10)        — A↔B swapped
    // Pair (A, B): x relation flipped     → broken
    // Pair (A, C): x flipped (A was =, now > C) → broken
    // Pair (B, C): x relation flipped     → broken
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10]]);
    const curr = state([['A', 10, 0], ['B', 0, 0], ['C', 0, 10]]);
    // 0 of 3 pairs preserved.
    expect(orthogonalOrderingPreservation(prev, curr)).toBe(0);
  });

  it('returns null for fewer than 2 persisting nodes', () => {
    const prev = state([['A', 0, 0]]);
    const curr = state([['A', 0, 0]]);
    expect(orthogonalOrderingPreservation(prev, curr)).toBeNull();
  });

  it('honors restrictTo by ignoring excluded nodes', () => {
    // A and B keep their L/R relation; C swaps with A in y.
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10]]);
    const curr = state([['A', 0, 100], ['B', 10, 100], ['C', 0, 0]]);
    // Restrict to {A, B}: only their pair, ordering preserved → 1.
    expect(orthogonalOrderingPreservation(prev, curr, new Set(['A', 'B']))).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// knnJaccard
// ──────────────────────────────────────────────────────────────────

describe('knnJaccard', () => {
  it('returns 1 when prev == curr (identity)', () => {
    const s = state([
      ['A', 0, 0], ['B', 1, 0], ['C', 2, 0], ['D', 3, 0], ['E', 4, 0],
    ]);
    expect(knnJaccard(s, s, 2)).toBe(1);
  });

  it('returns 1 under uniform translation', () => {
    const prev = state([
      ['A', 0, 0], ['B', 1, 0], ['C', 2, 0], ['D', 3, 0], ['E', 4, 0],
    ]);
    const curr = state([
      ['A', 100, 50], ['B', 101, 50], ['C', 102, 50], ['D', 103, 50], ['E', 104, 50],
    ]);
    expect(knnJaccard(prev, curr, 2)).toBe(1);
  });

  it('returns null when fewer than k+1 persisting nodes exist', () => {
    const prev = state([['A', 0, 0], ['B', 1, 0]]);
    expect(knnJaccard(prev, prev, 3)).toBeNull();
  });

  it('drops to a fraction < 1 when a node moves to a new cluster', () => {
    // Linear chain. With k=1 each node's nearest neighbor is its
    // chain-neighbor. Move E from x=4 to x=-1 — now A's NN is E, not B.
    const prev = state([
      ['A', 0, 0], ['B', 1, 0], ['C', 2, 0], ['D', 3, 0], ['E', 4, 0],
    ]);
    const curr = state([
      ['A', 0, 0], ['B', 1, 0], ['C', 2, 0], ['D', 3, 0], ['E', -1, 0],
    ]);
    const v = knnJaccard(prev, curr, 1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// edgeCrossings / edgeCrossingsDelta
// ──────────────────────────────────────────────────────────────────

describe('edgeCrossings', () => {
  it('returns 0 for parallel non-crossing edges', () => {
    const s = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10], ['D', 10, 10]]);
    const edges: CrossingEdge[] = [
      { source: 'A', target: 'B' },
      { source: 'C', target: 'D' },
    ];
    expect(edgeCrossings(s, edges)).toBe(0);
  });

  it('detects a single X crossing', () => {
    const s = state([['A', 0, 0], ['B', 10, 10], ['C', 0, 10], ['D', 10, 0]]);
    const edges: CrossingEdge[] = [
      { source: 'A', target: 'B' }, // diagonal /
      { source: 'C', target: 'D' }, // diagonal \
    ];
    expect(edgeCrossings(s, edges)).toBe(1);
  });

  it('does not count incident edges as crossings', () => {
    // Two edges share node A. They should not count as crossing each
    // other even though they meet at A.
    const s = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10]]);
    const edges: CrossingEdge[] = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
    ];
    expect(edgeCrossings(s, edges)).toBe(0);
  });
});

describe('edgeCrossingsDelta', () => {
  it('is 0 when the visual entanglement is unchanged', () => {
    const s = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10], ['D', 10, 10]]);
    const edges: CrossingEdge[] = [
      { source: 'A', target: 'B' },
      { source: 'C', target: 'D' },
    ];
    expect(edgeCrossingsDelta(s, edges, s, edges)).toBe(0);
  });

  it('reports the absolute increase when a new crossing appears', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 0, 10], ['D', 10, 10]]);
    const curr = state([['A', 0, 0], ['B', 10, 10], ['C', 0, 10], ['D', 10, 0]]);
    const edges: CrossingEdge[] = [
      { source: 'A', target: 'B' },
      { source: 'C', target: 'D' },
    ];
    expect(edgeCrossingsDelta(prev, edges, curr, edges)).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// directionalCoherence
// ──────────────────────────────────────────────────────────────────

describe('directionalCoherence', () => {
  it('returns 1 when every node moves the same direction', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 20, 0]]);
    const curr = state([['A', 5, 0], ['B', 15, 0], ['C', 25, 0]]);
    const v = directionalCoherence(prev, curr, ['A', 'B', 'C']);
    expect(v).toBeCloseTo(1, 10);
  });

  it('returns 0 when two nodes move in exactly opposite directions', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0]]);
    const curr = state([['A', -5, 0], ['B', 15, 0]]);
    // A moves left, B moves right — unit vectors cancel, R = 0.
    const v = directionalCoherence(prev, curr, ['A', 'B']);
    expect(v).toBeCloseTo(0, 10);
  });

  it('excludes zero-drift nodes from the count', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0], ['C', 20, 0]]);
    const curr = state([['A', 5, 0], ['B', 10, 0], ['C', 25, 0]]);
    // Only A and C move — both rightward. Resultant length = 1.
    const v = directionalCoherence(prev, curr, ['A', 'B', 'C']);
    expect(v).toBeCloseTo(1, 10);
  });

  it('returns null when no node in the set moved', () => {
    const s = state([['A', 0, 0], ['B', 10, 0]]);
    expect(directionalCoherence(s, s, ['A', 'B'])).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
// stableQuietRatio
// ──────────────────────────────────────────────────────────────────

describe('stableQuietRatio', () => {
  it('returns 1 when stable nodes really did not move', () => {
    const prev = state([['A', 0, 0], ['B', 10, 0]]);
    const curr = state([['A', 0, 0], ['B', 10, 0]]);
    expect(stableQuietRatio(prev, curr, ['A', 'B'])).toBe(1);
  });

  it('reports the fraction of stable ids whose drift stays under threshold', () => {
    const prev = state([['A', 0, 0], ['B', 0, 0], ['C', 0, 0], ['D', 0, 0]]);
    // A: 0 drift. B: 4 drift (under 5). C: 5 drift (== threshold, counts). D: 100 drift.
    const curr = state([['A', 0, 0], ['B', 0, 4], ['C', 0, 5], ['D', 0, 100]]);
    expect(stableQuietRatio(prev, curr, ['A', 'B', 'C', 'D'])).toBe(0.75);
  });

  it('returns null when no stable id persists', () => {
    const prev = state([['A', 0, 0]]);
    const curr = state([['B', 0, 0]]);
    expect(stableQuietRatio(prev, curr, ['A'])).toBeNull();
  });

  it('respects a custom threshold', () => {
    const prev = state([['A', 0, 0], ['B', 0, 0]]);
    const curr = state([['A', 0, 6], ['B', 0, 8]]);
    // threshold 7: A passes (6 ≤ 7), B fails (8 > 7) → 0.5
    expect(stableQuietRatio(prev, curr, ['A', 'B'], 7)).toBe(0.5);
  });
});
