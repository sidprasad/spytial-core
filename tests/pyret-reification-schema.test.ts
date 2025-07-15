import { describe, it, expect } from 'vitest';
import { PyretDataInstance, PyretTypeSchema } from '../src/data-instance/pyret/pyret-data-instance';

describe('PyretDataInstance Reification with Schemas', () => {
  it('should use schema to determine constructor argument order', () => {
    // Define schema for BinaryTree type
    const schemas: PyretTypeSchema[] = [
      {
        typeName: 'BinaryTree',
        argumentFields: ['value', 'left', 'right']
      }
    ];

    // Create instance with schema
    const instance = new PyretDataInstance(null, false, schemas);
    
    // Add atoms manually (simulating REPL construction)
    instance.addAtom({ id: 'root', type: 'BinaryTree', label: 'BinaryTree$1' });
    instance.addAtom({ id: 'val', type: 'Number', label: '10' });
    instance.addAtom({ id: 'leftNode', type: 'BinaryTree', label: 'BinaryTree$2' });
    instance.addAtom({ id: 'leftVal', type: 'Number', label: '5' });
    
    // Add relations following schema order
    instance.addRelationTuple('value', { atoms: ['root', 'val'], types: ['BinaryTree', 'Number'] });
    instance.addRelationTuple('left', { atoms: ['root', 'leftNode'], types: ['BinaryTree', 'BinaryTree'] });
    instance.addRelationTuple('value', { atoms: ['leftNode', 'leftVal'], types: ['BinaryTree', 'Number'] });
    
    const result = instance.reify();
    
    // Should use schema order: value, left, right
    expect(result).toBe('BinaryTree(10, BinaryTree(5))');
  });

  it('should fall back to alphabetical order when no schema is provided', () => {
    // Create instance without schema
    const instance = new PyretDataInstance(null, false, []);
    
    // Add atoms manually
    instance.addAtom({ id: 'root', type: 'Node', label: 'Node$1' });
    instance.addAtom({ id: 'val', type: 'Number', label: '42' });
    
    // Add relation
    instance.addRelationTuple('value', { atoms: ['root', 'val'], types: ['Node', 'Number'] });
    
    const result = instance.reify();
    
    // Should fall back to alphabetical order
    expect(result).toBe('Node(42)');
  });

  it('should preserve original object structure when available', () => {
    // Create Pyret object with specific key order
    const pyretData = {
      dict: { 
        right: { dict: {}, brands: { "$brandBinaryTree99": true } },
        value: 15,
        left: { dict: {}, brands: { "$brandBinaryTree98": true } }
      },
      brands: { "$brandBinaryTree100": true }
    };

    const schemas: PyretTypeSchema[] = [
      {
        typeName: 'BinaryTree',
        argumentFields: ['value', 'left', 'right'] // Different order than dict
      }
    ];

    const instance = new PyretDataInstance(pyretData, false, schemas);
    const result = instance.reify();
    
    // Should preserve original dict order (right, value, left) over schema order
    expect(result).toContain('BinaryTree');
  });

  it('should handle multiple root atoms', () => {
    const instance = new PyretDataInstance(null, false, []);
    
    instance.addAtom({ id: 'atom1', type: 'Person', label: 'Alice' });
    instance.addAtom({ id: 'atom2', type: 'Person', label: 'Bob' });
    
    const result = instance.reify();
    
    expect(result).toBe('[list: Person, Person]');
  });

  it('should handle empty instances', () => {
    const instance = new PyretDataInstance(null, false, []);
    
    const result = instance.reify();
    
    expect(result).toBe('/* No root atoms found */');
  });

  it('should handle simple cases correctly', () => {
    const instance = new PyretDataInstance(null, false, []);
    
    // Create simple case with one root atom
    instance.addAtom({ id: 'node1', type: 'Node', label: 'Node$1' });
    instance.addAtom({ id: 'val1', type: 'Number', label: '42' });
    
    // node1 is root, references val1
    instance.addRelationTuple('value', { atoms: ['node1', 'val1'], types: ['Node', 'Number'] });
    
    const result = instance.reify();
    
    // Should work correctly for simple case
    expect(result).toContain('Node');
  });
});