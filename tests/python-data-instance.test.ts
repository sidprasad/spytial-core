import { describe, it, expect, beforeEach } from 'vitest';
import { PythonDataInstance, createPythonDataInstance, isPythonDataInstance } from '../src/data-instance/python/python-data-instance';

describe('PythonDataInstance', () => {
  let instance: PythonDataInstance;

  beforeEach(() => {
    instance = new PythonDataInstance();
  });

  describe('constructor', () => {
    it('should create empty instance when no data provided', () => {
      expect(instance.getAtoms()).toHaveLength(0);
      expect(instance.getRelations()).toHaveLength(0);
    });

    it('should parse simple Python object', () => {
      const pythonData = {
        value: 42,
        name: "test",
        __class__: { __name__: "TestObject" }
      };

      const testInstance = new PythonDataInstance(pythonData);
      const atoms = testInstance.getAtoms();
      const relations = testInstance.getRelations();

      expect(atoms.length).toBeGreaterThan(0);
      expect(relations.length).toBeGreaterThan(0);
      
      // Should have atoms for the object and its primitive values
      const objectAtom = atoms.find(atom => atom.type === 'TestObject');
      const valueAtom = atoms.find(atom => atom.type === 'int' && atom.label === '42');
      const nameAtom = atoms.find(atom => atom.type === 'str' && atom.label === 'test');
      
      expect(objectAtom).toBeDefined();
      expect(valueAtom).toBeDefined();
      expect(nameAtom).toBeDefined();
    });

    it('should handle nested Python objects', () => {
      const pythonData = {
        left: {
          value: 1,
          __class__: { __name__: "Node" }
        },
        right: {
          value: 2,
          __class__: { __name__: "Node" }
        },
        __class__: { __name__: "Tree" }
      };

      const testInstance = new PythonDataInstance(pythonData);
      const atoms = testInstance.getAtoms();
      
      // Should have atoms for tree and both nodes
      const treeAtom = atoms.find(atom => atom.type === 'Tree');
      const nodeAtoms = atoms.filter(atom => atom.type === 'Node');
      
      expect(treeAtom).toBeDefined();
      expect(nodeAtoms).toHaveLength(2);
    });
  });

  describe('atom management', () => {
    it('should add atoms correctly', () => {
      const atom = {
        id: 'test_1',
        type: 'str',
        label: 'hello'
      };

      instance.addAtom(atom);
      
      const atoms = instance.getAtoms();
      expect(atoms).toHaveLength(1);
      expect(atoms[0]).toEqual(atom);
    });

    it('should remove atoms correctly', () => {
      const atom = {
        id: 'test_1',
        type: 'str',
        label: 'hello'
      };

      instance.addAtom(atom);
      expect(instance.getAtoms()).toHaveLength(1);
      
      instance.removeAtom('test_1');
      expect(instance.getAtoms()).toHaveLength(0);
    });
  });

  describe('relation management', () => {
    it('should add relation tuples correctly', () => {
      const atom1 = { id: 'obj_1', type: 'object', label: 'obj1' };
      const atom2 = { id: 'str_1', type: 'str', label: 'value' };
      
      instance.addAtom(atom1);
      instance.addAtom(atom2);
      
      instance.addRelationTuple('name', {
        atoms: ['obj_1', 'str_1'],
        types: ['object', 'str']
      });
      
      const relations = instance.getRelations();
      expect(relations).toHaveLength(1);
      expect(relations[0].name).toBe('name');
      expect(relations[0].tuples).toHaveLength(1);
    });
  });

  describe('reification', () => {
    it('should reify empty instance', () => {
      const result = instance.reify();
      expect(result).toBe('# No root atoms found');
    });

    it('should reify primitive values', () => {
      const atom = {
        id: 'str_1',
        type: 'str',
        label: 'hello'
      };
      
      instance.addAtom(atom);
      const result = instance.reify();
      expect(result).toBe('"hello"');
    });

    it('should reify simple object with relations', () => {
      const objAtom = { id: 'obj_1', type: 'Person', label: 'Person_1' };
      const nameAtom = { id: 'str_1', type: 'str', label: 'Alice' };
      
      instance.addAtom(objAtom);
      instance.addAtom(nameAtom);
      
      instance.addRelationTuple('name', {
        atoms: ['obj_1', 'str_1'],
        types: ['Person', 'str']
      });
      
      const result = instance.reify();
      expect(result).toBe('Person(name="Alice")');
    });
  });

  describe('type management', () => {
    it('should track types correctly', () => {
      const atom1 = { id: 'str_1', type: 'str', label: 'hello' };
      const atom2 = { id: 'int_1', type: 'int', label: '42' };
      
      instance.addAtom(atom1);
      instance.addAtom(atom2);
      
      const types = instance.getTypes();
      expect(types.length).toBeGreaterThanOrEqual(2);
      
      const strType = types.find(t => t.id === 'str');
      const intType = types.find(t => t.id === 'int');
      
      expect(strType).toBeDefined();
      expect(intType).toBeDefined();
      expect(strType?.atoms).toHaveLength(1);
      expect(intType?.atoms).toHaveLength(1);
    });
  });

  describe('graph generation', () => {
    it('should generate graph with atoms and relations', () => {
      const atom1 = { id: 'obj_1', type: 'object', label: 'obj1' };
      const atom2 = { id: 'str_1', type: 'str', label: 'value' };
      
      instance.addAtom(atom1);
      instance.addAtom(atom2);
      
      instance.addRelationTuple('name', {
        atoms: ['obj_1', 'str_1'],
        types: ['object', 'str']
      });
      
      const graph = instance.generateGraph();
      
      expect(graph.nodes()).toHaveLength(2);
      expect(graph.edges()).toHaveLength(1);
    });
  });

  describe('external evaluator integration', () => {
    it('should track external evaluator', () => {
      expect(instance.hasExternalEvaluator()).toBe(false);
      
      const mockEvaluator = {
        runPython: async (code: string) => Promise.resolve(eval(code))
      };
      
      instance.setExternalEvaluator(mockEvaluator);
      expect(instance.hasExternalEvaluator()).toBe(true);
      expect(instance.getExternalEvaluator()).toBe(mockEvaluator);
    });
  });
});

describe('factory functions', () => {
  describe('createPythonDataInstance', () => {
    it('should create instance from JSON string', () => {
      const jsonData = '{"value": 42, "__class__": {"__name__": "TestObject"}}';
      const instance = createPythonDataInstance(jsonData);
      
      expect(instance).toBeInstanceOf(PythonDataInstance);
      expect(instance.getAtoms().length).toBeGreaterThan(0);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        createPythonDataInstance('invalid json');
      }).toThrow();
    });
  });

  describe('isPythonDataInstance', () => {
    it('should correctly identify PythonDataInstance', () => {
      const instance = new PythonDataInstance();
      expect(isPythonDataInstance(instance)).toBe(true);
    });
  });
});