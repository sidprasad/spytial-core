import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { IAtom, ITuple } from '../src/data-instance/interfaces';

// Mock the WebColaCnDGraph parent class
vi.mock('../src/translators/webcola/webcola-cnd-graph', () => ({
  WebColaCnDGraph: class {
    shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    addEventListener = vi.fn();
    dispatchEvent = vi.fn();
    
    constructor() {
      // Mock parent constructor
    }
    
    async enforceConstraintsAndRegenerate() {
      return Promise.resolve();
    }

    getLayoutState() {
      return { positions: [] };
    }
  }
}));

describe('StructuredInputGraph', () => {
  let graph: StructuredInputGraph;
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    // Set up DOM environment
    document.body.innerHTML = '';
    
    // Create test data instance with some sample data
    const atoms: IAtom[] = [
      { id: 'atom1', type: 'Person', label: 'Alice' },
      { id: 'atom2', type: 'Person', label: 'Bob' },
      { id: 'atom3', type: 'Person', label: 'Charlie' }
    ];

    const relations = [
      {
        id: 'friendship',
        name: 'friendship',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] } as ITuple
        ]
      },
      {
        id: 'knows',
        name: 'knows',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['atom2', 'atom3'], types: ['Person', 'Person'] } as ITuple
        ]
      }
    ];

    dataInstance = new JSONDataInstance({
      atoms,
      relations,
      types: []
    });

    graph = new StructuredInputGraph(dataInstance);
  });

  describe('N-ary Relation Position Management', () => {
    it('should initialize with 2 empty positions', () => {
      const positions = (graph as any).relationAtomPositions;
      expect(positions).toEqual(['', '']);
    });
  });

  describe('Edge Modification', () => {
    it('should handle edge-modification-requested event by removing old tuple and adding new tuple', async () => {
      // Initial state: 2 relations
      expect(dataInstance.getRelations()).toHaveLength(2);
      expect(dataInstance.getRelations().find(r => r.id === 'friendship')?.tuples).toHaveLength(1);
      expect(dataInstance.getRelations().find(r => r.id === 'knows')?.tuples).toHaveLength(1);
      
      // Create modification event: rename 'friendship' relation to 'bestfriend'
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      const modificationEvent = {
        detail: {
          oldRelationId: 'friendship',
          newRelationId: 'bestfriend',
          sourceNodeId: 'atom1',
          targetNodeId: 'atom2',
          tuple: tuple
        }
      } as CustomEvent;

      // Call the handler directly (since addEventListener is mocked)
      await (graph as any).handleEdgeModificationRequest(modificationEvent);

      // Verify old relation no longer has the tuple
      const oldRelation = dataInstance.getRelations().find(r => r.id === 'friendship');
      expect(oldRelation?.tuples).toHaveLength(0);
      
      // Verify new relation was created with the tuple
      const newRelation = dataInstance.getRelations().find(r => r.id === 'bestfriend');
      expect(newRelation).toBeDefined();
      expect(newRelation?.tuples).toHaveLength(1);
      expect(newRelation?.tuples[0].atoms).toEqual(['atom1', 'atom2']);
    });

    it('should handle edge-modification-requested when moving tuple to existing relation', async () => {
      // Initial state
      expect(dataInstance.getRelations().find(r => r.id === 'friendship')?.tuples).toHaveLength(1);
      expect(dataInstance.getRelations().find(r => r.id === 'knows')?.tuples).toHaveLength(1);
      
      // Move tuple from 'friendship' to 'knows'
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      const modificationEvent = {
        detail: {
          oldRelationId: 'friendship',
          newRelationId: 'knows',
          sourceNodeId: 'atom1',
          targetNodeId: 'atom2',
          tuple: tuple
        }
      } as CustomEvent;

      // Call the handler directly
      await (graph as any).handleEdgeModificationRequest(modificationEvent);

      // Verify old relation no longer has the tuple
      const oldRelation = dataInstance.getRelations().find(r => r.id === 'friendship');
      expect(oldRelation?.tuples).toHaveLength(0);
      
      // Verify new relation now has 2 tuples
      const targetRelation = dataInstance.getRelations().find(r => r.id === 'knows');
      expect(targetRelation?.tuples).toHaveLength(2);
    });

    it('should handle edge deletion when newRelationId is empty', async () => {
      // Initial state
      expect(dataInstance.getRelations().find(r => r.id === 'friendship')?.tuples).toHaveLength(1);
      
      // Delete the edge by providing empty newRelationId
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      const modificationEvent = {
        detail: {
          oldRelationId: 'friendship',
          newRelationId: '',
          sourceNodeId: 'atom1',
          targetNodeId: 'atom2',
          tuple: tuple
        }
      } as CustomEvent;

      // Call the handler directly
      await (graph as any).handleEdgeModificationRequest(modificationEvent);

      // Verify tuple was removed
      const relation = dataInstance.getRelations().find(r => r.id === 'friendship');
      expect(relation?.tuples).toHaveLength(0);
    });

    it('should handle edge-modification-requested with same relation name (no-op)', async () => {
      // Initial state
      const initialTupleCount = dataInstance.getRelations().find(r => r.id === 'friendship')?.tuples.length;
      expect(initialTupleCount).toBe(1);
      
      // Try to rename to the same name
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      const modificationEvent = {
        detail: {
          oldRelationId: 'friendship',
          newRelationId: 'friendship',
          sourceNodeId: 'atom1',
          targetNodeId: 'atom2',
          tuple: tuple
        }
      } as CustomEvent;

      // Call the handler directly
      await (graph as any).handleEdgeModificationRequest(modificationEvent);

      // Verify nothing changed
      const relation = dataInstance.getRelations().find(r => r.id === 'friendship');
      expect(relation?.tuples).toHaveLength(initialTupleCount);
    });
  });
});