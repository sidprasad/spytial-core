import { describe, expect, it } from 'vitest';
import {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  getSequencePolicy,
  registerSequencePolicy,
} from '../src/translators/webcola/sequence-policy';
import type {
  SequencePolicy,
  SequencePolicyContext,
  SequenceViewportBounds,
} from '../src/translators/webcola/sequence-policy';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';
import type { IDataInstance, IAtom, IRelation, IType } from '../src/data-instance/interfaces';
import { Graph } from 'graphlib';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(entries: Array<[string, number, number]>): LayoutState {
  return {
    positions: entries.map(([id, x, y]) => ({ id, x, y })),
    transform: { k: 1, x: 0, y: 0 },
  };
}

/** Minimal IDataInstance stub for testing. */
function makeInstance(
  atoms: Array<{ id: string; type: string }>,
  relations: Array<{ name: string; tuples: string[][] }>
): IDataInstance {
  const iAtoms: IAtom[] = atoms.map(a => ({ id: a.id, type: a.type, label: a.id }));
  const iRelations: IRelation[] = relations.map((r, i) => ({
    id: `rel_${i}`,
    name: r.name,
    types: [],
    tuples: r.tuples.map(t => ({ atoms: t, types: [] })),
  }));
  return {
    getAtoms: () => iAtoms,
    getRelations: () => iRelations,
    getTypes: () => [] as IType[],
    getAtomType: () => ({ id: 'T', types: ['T'], atoms: [], isBuiltin: false }),
    applyProjections: () => { throw new Error('not implemented'); },
    generateGraph: () => new Graph(),
  };
}

/** Minimal LayoutSpec stub — current policies don't inspect it. */
const STUB_SPEC = {
  constraints: {
    orientation: { relative: [], cyclic: [] },
    alignment: [],
    grouping: { groups: [], subgroups: [] },
  },
  directives: { sizes: [], hiddenAtoms: [], icons: [], projections: [], edgeStyles: [] },
} as any;

function ctx(
  priorState: LayoutState,
  prev: IDataInstance,
  curr: IDataInstance,
  viewportBounds?: SequenceViewportBounds
): SequencePolicyContext {
  return { priorState, prevInstance: prev, currInstance: curr, spec: STUB_SPEC, viewportBounds };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------
// ignoreHistory
// ---------------------------------------------------------------------------

describe('ignoreHistory', () => {
  it('always returns no prior state', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    const result = ignoreHistory.apply(ctx(prior, inst, inst));

    expect(result.effectivePriorState).toBeUndefined();
    expect(result.useReducedIterations).toBe(false);
  });

  it('has name "ignore_history"', () => {
    expect(ignoreHistory.name).toBe('ignore_history');
  });
});

// ---------------------------------------------------------------------------
// stability
// ---------------------------------------------------------------------------

describe('stability', () => {
  it('passes through current prior positions when all nodes still exist', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const inst = makeInstance([{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }], []);
    const result = stability.apply(ctx(prior, inst, inst));

    expect(result.effectivePriorState).toEqual(prior);
    expect(result.useReducedIterations).toBe(true);
  });

  it('restores a previously seen position when a node reappears later in sequence', () => {
    const state1 = makeState([['Node1', 100, 120], ['Node2', 200, 220]]);
    const inst1 = makeInstance([{ id: 'Node1', type: 'T' }, { id: 'Node2', type: 'T' }], []);

    const state2 = makeState([['Node2', 205, 225]]);
    const inst2 = makeInstance([{ id: 'Node2', type: 'T' }], []);

    const inst3 = makeInstance([{ id: 'Node1', type: 'T' }, { id: 'Node2', type: 'T' }], []);

    // Step 1 -> 2 (Node1 disappears)
    const resultStep2 = stability.apply(ctx(state1, inst1, inst2));
    expect(resultStep2.effectivePriorState?.positions.map(p => p.id)).toEqual(['Node2']);

    // Step 2 -> 3 (Node1 reappears)
    const resultStep3 = stability.apply(ctx(state2, inst2, inst3));
    const node1 = resultStep3.effectivePriorState?.positions.find(p => p.id === 'Node1');
    const node2 = resultStep3.effectivePriorState?.positions.find(p => p.id === 'Node2');

    expect(node1).toEqual({ id: 'Node1', x: 100, y: 120 });
    expect(node2).toEqual({ id: 'Node2', x: 205, y: 225 });
  });

  it('has name "stability"', () => {
    expect(stability.name).toBe('stability');
  });
});

// ---------------------------------------------------------------------------
// changeEmphasis
// ---------------------------------------------------------------------------

describe('changeEmphasis', () => {
  it('has name "change_emphasis"', () => {
    expect(changeEmphasis.name).toBe('change_emphasis');
  });

  it('when instances are identical, all nodes are pinned (stability fallback)', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const atoms = [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }];
    const rels = [{ name: 'edge', tuples: [['A', 'B']] }];
    const inst = makeInstance(atoms, rels);

    const result = changeEmphasis.apply(ctx(prior, inst, inst));

    expect(result.effectivePriorState).toBe(prior);
    expect(result.useReducedIterations).toBe(true);
  });

  it('keeps stable nodes fixed and applies obvious deterministic jitter to changed nodes', () => {
    const prior = makeState([['A', 200, 200], ['B', 260, 260], ['C', 320, 320]]);

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B'], ['B', 'C']] }]
    );

    const viewportBounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };
    const result1 = changeEmphasis.apply(ctx(prior, prev, curr, viewportBounds));
    const result2 = changeEmphasis.apply(ctx(prior, prev, curr, viewportBounds));

    expect(result1.useReducedIterations).toBe(true);
    expect(result1.effectivePriorState!.transform).toEqual(prior.transform);

    const posA = result1.effectivePriorState!.positions.find(p => p.id === 'A');
    const posB = result1.effectivePriorState!.positions.find(p => p.id === 'B');
    const posC = result1.effectivePriorState!.positions.find(p => p.id === 'C');

    expect(posA).toEqual({ id: 'A', x: 200, y: 200 });
    expect(posB).toBeDefined();
    expect(posC).toBeDefined();

    // "obvious" jitter: changed nodes move by a meaningful amount.
    expect(distance({ x: posB!.x, y: posB!.y }, { x: 260, y: 260 })).toBeGreaterThan(20);
    expect(distance({ x: posC!.x, y: posC!.y }, { x: 320, y: 320 })).toBeGreaterThan(20);

    // Deterministic for same prev/curr pair.
    expect(result2.effectivePriorState).toEqual(result1.effectivePriorState);

    // Stay in viewport bounds.
    for (const p of result1.effectivePriorState!.positions) {
      expect(p.x).toBeGreaterThanOrEqual(viewportBounds.minX);
      expect(p.x).toBeLessThanOrEqual(viewportBounds.maxX);
      expect(p.y).toBeGreaterThanOrEqual(viewportBounds.minY);
      expect(p.y).toBeLessThanOrEqual(viewportBounds.maxY);
    }
  });

  it('detects new atoms as changed (new atoms have no prior positions)', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );

    const result = changeEmphasis.apply(ctx(prior, prev, curr));
    const ids = result.effectivePriorState!.positions.map(p => p.id);

    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).not.toContain('C');
  });

  it('filters out removed atoms while retaining current atoms', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }],
      []
    );

    const result = changeEmphasis.apply(ctx(prior, prev, curr));
    const ids = result.effectivePriorState!.positions.map(p => p.id);

    expect(ids).toContain('A');
    expect(ids).not.toContain('B');
  });

  it('adds extra emphasis to nodes that lost neighbors due to removed atoms', () => {
    const prior = makeState([['A', 200, 200], ['B', 260, 260]]);
    const viewportBounds = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B'], ['A', 'C']] }]
    );
    const currWithoutRemoval = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    const currWithRemoval = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );

    const noRemovalResult = changeEmphasis.apply(ctx(prior, prev, currWithoutRemoval, viewportBounds));
    const withRemovalResult = changeEmphasis.apply(ctx(prior, prev, currWithRemoval, viewportBounds));

    const aWithoutRemoval = noRemovalResult.effectivePriorState!.positions.find(p => p.id === 'A')!;
    const aWithRemoval = withRemovalResult.effectivePriorState!.positions.find(p => p.id === 'A')!;

    const distWithoutRemoval = distance({ x: aWithoutRemoval.x, y: aWithoutRemoval.y }, { x: 200, y: 200 });
    const distWithRemoval = distance({ x: aWithRemoval.x, y: aWithRemoval.y }, { x: 200, y: 200 });

    expect(distWithRemoval).toBeGreaterThan(distWithoutRemoval);
  });

  it('keeps jittered nodes inside a tight viewport', () => {
    const prior = makeState([['A', 95, 95]]);
    const prev = makeInstance(
      [{ id: 'A', type: 'T' }],
      []
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'A']] }]
    );

    const viewportBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const result = changeEmphasis.apply(ctx(prior, prev, curr, viewportBounds));
    const posA = result.effectivePriorState!.positions.find(p => p.id === 'A')!;

    expect(posA.x).toBeGreaterThanOrEqual(0);
    expect(posA.x).toBeLessThanOrEqual(100);
    expect(posA.y).toBeGreaterThanOrEqual(0);
    expect(posA.y).toBeLessThanOrEqual(100);
  });

  it('returns prior for two empty instances (no changes)', () => {
    const prior = makeState([['A', 10, 20]]);
    const prev = makeInstance([], []);
    const curr = makeInstance([], []);

    const result = changeEmphasis.apply(ctx(prior, prev, curr));

    expect(result.effectivePriorState).toBe(prior);
  });
});

// ---------------------------------------------------------------------------
// randomPositioning
// ---------------------------------------------------------------------------

describe('randomPositioning', () => {
  it('has name "random_positioning"', () => {
    expect(randomPositioning.name).toBe('random_positioning');
  });

  it('returns randomized positions for all current atoms within viewport bounds', () => {
    const prior = makeState([['A', 0, 0], ['B', 100, 100]]);
    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      []
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      []
    );

    const viewportBounds = { minX: -50, maxX: 50, minY: 10, maxY: 20 };
    const result = randomPositioning.apply(ctx(prior, prev, curr, viewportBounds));
    const positions = result.effectivePriorState!.positions;

    expect(result.useReducedIterations).toBe(true);
    expect(result.effectivePriorState!.transform).toEqual(prior.transform);
    expect(positions).toHaveLength(3);

    const ids = positions.map(p => p.id).sort();
    expect(ids).toEqual(['A', 'B', 'C']);

    for (const pos of positions) {
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
      expect(pos.x).toBeGreaterThanOrEqual(viewportBounds.minX);
      expect(pos.x).toBeLessThanOrEqual(viewportBounds.maxX);
      expect(pos.y).toBeGreaterThanOrEqual(viewportBounds.minY);
      expect(pos.y).toBeLessThanOrEqual(viewportBounds.maxY);
    }
  });
});

// ---------------------------------------------------------------------------
// getSequencePolicy
// ---------------------------------------------------------------------------

describe('getSequencePolicy', () => {
  it('returns ignoreHistory by name', () => {
    expect(getSequencePolicy('ignore_history')).toBe(ignoreHistory);
  });

  it('returns stability by name', () => {
    expect(getSequencePolicy('stability')).toBe(stability);
  });

  it('returns changeEmphasis by name', () => {
    expect(getSequencePolicy('change_emphasis')).toBe(changeEmphasis);
  });

  it('returns randomPositioning by name', () => {
    expect(getSequencePolicy('random_positioning')).toBe(randomPositioning);
  });

  it('defaults to ignoreHistory for unknown names', () => {
    expect(getSequencePolicy('nonexistent')).toBe(ignoreHistory);
  });
});

// ---------------------------------------------------------------------------
// registerSequencePolicy
// ---------------------------------------------------------------------------

describe('registerSequencePolicy', () => {
  it('allows registering and retrieving a custom policy', () => {
    const custom: SequencePolicy = {
      name: 'test_custom',
      apply: ({ priorState }) => ({
        effectivePriorState: priorState,
        useReducedIterations: false,
      }),
    };

    registerSequencePolicy(custom);
    expect(getSequencePolicy('test_custom')).toBe(custom);
  });
});
