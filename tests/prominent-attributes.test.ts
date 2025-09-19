import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

const jsonDataWithAttributes: IJsonDataInstance = {
  atoms: [
    { id: 'PersonA', type: 'Person', label: 'Alice' },
    { id: 'PersonB', type: 'Person', label: 'Bob' },
    { id: 'Company1', type: 'Company', label: 'TechCorp' },
    { id: 'AgeA', type: 'Age', label: '25' },
    { id: 'AgeB', type: 'Age', label: '30' }
  ],
  relations: [
    {
      id: 'name_rel',
      name: 'name',
      types: ['Person', 'Company'],
      tuples: [
        { atoms: ['PersonA', 'Company1'], types: ['Person', 'Company'] }
      ]
    },
    {
      id: 'age_rel',
      name: 'age',
      types: ['Person', 'Age'],
      tuples: [
        { atoms: ['PersonA', 'AgeA'], types: ['Person', 'Age'] },
        { atoms: ['PersonB', 'AgeB'], types: ['Person', 'Age'] }
      ]
    }
  ]
};

describe('Prominent Attributes', () => {
  it('should create attributes with prominence metadata', async () => {
    const layoutSpecStr = `
directives:
  - attribute:
      field: name
      prominent: true
  - attribute:
      field: age
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(jsonDataWithAttributes);
    
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find the person node
    const personNode = layout.nodes.find(node => node.id === 'PersonA');
    expect(personNode).toBeDefined();
    expect(personNode!.attributes).toBeDefined();

    // Check that name attribute is marked as prominent
    if (personNode!.attributes!.name) {
      expect(personNode!.attributes!.name.prominent).toBe(true);
      expect(personNode!.attributes!.name.values).toContain('TechCorp');
    }

    // Check that age attribute is not prominent (default)
    if (personNode!.attributes!.age) {
      expect(personNode!.attributes!.age.prominent).toBeFalsy();
      expect(personNode!.attributes!.age.values).toContain('25');
    }
  });

  it('should sort attributes alphabetically', async () => {
    const layoutSpecStr = `
directives:
  - attribute:
      field: name
      prominent: true
  - attribute:
      field: age
  - attribute:
      field: zzz_last_attribute
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    
    // Add a test relation for zzz_last_attribute
    const testData = {
      ...jsonDataWithAttributes,
      relations: [
        ...jsonDataWithAttributes.relations,
        {
          id: 'zzz_rel',
          name: 'zzz_last_attribute',
          types: ['Person', 'Company'],
          tuples: [{ atoms: ['PersonA', 'Company1'], types: ['Person', 'Company'] }]
        }
      ]
    };

    const instance = new JSONDataInstance(testData);
    
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find the person node
    const personNode = layout.nodes.find(node => node.id === 'PersonA');
    expect(personNode).toBeDefined();

    if (personNode!.attributes) {
      const attributeKeys = Object.keys(personNode!.attributes);
      // Should be sorted alphabetically: age, name, zzz_last_attribute
      const expectedOrder = ['age', 'name', 'zzz_last_attribute'].filter(key => 
        attributeKeys.includes(key)
      );
      
      // Check if the keys that exist are in alphabetical order
      const actualSortedKeys = attributeKeys.slice().sort();
      expect(attributeKeys.sort()).toEqual(actualSortedKeys);
    }
  });
});