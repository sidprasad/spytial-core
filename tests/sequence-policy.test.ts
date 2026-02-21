import { describe, expect, it } from 'vitest';
import {
  ignoreHistory,
  stability,
  changeEmphasis,
  getSequencePolicy,
  registerSequencePolicy,
} from '../src/translators/webcola/sequence-policy';
import type {
  SequencePolicy,
  SequencePolicyContext,
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
const STUB_SPEC = { constraints: { orientation: { relative: [], cyclic: [] }, alignment: [], grouping: { groups: [], subgroups: [] } }, directives: { sizes: [], hiddenAtoms: [], icons: [], projections: [], edgeStyles: [] } } as any;

function ctx(
  priorState: LayoutState,
  prev: IDataInstance,
  curr: IDataInstance
): SequencePolicyContext {
  return { priorState, prevInstance: prev, currInstance: curr, spec: STUB_SPEC };
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
  it('passes through prior state verbatim', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    const result = stability.apply(ctx(prior, inst, inst));

    expect(result.effectivePriorState).toBe(prior);
    expect(result.useReducedIterations).toBe(true);
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

    expect(result.effectivePriorState).toBe(prior); // same reference — unchanged
    expect(result.useReducedIterations).toBe(true);
  });

  it('pins stable nodes and omits nodes with changed edges', () => {
    const prior = makeState([['A', 20, 30], ['B', 40, 50], ['C', 60, 70]]);

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    // C gains an edge — B and C changed, A keeps its single edge
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }, { id: 'C', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B'], ['B', 'C']] }]
    );

    const result = changeEmphasis.apply(ctx(prior, prev, curr));

    expect(result.useReducedIterations).toBe(true);
    const positions = result.effectivePriorState!.positions;

    // A is stable (same edge fingerprint)
    expect(positions).toContainEqual({ id: 'A', x: 20, y: 30 });
    // B changed (gained B->C), C changed (gained B->C)
    expect(positions.find(p => p.id === 'B')).toBeUndefined();
    expect(positions.find(p => p.id === 'C')).toBeUndefined();

    // Transform preserved
    expect(result.effectivePriorState!.transform).toEqual(prior.transform);
  });

  it('detects new atoms as changed', () => {
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

    // A and B are stable, C is new (no prior position anyway)
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).not.toContain('C');
  });

  it('detects removed atoms as changed', () => {
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

    // A had edge A->B, now has nothing — changed
    // B is removed — changed
    expect(ids).not.toContain('A');
    expect(ids).not.toContain('B');
  });

  it('when all nodes changed, returns empty positions but preserves transform', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);

    const prev = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    const curr = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['B', 'A']] }]
    );

    const result = changeEmphasis.apply(ctx(prior, prev, curr));

    expect(result.effectivePriorState!.positions).toHaveLength(0);
    expect(result.effectivePriorState!.transform).toEqual(prior.transform);
    expect(result.useReducedIterations).toBe(true);
  });

  it('handles added edge on existing atoms', () => {
    const prior = makeState([['A', 10, 20], ['B', 30, 40]]);
    const atoms = [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }];

    const prev = makeInstance(atoms, []);
    const curr = makeInstance(atoms, [{ name: 'edge', tuples: [['A', 'B']] }]);

    const result = changeEmphasis.apply(ctx(prior, prev, curr));
    const ids = result.effectivePriorState!.positions.map(p => p.id);

    // Both A and B gained an edge — both changed
    expect(ids).not.toContain('A');
    expect(ids).not.toContain('B');
  });

  it('returns empty for two empty instances (no changes)', () => {
    const prior = makeState([['A', 10, 20]]);
    const prev = makeInstance([], []);
    const curr = makeInstance([], []);

    const result = changeEmphasis.apply(ctx(prior, prev, curr));

    // No atoms at all → no changes → prior state preserved
    expect(result.effectivePriorState).toBe(prior);
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
