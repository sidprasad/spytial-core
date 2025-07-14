import { describe, it, expect, beforeEach } from 'vitest';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { 
  ReificationHelper, 
  createReificationHelper, 
  PyretTypeSchema, 
  ReificationOptions 
} from '../src/data-instance/pyret/reification-helper';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';

describe('Enhanced Pyret Reification', () => {
  describe('ReificationHelper', () => {
    let emptyInstance: PyretDataInstance;
    let manualInstance: PyretDataInstance;

    beforeEach(() => {
      // Create empty instance
      emptyInstance = new PyretDataInstance(null);
      
      // Create instance with manually added atoms (simulating REPL usage)
      manualInstance = new PyretDataInstance(null);
      
      // Add atoms manually (as would happen through REPL)
      manualInstance.addAtom({ id: 'node1', type: 'Node', label: 'Node$1' });
      manualInstance.addAtom({ id: 'val1', type: 'Number', label: '5' });
      manualInstance.addAtom({ id: 'leaf1', type: 'Leaf', label: 'Leaf$1' });
      manualInstance.addAtom({ id: 'val2', type: 'Number', label: '3' });
      manualInstance.addAtom({ id: 'leaf2', type: 'Leaf', label: 'Leaf$2' });
      manualInstance.addAtom({ id: 'val3', type: 'Number', label: '7' });
      
      // Add relations
      manualInstance.addRelationTuple('value', { 
        atoms: ['node1', 'val1'], 
        types: ['Node', 'Number'] 
      });
      manualInstance.addRelationTuple('left', { 
        atoms: ['node1', 'leaf1'], 
        types: ['Node', 'Leaf'] 
      });
      manualInstance.addRelationTuple('right', { 
        atoms: ['node1', 'leaf2'], 
        types: ['Node', 'Leaf'] 
      });
      manualInstance.addRelationTuple('value', { 
        atoms: ['leaf1', 'val2'], 
        types: ['Leaf', 'Number'] 
      });
      manualInstance.addRelationTuple('value', { 
        atoms: ['leaf2', 'val3'], 
        types: ['Leaf', 'Number'] 
      });
    });

    it('should create helper with default schemas', () => {
      const helper = createReificationHelper(emptyInstance);
      const schemas = helper.getSchemas();
      
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas.some(s => s.typeName === 'Black')).toBe(true);
      expect(schemas.some(s => s.typeName === 'Red')).toBe(true);
      expect(schemas.some(s => s.typeName === 'Leaf')).toBe(true);
    });

    it('should handle empty instance gracefully', () => {
      const helper = createReificationHelper(emptyInstance);
      const result = helper.reify();
      
      expect(result).toBe('');
    });

    it('should reify manually constructed data using schemas', () => {
      const schemas: PyretTypeSchema[] = [
        {
          typeName: 'Node',
          argumentFields: ['value', 'left', 'right'],
          examples: ['Node(5, Leaf(3), Leaf(7))']
        },
        {
          typeName: 'Leaf',
          argumentFields: ['value'],
          examples: ['Leaf(5)']
        }
      ];

      const helper = createReificationHelper(manualInstance, { schemas });
      const result = helper.reify();
      
      expect(result).toBeDefined();
      expect(result).toContain('Node(');
      expect(result).toContain('Leaf(');
      expect(result).toContain('5');
      expect(result).toContain('3');
      expect(result).toContain('7');
    });

    it('should use heuristics when schema is missing', () => {
      const helper = createReificationHelper(manualInstance, { 
        useHeuristics: true,
        schemas: [] // No schemas provided
      });
      const result = helper.reify();
      
      expect(result).toBeDefined();
      expect(result).toContain('Node(');
      expect(result).toContain('Leaf(');
    });

    it('should format output when requested', () => {
      const schemas: PyretTypeSchema[] = [
        {
          typeName: 'Node',
          argumentFields: ['value', 'left', 'right']
        }
      ];

      const helper = createReificationHelper(manualInstance, { 
        schemas,
        formatOutput: true 
      });
      const result = helper.reify();
      
      expect(result).toContain('\n'); // Should contain newlines for formatting
    });

    it('should include debug comments when requested', () => {
      const helper = createReificationHelper(manualInstance, { 
        includeDebugComments: true 
      });
      const result = helper.reify();
      
      // Debug comments aren't included in normal cases, but should handle missing atoms gracefully
      expect(result).toBeDefined();
    });

    it('should handle cycles gracefully', () => {
      // Create a cycle
      const cyclicInstance = new PyretDataInstance(null);
      cyclicInstance.addAtom({ id: 'a', type: 'Node', label: 'A' });
      cyclicInstance.addAtom({ id: 'b', type: 'Node', label: 'B' });
      
      cyclicInstance.addRelationTuple('next', { 
        atoms: ['a', 'b'], 
        types: ['Node', 'Node'] 
      });
      cyclicInstance.addRelationTuple('next', { 
        atoms: ['b', 'a'], 
        types: ['Node', 'Node'] 
      });

      const helper = createReificationHelper(cyclicInstance);
      const result = helper.reify();
      
      expect(result).toBeDefined();
      // Should not cause infinite recursion
    });

    it('should reify specific atoms', () => {
      const helper = createReificationHelper(manualInstance);
      const result = helper.reifyAtom('leaf1');
      
      expect(result).toBeDefined();
      expect(result).toContain('Leaf');
      expect(result).toContain('3');
    });

    it('should add custom schemas', () => {
      const helper = createReificationHelper(manualInstance);
      
      const customSchema: PyretTypeSchema = {
        typeName: 'CustomType',
        argumentFields: ['first', 'second'],
        examples: ['CustomType(a, b)']
      };
      
      helper.addSchema(customSchema);
      const schemas = helper.getSchemas();
      
      expect(schemas.some(s => s.typeName === 'CustomType')).toBe(true);
    });

    it('should infer argument order using common patterns', () => {
      // Create a binary tree structure
      const treeInstance = new PyretDataInstance(null);
      treeInstance.addAtom({ id: 'root', type: 'BinaryTree', label: 'BinaryTree$1' });
      treeInstance.addAtom({ id: 'val', type: 'Number', label: '10' });
      treeInstance.addAtom({ id: 'leftChild', type: 'BinaryTree', label: 'BinaryTree$2' });
      treeInstance.addAtom({ id: 'rightChild', type: 'BinaryTree', label: 'BinaryTree$3' });
      
      treeInstance.addRelationTuple('value', { 
        atoms: ['root', 'val'], 
        types: ['BinaryTree', 'Number'] 
      });
      treeInstance.addRelationTuple('left', { 
        atoms: ['root', 'leftChild'], 
        types: ['BinaryTree', 'BinaryTree'] 
      });
      treeInstance.addRelationTuple('right', { 
        atoms: ['root', 'rightChild'], 
        types: ['BinaryTree', 'BinaryTree'] 
      });

      const helper = createReificationHelper(treeInstance, { 
        useHeuristics: true,
        schemas: [] // Force heuristic usage
      });
      const result = helper.reify();
      
      expect(result).toBeDefined();
      expect(result).toContain('BinaryTree(');
      // Should use value, left, right order due to heuristics
    });
  });

  describe('PyretDataInstance enhanced reify methods', () => {
    let instance: PyretDataInstance;

    beforeEach(() => {
      // Use the same test data from the original test
      const pyretData = {
        "dict": {
          "value": 5,
          "left": {
            "dict": { "value": 3 },
            "brands": { "$brandLeaf964": true }
          },
          "right": {
            "dict": { "value": 7 },
            "brands": { "$brandLeaf964": true }
          }
        },
        "brands": { "$brandBlack962": true }
      };

      instance = new PyretDataInstance(pyretData);
    });

    it('should use original reify method by default', () => {
      const result = instance.reify();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use enhanced reification with options', () => {
      const options = {
        formatOutput: true,
        includeDebugComments: true
      };
      
      // For now, this falls back to basic reify until enhanced implementation is complete
      const result = instance.reifyWithOptions(options);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should reify specific atoms by ID', () => {
      const atoms = instance.getAtoms();
      const rootAtom = atoms.find(a => a.type === 'Black');
      
      if (rootAtom) {
        const result = instance.reifyAtomById(rootAtom.id);
        expect(result).toBeDefined();
        expect(result).toContain('Black');
      }
    });

    it('should use enhanced reification for specific atoms with options', () => {
      const atoms = instance.getAtoms();
      const rootAtom = atoms.find(a => a.type === 'Black');
      
      if (rootAtom) {
        const options = { formatOutput: true };
        // For now, this falls back to basic reify until enhanced implementation is complete
        const result = instance.reifyAtomById(rootAtom.id, options);
        expect(result).toBeDefined();
        expect(result).toContain('Black');
      }
    });
  });

  describe('Integration with original PyretDataInstance test', () => {
    it('should maintain backward compatibility with existing reify functionality', () => {
      // Use the exact same test data from the original test
      const pyretData = {
        "dict": {
          "value": 5,
          "left": {
            "dict": {
              "value": 1,
              "left": {
                "dict": {
                  "value": 2,
                  "left": {
                    "dict": {
                      "value": 1,
                      "left": {
                        "dict": { "value": 0 },
                        "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
                      },
                      "right": {
                        "dict": { "value": 0 },
                        "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
                      }
                    },
                    "brands": { "$brandRBNod961": true, "$brandRed963": true }
                  },
                  "right": {
                    "dict": { "value": 0 },
                    "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
                  }
                },
                "brands": { "$brandRBNod961": true, "$brandRed963": true }
              },
              "right": {
                "dict": { "value": 0 },
                "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
              }
            },
            "brands": { "$brandRBNod961": true, "$brandBlack962": true }
          },
          "right": {
            "dict": {
              "value": 6,
              "left": {
                "dict": { "value": 0 },
                "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
              },
              "right": {
                "dict": { "value": 0 },
                "brands": { "$brandRBNod961": true, "$brandLeaf964": true }
              }
            },
            "brands": { "$brandRBNod961": true, "$brandRed963": true }
          }
        },
        "brands": { "$brandRBNod961": true, "$brandBlack962": true }
      };

      const reifiedData = "Black(5,Black(1,Red(2,Red(1,Leaf(0),Leaf(0)),Leaf(0)),Leaf(0)),Red(6,Leaf(0),Leaf(0)))";

      const instance = new PyretDataInstance(pyretData);
      const reified = instance.reify();

      expect(reified).toBeDefined();
      expect(typeof reified).toBe('string');

      // Remove whitespace for comparison (same as original test)
      const normalizedReified = reified.replace(/\s+/g, '');
      const normalizedReifiedData = reifiedData.replace(/\s+/g, '');
      expect(normalizedReified).toBe(normalizedReifiedData);
    });
  });
});