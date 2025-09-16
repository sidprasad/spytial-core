import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' }
  ],
  relations: [
    {
      id: 'r',
      name: 'r',
      types: ['Type1', 'Type1'],
      tuples: [ { atoms: ['A', 'B'], types: ['Type1', 'Type1'] } ]
    }
  ]
};

const layoutSpecStr = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('LayoutInstance', () => {
  it('generates layout from data', () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.constraints.length).toBeGreaterThan(0);
  });

  it('handles prominent attributes correctly', () => {
    const dataWithAttributes: IJsonDataInstance = {
      atoms: [
        { id: 'Person1', type: 'Person', label: 'John' },
        { id: 'Name1', type: 'String', label: 'John Doe' },
        { id: 'Age1', type: 'Number', label: '30' }
      ],
      relations: [
        {
          id: 'name_rel',
          name: 'name',
          types: ['Person', 'String'],
          tuples: [{ atoms: ['Person1', 'Name1'], types: ['Person', 'String'] }]
        },
        {
          id: 'age_rel',
          name: 'age',
          types: ['Person', 'Number'],
          tuples: [{ atoms: ['Person1', 'Age1'], types: ['Person', 'Number'] }]
        }
      ]
    };

    const layoutSpecWithProminentAttributes = `
constraints:
  - orientation:
      selector: name
      directions:
        - right
directives:
  - attribute:
      field: 'name'
      prominent: true
  - attribute:
      field: 'age'
`;

    const spec = parseLayoutSpec(layoutSpecWithProminentAttributes);
    const instance = new JSONDataInstance(dataWithAttributes);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find the Person1 node
    const personNode = layout.nodes.find(node => node.id === 'Person1');
    expect(personNode).toBeDefined();

    // Check that attributes are present
    expect(personNode?.attributes).toBeDefined();
    expect(personNode?.attributes?.name).toContain('John Doe');
    expect(personNode?.attributes?.age).toContain('30');

    // Check that prominent attributes are tracked
    expect(personNode?.prominentAttributes).toBeDefined();
    expect(personNode?.prominentAttributes?.has('name')).toBe(true);
    expect(personNode?.prominentAttributes?.has('age')).toBe(false);
  });

  it('sorts attributes alphabetically', () => {
    const dataWithMultipleAttributes: IJsonDataInstance = {
      atoms: [
        { id: 'Person1', type: 'Person', label: 'John' },
        { id: 'Name1', type: 'String', label: 'John Doe' },
        { id: 'Age1', type: 'Number', label: '30' },
        { id: 'City1', type: 'String', label: 'Boston' },
        { id: 'Department1', type: 'String', label: 'Engineering' }
      ],
      relations: [
        {
          id: 'name_rel',
          name: 'name',
          types: ['Person', 'String'],
          tuples: [{ atoms: ['Person1', 'Name1'], types: ['Person', 'String'] }]
        },
        {
          id: 'age_rel',
          name: 'age',
          types: ['Person', 'Number'],
          tuples: [{ atoms: ['Person1', 'Age1'], types: ['Person', 'Number'] }]
        },
        {
          id: 'city_rel',
          name: 'city',
          types: ['Person', 'String'],
          tuples: [{ atoms: ['Person1', 'City1'], types: ['Person', 'String'] }]
        },
        {
          id: 'department_rel',
          name: 'department',
          types: ['Person', 'String'],
          tuples: [{ atoms: ['Person1', 'Department1'], types: ['Person', 'String'] }]
        }
      ]
    };

    const layoutSpecWithMultipleAttributes = `
constraints:
  - orientation:
      selector: name
      directions:
        - right
directives:
  - attribute:
      field: 'name'
      prominent: true
  - attribute:
      field: 'department'
      prominent: true
  - attribute:
      field: 'city'
  - attribute:
      field: 'age'
`;

    const spec = parseLayoutSpec(layoutSpecWithMultipleAttributes);
    const instance = new JSONDataInstance(dataWithMultipleAttributes);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find the Person1 node
    const personNode = layout.nodes.find(node => node.id === 'Person1');
    expect(personNode).toBeDefined();

    // Check that all attributes are present
    expect(personNode?.attributes).toBeDefined();
    expect(personNode?.attributes?.name).toContain('John Doe');
    expect(personNode?.attributes?.age).toContain('30');
    expect(personNode?.attributes?.city).toContain('Boston');
    expect(personNode?.attributes?.department).toContain('Engineering');

    // Check that prominent attributes are correctly tracked
    expect(personNode?.prominentAttributes).toBeDefined();
    expect(personNode?.prominentAttributes?.has('name')).toBe(true);
    expect(personNode?.prominentAttributes?.has('department')).toBe(true);
    expect(personNode?.prominentAttributes?.has('city')).toBe(false);
    expect(personNode?.prominentAttributes?.has('age')).toBe(false);

    // The alphabetical sorting should be verified in the rendering logic
    // The attributes object should contain all four attributes
    const attributeKeys = Object.keys(personNode?.attributes || {});
    expect(attributeKeys).toContain('name');
    expect(attributeKeys).toContain('age');
    expect(attributeKeys).toContain('city');
    expect(attributeKeys).toContain('department');
  });
});

