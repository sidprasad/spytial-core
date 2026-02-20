import { describe, expect, it, vi } from 'vitest';
import {
  normalizeTemporalPolicyName,
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
  it('seed_default ignores prior positions and uses default seeds', () => {
    const policy = resolveTemporalPolicy('seed_default');
    const prevPositions = createPositions([
      ['A', 10, 20],
      ['B', 30, 40]
    ]);
    const defaultSeeds = createPositions([
      ['A', 100, 200],
      ['B', 300, 400],
      ['C', 500, 600]
    ]);

    const result = policy.makeHints({
      prevPositions,
      prevTransform: null,
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      defaultSeeds
    });

    expect(result.iterationMode).toBe('default');
    expect(result.hints).toEqual([
      { id: 'A', x: 100, y: 200 },
      { id: 'B', x: 300, y: 400 },
      { id: 'C', x: 500, y: 600 }
    ]);
  });

  it('seed_continuity_raw maps matched ids to prior positions and unmatched ids to default seeds', () => {
    const policy = resolveTemporalPolicy('seed_continuity_raw');
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

  it('seed_continuity_transport applies a uniform scale+translate transform to matched prior positions', () => {
    const policy = resolveTemporalPolicy('seed_continuity_transport');
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

  it('seed_change_emphasis keeps stable nodes and randomly reflows changed nodes', () => {
    const policy = resolveTemporalPolicy('seed_change_emphasis', { changedIds: ['D'] });
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

    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.25) // angle => PI/2
      .mockReturnValueOnce(0.5); // magnitude => radius/2

    const result = policy.makeHints({
      prevPositions,
      prevTransform: null,
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
      defaultSeeds,
      viewport: { width: 800, height: 600 }
    });
    randomSpy.mockRestore();

    const hintsById = hintsToMap(result.hints);
    expect(result.iterationMode).toBe('default');

    // Stable/matched IDs keep continuity-raw positions.
    expect(hintsById.get('A')).toEqual({ x: 20, y: 30 });
    expect(hintsById.get('B')).toEqual({ x: 40, y: 50 });
    expect(hintsById.get('C')).toEqual({ x: 60, y: 70 });

    // Changed ID uses random jitter around stable centroid (40, 50) with radius 18.
    expect(hintsById.get('D')!.x).toBeCloseTo(40, 6);
    expect(hintsById.get('D')!.y).toBeCloseTo(59, 6);
  });

  it('normalizes legacy aliases to canonical policy names', () => {
    expect(normalizeTemporalPolicyName('baseline')).toBe('seed_continuity_raw');
    expect(normalizeTemporalPolicyName('transport_pan_zoom')).toBe('seed_continuity_transport');
    expect(normalizeTemporalPolicyName('change_emphasis')).toBe('seed_change_emphasis');
  });
});
