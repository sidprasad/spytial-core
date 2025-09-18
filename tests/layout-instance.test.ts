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

const jsonDataDisconnected: IJsonDataInstance = {
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

const layoutSpecDisconnected = `
constraints:
  - orientation:
      selector: A->C
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);
const layoutSpecDisconnectedNodes = parseLayoutSpec(layoutSpecDisconnected);

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
    expect(layout.edges).toHaveLength(1); // Only the original relation edge, no alignment edge because they're already connected
    expect(layout.constraints.length).toBeGreaterThan(0);
  });

  it('adds alignment edges for disconnected nodes with orientation constraints', () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2); // Original relation edge A->B + alignment edge A->C
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Check that we have both the original edge and the alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('r'); // Original relation
    expect(edgeLabels).toContain('_alignment_A_C_'); // Added alignment edge
  });

  it('does not add alignment edges when addAlignmentEdges is false', () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, false);
    const { layout } = layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1); // Only the original relation edge A->B
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Should not have alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).not.toContain('_alignment_A_C_');
  });
});

