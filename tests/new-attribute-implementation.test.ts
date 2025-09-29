import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

describe('New Attribute Directive Implementation', () => {
  const testData: IJsonDataInstance = {
    atoms: [
      { id: 'alice', type: 'Person', label: 'Alice' },
      { id: 'bob', type: 'Person', label: 'Bob' },
      { id: 'tesla', type: 'Car', label: 'Tesla' },
      { id: 'age25', type: 'Number', label: '25' },
      { id: 'age30', type: 'Number', label: '30' },
    ],
    relations: [
      {
        id: 'age',
        name: 'age',
        types: ['Person', 'Number'],
        tuples: [
          { atoms: ['alice', 'age25'], types: ['Person', 'Number'] },
          { atoms: ['bob', 'age30'], types: ['Person', 'Number'] }
        ]
      }
    ]
  };

  it('should apply new-style attribute directive using selectors', () => {
    const layoutSpecStr = `
directives:
  - attribute:
      selector: 'Person'
      key: 'personAge'
      valueSelector: 'Person.age'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find Person nodes
    const personNodes = layout.nodes.filter(n => n.types.includes('Person'));
    expect(personNodes.length).toBe(2);

    // Each Person node should have the personAge attribute
    personNodes.forEach(node => {
      expect(node.attributes).toBeDefined();
      expect(Object.keys(node.attributes || {})).toContain('personAge');
      
      // The attribute should have values from the valueSelector
      const ageValues = node.attributes?.['personAge'] || [];
      expect(ageValues.length).toBeGreaterThan(0);
    });

    // Car nodes should not have personAge attributes
    const carNodes = layout.nodes.filter(n => n.types.includes('Car'));
    carNodes.forEach(node => {
      const attrs = node.attributes || {};
      expect(Object.keys(attrs)).not.toContain('personAge');
    });

    // Age relationships should still exist as edges (not converted)
    const ageEdges = layout.edges.filter(e => e.relationName === 'age');
    expect(ageEdges.length).toBeGreaterThan(0);
  });

  it('should support multiple values when valueSelector returns multiple results', () => {
    const multiValueData: IJsonDataInstance = {
      atoms: [
        { id: 'alice', type: 'Person', label: 'Alice' },
        { id: 'hobby1', type: 'Hobby', label: 'Reading' },
        { id: 'hobby2', type: 'Hobby', label: 'Swimming' },
      ],
      relations: [
        {
          id: 'hobbies',
          name: 'hobbies',
          types: ['Person', 'Hobby'],
          tuples: [
            { atoms: ['alice', 'hobby1'], types: ['Person', 'Hobby'] },
            { atoms: ['alice', 'hobby2'], types: ['Person', 'Hobby'] }
          ]
        }
      ]
    };

    const layoutSpecStr = `
directives:
  - attribute:
      selector: 'Person'
      key: 'interests'
      valueSelector: 'Person.hobbies'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(multiValueData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    const personNodes = layout.nodes.filter(n => n.types.includes('Person'));
    expect(personNodes.length).toBe(1);

    const alice = personNodes[0];
    expect(alice.attributes).toBeDefined();
    expect(Object.keys(alice.attributes || {})).toContain('interests');
    
    // Should have multiple hobby values
    const interests = alice.attributes?.['interests'] || [];
    expect(interests.length).toBeGreaterThanOrEqual(2);
  });

  it('should reject old field-based format with helpful error message', () => {
    const oldFormatSpec = `
directives:
  - attribute:
      field: 'age'
      selector: 'Person'
`;

    expect(() => parseLayoutSpec(oldFormatSpec)).toThrow(/Attribute directive with old field-based format detected/);
  });

  it('should require all three fields in new format', () => {
    const incompleteSpec = `
directives:
  - attribute:
      selector: 'Person'
      key: 'age'
      # missing valueSelector
`;

    expect(() => parseLayoutSpec(incompleteSpec)).toThrow(/must have selector, key, and valueSelector fields/);
  });
});