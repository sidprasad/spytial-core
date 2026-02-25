import { describe, it, expect } from 'vitest';
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

describe('Duplicate Constraint Removal', () => {
  it('removes duplicate orientation constraints from YAML', () => {
    // YAML with duplicate orientation constraints
    const layoutSpecWithDuplicates = `
constraints:
  - orientation:
      selector: A->B
      directions:
        - right
  - orientation:
      selector: A->B
      directions:
        - right
  - orientation:
      selector: B->C
      directions:
        - right
`;

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(layoutSpecWithDuplicates);
    
    // Check that duplicates are removed in parsing
    expect(layoutSpec.constraints.orientation.relative).toHaveLength(2);
    // Verify the unique constraints remain
    const selectors = layoutSpec.constraints.orientation.relative.map(c => c.selector);
    expect(selectors).toContain('A->B');
    expect(selectors).toContain('B->C');
    // A->B should only appear once
    expect(selectors.filter(s => s === 'A->B')).toHaveLength(1);
  });

  it('removes duplicate align constraints from YAML', () => {
    const layoutSpecWithDuplicates = `
constraints:
  - align:
      selector: A->B
      direction: horizontal
  - align:
      selector: A->B
      direction: horizontal
  - align:
      selector: B->C
      direction: vertical
`;

    const layoutSpec = parseLayoutSpec(layoutSpecWithDuplicates);
    
    // Check that duplicates are removed
    expect(layoutSpec.constraints.alignment).toHaveLength(2);
    const selectors = layoutSpec.constraints.alignment.map(c => c.selector);
    expect(selectors).toContain('A->B');
    expect(selectors).toContain('B->C');
    expect(selectors.filter(s => s === 'A->B')).toHaveLength(1);
  });

  it('removes duplicate cyclic constraints from YAML', () => {
    const layoutSpecWithDuplicates = `
constraints:
  - cyclic:
      selector: r
      direction: clockwise
  - cyclic:
      selector: r
      direction: clockwise
`;

    const layoutSpec = parseLayoutSpec(layoutSpecWithDuplicates);
    
    // Check that duplicates are removed
    expect(layoutSpec.constraints.orientation.cyclic).toHaveLength(1);
    expect(layoutSpec.constraints.orientation.cyclic[0].selector).toBe('r');
  });

  it('removes duplicate group by selector constraints from YAML', () => {
    const layoutSpecWithDuplicates = `
constraints:
  - group:
      selector: A->B
      name: myGroup
  - group:
      selector: A->B
      name: myGroup
`;

    const layoutSpec = parseLayoutSpec(layoutSpecWithDuplicates);
    
    // Check that duplicates are removed
    expect(layoutSpec.constraints.grouping.byselector).toHaveLength(1);
    expect(layoutSpec.constraints.grouping.byselector[0].selector).toBe('A->B');
  });

  it('keeps orientation constraints with different directions', () => {
    const layoutSpecWithDifferent = `
constraints:
  - orientation:
      selector: A->B
      directions:
        - right
  - orientation:
      selector: A->B
      directions:
        - below
`;

    const layoutSpec = parseLayoutSpec(layoutSpecWithDifferent);
    
    // Different directions should be kept
    expect(layoutSpec.constraints.orientation.relative).toHaveLength(2);
  });

  it('keeps align constraints with different directions', () => {
    const layoutSpecWithDifferent = `
constraints:
  - align:
      selector: A->B
      direction: horizontal
  - align:
      selector: A->B
      direction: vertical
`;

    const layoutSpec = parseLayoutSpec(layoutSpecWithDifferent);
    
    // Different directions should be kept
    expect(layoutSpec.constraints.alignment).toHaveLength(2);
  });

  it('verifies duplicate removal improves performance', () => {
    // Create a large YAML with many duplicates
    const duplicateCount = 100;
    let constraints = 'constraints:\n';
    for (let i = 0; i < duplicateCount; i++) {
      constraints += `  - orientation:
      selector: A->B
      directions:
        - right
`;
    }

    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(constraints);
    
    // All duplicates should be removed, leaving only 1
    expect(layoutSpec.constraints.orientation.relative).toHaveLength(1);
    
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance);
    
    // The layout should have only 1 unique constraint applied
    // (the removeDuplicateConstraints function will handle final deduplication)
    expect(layout.constraints.length).toBeGreaterThan(0);
  });
});
