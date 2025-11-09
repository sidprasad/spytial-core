import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { IAtom, ITuple } from '../src/data-instance/interfaces';

// Mock the WebColaSpytialGraph parent class
vi.mock('../src/translators/webcola/webcola-spytial-graph', () => ({
  WebColaSpytialGraph: class {
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

  describe('Relation Naming in Deletion Dropdown', () => {
    it('should name relations by ID instead of type', () => {
      // Access the private method for testing
      const updateDeletionSelectsMethod = (graph as any).updateDeletionSelects.bind(graph);
      
      // Mock the control container and dropdown
      const controlsContainer = document.createElement('div');
      const relationDeleteSelect = document.createElement('select');
      relationDeleteSelect.className = 'relation-delete-select';
      
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select relation to delete...';
      relationDeleteSelect.appendChild(defaultOption);
      
      controlsContainer.appendChild(relationDeleteSelect);
      (graph as any).controlsContainer = controlsContainer;

      // Call the method
      updateDeletionSelectsMethod();

      // Check that relations are named by ID, not type
      const options = Array.from(relationDeleteSelect.children) as HTMLOptionElement[];
      const relationOptions = options.slice(1); // Skip the default option

      expect(relationOptions).toHaveLength(2);
      
      // First relation should be "friendship: Alice → Bob"
      expect(relationOptions[0].textContent).toBe('friendship: Alice → Bob');
      expect(relationOptions[0].value).toBe('0');
      
      // Second relation should be "knows: Bob → Charlie"
      expect(relationOptions[1].textContent).toBe('knows: Bob → Charlie');
      expect(relationOptions[1].value).toBe('1');
    });
  });

  describe('N-ary Relation Position Management', () => {
    it('should initialize with 2 empty positions', () => {
      const positions = (graph as any).relationAtomPositions;
      expect(positions).toEqual(['', '']);
    });

    it('should update arity display when positions change', () => {
      // Mock the controls container
      const controlsContainer = document.createElement('div');
      const arityDisplay = document.createElement('span');
      arityDisplay.className = 'arity-display';
      const positionsContainer = document.createElement('div');
      positionsContainer.className = 'atom-positions';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-position-btn';
      
      controlsContainer.appendChild(arityDisplay);
      controlsContainer.appendChild(positionsContainer);
      controlsContainer.appendChild(removeBtn);
      (graph as any).controlsContainer = controlsContainer;

      // Test updating positions
      const updateAtomPositionsMethod = (graph as any).updateAtomPositions.bind(graph);
      
      // Should show arity 2 initially
      updateAtomPositionsMethod();
      expect(arityDisplay.textContent).toBe('2');
      expect(removeBtn.disabled).toBe(true); // Can't remove below 2

      // Add a position
      (graph as any).relationAtomPositions.push('');
      updateAtomPositionsMethod();
      expect(arityDisplay.textContent).toBe('3');
      expect(removeBtn.disabled).toBe(false); // Can remove when > 2
    });

    it('should create ordered position selectors', () => {
      // Mock the controls container
      const controlsContainer = document.createElement('div');
      const arityDisplay = document.createElement('span');
      arityDisplay.className = 'arity-display';
      const positionsContainer = document.createElement('div');
      positionsContainer.className = 'atom-positions';
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-position-btn';
      
      controlsContainer.appendChild(arityDisplay);
      controlsContainer.appendChild(positionsContainer);
      controlsContainer.appendChild(removeBtn);
      (graph as any).controlsContainer = controlsContainer;

      // Set up some atom positions
      (graph as any).relationAtomPositions = ['atom1', 'atom2', 'atom3'];
      
      const updateAtomPositionsMethod = (graph as any).updateAtomPositions.bind(graph);
      updateAtomPositionsMethod();

      // Check that position selectors were created
      const positionDivs = positionsContainer.querySelectorAll('.atom-position');
      expect(positionDivs).toHaveLength(3);

      // Check labels and selected values
      const labels = Array.from(positionDivs).map(div => 
        div.querySelector('label')?.textContent
      );
      expect(labels).toEqual(['Position 1:', 'Position 2:', 'Position 3:']);

      const selects = Array.from(positionDivs).map(div => 
        div.querySelector('select') as HTMLSelectElement
      );
      expect(selects[0].value).toBe('atom1');
      expect(selects[1].value).toBe('atom2');
      expect(selects[2].value).toBe('atom3');
    });
  });

  describe('Relation Button State Management', () => {
    it('should enable button only when enough positions are filled and type is provided', () => {
      // Mock the controls container
      const controlsContainer = document.createElement('div');
      const relationTypeInput = document.createElement('input');
      relationTypeInput.className = 'relation-type-input';
      const addRelationBtn = document.createElement('button');
      addRelationBtn.className = 'add-relation-btn';
      
      controlsContainer.appendChild(relationTypeInput);
      controlsContainer.appendChild(addRelationBtn);
      (graph as any).controlsContainer = controlsContainer;

      const updateRelationButtonStateMethod = (graph as any).updateRelationButtonState.bind(graph);

      // Initially should be disabled (no type, empty positions)
      updateRelationButtonStateMethod();
      expect(addRelationBtn.disabled).toBe(true);

      // Add type but still empty positions
      relationTypeInput.value = 'friend';
      updateRelationButtonStateMethod();
      expect(addRelationBtn.disabled).toBe(true);

      // Fill one position - still not enough
      (graph as any).relationAtomPositions = ['atom1', ''];
      updateRelationButtonStateMethod();
      expect(addRelationBtn.disabled).toBe(true);

      // Fill two positions - should be enabled
      (graph as any).relationAtomPositions = ['atom1', 'atom2'];
      updateRelationButtonStateMethod();
      expect(addRelationBtn.disabled).toBe(false);

      // Remove type - should be disabled again
      relationTypeInput.value = '';
      updateRelationButtonStateMethod();
      expect(addRelationBtn.disabled).toBe(true);
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