import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

// Test data with multiple types having relations of the same name
const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'person1', type: 'Person', label: 'Alice' },
    { id: 'person2', type: 'Person', label: 'Bob' },
    { id: 'car1', type: 'Car', label: 'Tesla' },
    { id: 'car2', type: 'Car', label: 'Ford' },
    { id: 'company1', type: 'Company', label: 'TechCorp' },
    // Add the string atoms that are referenced in relations
    { id: 'Alice', type: 'String', label: 'Alice' },
    { id: 'Bob', type: 'String', label: 'Bob' },
    { id: 'Tesla', type: 'String', label: 'Tesla' },
    { id: 'Ford', type: 'String', label: 'Ford' },
    { id: 'TechCorp', type: 'String', label: 'TechCorp' }
  ],
  relations: [
    {
      id: 'name',
      name: 'name',
      types: ['Person', 'String'],
      tuples: [
        { atoms: ['person1', 'Alice'], types: ['Person', 'String'] },
        { atoms: ['person2', 'Bob'], types: ['Person', 'String'] }
      ]
    },
    {
      id: 'name_car',
      name: 'name',
      types: ['Car', 'String'], 
      tuples: [
        { atoms: ['car1', 'Tesla'], types: ['Car', 'String'] },
        { atoms: ['car2', 'Ford'], types: ['Car', 'String'] }
      ]
    },
    {
      id: 'name_company',
      name: 'name',
      types: ['Company', 'String'],
      tuples: [
        { atoms: ['company1', 'TechCorp'], types: ['Company', 'String'] }
      ]
    },
    {
      id: 'owns',
      name: 'owns',
      types: ['Person', 'Car'],
      tuples: [
        { atoms: ['person1', 'car1'], types: ['Person', 'Car'] },
        { atoms: ['person2', 'car2'], types: ['Person', 'Car'] }
      ]
    }
  ]
};

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Field-based directives with selectors - Integration', () => {
  it('should apply edge colors only to specified atoms via selector', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'name'
      value: 'red'
      selector: 'Person'
  - edgeColor:
      field: 'name'
      value: 'blue'
      selector: 'Car'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find edges by relation name
    const personNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Person') || e.target.types.includes('Person'))
    );
    const carNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Car') || e.target.types.includes('Car'))
    );
    const companyNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Company') || e.target.types.includes('Company'))
    );

    // Person name edges should be red
    expect(personNameEdges.length).toBeGreaterThan(0);
    personNameEdges.forEach(edge => {
      expect(edge.color).toBe('red');
    });

    // Car name edges should be blue  
    expect(carNameEdges.length).toBeGreaterThan(0);
    carNameEdges.forEach(edge => {
      expect(edge.color).toBe('blue');
    });

    // Company name edges should have default color (no selector matches)
    expect(companyNameEdges.length).toBeGreaterThan(0);
    companyNameEdges.forEach(edge => {
      expect(edge.color).toBe('black'); // Default color
    });
  });

  it('should apply attribute directive only to specified atoms via selector', () => {
    const layoutSpecStr = `
directives:
  - attribute:
      field: 'name'
      selector: 'Person'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Find Person and Car nodes
    const personNodes = layout.nodes.filter(n => n.types.includes('Person'));
    const carNodes = layout.nodes.filter(n => n.types.includes('Car'));
    const companyNodes = layout.nodes.filter(n => n.types.includes('Company'));

    // Person nodes should have name attributes (edges converted to attributes)
    expect(personNodes.length).toBeGreaterThan(0);
    personNodes.forEach(node => {
      expect(node.attributes).toBeDefined();
      // Should have name attribute since Person name edges were converted
      expect(Object.keys(node.attributes || {})).toContain('name');
    });

    // Car and Company nodes should not have name attributes  
    carNodes.forEach(node => {
      const attrs = node.attributes || {};
      expect(Object.keys(attrs)).not.toContain('name');
    });

    companyNodes.forEach(node => {
      const attrs = node.attributes || {};
      expect(Object.keys(attrs)).not.toContain('name');
    });

    // Car and Company name edges should still exist as edges (not converted to attributes)
    const remainingNameEdges = layout.edges.filter(e => e.relationName === 'name');
    const carNameEdges = remainingNameEdges.filter(e => 
      e.source.types.includes('Car') || e.target.types.includes('Car')
    );
    const companyNameEdges = remainingNameEdges.filter(e => 
      e.source.types.includes('Company') || e.target.types.includes('Company')
    );

    expect(carNameEdges.length).toBeGreaterThan(0);
    expect(companyNameEdges.length).toBeGreaterThan(0);
  });

  it('should apply hide field directive only to specified atoms via selector', () => {
    const layoutSpecStr = `
directives:
  - hideField:
      field: 'name'
      selector: 'Car'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Car name edges should be hidden (not present in layout)
    const carNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Car') || e.target.types.includes('Car'))
    );
    expect(carNameEdges.length).toBe(0);

    // Person and Company name edges should still be present
    const personNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Person') || e.target.types.includes('Person'))
    );
    const companyNameEdges = layout.edges.filter(e => 
      e.relationName === 'name' && 
      (e.source.types.includes('Company') || e.target.types.includes('Company'))
    );

    expect(personNameEdges.length).toBeGreaterThan(0);
    expect(companyNameEdges.length).toBeGreaterThan(0);
  });

  it('should maintain backward compatibility with directives without selectors', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'name'
      value: 'green'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // All name edges should be green (legacy behavior - applies to all)
    const allNameEdges = layout.edges.filter(e => e.relationName === 'name');
    expect(allNameEdges.length).toBeGreaterThan(0);
    allNameEdges.forEach(edge => {
      expect(edge.color).toBe('green');
    });
  });
});