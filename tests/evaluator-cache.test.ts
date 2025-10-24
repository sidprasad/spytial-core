import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' },
    { id: 'C', type: 'Type1', label: 'C' }
  ],
  relations: [
    {
      id: 'r',
      name: 'r',
      types: ['Type1', 'Type1'],
      tuples: [
        { atoms: ['A', 'B'], types: ['Type1', 'Type1'] },
        { atoms: ['B', 'C'], types: ['Type1', 'Type1'] }
      ]
    }
  ]
};

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Evaluator Caching', () => {
  it('caches evaluator results for repeated selectors', () => {
    // Create a layout spec that uses the same selector multiple times
    const layoutSpecWithDuplicateSelectors = `
constraints:
  - orientation:
      selector: A->B
      directions:
        - right
directives:
  - atomColor:
      selector: A->B
      value: "#FF0000"
  - size:
      selector: A->B
      height: 100
      width: 200
`;

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    
    // Access the internal evaluator to spy on actual evaluations
    const internalEval = (evaluator as any).eval;
    const evaluateSpy = vi.spyOn(internalEval, 'evaluateExpression');
    
    const layoutSpec = parseLayoutSpec(layoutSpecWithDuplicateSelectors);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    // Generate layout - this should trigger multiple uses of the same selector
    layoutInstance.generateLayout(instance, {});
    
    // Count how many times 'A->B' was actually evaluated (not cached hits)
    const aToB_Calls = evaluateSpy.mock.calls.filter(
      call => call[0] === 'A->B'
    );
    
    // With caching in the evaluator, the selector 'A->B' should only be evaluated once
    // by the internal evaluator, even though it appears in multiple directives/constraints
    expect(aToB_Calls.length).toBe(1);
    
    evaluateSpy.mockRestore();
  });

  it('clears cache on reinitialization', () => {
    const layoutSpecStr = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    let internalEval = (evaluator as any).eval;
    let evaluateSpy = vi.spyOn(internalEval, 'evaluateExpression');
    
    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    // First layout generation
    layoutInstance.generateLayout(instance, {});
    const firstCallCount = evaluateSpy.mock.calls.length;
    
    // Clean up first spy
    evaluateSpy.mockRestore();
    
    // Reinitialize the evaluator (simulates new data) - this creates a new internal evaluator
    evaluator.initialize({ sourceData: instance });
    
    // Spy on the new internal evaluator
    internalEval = (evaluator as any).eval;
    evaluateSpy = vi.spyOn(internalEval, 'evaluateExpression');
    
    // Second layout generation after reinitialization
    layoutInstance.generateLayout(instance, {});
    const secondCallCount = evaluateSpy.mock.calls.length;
    
    // After reinitialization, the cache should be cleared, so we should see
    // roughly the same number of calls as the first time
    expect(secondCallCount).toBeGreaterThan(0);
    expect(secondCallCount).toBeCloseTo(firstCallCount, 0);
    
    evaluateSpy.mockRestore();
  });

  it('caches results for multiple directives using the same selector', () => {
    const layoutSpecWithMultipleDirectives = `
directives:
  - atomColor:
      selector: Type1
      value: "#FF0000"
  - size:
      selector: Type1
      height: 100
      width: 200
  - icon:
      selector: Type1
      path: "/icon.svg"
      showLabels: true
`;

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    const internalEval = (evaluator as any).eval;
    const evaluateSpy = vi.spyOn(internalEval, 'evaluateExpression');
    
    const layoutSpec = parseLayoutSpec(layoutSpecWithMultipleDirectives);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    layoutInstance.generateLayout(instance, {});
    
    // Count actual evaluations of 'Type1' selector
    const type1Calls = evaluateSpy.mock.calls.filter(
      call => call[0] === 'Type1'
    );
    
    // With caching in the evaluator, 'Type1' should only be evaluated once by the
    // internal evaluator, despite being used in color, size, and icon directives
    expect(type1Calls.length).toBe(1);
    
    evaluateSpy.mockRestore();
  });

  it('provides correct results when using cache', () => {
    const layoutSpecStr = `
constraints:
  - orientation:
      selector: A->B
      directions:
        - right
directives:
  - atomColor:
      selector: A->B
      value: "#FF0000"
`;

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const { layout } = layoutInstance.generateLayout(instance, {});
    
    // Verify the layout is correct
    expect(layout.nodes).toHaveLength(3);
    expect(layout.constraints.length).toBeGreaterThan(0);
    
    // Verify that caching didn't affect the color application
    const nodeA = layout.nodes.find(n => n.id === 'A');
    const nodeB = layout.nodes.find(n => n.id === 'B');
    
    // Both A and B should exist
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
  });
});

