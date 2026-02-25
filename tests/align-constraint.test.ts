import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { isAlignmentConstraint } from '../src/layout/interfaces';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'Node1', type: 'Node', label: 'Node1' },
    { id: 'Node2', type: 'Node', label: 'Node2' },
    { id: 'Node3', type: 'Node', label: 'Node3' }
  ],
  relations: [
    {
      id: 'R',
      name: 'R',
      types: ['Node', 'Node'],
      tuples: [
        { atoms: ['Node1', 'Node2'], types: ['Node', 'Node'] },
        { atoms: ['Node2', 'Node3'], types: ['Node', 'Node'] }
      ]
    }
  ]
};

const alignSpecHorizontal = `
constraints:
  - align:
      selector: "{x, y : Node | some x.R and some y.R}"
      direction: "horizontal"
`;

const alignSpecVertical = `
constraints:
  - align:
      selector: "{x, y : Node | some x.R and some y.R}" 
      direction: "vertical"
`;

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('AlignConstraint', () => {
  it('parses horizontal align constraint correctly', () => {
    const layoutSpec = parseLayoutSpec(alignSpecHorizontal);
    
    expect(layoutSpec.constraints.alignment).toBeDefined();
    expect(layoutSpec.constraints.alignment.length).toBe(1);
    
    const alignConstraint = layoutSpec.constraints.alignment[0];
    expect(alignConstraint.selector).toBe("{x, y : Node | some x.R and some y.R}");
    expect(alignConstraint.direction).toBe("horizontal");
    expect(alignConstraint.isInternallyConsistent()).toBe(true);
  });

  it('parses vertical align constraint correctly', () => {
    const layoutSpec = parseLayoutSpec(alignSpecVertical);
    
    expect(layoutSpec.constraints.alignment).toBeDefined();
    expect(layoutSpec.constraints.alignment.length).toBe(1);
    
    const alignConstraint = layoutSpec.constraints.alignment[0];
    expect(alignConstraint.selector).toBe("{x, y : Node | some x.R and some y.R}");
    expect(alignConstraint.direction).toBe("vertical");
    expect(alignConstraint.isInternallyConsistent()).toBe(true);
  });

  it('generates layout with horizontal align constraints', () => {
    const layoutSpec = parseLayoutSpec(alignSpecHorizontal);
    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const result = layoutInstance.generateLayout(dataInstance);
    
    expect(result.layout).toBeDefined();
    expect(result.layout.constraints.length).toBeGreaterThan(0);
    
    // Check if alignment constraints were created
    const alignmentConstraints = result.layout.constraints.filter(isAlignmentConstraint);
    expect(alignmentConstraints.length).toBeGreaterThan(0);
    
    // Horizontal alignment should use Y axis
    const yAxisConstraints = alignmentConstraints.filter(c => c.axis === 'y');
    expect(yAxisConstraints.length).toBeGreaterThan(0);
  });

  it('generates layout with vertical align constraints', () => {
    const layoutSpec = parseLayoutSpec(alignSpecVertical);
    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(dataInstance);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    const result = layoutInstance.generateLayout(dataInstance);
    
    expect(result.layout).toBeDefined();
    expect(result.layout.constraints.length).toBeGreaterThan(0);
    
    // Check if alignment constraints were created
    const alignmentConstraints = result.layout.constraints.filter(isAlignmentConstraint);
    expect(alignmentConstraints.length).toBeGreaterThan(0);
    
    // Vertical alignment should use X axis
    const xAxisConstraints = alignmentConstraints.filter(c => c.axis === 'x');
    expect(xAxisConstraints.length).toBeGreaterThan(0);
  });

  it('rejects invalid align direction', () => {
    const invalidAlignSpec = `
    constraints:
      - align:
          selector: "{x, y : Node | some x.R and some y.R}"
          direction: "invalid"
    `;
    
    expect(() => parseLayoutSpec(invalidAlignSpec)).toThrow();
  });
});