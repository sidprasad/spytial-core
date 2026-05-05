/**
 * Tests for the appropriateness-oracle layouts.
 *
 * `positionalOracle` is the constraint-feasible projection of the
 * prior layout. `pairwiseDistanceOracle` is the constraint-feasible
 * layout that minimizes pairwise-distance deviation from prior.
 */

import { describe, it, expect } from 'vitest';
import {
  positionalOracle,
  pairwiseDistanceOracle,
} from '../src/evaluation/oracle-layouts';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';
import type { LayoutConstraint } from '../src/layout/interfaces';

const IDENTITY_TRANSFORM = { k: 1, x: 0, y: 0 };

function state(entries: Array<[string, number, number]>): LayoutState {
  return {
    positions: entries.map(([id, x, y]) => ({ id, x, y })),
    transform: IDENTITY_TRANSFORM,
  };
}

function makeNode(id: string, width: number = 50, height: number = 30) {
  return {
    id,
    label: id,
    color: 'gray',
    width,
    height,
    mostSpecificType: 'Node',
    types: ['Node'],
    showLabels: true,
  } as any;
}

function leftConstraint(leftId: string, rightId: string, minDistance: number): LayoutConstraint {
  return {
    type: 'left',
    left: makeNode(leftId),
    right: makeNode(rightId),
    minDistance,
  } as unknown as LayoutConstraint;
}

function topConstraint(topId: string, bottomId: string, minDistance: number): LayoutConstraint {
  return {
    type: 'top',
    top: makeNode(topId),
    bottom: makeNode(bottomId),
    minDistance,
  } as unknown as LayoutConstraint;
}

function alignmentConstraint(
  node1Id: string,
  node2Id: string,
  axis: 'x' | 'y'
): LayoutConstraint {
  return {
    type: 'alignment',
    node1: makeNode(node1Id),
    node2: makeNode(node2Id),
    axis,
  } as unknown as LayoutConstraint;
}

// ──────────────────────────────────────────────────────────────────
// positionalOracle
// ──────────────────────────────────────────────────────────────────

describe('positionalOracle', () => {
  it('returns prior unchanged when constraints are already satisfied', () => {
    // A.x = 0, B.x = 100. Constraint: A.x + 10 ≤ B.x. Already satisfied
    // (gap = 100, required = 10). No movement needed.
    const prev = state([['A', 0, 0], ['B', 100, 0]]);
    const constraints = [leftConstraint('A', 'B', 10)];

    const oracle = positionalOracle(prev, constraints);

    const aOut = oracle.positions.find(p => p.id === 'A')!;
    const bOut = oracle.positions.find(p => p.id === 'B')!;
    expect(aOut.x).toBeCloseTo(0, 5);
    expect(bOut.x).toBeCloseTo(100, 5);
    expect(aOut.y).toBeCloseTo(0, 5);
    expect(bOut.y).toBeCloseTo(0, 5);
  });

  it('moves the violating node to satisfy a Left constraint', () => {
    // Prior: A.x = 0, B.x = 5. Constraint: A.x + 20 ≤ B.x. Violated by 15.
    // The closest feasible point either pulls A left or B right; Kiwi
    // splits the displacement such that the gap becomes 20 in some
    // way. The total displacement is at least 15.
    const prev = state([['A', 0, 0], ['B', 5, 0]]);
    const constraints = [leftConstraint('A', 'B', 20)];

    const oracle = positionalOracle(prev, constraints);

    const aOut = oracle.positions.find(p => p.id === 'A')!;
    const bOut = oracle.positions.find(p => p.id === 'B')!;

    // Constraint must now hold (within numerical tolerance).
    expect(bOut.x - aOut.x).toBeGreaterThanOrEqual(20 - 1e-6);
    // Y untouched (constraint is x-only).
    expect(aOut.y).toBeCloseTo(0, 5);
    expect(bOut.y).toBeCloseTo(0, 5);
  });

  it('moves only x, leaves y alone, for an x-only constraint', () => {
    const prev = state([['A', 0, 100], ['B', 0, 200]]);
    const constraints = [leftConstraint('A', 'B', 50)];

    const oracle = positionalOracle(prev, constraints);

    const aOut = oracle.positions.find(p => p.id === 'A')!;
    const bOut = oracle.positions.find(p => p.id === 'B')!;
    // Y should be unchanged regardless of constraint.
    expect(aOut.y).toBeCloseTo(100, 5);
    expect(bOut.y).toBeCloseTo(200, 5);
    // X must satisfy B.x - A.x ≥ 50.
    expect(bOut.x - aOut.x).toBeGreaterThanOrEqual(50 - 1e-6);
  });

  it('honors an alignment constraint', () => {
    // A.y = 10, B.y = 20. Alignment on y. Closest feasible: a.y == b.y.
    const prev = state([['A', 0, 10], ['B', 0, 20]]);
    const constraints = [alignmentConstraint('A', 'B', 'y')];

    const oracle = positionalOracle(prev, constraints);

    const aOut = oracle.positions.find(p => p.id === 'A')!;
    const bOut = oracle.positions.find(p => p.id === 'B')!;
    expect(aOut.y).toBeCloseTo(bOut.y, 5);
  });

  it('returns empty positions when prior is empty', () => {
    const prev = state([]);
    const oracle = positionalOracle(prev, []);
    expect(oracle.positions).toEqual([]);
  });

  it('preserves transform from prior', () => {
    const prev: LayoutState = {
      positions: [{ id: 'A', x: 0, y: 0 }],
      transform: { k: 1.5, x: 10, y: 20 },
    };
    const oracle = positionalOracle(prev, []);
    expect(oracle.transform).toEqual({ k: 1.5, x: 10, y: 20 });
  });
});

// ──────────────────────────────────────────────────────────────────
// pairwiseDistanceOracle
// ──────────────────────────────────────────────────────────────────

describe('pairwiseDistanceOracle', () => {
  it('preserves pairwise distances exactly when no constraints are present', () => {
    // Initialize at prior; target distances = prior distances; cola
    // sees zero stress and should not move anything.
    const prev = state([
      ['A', 0, 0],
      ['B', 100, 0],
      ['C', 0, 80],
      ['D', 100, 80],
    ]);

    const oracle = pairwiseDistanceOracle(prev, []);

    // Compare pairwise-distance matrices.
    for (let i = 0; i < prev.positions.length; i++) {
      for (let j = i + 1; j < prev.positions.length; j++) {
        const ai = prev.positions[i];
        const aj = prev.positions[j];
        const bi = oracle.positions.find(p => p.id === ai.id)!;
        const bj = oracle.positions.find(p => p.id === aj.id)!;

        const dPrev = Math.hypot(aj.x - ai.x, aj.y - ai.y);
        const dCurr = Math.hypot(bj.x - bi.x, bj.y - bi.y);
        // Stress majorization should leave the configuration alone
        // when it's already optimal — small numerical jitter only.
        expect(Math.abs(dCurr - dPrev)).toBeLessThan(1);
      }
    }
  });

  it('returns the (deep-copied) prior for fewer than 2 nodes', () => {
    const prev = state([['A', 5, 10]]);
    const oracle = pairwiseDistanceOracle(prev, []);
    expect(oracle.positions).toEqual([{ id: 'A', x: 5, y: 10 }]);
    // Must not be the same reference (we promised a deep copy).
    expect(oracle.positions[0]).not.toBe(prev.positions[0]);
  });

  it('respects a Left constraint while keeping pairwise distances close', () => {
    // Prior has A and B at the same x. Add Left constraint forcing
    // B.x ≥ A.x + 50. Oracle must satisfy the constraint; the rest of
    // the configuration adapts to keep pairwise distances close.
    const prev = state([
      ['A', 0, 0],
      ['B', 0, 0.001], // tiny offset to keep the virtual link non-degenerate
      ['C', 50, 50],
    ]);
    const constraints = [leftConstraint('A', 'B', 50)];

    const oracle = pairwiseDistanceOracle(prev, constraints, { iterations: 100 });

    const aOut = oracle.positions.find(p => p.id === 'A')!;
    const bOut = oracle.positions.find(p => p.id === 'B')!;
    expect(bOut.x - aOut.x).toBeGreaterThanOrEqual(50 - 1);
  });

  it('preserves transform from prior', () => {
    const prev: LayoutState = {
      positions: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 100, y: 0 },
      ],
      transform: { k: 2, x: 5, y: 10 },
    };
    const oracle = pairwiseDistanceOracle(prev, []);
    expect(oracle.transform).toEqual({ k: 2, x: 5, y: 10 });
  });
});

// ──────────────────────────────────────────────────────────────────
// Oracle ↔ stability sanity check
// ──────────────────────────────────────────────────────────────────

describe('oracle / stability sanity', () => {
  it('positional oracle equals prior when no constraints — `stability` will match by construction', () => {
    const prev = state([
      ['A', 10, 20],
      ['B', 50, 60],
      ['C', -30, 100],
    ]);
    const oracle = positionalOracle(prev, []);

    for (const p of prev.positions) {
      const o = oracle.positions.find(q => q.id === p.id)!;
      expect(o.x).toBeCloseTo(p.x, 5);
      expect(o.y).toBeCloseTo(p.y, 5);
    }
  });
});
