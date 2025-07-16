import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { IAtom, ITuple, IInputDataInstance } from '../src/data-instance/interfaces';

describe('Centralized State Management Logic', () => {
  let dataInstance: JSONDataInstance;

  beforeEach(() => {
    const emptyData: IJsonDataInstance = {
      atoms: [],
      relations: []
    };
    dataInstance = new JSONDataInstance(emptyData);
  });

  describe('Data Instance State Management', () => {
    it('should manage atoms through state change listeners', () => {
      const listeners: IInputDataInstance[] = [];
      const mockStateChangeListener = (instance: IInputDataInstance) => {
        listeners.push(instance);
      };

      // Mock the functionality that would be in the graph component
      const simulateStateChanges = () => {
        // Add atom
        const atom: IAtom = { id: 'atom1', type: 'Person', label: 'Alice' };
        dataInstance.addAtom(atom);
        mockStateChangeListener(dataInstance);

        // Remove atom  
        dataInstance.removeAtom('atom1');
        mockStateChangeListener(dataInstance);
      };

      simulateStateChanges();
      
      expect(listeners).toHaveLength(2);
      expect(listeners[0]).toBe(dataInstance);
      expect(listeners[1]).toBe(dataInstance);
    });

    it('should manage relation tuples through state changes', () => {
      const stateChangeEvents: string[] = [];
      
      const mockGraphStateManager = {
        inputDataInstance: dataInstance,
        stateChangeListeners: new Set<(instance: IInputDataInstance) => void>(),
        
        addStateChangeListener(listener: (instance: IInputDataInstance) => void) {
          this.stateChangeListeners.add(listener);
        },
        
        addRelationTuple(relationId: string, tuple: ITuple) {
          if (!this.inputDataInstance) {
            throw new Error('No data instance set');
          }
          this.inputDataInstance.addRelationTuple(relationId, tuple);
          this.notifyStateChange();
        },
        
        removeRelationTuple(relationId: string, tuple: ITuple) {
          if (!this.inputDataInstance) {
            throw new Error('No data instance set');  
          }
          this.inputDataInstance.removeRelationTuple(relationId, tuple);
          this.notifyStateChange();
        },
        
        notifyStateChange() {
          if (this.inputDataInstance) {
            this.stateChangeListeners.forEach(listener => {
              listener(this.inputDataInstance!);
            });
          }
        }
      };

      // Add required atoms first
      const atom1: IAtom = { id: 'atom1', type: 'Person', label: 'Alice' };
      const atom2: IAtom = { id: 'atom2', type: 'Person', label: 'Bob' };
      dataInstance.addAtom(atom1);
      dataInstance.addAtom(atom2);

      // Add listener to track state changes
      mockGraphStateManager.addStateChangeListener((instance) => {
        stateChangeEvents.push(`state-change-${instance.getAtoms().length}-atoms`);
      });

      // Test adding relation tuple
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      mockGraphStateManager.addRelationTuple('friends', tuple);
      
      // Test removing relation tuple
      mockGraphStateManager.removeRelationTuple('friends', tuple);
      
      expect(stateChangeEvents).toEqual([
        'state-change-2-atoms', // After adding relation
        'state-change-2-atoms'  // After removing relation
      ]);
    });

    it('should handle multiple state change listeners', () => {
      const listener1Events: string[] = [];
      const listener2Events: string[] = [];
      
      const mockCentralStateManager = {
        inputDataInstance: dataInstance,
        stateChangeListeners: new Set<(instance: IInputDataInstance) => void>(),
        
        addStateChangeListener(listener: (instance: IInputDataInstance) => void) {
          this.stateChangeListeners.add(listener);
        },
        
        removeStateChangeListener(listener: (instance: IInputDataInstance) => void) {
          this.stateChangeListeners.delete(listener);
        },
        
        addAtom(atom: IAtom) {
          if (!this.inputDataInstance) {
            throw new Error('No data instance set');
          }
          this.inputDataInstance.addAtom(atom);
          this.notifyStateChange();
        },
        
        notifyStateChange() {
          if (this.inputDataInstance) {
            this.stateChangeListeners.forEach(listener => {
              listener(this.inputDataInstance!);
            });
          }
        }
      };

      const listener1 = (instance: IInputDataInstance) => {
        listener1Events.push(`listener1-${instance.getAtoms().length}`);
      };
      
      const listener2 = (instance: IInputDataInstance) => {
        listener2Events.push(`listener2-${instance.getAtoms().length}`);
      };

      // Add both listeners
      mockCentralStateManager.addStateChangeListener(listener1);
      mockCentralStateManager.addStateChangeListener(listener2);
      
      // Add an atom
      const atom: IAtom = { id: 'atom1', type: 'Person', label: 'Alice' };
      mockCentralStateManager.addAtom(atom);
      
      expect(listener1Events).toEqual(['listener1-1']);
      expect(listener2Events).toEqual(['listener2-1']);
      
      // Remove one listener
      mockCentralStateManager.removeStateChangeListener(listener1);
      
      // Add another atom
      const atom2: IAtom = { id: 'atom2', type: 'Person', label: 'Bob' };
      mockCentralStateManager.addAtom(atom2);
      
      // Only listener2 should have been called
      expect(listener1Events).toEqual(['listener1-1']);
      expect(listener2Events).toEqual(['listener2-1', 'listener2-2']);
    });

    it('should provide data instance statistics', () => {
      // Add test data
      const atom1: IAtom = { id: 'atom1', type: 'Person', label: 'Alice' };
      const atom2: IAtom = { id: 'atom2', type: 'Person', label: 'Bob' };
      dataInstance.addAtom(atom1);
      dataInstance.addAtom(atom2);
      
      const tuple: ITuple = { atoms: ['atom1', 'atom2'], types: ['Person', 'Person'] };
      dataInstance.addRelationTuple('friends', tuple);

      // Mock the stats functionality
      const getDataInstanceStats = (instance: IInputDataInstance | null) => {
        if (!instance) {
          return null;
        }
        
        const atoms = instance.getAtoms();
        const relations = instance.getRelations();
        const tupleCount = relations.reduce((sum, rel) => sum + rel.tuples.length, 0);
        
        return {
          atoms: atoms.length,
          relations: relations.length,
          tuples: tupleCount
        };
      };

      const stats = getDataInstanceStats(dataInstance);
      expect(stats).toEqual({
        atoms: 2,
        relations: 1,
        tuples: 1
      });
      
      const nullStats = getDataInstanceStats(null);
      expect(nullStats).toBeNull();
    });

    it('should consolidate edge operations with state management', () => {
      const stateChangeEvents: Array<{ type: string; data: any }> = [];
      
      // Mock the centralized edge and atom management system
      const mockGraphComponent = {
        inputDataInstance: dataInstance,
        stateChangeListeners: new Set<(instance: IInputDataInstance) => void>(),
        
        setDataInstance(instance: IInputDataInstance) {
          this.inputDataInstance = instance;
          this.notifyStateChange();
        },
        
        addAtom(atom: IAtom) {
          if (!this.inputDataInstance) {
            throw new Error('No data instance set. Call setDataInstance() first.');
          }
          this.inputDataInstance.addAtom(atom);
          this.notifyStateChange();
          this.dispatchEvent('atom-added', { atom });
        },
        
        addRelationTuple(relationId: string, tuple: ITuple) {
          if (!this.inputDataInstance) {
            throw new Error('No data instance set. Call setDataInstance() first.');
          }
          this.inputDataInstance.addRelationTuple(relationId, tuple);
          this.notifyStateChange();
          this.dispatchEvent('relation-tuple-added', { relationId, tuple });
        },
        
        addStateChangeListener(listener: (instance: IInputDataInstance) => void) {
          this.stateChangeListeners.add(listener);
        },
        
        notifyStateChange() {
          if (this.inputDataInstance) {
            this.stateChangeListeners.forEach(listener => {
              listener(this.inputDataInstance!);
            });
            this.dispatchEvent('data-instance-changed', { instance: this.inputDataInstance });
          }
        },
        
        dispatchEvent(type: string, detail: any) {
          stateChangeEvents.push({ type, data: detail });
        }
      };

      // Set up state change listener
      mockGraphComponent.addStateChangeListener((instance) => {
        stateChangeEvents.push({ 
          type: 'state-change', 
          data: { 
            atoms: instance.getAtoms().length,
            relations: instance.getRelations().length
          }
        });
      });

      // Set the data instance
      mockGraphComponent.setDataInstance(dataInstance);
      
      // Add atoms (like ReplInterface would do)
      const atom1: IAtom = { id: 'alice', type: 'Person', label: 'Alice' };
      const atom2: IAtom = { id: 'bob', type: 'Person', label: 'Bob' };
      mockGraphComponent.addAtom(atom1);
      mockGraphComponent.addAtom(atom2);
      
      // Add edge/relation (like edge input mode would do)
      const tuple: ITuple = { atoms: ['alice', 'bob'], types: ['Person', 'Person'] };
      mockGraphComponent.addRelationTuple('friends', tuple);
      
      // Verify all operations triggered events and state changes
      // 1 setDataInstance + 2 addAtom + 1 addRelationTuple = 4 operations
      // Each operation triggers: state-change + data-instance-changed, plus addAtom/addRelationTuple trigger their specific events
      // So: 1×2 + 2×3 + 1×3 = 11 total events
      expect(stateChangeEvents).toHaveLength(11);
      
      // Check that events include the right types
      const eventTypes = stateChangeEvents.map(e => e.type);
      expect(eventTypes).toContain('data-instance-changed');
      expect(eventTypes).toContain('atom-added');
      expect(eventTypes).toContain('relation-tuple-added');
      expect(eventTypes).toContain('state-change');
    });
  });
});