import { describe, expect, it } from 'vitest';
import {
  resolveTemporalPolicy,
  type Position,
  type Positions
} from '../src/translators/webcola/temporal-policy';

function createPositions(entries: Array<[string, number, number]>): Positions {
  const positions: Positions = new Map();
  for (const [id, x, y] of entries) {
    positions.set(id, { x, y });
  }
  return positions;
}

function hintsToMap(hints: Array<{ id: string; x: number; y: number }>): Map<string, Position> {
  return new Map(hints.map(hint => [hint.id, { x: hint.x, y: hint.y }]));
}

describe('Temporal policies', () => {
  it('baseline policy maps matched ids to prior positions and unmatched ids to default seeds', () => {
    const policy = resolveTemporalPolicy('baseline');
    const prevPositions = createPositions([
      ['A', 10, 20],
      ['C', 30, 40]
    ]);
    const defaultSeeds = createPositions([
      ['A', 100, 200],
      ['B', 300, 400],
      ['C', 500, 600]
    ]);

    const result = policy.makeHints({
      prevPositions,
      prevTransform: null,
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
      defaultSeeds
    });

    expect(result.iterationMode).toBe('reduced');
    expect(result.hints).toEqual([
      { id: 'A', x: 10, y: 20 },
      { id: 'B', x: 300, y: 400 },
      { id: 'C', x: 30, y: 40 }
    ]);
  });

  it('transport_pan_zoom applies a uniform scale+translate transform to matched prior positions', () => {
    const policy = resolveTemporalPolicy('transport_pan_zoom');
    const prevPositions = createPositions([
      ['A', 0, 0],
      ['B', 10, 10],
      ['C', 0, 10]
    ]);
    const defaultSeeds = createPositions([
      ['A', 100, 200],
      ['B', 300, 400],
      ['C', 100, 400],
      ['D', 250, 300]
    ]);

    const result = policy.makeHints({
      prevPositions,
      prevTransform: null,
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
      defaultSeeds,
      viewport: { width: 800, height: 600 }
    });

    const hintsById = hintsToMap(result.hints);

    expect(result.iterationMode).toBe('reduced');
    expect(hintsById.get('A')!.x).toBeCloseTo(100);
    expect(hintsById.get('A')!.y).toBeCloseTo(200);
    expect(hintsById.get('B')!.x).toBeCloseTo(300);
    expect(hintsById.get('B')!.y).toBeCloseTo(400);
    expect(hintsById.get('C')!.x).toBeCloseTo(100);
    expect(hintsById.get('C')!.y).toBeCloseTo(400);
    expect(hintsById.get('D')!.x).toBe(250);
    expect(hintsById.get('D')!.y).toBe(300);
  });

  it('change_emphasis is deterministic for identical inputs', () => {
    const policy = resolveTemporalPolicy('change_emphasis', { changedIds: ['D'] });
    const prevPositions = createPositions([
      ['A', 20, 30],
      ['B', 40, 50],
      ['C', 60, 70]
    ]);
    const defaultSeeds = createPositions([
      ['A', 120, 130],
      ['B', 140, 150],
      ['C', 160, 170],
      ['D', 180, 190]
    ]);
    const args = {
      prevPositions,
      prevTransform: null,
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
      defaultSeeds,
      viewport: { width: 800, height: 600 }
    };

    const first = policy.makeHints(args);
    const second = policy.makeHints(args);

    expect(first.iterationMode).toBe('default');
    expect(second.iterationMode).toBe('default');
    expect(first.hints).toEqual(second.hints);
  });
});
