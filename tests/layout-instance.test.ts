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
  it('generates layout from data', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1); // Only the original relation edge, no alignment edge because they're already connected
    expect(layout.constraints.length).toBeGreaterThan(0);
  });

  it('adds alignment edges for disconnected nodes with orientation constraints', async () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2); // Original relation edge A->B + alignment edge A->C
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Check that we have both the original edge and the alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('r'); // Original relation
    expect(edgeLabels).toContain('_alignment_A_C_'); // Added alignment edge
  });

  it('adds alignment edges for align constraints on disconnected nodes', async () => {
    const alignConstraintData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Type1', label: 'A' },
        { id: 'B', type: 'Type1', label: 'B' },
        { id: 'C', type: 'Type1', label: 'C' }
      ],
      relations: []
    };

    const alignConstraintSpec = `
constraints:
  - align:
      selector: A->B
      direction: horizontal
`;

    const instance = new JSONDataInstance(alignConstraintData);
    const evaluator = createEvaluator(instance);
    const alignLayoutSpec = parseLayoutSpec(alignConstraintSpec);

    const layoutInstance = new LayoutInstance(alignLayoutSpec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1); // Only the alignment edge A->B
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Check that we have the alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('_alignment_A_B_'); // Added alignment edge
  });

  it('does not add alignment edges when addAlignmentEdges is false', async () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpecDisconnectedNodes, evaluator, 0, false);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1); // Only the original relation edge A->B
    expect(layout.constraints.length).toBeGreaterThan(0);

    // Should not have alignment edge
    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).not.toContain('_alignment_A_C_');
  });

  it('applies color to inferred edges when specified', async () => {
    const dataWithTransitiveRelation: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    const specWithInferredEdge = `
directives:
  - inferredEdge:
      name: reachable
      selector: next.next
      color: '#ff0000'
`;

    const instance = new JSONDataInstance(dataWithTransitiveRelation);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithInferredEdge);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    // Should have original edges (A->B, B->C) and inferred edge (A->C)
    expect(layout.edges.length).toBeGreaterThanOrEqual(3);

    // Find the inferred edge
    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('reachable'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge?.color).toBe('#ff0000');
  });

  it('uses default black color for inferred edges when color not specified', async () => {
    const dataWithTransitiveRelation: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    const specWithInferredEdge = `
directives:
  - inferredEdge:
      name: reachable
      selector: next.next
`;

    const instance = new JSONDataInstance(dataWithTransitiveRelation);
    const evaluator = createEvaluator(instance);
    const spec = parseLayoutSpec(specWithInferredEdge);

    const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayout(instance, {});

    expect(layout.nodes).toHaveLength(3);
    // Should have original edges (A->B, B->C) and inferred edge (A->C)
    expect(layout.edges.length).toBeGreaterThanOrEqual(3);

    // Find the inferred edge
    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('reachable'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge?.color).toBe('black'); // Default color
  });
});

