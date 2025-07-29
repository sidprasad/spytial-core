import { describe, it, expect } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { IInputDataInstance, IAtom, ITuple } from '../src/data-instance/interfaces';

/**
 * Test to verify that our comprehensive IInputDataInstance tests work
 * with different implementations like PyretDataInstance.
 * 
 * This demonstrates cross-implementation compatibility as requested in the issue.
 */
describe('IInputDataInstance Cross-Implementation Tests', () => {
  
  describe('PyretDataInstance Implementation', () => {
    function createEmptyPyretInstance(): IInputDataInstance {
      // Create an empty Pyret data structure
      const emptyPyretData = {
        dict: {},
        brands: {}
      };
      return new PyretDataInstance(emptyPyretData);
    }

    it('should support basic atom operations with PyretDataInstance', () => {
      const instance = createEmptyPyretInstance();
      
      const testAtom: IAtom = { id: 'test1', type: 'TestType', label: 'Test Atom' };
      
      // Test adding atom
      instance.addAtom(testAtom);
      
      const atoms = instance.getAtoms();
      expect(atoms.length).toBeGreaterThanOrEqual(1);
      
      const addedAtom = atoms.find(a => a.label === 'Test Atom');
      expect(addedAtom).toBeDefined();
      expect(addedAtom!.type).toBe('TestType');
    });

    it('should support basic relation operations with PyretDataInstance', () => {
      const instance = createEmptyPyretInstance();
      
      // Add atoms first
      const atom1: IAtom = { id: 'test1', type: 'TestType', label: 'Test 1' };
      const atom2: IAtom = { id: 'test2', type: 'TestType', label: 'Test 2' };
      
      instance.addAtom(atom1);
      instance.addAtom(atom2);
      
      // Add relation tuple
      const tuple: ITuple = {
        atoms: ['test1', 'test2'],
        types: ['TestType', 'TestType']
      };
      
      instance.addRelationTuple('testRelation', tuple);
      
      const relations = instance.getRelations();
      expect(relations.length).toBeGreaterThanOrEqual(1);
      
      const testRelation = relations.find(r => r.name === 'testRelation');
      expect(testRelation).toBeDefined();
      expect(testRelation!.tuples.length).toBeGreaterThanOrEqual(1);
    });

    it('should support event system with PyretDataInstance', () => {
      const instance = createEmptyPyretInstance();
      
      let eventFired = false;
      const listener = () => { eventFired = true; };
      
      instance.addEventListener('atomAdded', listener);
      
      const testAtom: IAtom = { id: 'event_test', type: 'EventType', label: 'Event Test' };
      instance.addAtom(testAtom);
      
      expect(eventFired).toBe(true);
    });

    it('should support data instance combination with PyretDataInstance', () => {
      const instance1 = createEmptyPyretInstance();
      const instance2 = createEmptyPyretInstance();
      
      // Add some data to instance2
      const atom: IAtom = { id: 'combine_test', type: 'CombineType', label: 'Combine Test' };
      instance2.addAtom(atom);
      
      const initialAtomCount = instance1.getAtoms().length;
      
      // Combine instances
      const result = instance1.addFromDataInstance(instance2, false);
      expect(result).toBe(true);
      
      const finalAtomCount = instance1.getAtoms().length;
      expect(finalAtomCount).toBeGreaterThan(initialAtomCount);
    });

    it('should handle reification with PyretDataInstance', () => {
      const instance = createEmptyPyretInstance();
      
      const testAtom: IAtom = { id: 'reify_test', type: 'ReifyType', label: 'Reify Test' };
      instance.addAtom(testAtom);
      
      const reified = instance.reify();
      expect(reified).toBeDefined();
      expect(typeof reified).toBe('string'); // PyretDataInstance reifies to string
    });
  });

  describe('Implementation Agnostic Interface Tests', () => {
    
    function createEmptyPyretInstance(): IInputDataInstance {
      // Create an empty Pyret data structure
      const emptyPyretData = {
        dict: {},
        brands: {}
      };
      return new PyretDataInstance(emptyPyretData);
    }
    
    function testIInputDataInstanceInterface(createInstance: () => IInputDataInstance) {
      const instance = createInstance();
      
      // Test that all required methods exist and are callable
      expect(typeof instance.addAtom).toBe('function');
      expect(typeof instance.removeAtom).toBe('function');
      expect(typeof instance.addRelationTuple).toBe('function');
      expect(typeof instance.removeRelationTuple).toBe('function');
      expect(typeof instance.addEventListener).toBe('function');
      expect(typeof instance.removeEventListener).toBe('function');
      expect(typeof instance.addFromDataInstance).toBe('function');
      expect(typeof instance.reify).toBe('function');
      expect(typeof instance.getAtoms).toBe('function');
      expect(typeof instance.getRelations).toBe('function');
      expect(typeof instance.getTypes).toBe('function');
      expect(typeof instance.getAtomType).toBe('function');
      expect(typeof instance.applyProjections).toBe('function');
      expect(typeof instance.generateGraph).toBe('function');
    }

    it('should have consistent interface for PyretDataInstance', () => {
      testIInputDataInstanceInterface(() => createEmptyPyretInstance());
    });

    it('should have consistent interface for JSONDataInstance', () => {
      testIInputDataInstanceInterface(() => new JSONDataInstance({ atoms: [], relations: [] }));
    });
  });
});