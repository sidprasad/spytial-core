import { describe, it, expect } from 'vitest';
import { 
  PyretValue, 
  PyretConstructor, 
  PyretExpression, 
  PyretPrimitive,
  EXAMPLE_PYRET_TYPES
} from '../src/components/PyretInputController/types';

describe('PyretInputController Types', () => {
  it('defines correct example Pyret types', () => {
    expect(EXAMPLE_PYRET_TYPES).toHaveLength(4);
    
    const listType = EXAMPLE_PYRET_TYPES.find(t => t.name === 'List');
    expect(listType).toBeDefined();
    expect(listType?.constructors).toContain('empty');
    expect(listType?.constructors).toContain('link');
    expect(listType?.fields['empty']).toEqual([]);
    expect(listType?.fields['link']).toEqual(['first', 'rest']);
    
    const treeType = EXAMPLE_PYRET_TYPES.find(t => t.name === 'Tree');
    expect(treeType).toBeDefined();
    expect(treeType?.constructors).toContain('Leaf');
    expect(treeType?.constructors).toContain('Node');
    expect(treeType?.fields['Leaf']).toEqual(['value']);
    expect(treeType?.fields['Node']).toEqual(['value', 'left', 'right']);
  });

  it('creates valid PyretExpression objects', () => {
    const expression: PyretExpression = {
      id: 'expr-1',
      expression: 'map(fun(x): x + 1 end, [list: 1, 2, 3])',
      type: 'expression'
    };
    
    expect(expression.type).toBe('expression');
    expect(expression.expression).toContain('map');
  });

  it('creates valid PyretPrimitive objects', () => {
    const numberPrimitive: PyretPrimitive = {
      id: 'num-1',
      value: 42,
      type: 'primitive',
      dataType: 'Number'
    };
    
    const stringPrimitive: PyretPrimitive = {
      id: 'str-1',
      value: 'hello',
      type: 'primitive',
      dataType: 'String'
    };
    
    const boolPrimitive: PyretPrimitive = {
      id: 'bool-1',
      value: true,
      type: 'primitive',
      dataType: 'Boolean'
    };
    
    expect(numberPrimitive.dataType).toBe('Number');
    expect(stringPrimitive.dataType).toBe('String');
    expect(boolPrimitive.dataType).toBe('Boolean');
  });

  it('creates valid PyretConstructor objects', () => {
    const leafExpression: PyretExpression = {
      id: 'expr-leaf-value',
      expression: '5',
      type: 'expression'
    };
    
    const leafConstructor: PyretConstructor = {
      id: 'leaf-1',
      name: 'Leaf',
      type: 'constructor',
      fields: [
        {
          name: 'value',
          value: leafExpression
        }
      ]
    };
    
    expect(leafConstructor.type).toBe('constructor');
    expect(leafConstructor.name).toBe('Leaf');
    expect(leafConstructor.fields).toHaveLength(1);
    expect(leafConstructor.fields[0].name).toBe('value');
  });

  it('handles complex nested structures', () => {
    // Create a binary tree: Node(5, Leaf(3), Leaf(7))
    const leftLeaf: PyretConstructor = {
      id: 'left-leaf',
      name: 'Leaf',
      type: 'constructor',
      fields: [
        {
          name: 'value',
          value: {
            id: 'left-value',
            value: 3,
            type: 'primitive',
            dataType: 'Number'
          } as PyretPrimitive
        }
      ]
    };
    
    const rightLeaf: PyretConstructor = {
      id: 'right-leaf',
      name: 'Leaf',
      type: 'constructor',
      fields: [
        {
          name: 'value',
          value: {
            id: 'right-value',
            value: 7,
            type: 'primitive',
            dataType: 'Number'
          } as PyretPrimitive
        }
      ]
    };
    
    const rootNode: PyretConstructor = {
      id: 'root-node',
      name: 'Node',
      type: 'constructor',
      fields: [
        {
          name: 'value',
          value: {
            id: 'root-value',
            value: 5,
            type: 'primitive',
            dataType: 'Number'
          } as PyretPrimitive
        },
        {
          name: 'left',
          value: {
            id: 'left-ref',
            targetId: leftLeaf.id,
            type: 'reference',
            targetName: 'Leaf'
          }
        },
        {
          name: 'right',
          value: {
            id: 'right-ref',
            targetId: rightLeaf.id,
            type: 'reference',
            targetName: 'Leaf'
          }
        }
      ]
    };
    
    expect(rootNode.fields).toHaveLength(3);
    expect(rootNode.fields[1].value.type).toBe('reference');
    expect(rootNode.fields[2].value.type).toBe('reference');
  });
});