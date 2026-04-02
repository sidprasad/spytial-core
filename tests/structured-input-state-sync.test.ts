import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import type { IAtom, ITuple, IRelation } from '../src/data-instance/interfaces';

// Mock the WebColaCnDGraph parent class
vi.mock('../src/translators/webcola/webcola-cnd-graph', () => ({
  WebColaCnDGraph: class {
    shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    private eventListeners: Map<string, Function[]> = new Map();

    constructor() {}

    addEventListener(event: string, handler: Function) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event)!.push(handler);
    }

    dispatchEvent(event: Event) {
      const handlers = this.eventListeners.get(event.type) || [];
      handlers.forEach(handler => handler(event));
      return true;
    }

    setAttribute() {}

    async renderLayout() {
      return Promise.resolve();
    }

    protected rerenderGraph() {}
  }
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for async event handlers to settle. */
async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Assert the full data instance state: atoms and relations (with tuples).
 * Every mutation test should call this to catch unintended side effects.
 */
function assertFullState(
  dataInstance: JSONDataInstance,
  expectedAtoms: Array<{ id: string; type: string }>,
  expectedRelations: Array<{ id: string; tuples: string[][] }>
): void {
  const atoms = dataInstance.getAtoms();
  expect(atoms).toHaveLength(expectedAtoms.length);
  for (const ea of expectedAtoms) {
    const found = atoms.find(a => a.id === ea.id);
    expect(found, `Atom ${ea.id} not found`).toBeDefined();
    expect(found!.type).toBe(ea.type);
  }

  const relations = dataInstance.getRelations();
  expect(relations).toHaveLength(expectedRelations.length);
  for (const er of expectedRelations) {
    const found = relations.find(r => r.id === er.id);
    expect(found, `Relation ${er.id} not found`).toBeDefined();
    expect(found!.tuples).toHaveLength(er.tuples.length);
    for (let i = 0; i < er.tuples.length; i++) {
      expect(found!.tuples[i].atoms).toEqual(er.tuples[i]);
    }
  }

  // No orphaned refs: every atom ID in relation tuples must exist in atoms
  const atomIds = new Set(atoms.map(a => a.id));
  for (const rel of relations) {
    for (const tuple of rel.tuples) {
      for (const atomId of tuple.atoms) {
        expect(atomIds.has(atomId), `Orphaned atom ref '${atomId}' in relation '${rel.id}'`).toBe(true);
      }
    }
  }
}

/**
 * Verify that reify() → new JSONDataInstance round-trips correctly.
 */
function assertReifyConsistency(dataInstance: JSONDataInstance): void {
  const reified = dataInstance.reify() as any;
  const roundTripped = new JSONDataInstance(reified);

  const origAtoms = dataInstance.getAtoms();
  const rtAtoms = roundTripped.getAtoms();
  expect(rtAtoms).toHaveLength(origAtoms.length);
  for (const oa of origAtoms) {
    expect(rtAtoms.find(a => a.id === oa.id)).toBeDefined();
  }

  const origRels = dataInstance.getRelations();
  const rtRels = roundTripped.getRelations();
  expect(rtRels).toHaveLength(origRels.length);
  for (const or_ of origRels) {
    const rtRel = rtRels.find(r => r.id === or_.id);
    expect(rtRel).toBeDefined();
    expect(rtRel!.tuples).toHaveLength(or_.tuples.length);
  }
}

function dispatchEdgeCreation(graph: StructuredInputGraph, detail: object): void {
  graph.dispatchEvent(new CustomEvent('edge-creation-requested', { detail, bubbles: true }));
}

function dispatchEdgeModification(graph: StructuredInputGraph, detail: object): void {
  graph.dispatchEvent(new CustomEvent('edge-modification-requested', { detail, bubbles: true }));
}

function dispatchEdgeReconnection(graph: StructuredInputGraph, detail: object): void {
  graph.dispatchEvent(new CustomEvent('edge-reconnection-requested', { detail, bubbles: true }));
}

// ─── Default test data factory ───────────────────────────────────────────────

function createDefaultDataInstance(): JSONDataInstance {
  return new JSONDataInstance({
    atoms: [
      { id: 'atom1', type: 'Person', label: 'Alice' },
      { id: 'atom2', type: 'Person', label: 'Bob' },
      { id: 'atom3', type: 'Person', label: 'Charlie' }
    ],
    relations: [
      {
        id: 'knows',
        name: 'knows',
        types: ['Person', 'Person'],
        tuples: [{ atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }]
      }
    ]
  });
}

const DEFAULT_ATOMS = [
  { id: 'atom1', type: 'Person' },
  { id: 'atom2', type: 'Person' },
  { id: 'atom3', type: 'Person' }
];

const DEFAULT_RELATIONS = [
  { id: 'knows', tuples: [['atom1', 'atom2']] }
];

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('StructuredInputGraph State Synchronization', () => {
  let graph: StructuredInputGraph;
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    dataInstance = createDefaultDataInstance();
    graph = new StructuredInputGraph(dataInstance);
  });

  // ── Basic Mutations: Add Atom ────────────────────────────────────────────

  describe('Basic Mutations: Add Atom', () => {
    it('should reflect a new atom in data instance after addAtomFromForm', async () => {
      const result = await (graph as any).addAtomFromForm('Dog', 'Rex');
      expect(result).not.toBeNull();
      expect(result.type).toBe('Dog');
      expect(result.label).toBe('Rex');

      assertFullState(dataInstance, [...DEFAULT_ATOMS, { id: result.id, type: 'Dog' }], DEFAULT_RELATIONS);
    });

    it('should auto-generate unique atom IDs for same type', async () => {
      const r1 = await (graph as any).addAtomFromForm('Cat', 'Whiskers');
      const r2 = await (graph as any).addAtomFromForm('Cat', 'Mittens');
      expect(r1.id).not.toBe(r2.id);
      expect(r1.id.startsWith('Cat')).toBe(true);
      expect(r2.id.startsWith('Cat')).toBe(true);
    });

    it('should reject duplicate atom IDs added directly', () => {
      expect(() => {
        dataInstance.addAtom({ id: 'atom1', type: 'Person', label: 'Duplicate' });
      }).toThrow(/already exists/);
    });
  });

  // ── Basic Mutations: Delete Atom ─────────────────────────────────────────

  describe('Basic Mutations: Delete Atom', () => {
    it('should remove atom and cascade-delete all referencing tuples', async () => {
      await (graph as any).deleteAtom('atom1');
      await tick();

      assertFullState(dataInstance,
        [{ id: 'atom2', type: 'Person' }, { id: 'atom3', type: 'Person' }],
        [{ id: 'knows', tuples: [] }] // JSONDataInstance keeps empty relations
      );
    });

    it('should leave unrelated relations untouched', async () => {
      // Add a relation not involving atom1
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });

      await (graph as any).deleteAtom('atom1');
      await tick();

      assertFullState(dataInstance,
        [{ id: 'atom2', type: 'Person' }, { id: 'atom3', type: 'Person' }],
        [
          { id: 'knows', tuples: [] }, // cascade-emptied
          { id: 'likes', tuples: [['atom2', 'atom3']] }
        ]
      );
    });

    it('should handle deleting atom not referenced by any relation', async () => {
      await (graph as any).deleteAtom('atom3');
      await tick();

      assertFullState(dataInstance,
        [{ id: 'atom1', type: 'Person' }, { id: 'atom2', type: 'Person' }],
        DEFAULT_RELATIONS
      );
    });

    it('should no-op for non-existent atom ID', async () => {
      await (graph as any).deleteAtom('nonexistent');
      await tick();
      // State should be unchanged
      assertFullState(dataInstance, DEFAULT_ATOMS, DEFAULT_RELATIONS);
    });
  });

  // ── Basic Mutations: Add Relation Tuple ──────────────────────────────────

  describe('Basic Mutations: Add Relation Tuple', () => {
    it('should add tuple to existing relation and verify full state', () => {
      dataInstance.addRelationTuple('knows', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom1', 'atom2'], ['atom2', 'atom3']] }
      ]);
    });

    it('should create new relation when relation ID does not exist', () => {
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom1', 'atom3'],
        types: ['Person', 'Person']
      });

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom1', 'atom2']] },
        { id: 'likes', tuples: [['atom1', 'atom3']] }
      ]);
    });

    it('should reject tuple referencing non-existent atom', () => {
      expect(() => {
        dataInstance.addRelationTuple('test', {
          atoms: ['atom1', 'nonexistent'],
          types: ['Person', 'Person']
        });
      }).toThrow();
    });
  });

  // ── Basic Mutations: Delete Relation Tuple ───────────────────────────────

  describe('Basic Mutations: Delete Relation Tuple', () => {
    it('should remove tuple by global index and verify full state', async () => {
      await (graph as any).deleteRelation('0');
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] } // JSONDataInstance keeps empty relations
      ]);
    });

    it('should leave relation with remaining tuples intact', async () => {
      dataInstance.addRelationTuple('knows', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });

      // Delete the first tuple (atom1->atom2)
      await (graph as any).deleteRelation('0');
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom2', 'atom3']] }
      ]);
    });

    it('should throw when relation does not exist', () => {
      expect(() => {
        dataInstance.removeRelationTuple('nonexistent', {
          atoms: ['atom1', 'atom2'],
          types: ['Person', 'Person']
        });
      }).toThrow();
    });

    it('should throw when tuple not found in relation', () => {
      expect(() => {
        dataInstance.removeRelationTuple('knows', {
          atoms: ['atom3', 'atom1'], // wrong order
          types: ['Person', 'Person']
        });
      }).toThrow();
    });
  });

  // ── Compound: Edge Creation via Drag ─────────────────────────────────────

  describe('Compound: Edge Creation via Drag', () => {
    it('should add relation tuple after edge-creation-requested event', async () => {
      dispatchEdgeCreation(graph, {
        relationId: 'friendship',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom3',
        tuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom1', 'atom2']] },
        { id: 'friendship', tuples: [['atom1', 'atom3']] }
      ]);
    });

    it('should create relation if it does not exist', async () => {
      dispatchEdgeCreation(graph, {
        relationId: 'newrel',
        sourceNodeId: 'atom2',
        targetNodeId: 'atom3',
        tuple: { atoms: ['atom2', 'atom3'], types: ['Person', 'Person'] }
      });
      await tick();

      const rel = dataInstance.getRelations().find(r => r.id === 'newrel');
      expect(rel).toBeDefined();
      expect(rel!.tuples).toHaveLength(1);
    });

    it('should leave atoms unchanged after edge creation', async () => {
      dispatchEdgeCreation(graph, {
        relationId: 'likes',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      expect(dataInstance.getAtoms()).toHaveLength(3);
    });
  });

  // ── Compound: Edge Deletion ──────────────────────────────────────────────

  describe('Compound: Edge Deletion', () => {
    it('should remove tuple when edge-modification-requested has empty newRelationId', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: '',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] }
      ]);
    });

    it('should leave other relations untouched after deletion', async () => {
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });

      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: '',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] },
        { id: 'likes', tuples: [['atom2', 'atom3']] }
      ]);
    });
  });

  // ── Compound: Edge Rename ────────────────────────────────────────────────

  describe('Compound: Edge Rename', () => {
    it('should move tuple from old relation to new relation', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'bestfriend',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] },
        { id: 'bestfriend', tuples: [['atom1', 'atom2']] }
      ]);
    });

    it('should move tuple to existing relation', async () => {
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });

      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'likes',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] },
        { id: 'likes', tuples: [['atom2', 'atom3'], ['atom1', 'atom2']] }
      ]);
    });

    it('should leave atoms unchanged after rename', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'friends',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      expect(dataInstance.getAtoms()).toHaveLength(3);
      expect(dataInstance.getAtoms().map(a => a.id).sort()).toEqual(['atom1', 'atom2', 'atom3']);
    });
  });

  // ── Compound: Edge Reconnection ──────────────────────────────────────────

  describe('Compound: Edge Reconnection', () => {
    it('should replace old tuple with new tuple in same relation', async () => {
      dispatchEdgeReconnection(graph, {
        relationId: 'knows',
        oldTuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
        newTuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] },
        oldSourceNodeId: 'atom1',
        oldTargetNodeId: 'atom2',
        newSourceNodeId: 'atom1',
        newTargetNodeId: 'atom3'
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom1', 'atom3']] }
      ]);
    });

    it('should leave atoms unchanged after reconnection', async () => {
      dispatchEdgeReconnection(graph, {
        relationId: 'knows',
        oldTuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
        newTuple: { atoms: ['atom3', 'atom2'], types: ['Person', 'Person'] },
        oldSourceNodeId: 'atom1',
        oldTargetNodeId: 'atom2',
        newSourceNodeId: 'atom3',
        newTargetNodeId: 'atom2'
      });
      await tick();

      expect(dataInstance.getAtoms()).toHaveLength(3);
    });
  });

  // ── Group Edge Operations ────────────────────────────────────────────────

  describe('Group Edge Operations', () => {
    beforeEach(() => {
      // Add a second tuple so we have group material
      dataInstance.addRelationTuple('knows', {
        atoms: ['atom1', 'atom3'],
        types: ['Person', 'Person']
      });
    });

    it('should delete all tuples in group via edge-modification-requested', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: '',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuples: [
          { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
          { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
        ]
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] }
      ]);
    });

    it('should move all tuples in group from old relation to new', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'likes',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuples: [
          { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
          { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
        ]
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] },
        { id: 'likes', tuples: [['atom1', 'atom2'], ['atom1', 'atom3']] }
      ]);
    });

    it('should verify full state after group operations', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'friends',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuples: [
          { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
          { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
        ]
      });
      await tick();

      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [] },
        { id: 'friends', tuples: [['atom1', 'atom2'], ['atom1', 'atom3']] }
      ]);
    });
  });

  // ── Bulk Operations: Clear All ───────────────────────────────────────────

  describe('Bulk Operations: Clear All', () => {
    it('should produce empty data instance with zero atoms and relations', async () => {
      await (graph as any).clearAllItems();
      await tick();

      // After clear, the graph's data instance is replaced
      const di = (graph as any).dataInstance as JSONDataInstance;
      expect(di.getAtoms()).toHaveLength(0);
      expect(di.getRelations()).toHaveLength(0);
    });

    it('should verify reify returns empty structure after clear', async () => {
      await (graph as any).clearAllItems();
      await tick();

      const di = (graph as any).dataInstance as JSONDataInstance;
      const reified = di.reify() as any;
      expect(reified.atoms).toHaveLength(0);
      expect(reified.relations).toHaveLength(0);
    });
  });

  // ── Bulk Operations: Load New Data Instance ──────────────────────────────

  describe('Bulk Operations: Load New Data Instance', () => {
    it('should replace entire data instance and verify new state', () => {
      const newInstance = new JSONDataInstance({
        atoms: [{ id: 'x1', type: 'Animal', label: 'Dog' }],
        relations: []
      });

      (graph as any).setDataInstance(newInstance);

      const di = (graph as any).dataInstance as JSONDataInstance;
      expect(di.getAtoms()).toHaveLength(1);
      expect(di.getAtoms()[0].id).toBe('x1');
      expect(di.getRelations()).toHaveLength(0);
    });

    it('should detach event listeners from old instance', async () => {
      const oldInstance = dataInstance;
      const newInstance = new JSONDataInstance({
        atoms: [{ id: 'x1', type: 'A', label: 'X' }],
        relations: []
      });

      const spy = vi.spyOn(graph as any, 'enforceConstraintsAndRegenerate');

      (graph as any).setDataInstance(newInstance);
      spy.mockClear();

      // Mutate old instance — should NOT trigger enforceConstraintsAndRegenerate
      oldInstance.addAtom({ id: 'orphan', type: 'B', label: 'Orphan' });
      await tick();

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should attach event listeners to new instance', async () => {
      const newInstance = new JSONDataInstance({
        atoms: [
          { id: 'x1', type: 'A', label: 'X' },
          { id: 'x2', type: 'A', label: 'Y' }
        ],
        relations: []
      });

      (graph as any).setDataInstance(newInstance);

      const spy = vi.spyOn(graph as any, 'enforceConstraintsAndRegenerate');

      // Mutate new instance — should trigger enforceConstraintsAndRegenerate
      newInstance.addRelationTuple('rel', {
        atoms: ['x1', 'x2'],
        types: ['A', 'A']
      });
      await tick();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ── Reify Consistency ────────────────────────────────────────────────────

  describe('Reify Consistency', () => {
    it('should round-trip after adding atom', async () => {
      await (graph as any).addAtomFromForm('Dog', 'Rex');
      const di = (graph as any).dataInstance as JSONDataInstance;
      assertReifyConsistency(di);
    });

    it('should round-trip after adding relation tuple', () => {
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Person']
      });
      assertReifyConsistency(dataInstance);
    });

    it('should round-trip after deleting atom with cascade', async () => {
      await (graph as any).deleteAtom('atom1');
      await tick();
      assertReifyConsistency(dataInstance);
    });

    it('should round-trip after edge rename', async () => {
      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'friends',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();
      assertReifyConsistency(dataInstance);
    });

    it('should round-trip on empty instance', async () => {
      await (graph as any).clearAllItems();
      await tick();
      const di = (graph as any).dataInstance as JSONDataInstance;
      assertReifyConsistency(di);
    });
  });

  // ── Suppression Flag ─────────────────────────────────────────────────────

  describe('Suppression Flag (_suppressDataChangeRerender)', () => {
    it('should call enforceConstraintsAndRegenerate exactly once for edge creation', async () => {
      const spy = vi.spyOn(graph as any, 'enforceConstraintsAndRegenerate');

      dispatchEdgeCreation(graph, {
        relationId: 'likes',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom3',
        tuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
      });
      await tick();

      // One explicit call from handleEdgeCreationRequest, NOT a second from the event handler
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should call enforceConstraintsAndRegenerate exactly once for edge modification', async () => {
      const spy = vi.spyOn(graph as any, 'enforceConstraintsAndRegenerate');

      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'friends',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      // One explicit call, not one per remove + add
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should call enforceConstraintsAndRegenerate exactly once for edge reconnection', async () => {
      const spy = vi.spyOn(graph as any, 'enforceConstraintsAndRegenerate');

      dispatchEdgeReconnection(graph, {
        relationId: 'knows',
        oldTuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] },
        newTuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] },
        oldSourceNodeId: 'atom1',
        oldTargetNodeId: 'atom2',
        newSourceNodeId: 'atom1',
        newTargetNodeId: 'atom3'
      });
      await tick();

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should still fire data instance events even when suppressed', async () => {
      const events: string[] = [];
      dataInstance.addEventListener('relationTupleRemoved', () => events.push('removed'));
      dataInstance.addEventListener('relationTupleAdded', () => events.push('added'));

      dispatchEdgeModification(graph, {
        oldRelationId: 'knows',
        newRelationId: 'friends',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom2',
        tuple: { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] }
      });
      await tick();

      expect(events).toContain('removed');
      expect(events).toContain('added');
    });
  });

  // ── Sequential Operations ────────────────────────────────────────────────

  describe('Sequential Operations', () => {
    it('should maintain consistency through add atom → add edge → rename edge → delete atom', async () => {
      // Step 1: Add atom
      const newAtom = await (graph as any).addAtomFromForm('Animal', 'Rex');
      assertFullState(dataInstance,
        [...DEFAULT_ATOMS, { id: newAtom.id, type: 'Animal' }],
        DEFAULT_RELATIONS
      );

      // Step 2: Add edge from new atom
      dispatchEdgeCreation(graph, {
        relationId: 'owns',
        sourceNodeId: 'atom1',
        targetNodeId: newAtom.id,
        tuple: { atoms: ['atom1', newAtom.id], types: ['Person', 'Animal'] }
      });
      await tick();
      assertFullState(dataInstance,
        [...DEFAULT_ATOMS, { id: newAtom.id, type: 'Animal' }],
        [
          { id: 'knows', tuples: [['atom1', 'atom2']] },
          { id: 'owns', tuples: [['atom1', newAtom.id]] }
        ]
      );

      // Step 3: Rename the edge
      dispatchEdgeModification(graph, {
        oldRelationId: 'owns',
        newRelationId: 'hasPet',
        sourceNodeId: 'atom1',
        targetNodeId: newAtom.id,
        tuple: { atoms: ['atom1', newAtom.id], types: ['Person', 'Animal'] }
      });
      await tick();
      assertFullState(dataInstance,
        [...DEFAULT_ATOMS, { id: newAtom.id, type: 'Animal' }],
        [
          { id: 'knows', tuples: [['atom1', 'atom2']] },
          { id: 'owns', tuples: [] },
          { id: 'hasPet', tuples: [['atom1', newAtom.id]] }
        ]
      );

      // Step 4: Delete the new atom (should cascade-delete hasPet tuple)
      await (graph as any).deleteAtom(newAtom.id);
      await tick();
      assertFullState(dataInstance, DEFAULT_ATOMS, [
        { id: 'knows', tuples: [['atom1', 'atom2']] },
        { id: 'owns', tuples: [] },
        { id: 'hasPet', tuples: [] }
      ]);
    });

    it('should maintain consistency through add atom → add edge → reconnect → delete edge', async () => {
      // Step 1: Add atom
      const newAtom = await (graph as any).addAtomFromForm('Person', 'Dave');

      // Step 2: Add edge
      dispatchEdgeCreation(graph, {
        relationId: 'likes',
        sourceNodeId: 'atom1',
        targetNodeId: newAtom.id,
        tuple: { atoms: ['atom1', newAtom.id], types: ['Person', 'Person'] }
      });
      await tick();

      // Step 3: Reconnect target from newAtom to atom3
      dispatchEdgeReconnection(graph, {
        relationId: 'likes',
        oldTuple: { atoms: ['atom1', newAtom.id], types: ['Person', 'Person'] },
        newTuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] },
        oldSourceNodeId: 'atom1',
        oldTargetNodeId: newAtom.id,
        newSourceNodeId: 'atom1',
        newTargetNodeId: 'atom3'
      });
      await tick();
      assertFullState(dataInstance,
        [...DEFAULT_ATOMS, { id: newAtom.id, type: 'Person' }],
        [
          { id: 'knows', tuples: [['atom1', 'atom2']] },
          { id: 'likes', tuples: [['atom1', 'atom3']] }
        ]
      );

      // Step 4: Delete the edge
      dispatchEdgeModification(graph, {
        oldRelationId: 'likes',
        newRelationId: '',
        sourceNodeId: 'atom1',
        targetNodeId: 'atom3',
        tuple: { atoms: ['atom1', 'atom3'], types: ['Person', 'Person'] }
      });
      await tick();
      assertFullState(dataInstance,
        [...DEFAULT_ATOMS, { id: newAtom.id, type: 'Person' }],
        [
          { id: 'knows', tuples: [['atom1', 'atom2']] },
          { id: 'likes', tuples: [] }
        ]
      );
    });

    it('should maintain consistency through multiple adds then clear all', async () => {
      await (graph as any).addAtomFromForm('Dog', 'Rex');
      await (graph as any).addAtomFromForm('Cat', 'Whiskers');
      dataInstance.addRelationTuple('likes', {
        atoms: ['atom1', 'atom2'],
        types: ['Person', 'Person']
      });

      expect(dataInstance.getAtoms().length).toBeGreaterThanOrEqual(5);

      await (graph as any).clearAllItems();
      await tick();

      const di = (graph as any).dataInstance as JSONDataInstance;
      expect(di.getAtoms()).toHaveLength(0);
      expect(di.getRelations()).toHaveLength(0);
    });
  });

  // ── JSONDataInstance Edge Cases ──────────────────────────────────────────

  describe('JSONDataInstance Edge Cases', () => {
    it('should throw on addRelationTuple referencing non-existent atom', () => {
      expect(() => {
        dataInstance.addRelationTuple('test', {
          atoms: ['atom1', 'ghost'],
          types: ['Person', 'Person']
        });
      }).toThrow();
    });

    it('should throw on removeRelationTuple for non-existent relation', () => {
      expect(() => {
        dataInstance.removeRelationTuple('ghost', {
          atoms: ['atom1', 'atom2'],
          types: ['Person', 'Person']
        });
      }).toThrow();
    });

    it('should throw on removeRelationTuple for non-existent tuple', () => {
      expect(() => {
        dataInstance.removeRelationTuple('knows', {
          atoms: ['atom2', 'atom1'], // reversed order
          types: ['Person', 'Person']
        });
      }).toThrow();
    });

    it('should throw on addAtom with duplicate ID', () => {
      expect(() => {
        dataInstance.addAtom({ id: 'atom1', type: 'Person', label: 'Dup' });
      }).toThrow(/already exists/);
    });

    it('should use structural atom-array comparison for tuple removal', () => {
      // Create a tuple, then remove it with a fresh object (different reference, same content)
      dataInstance.addRelationTuple('test', {
        atoms: ['atom1', 'atom3'],
        types: ['Person', 'Person']
      });

      // Remove using a DIFFERENT object with the same atom content
      dataInstance.removeRelationTuple('test', {
        atoms: ['atom1', 'atom3'],
        types: ['Person', 'Person']
      });

      // Tuple should be removed (JSONDataInstance keeps the empty relation shell)
      const testRel = dataInstance.getRelations().find(r => r.id === 'test');
      expect(testRel).toBeDefined();
      expect(testRel!.tuples).toHaveLength(0);
    });
  });
});
