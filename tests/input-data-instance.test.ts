import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  IInputDataInstance, 
  IAtom, 
  ITuple, 
  IRelation, 
  IType,
  DataInstanceEventType,
  DataInstanceEventListener,
  DataInstanceEvent 
} from '../src/data-instance/interfaces';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { AlloyDataInstance, createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';

/**
 * Factory interface for creating test instances of different IInputDataInstance implementations
 */
interface InstanceFactory {
  /** Create an empty instance */
  createEmpty(): IInputDataInstance;
  /** Create an instance with predefined test data */
  createWithTestData(): IInputDataInstance;
  /** Create an instance with specific data (only works for JSON implementation) */
  createWithData?(data: any): IInputDataInstance;
  /** Implementation name for test descriptions */
  name: string;
}

/**
 * Comprehensive test suite for IInputDataInstance interface.
 * 
 * These tests validate all the key functionality of IInputDataInstance:
 * - Adding/removing atoms
 * - Adding/removing relations
 * - Type management
 * - Event system
 * - Data instance combination
 * - Error handling and edge cases
 * 
 * Tests are designed to be implementation-agnostic and can be run against
 * any class that implements IInputDataInstance (JSONDataInstance, PyretDataInstance, AlloyDataInstance)
 */
function createIInputDataInstanceTestSuite(factory: InstanceFactory) {
  
  /**
   * Factory functions to create test instances using the provided factory.
   */
  function createEmptyInstance(): IInputDataInstance {
    return factory.createEmpty();
  }

  function createInstanceWithTestData(): IInputDataInstance {
    return factory.createWithTestData();
  }

  function createInstanceWithData(data: any): IInputDataInstance {
    if (factory.createWithData) {
      return factory.createWithData(data);
    }
    // Fallback for implementations that don't support arbitrary data
    const instance = factory.createEmpty();
    if (data.atoms) {
      data.atoms.forEach((atom: IAtom) => instance.addAtom(atom));
    }
    if (data.relations) {
      data.relations.forEach((relation: IRelation) => {
        relation.tuples.forEach((tuple: ITuple) => {
          instance.addRelationTuple(relation.name, tuple);
        });
      });
    }
    return instance;
  }

  // Sample test data
  const sampleAtom1: IAtom = { id: 'atom1', type: 'Person', label: 'Alice' };
  const sampleAtom2: IAtom = { id: 'atom2', type: 'Person', label: 'Bob' };
  const sampleAtom3: IAtom = { id: 'atom3', type: 'Company', label: 'TechCorp' };
  
  const sampleTuple1: ITuple = { 
    atoms: ['atom1', 'atom2'], 
    types: ['Person', 'Person'] 
  };
  
  const sampleTuple2: ITuple = { 
    atoms: ['atom1', 'atom3'], 
    types: ['Person', 'Company'] 
  };

  describe('Adding Atoms', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
    });

    it('should add a single atom successfully', () => {
      instance.addAtom(sampleAtom1);
      
      const atoms = instance.getAtoms();
      expect(atoms).toHaveLength(1);
      expect(atoms[0]).toEqual(sampleAtom1);
    });

    it('should add multiple atoms successfully', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addAtom(sampleAtom3);
      
      const atoms = instance.getAtoms();
      expect(atoms).toHaveLength(3);
      expect(atoms.map(a => a.id)).toContain('atom1');
      expect(atoms.map(a => a.id)).toContain('atom2');
      expect(atoms.map(a => a.id)).toContain('atom3');
    });

    it('should automatically create types when adding atoms', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom3);
      
      const types = instance.getTypes();
      expect(types.length).toBeGreaterThanOrEqual(2);
      expect(types.map(t => t.id)).toContain('Person');
      expect(types.map(t => t.id)).toContain('Company');
    });

    it('should throw error when adding atom with duplicate ID', () => {
      instance.addAtom(sampleAtom1);
      
      expect(() => {
        instance.addAtom({ ...sampleAtom1, label: 'Different Label' });
      }).toThrow(/already exists/);
    });

    it('should handle atoms with same label but different IDs', () => {
      const atom1 = { id: 'atom1', type: 'Person', label: 'Alice' };
      const atom2 = { id: 'atom2', type: 'Person', label: 'Alice' };
      
      instance.addAtom(atom1);
      instance.addAtom(atom2);
      
      const atoms = instance.getAtoms();
      expect(atoms).toHaveLength(2);
    });

    it('should handle atoms with same type', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      
      const types = instance.getTypes();
      const personType = types.find(t => t.id === 'Person');
      expect(personType).toBeDefined();
      expect(personType!.atoms).toHaveLength(2);
    });
  });

  describe('Removing Atoms', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addAtom(sampleAtom3);
    });

    it('should remove an existing atom successfully', () => {
      instance.removeAtom('atom1');
      
      const atoms = instance.getAtoms();
      expect(atoms).toHaveLength(2);
      expect(atoms.map(a => a.id)).not.toContain('atom1');
    });

    it('should throw error when removing non-existent atom', () => {
      expect(() => {
        instance.removeAtom('nonexistent');
      }).toThrow(/not found/);
    });

    it('should remove atom from its type when removed', () => {
      const typesBefore = instance.getTypes();
      const personTypeBefore = typesBefore.find(t => t.id === 'Person');
      expect(personTypeBefore!.atoms).toHaveLength(2);
      
      instance.removeAtom('atom1');
      
      const typesAfter = instance.getTypes();
      const personTypeAfter = typesAfter.find(t => t.id === 'Person');
      expect(personTypeAfter!.atoms).toHaveLength(1);
      expect(personTypeAfter!.atoms.map(a => a.id)).not.toContain('atom1');
    });

    it('should remove atom from all relation tuples when removed', () => {
      // First add some relations involving the atom
      instance.addRelationTuple('knows', sampleTuple1);
      instance.addRelationTuple('worksFor', sampleTuple2);
      
      const relationsBefore = instance.getRelations();
      const knowsRelationBefore = relationsBefore.find(r => r.name === 'knows');
      const worksForRelationBefore = relationsBefore.find(r => r.name === 'worksFor');
      expect(knowsRelationBefore!.tuples).toHaveLength(1);
      expect(worksForRelationBefore!.tuples).toHaveLength(1);
      
      // Remove atom1
      instance.removeAtom('atom1');
      
      const relationsAfter = instance.getRelations();
      const knowsRelationAfter = relationsAfter.find(r => r.name === 'knows');
      const worksForRelationAfter = relationsAfter.find(r => r.name === 'worksFor');
      
      // Both relations should have no tuples since atom1 was in both
      expect(knowsRelationAfter!.tuples).toHaveLength(0);
      expect(worksForRelationAfter!.tuples).toHaveLength(0);
    });
  });

  describe('Adding Relation Tuples', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addAtom(sampleAtom3);
    });

    it('should add tuple to new relation', () => {
      instance.addRelationTuple('knows', sampleTuple1);
      
      const relations = instance.getRelations();
      expect(relations).toHaveLength(1);
      expect(relations[0].name).toBe('knows');
      expect(relations[0].tuples).toHaveLength(1);
      expect(relations[0].tuples[0]).toEqual(sampleTuple1);
    });

    it('should add tuple to existing relation', () => {
      instance.addRelationTuple('knows', sampleTuple1);
      
      const newTuple: ITuple = { 
        atoms: ['atom2', 'atom3'], 
        types: ['Person', 'Company'] 
      };
      instance.addRelationTuple('knows', newTuple);
      
      const relations = instance.getRelations();
      const knowsRelation = relations.find(r => r.name === 'knows');
      expect(knowsRelation!.tuples).toHaveLength(2);
    });

    it('should merge types when adding to existing relation', () => {
      instance.addRelationTuple('relation1', sampleTuple1);
      
      const newTuple: ITuple = { 
        atoms: ['atom1', 'atom3'], 
        types: ['Person', 'Company'] 
      };
      instance.addRelationTuple('relation1', newTuple);
      
      const relations = instance.getRelations();
      const relation = relations.find(r => r.name === 'relation1');
      expect(relation!.types).toContain('Person');
      expect(relation!.types).toContain('Company');
    });

    it('should throw error when referencing non-existent atoms', () => {
      const invalidTuple: ITuple = {
        atoms: ['atom1', 'nonexistent'],
        types: ['Person', 'Person']
      };
      
      expect(() => {
        instance.addRelationTuple('knows', invalidTuple);
      }).toThrow(/does not exist/);
    });

    it('should handle empty tuples', () => {
      const emptyTuple: ITuple = { atoms: [], types: [] };
      
      instance.addRelationTuple('empty', emptyTuple);
      
      const relations = instance.getRelations();
      const emptyRelation = relations.find(r => r.name === 'empty');
      expect(emptyRelation!.tuples).toHaveLength(1);
      expect(emptyRelation!.tuples[0].atoms).toHaveLength(0);
    });

    it('should handle single-atom tuples', () => {
      const singleTuple: ITuple = { atoms: ['atom1'], types: ['Person'] };
      
      instance.addRelationTuple('single', singleTuple);
      
      const relations = instance.getRelations();
      const singleRelation = relations.find(r => r.name === 'single');
      expect(singleRelation!.tuples[0].atoms).toHaveLength(1);
    });

    it('should handle large tuples', () => {
      const largeTuple: ITuple = { 
        atoms: ['atom1', 'atom2', 'atom3'], 
        types: ['Person', 'Person', 'Company'] 
      };
      
      instance.addRelationTuple('large', largeTuple);
      
      const relations = instance.getRelations();
      const largeRelation = relations.find(r => r.name === 'large');
      expect(largeRelation!.tuples[0].atoms).toHaveLength(3);
    });
  });

  describe('Removing Relation Tuples', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addAtom(sampleAtom3);
      instance.addRelationTuple('knows', sampleTuple1);
      instance.addRelationTuple('worksFor', sampleTuple2);
    });

    it('should remove existing tuple from relation', () => {
      instance.removeRelationTuple('knows', sampleTuple1);
      
      const relations = instance.getRelations();
      const knowsRelation = relations.find(r => r.name === 'knows');
      expect(knowsRelation!.tuples).toHaveLength(0);
    });

    it('should throw error when removing from non-existent relation', () => {
      expect(() => {
        instance.removeRelationTuple('nonexistent', sampleTuple1);
      }).toThrow(/not found/);
    });

    it('should throw error when removing non-existent tuple', () => {
      const nonExistentTuple: ITuple = {
        atoms: ['atom2', 'atom3'],
        types: ['Person', 'Company']
      };
      
      expect(() => {
        instance.removeRelationTuple('knows', nonExistentTuple);
      }).toThrow(/not found/);
    });

    it('should only remove exact matching tuples', () => {
      // Add another tuple to the same relation
      const anotherTuple: ITuple = {
        atoms: ['atom2', 'atom1'], // Different order
        types: ['Person', 'Person']
      };
      instance.addRelationTuple('knows', anotherTuple);
      
      const relationsBefore = instance.getRelations();
      const knowsRelationBefore = relationsBefore.find(r => r.name === 'knows');
      expect(knowsRelationBefore!.tuples).toHaveLength(2);
      
      // Remove only the first tuple
      instance.removeRelationTuple('knows', sampleTuple1);
      
      const relationsAfter = instance.getRelations();
      const knowsRelationAfter = relationsAfter.find(r => r.name === 'knows');
      expect(knowsRelationAfter!.tuples).toHaveLength(1);
      expect(knowsRelationAfter!.tuples[0]).toEqual(anotherTuple);
    });
  });

  describe('Event System', () => {
    let instance: IInputDataInstance;
    let events: DataInstanceEvent[];
    let listener: DataInstanceEventListener;

    beforeEach(() => {
      instance = createEmptyInstance();
      events = [];
      listener = (event: DataInstanceEvent) => {
        events.push(event);
      };
    });

    it('should emit atomAdded event when adding atom', () => {
      instance.addEventListener('atomAdded', listener);
      instance.addAtom(sampleAtom1);
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('atomAdded');
      expect(events[0].data.atom).toEqual(sampleAtom1);
    });

    it('should emit atomRemoved event when removing atom', () => {
      instance.addAtom(sampleAtom1);
      instance.addEventListener('atomRemoved', listener);
      instance.removeAtom('atom1');
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('atomRemoved');
      expect(events[0].data.atomId).toBe('atom1');
    });

    it('should emit relationTupleAdded event when adding tuple', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addEventListener('relationTupleAdded', listener);
      instance.addRelationTuple('knows', sampleTuple1);
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('relationTupleAdded');
      expect(events[0].data.relationId).toBe('knows');
      expect(events[0].data.tuple).toEqual(sampleTuple1);
    });

    it('should emit relationTupleRemoved event when removing tuple', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addRelationTuple('knows', sampleTuple1);
      instance.addEventListener('relationTupleRemoved', listener);
      instance.removeRelationTuple('knows', sampleTuple1);
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('relationTupleRemoved');
      expect(events[0].data.relationId).toBe('knows');
      expect(events[0].data.tuple).toEqual(sampleTuple1);
    });

    it('should support multiple listeners for same event', () => {
      const events2: DataInstanceEvent[] = [];
      const listener2 = (event: DataInstanceEvent) => events2.push(event);
      
      instance.addEventListener('atomAdded', listener);
      instance.addEventListener('atomAdded', listener2);
      instance.addAtom(sampleAtom1);
      
      expect(events).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('should remove event listeners correctly', () => {
      instance.addEventListener('atomAdded', listener);
      instance.addAtom(sampleAtom1);
      expect(events).toHaveLength(1);
      
      instance.removeEventListener('atomAdded', listener);
      instance.addAtom(sampleAtom2);
      expect(events).toHaveLength(1); // No new events
    });

    it('should not throw when removing non-existent listener', () => {
      expect(() => {
        instance.removeEventListener('atomAdded', listener);
      }).not.toThrow();
    });

    it('should handle errors in event listeners gracefully', () => {
      const faultyListener = () => {
        throw new Error('Listener error');
      };
      
      instance.addEventListener('atomAdded', faultyListener);
      instance.addEventListener('atomAdded', listener);
      
      // Should not throw despite the faulty listener
      expect(() => {
        instance.addAtom(sampleAtom1);
      }).not.toThrow();
      
      // The good listener should still work
      expect(events).toHaveLength(1);
    });
  });

  describe('Combining Data Instances', () => {
    let instance1: IInputDataInstance;
    let instance2: IInputDataInstance;

    beforeEach(() => {
      instance1 = createInstanceWithData({
        atoms: [sampleAtom1, sampleAtom2],
        relations: [{
          id: 'knows',
          name: 'knows',
          types: ['Person', 'Person'],
          tuples: [sampleTuple1]
        }]
      });

      instance2 = createInstanceWithData({
        atoms: [sampleAtom3],
        relations: [{
          id: 'worksFor',
          name: 'worksFor',
          types: ['Person', 'Company'],
          tuples: [{
            atoms: ['atom1', 'atom3'], // Note: atom1 will need to be remapped
            types: ['Person', 'Company']
          }]
        }]
      });
    });

    it('should successfully combine two instances', () => {
      const result = instance1.addFromDataInstance(instance2, false);
      
      expect(result).toBe(true);
      
      const atoms = instance1.getAtoms();
      const relations = instance1.getRelations();
      
      expect(atoms.length).toBeGreaterThanOrEqual(3); // Original 2 + at least 1 from instance2
      expect(relations).toHaveLength(2); // knows + worksFor
    });

    it('should handle ID conflicts by generating new IDs', () => {
      // Add an atom with same ID but different type to instance2
      const conflictingInstance = createInstanceWithData({
        atoms: [{ id: 'atom1', type: 'Robot', label: 'R2D2' }],
        relations: []
      });
      
      const atomsBefore = instance1.getAtoms();
      const atom1Before = atomsBefore.find(a => a.id === 'atom1');
      expect(atom1Before!.type).toBe('Person');
      
      const result = instance1.addFromDataInstance(conflictingInstance, false);
      expect(result).toBe(true);
      
      const atomsAfter = instance1.getAtoms();
      expect(atomsAfter.length).toBeGreaterThanOrEqual(atomsBefore.length);
      
      // Original atom1 should still be there
      const originalAtom1 = atomsAfter.find(a => a.id === 'atom1');
      expect(originalAtom1!.type).toBe('Person');
      
      // New robot atom should be there with different ID
      const robotAtom = atomsAfter.find(a => a.type === 'Robot');
      expect(robotAtom).toBeDefined();
      expect(robotAtom!.id).not.toBe('atom1');
    });

    it('should merge relations with same name', () => {
      // Create instance with same relation name but different tuples
      const sameRelationInstance = createInstanceWithData({
        atoms: [{ id: 'atom4', type: 'Person', label: 'Charlie' }],
        relations: [{
          id: 'knows',
          name: 'knows',
          types: ['Person', 'Person'],
          tuples: [{
            atoms: ['atom1', 'atom4'], // Will be remapped
            types: ['Person', 'Person']
          }]
        }]
      });
      
      const relationsBefore = instance1.getRelations();
      const knowsRelationBefore = relationsBefore.find(r => r.name === 'knows');
      expect(knowsRelationBefore!.tuples).toHaveLength(1);
      
      const result = instance1.addFromDataInstance(sameRelationInstance, false);
      expect(result).toBe(true);
      
      const relationsAfter = instance1.getRelations();
      const knowsRelationAfter = relationsAfter.find(r => r.name === 'knows');
      expect(knowsRelationAfter!.tuples.length).toBeGreaterThan(1);
    });

    it('should handle unifyBuiltIns parameter correctly', () => {
      // This test would be more meaningful with actual built-in types
      // For now, we just verify the parameter is accepted
      const result1 = instance1.addFromDataInstance(instance2, true);
      expect(result1).toBe(true);
      
      const fresh = createInstanceWithData({
        atoms: [sampleAtom1, sampleAtom2],
        relations: []
      });
      const result2 = fresh.addFromDataInstance(instance2, false);
      expect(result2).toBe(true);
    });

    it('should handle empty instances', () => {
      const emptyInstance = createEmptyInstance();
      const result = instance1.addFromDataInstance(emptyInstance, false);
      expect(result).toBe(true);
      
      // Should not change anything
      expect(instance1.getAtoms()).toHaveLength(2);
      expect(instance1.getRelations()).toHaveLength(1);
    });

    it('should return false for invalid input', () => {
      const result = instance1.addFromDataInstance(null as any, false);
      expect(result).toBe(false);
    });
  });

  describe('Type Management', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
    });

    it('should automatically create types when adding atoms', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom3);
      
      const types = instance.getTypes();
      expect(types.length).toBeGreaterThanOrEqual(2);
      
      const personType = types.find(t => t.id === 'Person');
      const companyType = types.find(t => t.id === 'Company');
      
      expect(personType).toBeDefined();
      expect(companyType).toBeDefined();
    });

    it('should maintain atom-type relationships', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      
      const types = instance.getTypes();
      const personType = types.find(t => t.id === 'Person');
      
      expect(personType!.atoms).toHaveLength(2);
      expect(personType!.atoms.map(a => a.id)).toContain('atom1');
      expect(personType!.atoms.map(a => a.id)).toContain('atom2');
    });

    it('should get atom type correctly', () => {
      instance.addAtom(sampleAtom1);
      
      const atomType = instance.getAtomType('atom1');
      expect(atomType.id).toBe('Person');
    });

    it('should throw error when getting type for non-existent atom', () => {
      expect(() => {
        instance.getAtomType('nonexistent');
      }).toThrow(/not found/);
    });
  });

  describe('Data Integrity and Validation', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
    });

    it('should maintain referential integrity when removing atoms', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addRelationTuple('knows', sampleTuple1);
      
      // Verify tuple exists
      let relations = instance.getRelations();
      expect(relations[0].tuples).toHaveLength(1);
      
      // Remove one of the atoms in the tuple
      instance.removeAtom('atom1');
      
      // Tuple should be removed
      relations = instance.getRelations();
      expect(relations[0].tuples).toHaveLength(0);
    });

    it('should generate valid graphs', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addRelationTuple('knows', sampleTuple1);
      
      const graph = instance.generateGraph(false, false);
      expect(graph).toBeDefined();
      expect(graph.nodes()).toContain('atom1');
      expect(graph.nodes()).toContain('atom2');
      expect(graph.edges().length).toBeGreaterThan(0);
    });

    it('should handle projections correctly', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addAtom(sampleAtom3);
      instance.addRelationTuple('knows', sampleTuple1);
      instance.addRelationTuple('worksFor', sampleTuple2);
      
      const projection = instance.applyProjections(['atom1', 'atom2']);
      expect(projection.getAtoms()).toHaveLength(2);
      
      const relations = projection.getRelations();
      const knowsRelation = relations.find(r => r.name === 'knows');
      const worksForRelation = relations.find(r => r.name === 'worksFor');
      
      expect(knowsRelation?.tuples).toHaveLength(1); // Both atoms in projection
      
      // worksForRelation might not exist if it has no tuples after projection
      if (worksForRelation) {
        expect(worksForRelation.tuples).toHaveLength(0); // atom3 not in projection
      } else {
        // Relation was filtered out completely, which is also valid
        expect(relations.find(r => r.name === 'worksFor')).toBeUndefined();
      }
    });

    it('should reify data correctly', () => {
      instance.addAtom(sampleAtom1);
      instance.addAtom(sampleAtom2);
      instance.addRelationTuple('knows', sampleTuple1);
      
      const reified = instance.reify();
      expect(reified).toBeDefined();
      
      // Create new instance from reified data to test round-trip
      const newInstance = createInstanceWithData(reified as IJsonDataInstance);
      expect(newInstance.getAtoms()).toHaveLength(2);
      expect(newInstance.getRelations()).toHaveLength(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let instance: IInputDataInstance;

    beforeEach(() => {
      instance = createEmptyInstance();
    });

    it('should handle atoms with special characters in IDs', () => {
      const specialAtom: IAtom = { id: 'atom@#$%', type: 'Special', label: 'Special Atom' };
      
      instance.addAtom(specialAtom);
      
      const atoms = instance.getAtoms();
      expect(atoms[0].id).toBe('atom@#$%');
      
      instance.removeAtom('atom@#$%');
      expect(instance.getAtoms()).toHaveLength(0);
    });

    it('should handle empty string labels and types', () => {
      const emptyAtom: IAtom = { id: 'empty', type: '', label: '' };
      
      instance.addAtom(emptyAtom);
      
      const atoms = instance.getAtoms();
      expect(atoms[0].type).toBe('');
      expect(atoms[0].label).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const longAtom: IAtom = { id: 'long', type: longString, label: longString };
      
      instance.addAtom(longAtom);
      
      const atoms = instance.getAtoms();
      expect(atoms[0].type).toBe(longString);
      expect(atoms[0].label).toBe(longString);
    });

    it('should handle unicode characters', () => {
      const unicodeAtom: IAtom = { id: 'unicode', type: '类型', label: '🚀 Test 中文' };
      
      instance.addAtom(unicodeAtom);
      
      const atoms = instance.getAtoms();
      expect(atoms[0].type).toBe('类型');
      expect(atoms[0].label).toBe('🚀 Test 中文');
    });

    it('should handle large numbers of atoms efficiently', () => {
      const start = performance.now();
      
      // Add 1000 atoms
      for (let i = 0; i < 1000; i++) {
        instance.addAtom({ id: `atom${i}`, type: 'TestType', label: `Atom ${i}` });
      }
      
      const end = performance.now();
      expect(end - start).toBeLessThan(1000); // Should complete in under 1 second
      
      expect(instance.getAtoms()).toHaveLength(1000);
    });
  });
}

// Factory implementations for each IInputDataInstance type

/**
 * JSON Data Instance Factory
 */
const jsonFactory: InstanceFactory = {
  name: 'JSONDataInstance',
  createEmpty: () => new JSONDataInstance({ atoms: [], relations: [] }),
  createWithTestData: () => new JSONDataInstance({
    atoms: [
      { id: 'testAtom1', type: 'TestType', label: 'Test 1' },
      { id: 'testAtom2', type: 'TestType', label: 'Test 2' }
    ],
    relations: [
      {
        id: 'testRelation',
        name: 'testRel',
        types: ['TestType', 'TestType'],
        tuples: [{ atoms: ['testAtom1', 'testAtom2'], types: ['TestType', 'TestType'] }]
      }
    ]
  }),
  createWithData: (data: IJsonDataInstance) => new JSONDataInstance(data)
};

/**
 * Pyret Data Instance Factory
 */
const pyretFactory: InstanceFactory = {
  name: 'PyretDataInstance',
  createEmpty: () => new PyretDataInstance(null, false),
  createWithTestData: () => {
    // Create a simple Pyret object with test data
    const pyretData = {
      dict: {
        value: 'testValue',
        relation: {
          dict: { value: 'relatedValue' },
          brands: { '$testtype': true }
        }
      },
      brands: { '$testtype': true }
    };
    return new PyretDataInstance(pyretData, false);
  }
};

/**
 * Alloy Data Instance Factory
 */
const alloyFactory: InstanceFactory = {
  name: 'AlloyDataInstance',
  createEmpty: () => createEmptyAlloyDataInstance(),
  createWithTestData: () => {
    const instance = createEmptyAlloyDataInstance();
    // Add some test data
    instance.addAtom({ id: 'testAtom1', type: 'TestType', label: 'Test 1' });
    instance.addAtom({ id: 'testAtom2', type: 'TestType', label: 'Test 2' });
    instance.addRelationTuple('testRel', { 
      atoms: ['testAtom1', 'testAtom2'], 
      types: ['TestType', 'TestType'] 
    });
    return instance;
  }
};

// Run the comprehensive test suite against all implementations
describe('IInputDataInstance Comprehensive Tests', () => {
  describe('JSONDataInstance Implementation', () => {
    createIInputDataInstanceTestSuite(jsonFactory);
  });

  describe('PyretDataInstance Implementation', () => {
    createIInputDataInstanceTestSuite(pyretFactory);
  });

  describe('AlloyDataInstance Implementation', () => {
    createIInputDataInstanceTestSuite(alloyFactory);
  });
});