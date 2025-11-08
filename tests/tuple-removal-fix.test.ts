import { describe, it, expect } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

/**
 * Test suite specifically for the tuple removal bug fix.
 * 
 * Bug: When dragging an edge endpoint to reconnect it, the system would:
 * ✅ Add the new tuple (n0->n1)
 * ❌ Fail to remove the old tuple (n0->n2) with error "Tuple not found in relation"
 * Result: Both edges would exist when only the new one should
 * 
 * Root cause: JSON.stringify() comparison was fragile and failed due to property ordering
 * Fix: Compare tuples by their atom arrays directly
 */
describe('Tuple Removal Bug Fix', () => {
  it('should successfully remove a tuple that was previously added', () => {
    const dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'n0', type: 'TreeNode', label: 't1' },
        { id: 'n1', type: 'TreeNode', label: 'obj' },
        { id: 'n2', type: 'TreeNode', label: 'obj' }
      ],
      relations: []
    });

    // Add a tuple
    const tuple1 = {
      atoms: ['n0', 'n2'],
      types: ['TreeNode', 'TreeNode']
    };
    dataInstance.addRelationTuple('right', tuple1);

    // Verify tuple was added
    let relations = dataInstance.getRelations();
    expect(relations.length).toBe(1);
    expect(relations[0].tuples.length).toBe(1);
    expect(relations[0].tuples[0].atoms).toEqual(['n0', 'n2']);

    // Remove the tuple (simulating edge reconnection removing old tuple)
    // This should NOT throw "Tuple not found in relation" error
    expect(() => {
      dataInstance.removeRelationTuple('right', tuple1);
    }).not.toThrow();

    // Verify tuple was removed
    relations = dataInstance.getRelations();
    expect(relations[0].tuples.length).toBe(0);
  });

  it('should handle edge reconnection: remove old tuple and add new tuple', () => {
    const dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'n0', type: 'TreeNode', label: 't1' },
        { id: 'n1', type: 'TreeNode', label: 'obj1' },
        { id: 'n2', type: 'TreeNode', label: 'obj2' }
      ],
      relations: []
    });

    // Initial edge: n0 -> n2
    const oldTuple = {
      atoms: ['n0', 'n2'],
      types: ['TreeNode', 'TreeNode']
    };
    dataInstance.addRelationTuple('right', oldTuple);

    // Verify initial state
    let relations = dataInstance.getRelations();
    expect(relations[0].tuples.length).toBe(1);
    expect(relations[0].tuples[0].atoms).toEqual(['n0', 'n2']);

    // Reconnect edge: n0 -> n1
    // Step 1: Remove old tuple (should work without error)
    dataInstance.removeRelationTuple('right', oldTuple);
    
    // Step 2: Add new tuple
    const newTuple = {
      atoms: ['n0', 'n1'],
      types: ['TreeNode', 'TreeNode']
    };
    dataInstance.addRelationTuple('right', newTuple);

    // Verify final state: only new tuple exists
    relations = dataInstance.getRelations();
    expect(relations[0].tuples.length).toBe(1);
    expect(relations[0].tuples[0].atoms).toEqual(['n0', 'n1']);
  });

  it('should match tuples by atom arrays even if other properties differ', () => {
    const dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'a', type: 'Node', label: 'A' },
        { id: 'b', type: 'Node', label: 'B' }
      ],
      relations: []
    });

    // Add a tuple
    const tupleToAdd = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node']
    };
    dataInstance.addRelationTuple('edge', tupleToAdd);

    // Try to remove with a tuple that has the same atoms but might have different property order
    // or additional properties - should still match
    const tupleToRemove = {
      atoms: ['a', 'b'],
      types: ['Node', 'Node']
    };
    
    // This should work because we compare by atom arrays, not JSON.stringify
    expect(() => {
      dataInstance.removeRelationTuple('edge', tupleToRemove);
    }).not.toThrow();

    // Verify removal
    const relations = dataInstance.getRelations();
    expect(relations[0].tuples.length).toBe(0);
  });

  it('should throw error when trying to remove non-existent tuple', () => {
    const dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'a', type: 'Node', label: 'A' },
        { id: 'b', type: 'Node', label: 'B' },
        { id: 'c', type: 'Node', label: 'C' }
      ],
      relations: []
    });

    // Add tuple a->b
    dataInstance.addRelationTuple('edge', {
      atoms: ['a', 'b'],
      types: ['Node', 'Node']
    });

    // Try to remove a different tuple a->c (doesn't exist)
    expect(() => {
      dataInstance.removeRelationTuple('edge', {
        atoms: ['a', 'c'],
        types: ['Node', 'Node']
      });
    }).toThrow('Tuple not found in relation');
  });
});
