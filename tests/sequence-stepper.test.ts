import { describe, expect, it, vi } from 'vitest';
import { SequenceStepper } from '../src/translators/webcola/temporal-sequence';
import {
  ignoreHistory,
  stability,
  changeEmphasis,
} from '../src/translators/webcola/sequence-policy';
import type { SequencePolicy } from '../src/translators/webcola/sequence-policy';
import type { LayoutState } from '../src/translators/webcola/webcolatranslator';
import type { IDataInstance, IAtom, IRelation, IType } from '../src/data-instance/interfaces';
import type { InstanceLayout } from '../src/layout/interfaces';
import { Graph } from 'graphlib';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/** Minimal IDataInstance stub. */
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

function makeState(entries: Array<[string, number, number]>): LayoutState {
  return {
    positions: entries.map(([id, x, y]) => ({ id, x, y })),
    transform: { k: 1, x: 0, y: 0 },
  };
}

const STUB_SPEC = {
  constraints: { orientation: { relative: [], cyclic: [] }, alignment: [], grouping: { groups: [], subgroups: [] } },
  directives: { sizes: [], hiddenAtoms: [], icons: [], projections: [], edgeStyles: [] },
} as any;

const STUB_LAYOUT: InstanceLayout = { nodes: [], edges: [], constraints: [], groups: [] } as any;

/**
 * Create a mock WebColaCnDGraph that records renderLayout calls
 * and returns configurable layout state.
 */
function createMockGraph() {
  let layoutState: LayoutState = { positions: [], transform: { k: 1, x: 0, y: 0 } };
  const renderCalls: Array<{ layout: InstanceLayout; options: any }> = [];

  return {
    element: {
      renderLayout: vi.fn(async (layout: InstanceLayout, options?: any) => {
        renderCalls.push({ layout, options });
        // Simulate solver producing positions from layout nodes
        layoutState = makeState([['A', 100, 200], ['B', 300, 400]]);
      }),
      getLayoutState: vi.fn(() => layoutState),
    } as any,
    renderCalls,
    /** Override what getLayoutState returns (simulate drag). */
    setLayoutState(state: LayoutState) {
      layoutState = state;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequenceStepper', () => {
  it('first step renders without prior state', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: stability,
      spec: STUB_SPEC,
    });

    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst, STUB_LAYOUT);

    // renderLayout called once with no priorState
    expect(mock.renderCalls).toHaveLength(1);
    expect(mock.renderCalls[0].options).toEqual({});
  });

  it('second step applies policy with prior state', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: stability,
      spec: STUB_SPEC,
    });

    const inst1 = makeInstance([{ id: 'A', type: 'T' }], []);
    const inst2 = makeInstance([{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }], []);

    await stepper.step(inst1, STUB_LAYOUT);
    await stepper.step(inst2, STUB_LAYOUT);

    // Second render should include priorState (stability passes it through)
    expect(mock.renderCalls).toHaveLength(2);
    expect(mock.renderCalls[1].options.priorState).toBeDefined();
    expect(mock.renderCalls[1].options.priorState.positions).toHaveLength(2);
  });

  it('ignoreHistory never passes prior state', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: ignoreHistory,
      spec: STUB_SPEC,
    });

    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst, STUB_LAYOUT);
    await stepper.step(inst, STUB_LAYOUT);

    // Both renders should have no priorState
    expect(mock.renderCalls[0].options).toEqual({});
    expect(mock.renderCalls[1].options).toEqual({});
  });

  it('captures drag positions between steps', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: stability,
      spec: STUB_SPEC,
    });

    const inst1 = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst1, STUB_LAYOUT);

    // Simulate user dragging node A to a different position
    mock.setLayoutState(makeState([['A', 999, 888]]));

    const inst2 = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst2, STUB_LAYOUT);

    // The dragged position should be in the prior state
    const priorState = mock.renderCalls[1].options.priorState;
    expect(priorState.positions).toContainEqual({ id: 'A', x: 999, y: 888 });
  });

  it('reset causes next step to render fresh', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: stability,
      spec: STUB_SPEC,
    });

    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst, STUB_LAYOUT);

    stepper.reset();
    await stepper.step(inst, STUB_LAYOUT);

    // After reset, no priorState
    expect(mock.renderCalls[1].options).toEqual({});
  });

  it('setPolicy changes behavior mid-stream', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: stability,
      spec: STUB_SPEC,
    });

    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst, STUB_LAYOUT);

    // Switch to ignoreHistory
    stepper.setPolicy(ignoreHistory);
    expect(stepper.policy).toBe(ignoreHistory);

    await stepper.step(inst, STUB_LAYOUT);

    // After switching, no priorState
    expect(mock.renderCalls[1].options).toEqual({});
  });

  it('changeEmphasis omits changed nodes from prior state', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, {
      policy: changeEmphasis,
      spec: STUB_SPEC,
    });

    // Step 1: A and B with edge A->B
    const inst1 = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['A', 'B']] }]
    );
    await stepper.step(inst1, STUB_LAYOUT);

    // Simulate solver output: A at (100,200), B at (300,400)
    mock.setLayoutState(makeState([['A', 100, 200], ['B', 300, 400]]));

    // Step 2: A and B with edge B->A (both changed)
    const inst2 = makeInstance(
      [{ id: 'A', type: 'T' }, { id: 'B', type: 'T' }],
      [{ name: 'edge', tuples: [['B', 'A']] }]
    );
    await stepper.step(inst2, STUB_LAYOUT);

    // Both nodes changed edges → prior state positions should be empty
    const priorState = mock.renderCalls[1].options.priorState;
    expect(priorState.positions).toHaveLength(0);
  });

  it('defaults to ignoreHistory when no policy specified', async () => {
    const mock = createMockGraph();
    const stepper = new SequenceStepper(mock.element, { spec: STUB_SPEC });

    expect(stepper.policy).toBe(ignoreHistory);

    const inst = makeInstance([{ id: 'A', type: 'T' }], []);
    await stepper.step(inst, STUB_LAYOUT);
    await stepper.step(inst, STUB_LAYOUT);

    // ignoreHistory → no priorState on second render
    expect(mock.renderCalls[1].options).toEqual({});
  });
});
