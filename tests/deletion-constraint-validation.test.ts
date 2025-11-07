import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

// Mock the WebColaCnDGraph parent class
vi.mock('../src/translators/webcola/webcola-cnd-graph', () => ({
  WebColaCnDGraph: class {
    shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
    private eventListeners: Map<string, Function[]> = new Map();
    
    constructor() {
      // Mock parent constructor
    }
    
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
    
    setAttribute() {
      // Mock setAttribute
    }
    
    async renderLayout() {
      return Promise.resolve();
    }
  }
}));

/**
 * Test suite verifying that deletions properly trigger constraint validation
 * This addresses the core issue: "re run constraint generation and validation EVERY TIME data changes"
 */
describe('Deletion Triggers Constraint Validation', () => {
  let graph: StructuredInputGraph;
  let dataInstance: JSONDataInstance;
  let constraintValidationSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dataInstance = new JSONDataInstance({
      atoms: [
        { id: 'node1', type: 'Entity', label: 'Node 1' },
        { id: 'node2', type: 'Entity', label: 'Node 2' },
        { id: 'node3', type: 'Entity', label: 'Node 3' },
        { id: 'node4', type: 'Entity', label: 'Node 4' }
      ],
      relations: [
        {
          id: 'edge',
          name: 'edge',
          types: ['Entity', 'Entity'],
          tuples: [
            { atoms: ['node1', 'node2'], types: ['Entity', 'Entity'] },
            { atoms: ['node2', 'node3'], types: ['Entity', 'Entity'] },
            { atoms: ['node3', 'node4'], types: ['Entity', 'Entity'] }
          ]
        }
      ]
    });

    graph = new StructuredInputGraph(dataInstance);
    
    // Spy on the enforceConstraintsAndRegenerate method to verify it's called
    constraintValidationSpy = vi.fn();
    const originalMethod = (graph as any).enforceConstraintsAndRegenerate.bind(graph);
    (graph as any).enforceConstraintsAndRegenerate = async function() {
      constraintValidationSpy();
      return await originalMethod();
    };
  });

  describe('Direct data instance deletions', () => {
    it('should trigger constraint validation when removing an atom via data instance', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      // Clear spy from spec loading
      constraintValidationSpy.mockClear();

      // Remove an atom directly via the data instance
      // This should trigger the 'atomRemoved' event, which should call enforceConstraintsAndRegenerate
      dataInstance.removeAtom('node4');

      // Wait for async event handling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Constraint validation should have been triggered
      expect(constraintValidationSpy).toHaveBeenCalled();
    });

    it('should trigger constraint validation when removing a relation tuple via data instance', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      // Clear spy from spec loading
      constraintValidationSpy.mockClear();

      // Remove a tuple directly via the data instance
      // This should trigger the 'relationTupleRemoved' event, which should call enforceConstraintsAndRegenerate
      const tupleToRemove = { atoms: ['node2', 'node3'], types: ['Entity', 'Entity'] };
      dataInstance.removeRelationTuple('edge', tupleToRemove);

      // Wait for async event handling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Constraint validation should have been triggered
      expect(constraintValidationSpy).toHaveBeenCalled();
    });
  });

  describe('UI-triggered deletions', () => {
    it('should trigger constraint validation when deleting atom via UI (deleteAtom method)', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      // Manually setup the controls if needed
      // The deleteAtom is private, but we can test it indirectly through the button click
      // For this test, we'll call it via any cast
      constraintValidationSpy.mockClear();

      // Simulate calling deleteAtom (as would happen via UI button click)
      await (graph as any).deleteAtom('node3');

      // Wait for async event handling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Constraint validation should have been triggered by the atomRemoved event
      expect(constraintValidationSpy).toHaveBeenCalled();
      
      // Verify the atom was actually removed
      const remainingAtoms = dataInstance.getAtoms();
      expect(remainingAtoms.some(a => a.id === 'node3')).toBe(false);
    });

    it('should trigger constraint validation when deleting relation tuple via UI (deleteRelation method)', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      constraintValidationSpy.mockClear();

      // Simulate calling deleteRelation with tuple index 1 (node2->node3)
      // This would normally be called via the UI dropdown and delete button
      await (graph as any).deleteRelation('1');

      // Wait for async event handling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Constraint validation should have been triggered by the relationTupleRemoved event
      expect(constraintValidationSpy).toHaveBeenCalled();
      
      // Verify the tuple was actually removed
      const edgeRelation = dataInstance.getRelations().find(r => r.id === 'edge');
      expect(edgeRelation).toBeDefined();
      // Should have 2 tuples left (was 3, deleted 1)
      expect(edgeRelation!.tuples.length).toBe(2);
      // The deleted tuple (node2->node3) should not exist
      const hasDeletedTuple = edgeRelation!.tuples.some(
        t => t.atoms[0] === 'node2' && t.atoms[1] === 'node3'
      );
      expect(hasDeletedTuple).toBe(false);
    });
  });

  describe('Multiple deletion operations maintain data consistency', () => {
    it('should properly handle multiple atom deletions with constraint validation', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      constraintValidationSpy.mockClear();
      
      // Delete multiple atoms in sequence
      dataInstance.removeAtom('node1');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      dataInstance.removeAtom('node4');
      await new Promise(resolve => setTimeout(resolve, 150));

      // Constraint validation should have been called twice
      expect(constraintValidationSpy).toHaveBeenCalledTimes(2);
      
      // Verify data consistency: should have 2 atoms left
      expect(dataInstance.getAtoms().length).toBe(2);
      
      // Relations involving deleted atoms should be removed
      const edgeRelation = dataInstance.getRelations().find(r => r.id === 'edge');
      // Should only have 1 tuple left (node2->node3), others involved node1 or node4
      expect(edgeRelation!.tuples.length).toBe(1);
      expect(edgeRelation!.tuples[0].atoms).toEqual(['node2', 'node3']);
    });

    it('should properly handle multiple relation tuple deletions with constraint validation', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      constraintValidationSpy.mockClear();
      
      // Delete multiple tuples in sequence
      dataInstance.removeRelationTuple('edge', { atoms: ['node1', 'node2'], types: ['Entity', 'Entity'] });
      await new Promise(resolve => setTimeout(resolve, 150));
      
      dataInstance.removeRelationTuple('edge', { atoms: ['node3', 'node4'], types: ['Entity', 'Entity'] });
      await new Promise(resolve => setTimeout(resolve, 150));

      // Constraint validation should have been called twice
      expect(constraintValidationSpy).toHaveBeenCalledTimes(2);
      
      // Verify data consistency: should have 1 tuple left
      const edgeRelation = dataInstance.getRelations().find(r => r.id === 'edge');
      expect(edgeRelation!.tuples.length).toBe(1);
      expect(edgeRelation!.tuples[0].atoms).toEqual(['node2', 'node3']);
    });
  });

  describe('Event listener management', () => {
    it('should not add duplicate event listeners when calling setDataInstance multiple times', async () => {
      const spec = `
        relations:
          - name: edge
            arity: 2
      `;
      await graph.setCnDSpec(spec);
      
      // Create a new data instance and set it
      const newInstance = new JSONDataInstance({
        atoms: [
          { id: 'a1', type: 'Node', label: 'A1' },
          { id: 'a2', type: 'Node', label: 'A2' }
        ],
        relations: []
      });
      
      // Set the new instance (this should remove old listeners and add new ones)
      graph.setDataInstance(newInstance);
      
      constraintValidationSpy.mockClear();
      
      // Remove an atom from the NEW instance
      newInstance.removeAtom('a1');
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should only be called once (not multiple times due to duplicate listeners)
      expect(constraintValidationSpy).toHaveBeenCalledTimes(1);
    });
  });
});
