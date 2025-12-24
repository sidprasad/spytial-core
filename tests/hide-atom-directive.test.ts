/**
 * Tests for the new hideAtom directive functionality
 */

import { describe, it, expect } from 'vitest';
import { parseLayoutSpec, LayoutInstance } from '../src/layout';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

describe('Hide Atom Directive', () => {
  const testData = {
    atoms: [
      { id: 'A', type: 'Type1', label: 'A' },
      { id: 'B', type: 'Type1', label: 'B' },
      { id: 'C', type: 'Type2', label: 'C' },
      { id: 'D', type: 'Type2', label: 'D' },
    ],
    relations: [
      { 
        id: 'r', 
        name: 'r', 
        types: ['Type1', 'Type1'], 
        tuples: [
          { atoms: ['A', 'B'], types: ['Type1', 'Type1'] }
        ]
      }
    ]
  };

  it('should hide atoms matching selector', () => {
    const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: Type2
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(dataInstance, {});

    // Type2 atoms (C, D) should be hidden, only Type1 atoms (A, B) should remain
    const nodeIds = layout.nodes.map(node => node.id);
    expect(nodeIds).toContain('A');
    expect(nodeIds).toContain('B');
    expect(nodeIds).not.toContain('C');
    expect(nodeIds).not.toContain('D');
  });

  it('should hide atoms matching complex selector', () => {
    const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: A + B
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(dataInstance, {});

    // A and B should be hidden, C and D should remain
    const nodeIds = layout.nodes.map(node => node.id);
    expect(nodeIds).not.toContain('A');
    expect(nodeIds).not.toContain('B');
    expect(nodeIds).toContain('C');
    expect(nodeIds).toContain('D');
  });

  it('should work alongside legacy hideDisconnected flags', () => {
    const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: A
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(dataInstance, {});

    // A should be hidden by selector
    // C and D are disconnected but not flagged to hide
    // B should remain (connected and not selected by hideAtom)
    const nodeIds = layout.nodes.map(node => node.id);
    expect(nodeIds).not.toContain('A');
    expect(nodeIds).toContain('B');
    expect(nodeIds).toContain('C');
    expect(nodeIds).toContain('D');
  });

  it('should handle multiple hideAtom directives', () => {
    const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: A
  - hideAtom:
      selector: C
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(dataInstance, {});

    // A and C should be hidden by selectors
    // B and D should remain
    const nodeIds = layout.nodes.map(node => node.id);
    expect(nodeIds).not.toContain('A');
    expect(nodeIds).toContain('B');
    expect(nodeIds).not.toContain('C');
    expect(nodeIds).toContain('D');
  });

  it('should handle empty selector gracefully', () => {
    const layoutSpecYaml = `
constraints: []
directives:
  - hideAtom:
      selector: nonexistent
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    
    // Should not throw an error
    expect(() => {
      layoutInstance.generateLayout(dataInstance, {});
    }).not.toThrow();
  });

  it('surfaces constraints that reference hidden atoms as constraint errors', () => {
    const layoutSpecYaml = `
constraints:
  - orientation:
      selector: r
      directions: [right]
directives:
  - hideAtom:
      selector: B
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    const dataInstance = new JSONDataInstance(testData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout, error } = layoutInstance.generateLayout(dataInstance, {});

    expect(error).not.toBeNull();
    expect(error?.type).toBe('unknown-constraint');
    expect(error?.message).toContain('B');

    const nodeIds = layout.nodes.map(node => node.id);
    expect(nodeIds).not.toContain('B');
  });
});
