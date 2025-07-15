import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { LayoutEdge, LayoutNode } from '../src/layout/interfaces';

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

const layoutSpecStr = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

// Helper function to create mock nodes
function createMockNode(id: string): LayoutNode {
  return {
    id,
    label: id,
    color: '#000000',
    width: 100,
    height: 60,
    mostSpecificType: 'Type1',
    types: ['Type1'],
    showLabels: true
  };
}

// Helper function to create mock edges
function createMockEdge(sourceId: string, targetId: string, label: string, relationName: string = 'rel'): LayoutEdge {
  return {
    source: createMockNode(sourceId),
    target: createMockNode(targetId),
    label,
    relationName,
    id: `${sourceId}-${targetId}-${label}`,
    color: '#000000'
  };
}

describe('WebColaTranslator', () => {
  it('translates layout to webcola format', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    const translator = new WebColaTranslator();
    const result = await translator.translate(layout);

    expect(result.colaNodes).toHaveLength(2);
    expect(result.colaEdges).toHaveLength(1);
    expect(result.colaConstraints.length).toBeGreaterThan(0);
  });

  describe('Symmetric Edge Collapse', () => {
    it('collapses symmetric edges with same label', async () => {
      // Create test data with bidirectional edges with same label
      const nodeA = createMockNode('A');
      const nodeB = createMockNode('B');
      
      const edge1 = createMockEdge('A', 'B', 'sameLabel');
      const edge2 = createMockEdge('B', 'A', 'sameLabel');

      const testLayout = {
        nodes: [nodeA, nodeB],
        edges: [edge1, edge2],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(testLayout);

      // Should have collapsed 2 edges into 1
      expect(result.colaEdges).toHaveLength(1);
      expect(result.colaEdges[0].label).toBe('sameLabel');
      expect(result.colaEdges[0].id).toContain('bidirectional');
    });

    it('does not collapse edges with different labels', async () => {
      // Create test data with bidirectional edges with different labels
      const nodeA = createMockNode('A');
      const nodeB = createMockNode('B');
      
      const edge1 = createMockEdge('A', 'B', 'labelX');
      const edge2 = createMockEdge('B', 'A', 'labelY');

      const testLayout = {
        nodes: [nodeA, nodeB],
        edges: [edge1, edge2],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(testLayout);

      // Should keep both edges since labels are different
      expect(result.colaEdges).toHaveLength(2);
      expect(result.colaEdges.map(e => e.label)).toContain('labelX');
      expect(result.colaEdges.map(e => e.label)).toContain('labelY');
    });

    it('handles mixed scenarios correctly', async () => {
      // Create test data with mix of symmetric and non-symmetric edges
      const nodeA = createMockNode('A');
      const nodeB = createMockNode('B');
      const nodeC = createMockNode('C');
      
      const edge1 = createMockEdge('A', 'B', 'sameLabel'); // Will be collapsed
      const edge2 = createMockEdge('B', 'A', 'sameLabel'); // Will be collapsed
      const edge3 = createMockEdge('A', 'C', 'differentLabel'); // Will remain
      const edge4 = createMockEdge('B', 'C', 'uniqueLabel'); // Will remain

      const testLayout = {
        nodes: [nodeA, nodeB, nodeC],
        edges: [edge1, edge2, edge3, edge4],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(testLayout);

      // Should have 3 edges: 1 collapsed + 2 original
      expect(result.colaEdges).toHaveLength(3);
      
      const labels = result.colaEdges.map(e => e.label);
      expect(labels).toContain('sameLabel');
      expect(labels).toContain('differentLabel');
      expect(labels).toContain('uniqueLabel');

      // Check that one edge is marked as bidirectional
      const bidirectionalEdges = result.colaEdges.filter(e => e.id.includes('bidirectional'));
      expect(bidirectionalEdges).toHaveLength(1);
      expect(bidirectionalEdges[0].label).toBe('sameLabel');
    });

    it('preserves single directional edges', async () => {
      // Create test data with only single directional edges
      const nodeA = createMockNode('A');
      const nodeB = createMockNode('B');
      
      const edge1 = createMockEdge('A', 'B', 'onlyOneWay');

      const testLayout = {
        nodes: [nodeA, nodeB],
        edges: [edge1],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(testLayout);

      // Should keep the single edge as-is
      expect(result.colaEdges).toHaveLength(1);
      expect(result.colaEdges[0].label).toBe('onlyOneWay');
      expect(result.colaEdges[0].id).not.toContain('bidirectional');
    });

    it('handles multiple node pairs with different collapse behaviors', async () => {
      // Create test data with multiple node pairs having different edge configurations
      const nodeA = createMockNode('A');
      const nodeB = createMockNode('B');
      const nodeC = createMockNode('C');
      const nodeD = createMockNode('D');
      
      // A <-> B with same label (should collapse)
      const edgeAB = createMockEdge('A', 'B', 'friendship');
      const edgeBA = createMockEdge('B', 'A', 'friendship');
      
      // C <-> D with different labels (should not collapse)
      const edgeCD = createMockEdge('C', 'D', 'parent');
      const edgeDC = createMockEdge('D', 'C', 'child');
      
      // A -> C single direction (should remain as-is)
      const edgeAC = createMockEdge('A', 'C', 'knows');

      const testLayout = {
        nodes: [nodeA, nodeB, nodeC, nodeD],
        edges: [edgeAB, edgeBA, edgeCD, edgeDC, edgeAC],
        constraints: [],
        groups: []
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(testLayout);

      // Should have 4 edges: 1 collapsed + 2 different labels + 1 single direction
      expect(result.colaEdges).toHaveLength(4);
      
      const labels = result.colaEdges.map(e => e.label);
      expect(labels).toContain('friendship'); // Collapsed edge
      expect(labels).toContain('parent');     // Non-collapsed
      expect(labels).toContain('child');      // Non-collapsed  
      expect(labels).toContain('knows');      // Single direction

      // Check that only one edge is marked as bidirectional
      const bidirectionalEdges = result.colaEdges.filter(e => e.id.includes('bidirectional'));
      expect(bidirectionalEdges).toHaveLength(1);
      expect(bidirectionalEdges[0].label).toBe('friendship');
    });
  });
});

