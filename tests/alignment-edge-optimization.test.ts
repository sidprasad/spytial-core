import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

/**
 * Tests for alignment edge optimization.
 * 
 * This test verifies that alignment edges are only added when nodes are NOT
 * already connected, which significantly reduces the number of constraints
 * for large graphs and improves WebCola performance.
 */

describe('Alignment Edge Optimization', () => {
  it('should not add alignment edges when nodes are already directly connected', () => {
    // Create a simple graph: A -> B -> C
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'R',
          name: 'R',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    // Layout spec that aligns all nodes (A-B and B-C are already connected)
    const layoutSpec = parseLayoutSpec(`
constraints:
  - align:
      selector: "{x, y : Node | some x.R or some y.R or some R.x or some R.y}"
      direction: "horizontal"
`);

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    // Generate layout with alignment edges enabled
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const result = layoutInstance.generateLayout(dataInstance, {});
    
    // Count edges - should only have the original 2 edges (A->B, B->C)
    // No alignment edges should be added since A-B and B-C are already connected
    // and A-C are connected via B
    expect(result.layout.edges.length).toBe(2);
  });

  it('should add alignment edges when nodes are disconnected', () => {
    // Create a graph with disconnected nodes: A and B have no relation
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' }
      ],
      relations: []
    };

    // Layout spec that aligns disconnected nodes
    const layoutSpec = parseLayoutSpec(`
constraints:
  - align:
      selector: "{x, y : Node | x != y}"
      direction: "horizontal"
`);

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    // Generate layout with alignment edges enabled
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const result = layoutInstance.generateLayout(dataInstance, {});
    
    // Should have added 1 alignment edge since A and B are disconnected
    expect(result.layout.edges.length).toBe(1);
    expect(result.layout.edges[0].id).toContain('_alignment_');
  });

  it('should not add alignment edges when nodes are connected via path', () => {
    // Create a longer path: A -> B -> C -> D
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
        { id: 'D', type: 'Node', label: 'D' }
      ],
      relations: [
        {
          id: 'R',
          name: 'R',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            { atoms: ['C', 'D'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    // Layout spec that aligns all pairs of nodes
    const layoutSpec = parseLayoutSpec(`
constraints:
  - align:
      selector: "{x, y : Node | x != y}"
      direction: "vertical"
`);

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    // Generate layout with alignment edges enabled
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const result = layoutInstance.generateLayout(dataInstance, {});
    
    // Should only have the original 3 edges (A->B, B->C, C->D)
    // No alignment edges needed because all nodes are connected via paths:
    // A-D connected via B and C, A-C connected via B, B-D connected via C
    expect(result.layout.edges.length).toBe(3);
    expect(result.layout.edges.filter(e => e.id.includes('_alignment_')).length).toBe(0);
  });

  it('should respect addAlignmentEdges=false flag', () => {
    // Create disconnected nodes
    const jsonData: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' }
      ],
      relations: []
    };

    const layoutSpec = parseLayoutSpec(`
constraints:
  - align:
      selector: "{x, y : Node | x != y}"
      direction: "horizontal"
`);

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    // Generate layout with alignment edges DISABLED
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, false);
    const result = layoutInstance.generateLayout(dataInstance, {});
    
    // Should have NO edges at all since alignment edge creation is disabled
    expect(result.layout.edges.length).toBe(0);
  });

  it('should optimize for large graphs with many alignment constraints', () => {
    // Create a fully connected graph: every node connects to every other node
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `Node${i}`,
      type: 'Node',
      label: `Node${i}`
    }));

    const tuples = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      tuples.push({
        atoms: [`Node${i}`, `Node${i + 1}`],
        types: ['Node', 'Node']
      });
    }

    const jsonData: IJsonDataInstance = {
      atoms: nodes,
      relations: [
        {
          id: 'R',
          name: 'R',
          types: ['Node', 'Node'],
          tuples
        }
      ]
    };

    // Layout spec that aligns ALL pairs of nodes (would be n*(n-1)/2 = 45 pairs for 10 nodes)
    const layoutSpec = parseLayoutSpec(`
constraints:
  - align:
      selector: "{x, y : Node | x != y}"
      direction: "horizontal"
`);

    const dataInstance = new JSONDataInstance(jsonData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const result = layoutInstance.generateLayout(dataInstance, {});
    
    // Should only have 9 edges (the chain connections), not 9 + 45 alignment edges
    // All nodes are connected via the chain, so no alignment edges needed
    expect(result.layout.edges.length).toBe(9);
    
    // Verify no alignment edges were added
    const alignmentEdges = result.layout.edges.filter(e => e.id.includes('_alignment_'));
    expect(alignmentEdges.length).toBe(0);
  });
});
