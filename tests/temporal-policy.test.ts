import { describe, expect, it, vi } from 'vitest';
import { applyTemporalPolicy } from '../src/translators/webcola/temporal-policy';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';

function makeState(entries: Array<[string, number, number]>): LayoutState {
  return {
    positions: entries.map(([id, x, y]) => ({ id, x, y })),
    transform: { k: 1, x: 0, y: 0 }
  };
}

describe('applyTemporalPolicy', () => {
  it('ignore_history returns no prior state regardless of input', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const result = applyTemporalPolicy(prior, 'ignore_history');

    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('ignore_history is the default mode', () => {
    const prior = makeState([['A', 10, 20]]);
    const result = applyTemporalPolicy(prior);

    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('returns fresh layout when priorState is undefined', () => {
    const result = applyTemporalPolicy(undefined, 'stability');
    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('returns fresh layout when priorState has empty positions', () => {
    const result = applyTemporalPolicy({ positions: [], transform: { k: 1, x: 0, y: 0 } }, 'stability');
    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('stability passes through prior state and enables reduced iterations', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const result = applyTemporalPolicy(prior, 'stability');

    expect(result.effectivePriorState).toBe(prior);
    expect(result.useReducedIterations).toBe(true);
  });

  it('change_emphasis without changedNodeIds falls back to stability-like behavior', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const result = applyTemporalPolicy(prior, 'change_emphasis');

    // No changed IDs -- all positions preserved
    expect(result.effectivePriorState).toBe(prior);
    expect(result.useReducedIterations).toBe(false);
  });

  it('change_emphasis preserves stable nodes and jitters changed nodes', () => {
    const prior = makeState([['A', 20, 30], ['B', 40, 50], ['C', 60, 70]]);

    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.25) // angle
      .mockReturnValueOnce(0.5); // magnitude

    const result = applyTemporalPolicy(prior, 'change_emphasis', ['C']);
    randomSpy.mockRestore();

    expect(result.useReducedIterations).toBe(false);
    expect(result.effectivePriorState).toBeDefined();

    const positions = result.effectivePriorState!.positions;
    expect(positions).toHaveLength(3);

    // Stable nodes keep their positions
    const posA = positions.find(p => p.id === 'A')!;
    const posB = positions.find(p => p.id === 'B')!;
    expect(posA).toEqual({ id: 'A', x: 20, y: 30 });
    expect(posB).toEqual({ id: 'B', x: 40, y: 50 });

    // Changed node is jittered around centroid of stable nodes (A, B)
    // Centroid = (30, 40), jitter with angle=PI/2, magnitude=9
    const posC = positions.find(p => p.id === 'C')!;
    expect(posC.x).toBeCloseTo(30, 0); // centroid.x + jitter.x
    expect(posC.y).toBeCloseTo(49, 0); // centroid.y + jitter.y

    // Transform is preserved
    expect(result.effectivePriorState!.transform).toEqual(prior.transform);
  });
});
