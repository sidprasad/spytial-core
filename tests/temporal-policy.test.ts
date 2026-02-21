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
  it('ignore_history ignores prior positions and uses default seeds', () => {
    const policy = resolveTemporalPolicy('ignore_history');
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

  it('stability maps matched ids to prior positions and unmatched ids to default seeds', () => {
    const policy = resolveTemporalPolicy('stability');
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

  it('change_emphasis keeps stable nodes and randomly reflows changed nodes', () => {
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

    // Stable/matched IDs keep stability positions.
    expect(hintsById.get('A')).toEqual({ x: 20, y: 30 });
    expect(hintsById.get('B')).toEqual({ x: 40, y: 50 });
    expect(hintsById.get('C')).toEqual({ x: 60, y: 70 });

    // Changed ID uses random jitter around stable centroid (40, 50) with radius 18.
    expect(hintsById.get('D')!.x).toBeCloseTo(40, 6);
    expect(hintsById.get('D')!.y).toBeCloseTo(59, 6);
  });

  it('normalizes legacy aliases to canonical policy names', () => {
    expect(normalizeTemporalPolicyName('seed_default')).toBe('ignore_history');
    expect(normalizeTemporalPolicyName('seed_continuity_raw')).toBe('stability');
    expect(normalizeTemporalPolicyName('seed_continuity_transport')).toBe('stability');
    expect(normalizeTemporalPolicyName('seed_change_emphasis')).toBe('change_emphasis');
    expect(normalizeTemporalPolicyName('baseline')).toBe('stability');
    expect(normalizeTemporalPolicyName('transport_pan_zoom')).toBe('stability');
  });
});
