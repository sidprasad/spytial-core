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
  }
}));

describe('Edge Movement', () => {
  let graph: StructuredInputGraph;
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    // Set up DOM environment
    document.body.innerHTML = '';
    
    // Create test data instance with some sample data
    const atoms: IAtom[] = [
      { id: 'alice', type: 'Person', label: 'Alice' },
      { id: 'bob', type: 'Person', label: 'Bob' },
      { id: 'charlie', type: 'Person', label: 'Charlie' },
      { id: 'dave', type: 'Person', label: 'Dave' }
    ];

    const relations = [
      {
        id: 'friend',
        name: 'friend',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['alice', 'bob'], types: ['Person', 'Person'] } as ITuple,
          { atoms: ['bob', 'charlie'], types: ['Person', 'Person'] } as ITuple
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

  describe('Edge Movement Request Handling', () => {
    it('should handle edge movement by removing old tuple and adding new tuple', async () => {
      // Create edge movement event
      const oldTuple: ITuple = {
        atoms: ['alice', 'bob'],
        types: ['Person', 'Person']
      };

      const newTuple: ITuple = {
        atoms: ['alice', 'dave'],
        types: ['Person', 'Person']
      };

      const edgeMovementEvent = new CustomEvent('edge-movement-requested', {
        detail: {
          relationId: 'friend',
          oldTuple,
          newTuple,
          oldSourceNodeId: 'alice',
          oldTargetNodeId: 'bob',
          newSourceNodeId: 'alice',
          newTargetNodeId: 'dave'
        }
      });

      // Trigger the event handler
      await (graph as any).handleEdgeMovementRequest(edgeMovementEvent);

      // Verify the old tuple was removed
      const friendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      expect(friendRelation).toBeDefined();
      
      const oldTupleExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'bob'
      );
      expect(oldTupleExists).toBe(false);

      // Verify the new tuple was added
      const newTupleExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'dave'
      );
      expect(newTupleExists).toBe(true);
    });

    it('should move edge target from one node to another', async () => {
      // Initial state: alice -> bob
      const initialFriendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      expect(initialFriendRelation?.tuples).toHaveLength(2);

      // Move edge target: alice -> bob becomes alice -> charlie
      const oldTuple: ITuple = {
        atoms: ['alice', 'bob'],
        types: ['Person', 'Person']
      };

      const newTuple: ITuple = {
        atoms: ['alice', 'charlie'],
        types: ['Person', 'Person']
      };

      const edgeMovementEvent = new CustomEvent('edge-movement-requested', {
        detail: {
          relationId: 'friend',
          oldTuple,
          newTuple,
          oldSourceNodeId: 'alice',
          oldTargetNodeId: 'bob',
          newSourceNodeId: 'alice',
          newTargetNodeId: 'charlie'
        }
      });

      await (graph as any).handleEdgeMovementRequest(edgeMovementEvent);

      // Verify the edge was moved
      const friendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      
      const aliceToBobExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'bob'
      );
      expect(aliceToBobExists).toBe(false);

      const aliceToCharlieExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'charlie'
      );
      expect(aliceToCharlieExists).toBe(true);
    });

    it('should move edge source from one node to another', async () => {
      // Initial state: alice -> bob
      // Move edge source: alice -> bob becomes dave -> bob
      const oldTuple: ITuple = {
        atoms: ['alice', 'bob'],
        types: ['Person', 'Person']
      };

      const newTuple: ITuple = {
        atoms: ['dave', 'bob'],
        types: ['Person', 'Person']
      };

      const edgeMovementEvent = new CustomEvent('edge-movement-requested', {
        detail: {
          relationId: 'friend',
          oldTuple,
          newTuple,
          oldSourceNodeId: 'alice',
          oldTargetNodeId: 'bob',
          newSourceNodeId: 'dave',
          newTargetNodeId: 'bob'
        }
      });

      await (graph as any).handleEdgeMovementRequest(edgeMovementEvent);

      // Verify the edge was moved
      const friendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      
      const aliceToBobExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'bob'
      );
      expect(aliceToBobExists).toBe(false);

      const daveToBobExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'dave' && t.atoms[1] === 'bob'
      );
      expect(daveToBobExists).toBe(true);
    });

    it('should preserve other tuples when moving an edge', async () => {
      // Initial state has 2 tuples: alice -> bob and bob -> charlie
      const initialFriendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      expect(initialFriendRelation?.tuples).toHaveLength(2);

      // Move alice -> bob to alice -> dave
      const oldTuple: ITuple = {
        atoms: ['alice', 'bob'],
        types: ['Person', 'Person']
      };

      const newTuple: ITuple = {
        atoms: ['alice', 'dave'],
        types: ['Person', 'Person']
      };

      const edgeMovementEvent = new CustomEvent('edge-movement-requested', {
        detail: {
          relationId: 'friend',
          oldTuple,
          newTuple,
          oldSourceNodeId: 'alice',
          oldTargetNodeId: 'bob',
          newSourceNodeId: 'alice',
          newTargetNodeId: 'dave'
        }
      });

      await (graph as any).handleEdgeMovementRequest(edgeMovementEvent);

      // Verify we still have 2 tuples (one removed, one added)
      const friendRelation = dataInstance.getRelations().find(r => r.id === 'friend');
      expect(friendRelation?.tuples).toHaveLength(2);

      // Verify bob -> charlie is still there
      const bobToCharlieExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'bob' && t.atoms[1] === 'charlie'
      );
      expect(bobToCharlieExists).toBe(true);

      // Verify alice -> dave is now there
      const aliceToDaveExists = friendRelation?.tuples.some(t => 
        t.atoms[0] === 'alice' && t.atoms[1] === 'dave'
      );
      expect(aliceToDaveExists).toBe(true);
    });
  });
});
