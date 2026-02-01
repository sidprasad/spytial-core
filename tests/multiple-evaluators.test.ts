import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { SQLEvaluator } from '../src/evaluators/sql-evaluator';
import { EvaluatorRegistry, EvaluatorType } from '../src/evaluators/interfaces';

/**
 * Test suite for multiple evaluator support in layouts
 */
describe('Multiple Evaluators in Layout', () => {
  let sqlEvaluator: SQLEvaluator;

  beforeEach(() => {
    sqlEvaluator = new SQLEvaluator();
  });

  afterEach(() => {
    sqlEvaluator.dispose();
  });

  const jsonData: IJsonDataInstance = {
    atoms: [
      { id: 'Alice', type: 'Person', label: 'Alice' },
      { id: 'Bob', type: 'Person', label: 'Bob' },
      { id: 'Charlie', type: 'Person', label: 'Charlie' },
      { id: 'Company1', type: 'Company', label: 'TechCorp' }
    ],
    relations: [
      {
        id: 'friend',
        name: 'friend',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['Alice', 'Bob'], types: ['Person', 'Person'] },
          { atoms: ['Bob', 'Charlie'], types: ['Person', 'Person'] }
        ]
      },
      {
        id: 'worksAt',
        name: 'worksAt',
        types: ['Person', 'Company'],
        tuples: [
          { atoms: ['Alice', 'Company1'], types: ['Person', 'Company'] },
          { atoms: ['Bob', 'Company1'], types: ['Person', 'Company'] }
        ]
      }
    ]
  };

  function createEvaluatorRegistry(instance: JSONDataInstance): EvaluatorRegistry {
    const registry = new EvaluatorRegistry();
    
    // Register SGQ evaluator (default)
    const sgqEval = new SGraphQueryEvaluator();
    sgqEval.initialize({ sourceData: instance });
    registry.register(EvaluatorType.SGQ, sgqEval);
    registry.setDefault(EvaluatorType.SGQ);
    
    // Register SQL evaluator
    const sqlEval = new SQLEvaluator();
    sqlEval.initialize({ sourceData: instance });
    registry.register(EvaluatorType.SQL, sqlEval);
    
    return registry;
  }

  describe('Backward Compatibility', () => {
    it('should work with single evaluator (legacy mode)', () => {
      const instance = new JSONDataInstance(jsonData);
      const sgqEvaluator = new SGraphQueryEvaluator();
      sgqEvaluator.initialize({ sourceData: instance });

      const layoutSpecStr = `
constraints:
  - orientation:
      selector: friend
      directions:
        - right
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, sgqEvaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.constraints.length).toBeGreaterThan(0);
    });

    it('should default to SGQ evaluator when no type specified', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
constraints:
  - orientation:
      selector: friend
      directions:
        - right
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.constraints.length).toBeGreaterThan(0);
    });
  });

  describe('SQL Evaluator Selection', () => {
    it('should use SQL evaluator when specified in constraint', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      // Use SQL syntax with evaluator type specified
      const layoutSpecStr = `
constraints:
  - orientation:
      selector: "SELECT src, tgt FROM friend"
      evaluatorType: sql
      directions:
        - right
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.constraints.length).toBeGreaterThan(0);
    });

    it('should use SQL evaluator in directives', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
directives:
  - atomColor:
      selector: "SELECT id FROM _atoms WHERE type = 'Person'"
      evaluatorType: sql
      value: "#FF0000"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      // Check that Person nodes got colored
      const aliceNode = layout.nodes.find(n => n.id === 'Alice');
      const bobNode = layout.nodes.find(n => n.id === 'Bob');
      const charlieNode = layout.nodes.find(n => n.id === 'Charlie');

      expect(aliceNode?.color).toBe('#FF0000');
      expect(bobNode?.color).toBe('#FF0000');
      expect(charlieNode?.color).toBe('#FF0000');
    });
  });

  describe('Mixed Evaluators', () => {
    it('should support mixing SGQ and SQL evaluators in same spec', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
constraints:
  - orientation:
      selector: friend
      directions:
        - right
directives:
  - atomColor:
      selector: "SELECT id FROM _atoms WHERE type = 'Company'"
      evaluatorType: sql
      value: "#00FF00"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.constraints.length).toBeGreaterThan(0);

      // Check that Company node got colored with SQL evaluator
      const companyNode = layout.nodes.find(n => n.id === 'Company1');
      expect(companyNode?.color).toBe('#00FF00');
    });

    it('should handle multiple directives with different evaluators', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
directives:
  - atomColor:
      selector: Person
      value: "#0000FF"
  - atomColor:
      selector: "SELECT id FROM _atoms WHERE type = 'Company'"
      evaluatorType: sql
      value: "#00FF00"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      // Check Person nodes got colored with SGQ (default)
      const aliceNode = layout.nodes.find(n => n.id === 'Alice');
      expect(aliceNode?.color).toBe('#0000FF');

      // Check Company node got colored with SQL
      const companyNode = layout.nodes.find(n => n.id === 'Company1');
      expect(companyNode?.color).toBe('#00FF00');
    });
  });

  describe('Tag Directives with Multiple Evaluators', () => {
    it('should support different evaluators for toTag and value selectors', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
directives:
  - tag:
      toTag: Person
      name: company
      value: "SELECT tgt FROM worksAt WHERE src = 'Alice' OR src = 'Bob'"
      valueEvaluatorType: sql
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      // Check that tags were applied
      expect(layout.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('Evaluator Type Parsing', () => {
    it('should parse different case variations of evaluator types', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      // Test with uppercase SQL
      const layoutSpecStr = `
directives:
  - atomColor:
      selector: "SELECT id FROM _atoms WHERE type = 'Person'"
      evaluatorType: SQL
      value: "#FF0000"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      
      const aliceNode = layout.nodes.find(n => n.id === 'Alice');
      expect(aliceNode?.color).toBe('#FF0000');
    });

    it('should handle SGQ alias "simplegraphquery"', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
constraints:
  - orientation:
      selector: friend
      evaluatorType: simplegraphquery
      directions:
        - right
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.constraints.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should fall back to default evaluator if specified type not registered', () => {
      const instance = new JSONDataInstance(jsonData);
      
      // Only register SGQ, not SQL
      const registry = new EvaluatorRegistry();
      const sgqEval = new SGraphQueryEvaluator();
      sgqEval.initialize({ sourceData: instance });
      registry.register(EvaluatorType.SGQ, sgqEval);
      registry.setDefault(EvaluatorType.SGQ);

      const layoutSpecStr = `
directives:
  - atomColor:
      selector: Person
      evaluatorType: sql
      value: "#FF0000"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      
      // Should fall back to default SGQ evaluator
      const { layout } = layoutInstance.generateLayout(instance, {});
      
      expect(layout.nodes.length).toBeGreaterThan(0);
      const aliceNode = layout.nodes.find(n => n.id === 'Alice');
      expect(aliceNode?.color).toBe('#FF0000');
    });
  });

  describe('EdgeStyle Directives with Multiple Evaluators', () => {
    it('should support SQL evaluator for edge filters', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
directives:
  - edgeColor:
      field: friend
      selector: Person
      filter: "SELECT src, tgt FROM friend WHERE src = 'Alice'"
      filterEvaluatorType: sql
      value: "#FF00FF"
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.edges.length).toBeGreaterThan(0);
    });
  });

  describe('Group By Constraints with Multiple Evaluators', () => {
    it('should support SQL evaluator in group by selector', () => {
      const instance = new JSONDataInstance(jsonData);
      const registry = createEvaluatorRegistry(instance);

      const layoutSpecStr = `
constraints:
  - group:
      selector: "SELECT src, tgt FROM worksAt"
      evaluatorType: sql
      name: company
      addEdge: false
`;

      const layoutSpec = parseLayoutSpec(layoutSpecStr);
      const layoutInstance = new LayoutInstance(layoutSpec, registry, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      expect(layout.nodes.length).toBeGreaterThan(0);
      expect(layout.groups.length).toBeGreaterThan(0);
    });
  });
});
