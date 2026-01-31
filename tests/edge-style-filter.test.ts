/**
 * Tests for edge style filter functionality, specifically for hiding edges.
 * 
 * This tests the 'filter' parameter in edgeColor directives, which should
 * filter which specific tuples a style/hidden directive applies to.
 */
import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

// Test data mimicking a binary tree structure (similar to the user's Forge model)
const binaryTreeData: IJsonDataInstance = {
  atoms: [
    { id: 'Node0', type: 'Node', label: 'Node0' },
    { id: 'Node1', type: 'Node', label: 'Node1' },
    { id: 'Node2', type: 'Node', label: 'Node2' },
    { id: 'Node3', type: 'Node', label: 'Node3' },
    { id: 'Node4', type: 'Node', label: 'Node4' },
  ],
  relations: [
    {
      id: 'left',
      name: 'left',
      types: ['Node', 'Node'],
      tuples: [
        { atoms: ['Node3', 'Node1'], types: ['Node', 'Node'] },
        { atoms: ['Node4', 'Node2'], types: ['Node', 'Node'] }
      ]
    },
    {
      id: 'right',
      name: 'right',
      types: ['Node', 'Node'],
      tuples: [
        { atoms: ['Node1', 'Node4'], types: ['Node', 'Node'] },
        { atoms: ['Node3', 'Node0'], types: ['Node', 'Node'] }
      ]
    }
  ]
};

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Edge Style Filter for Hidden Edges', () => {
  it('should hide all edges of a field when hidden=true and no filter', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#000000'
      hidden: true
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // All 'left' edges should be hidden
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(0);

    // 'right' edges should still be present
    const rightEdges = layout.edges.filter(e => e.relationName === 'right');
    expect(rightEdges.length).toBe(2);
  });

  it('should hide only filtered edges when filter is specified', () => {
    // Filter to only hide the left edge from Node3 to Node1
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#000000'
      filter: 'Node3 -> Node1'
      hidden: true
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Only Node3->Node1 left edge should be hidden
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(1);
    
    // The remaining left edge should be Node4->Node2
    expect(leftEdges[0].source.id).toBe('Node4');
    expect(leftEdges[0].target.id).toBe('Node2');

    // 'right' edges should still be present (all 2)
    const rightEdges = layout.edges.filter(e => e.relationName === 'right');
    expect(rightEdges.length).toBe(2);
  });

  it('should hide edges matching filter expression with intersection', () => {
    // Use intersection to filter: left & (Node3 -> univ) means left edges starting from Node3
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#000000'
      filter: 'left & (Node3 -> univ)'
      hidden: true
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Only left edges from Node3 should be hidden
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(1);
    
    // The remaining left edge should be Node4->Node2
    expect(leftEdges[0].source.id).toBe('Node4');
    expect(leftEdges[0].target.id).toBe('Node2');
  });

  it('should apply color to filtered edges without hiding', () => {
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#FF0000'
      filter: 'Node3 -> Node1'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // All left edges should still be present
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(2);
    
    // The Node3->Node1 edge should be red
    const node3ToNode1Edge = leftEdges.find(e => 
      e.source.id === 'Node3' && e.target.id === 'Node1'
    );
    expect(node3ToNode1Edge).toBeDefined();
    expect(node3ToNode1Edge?.color).toBe('#FF0000');
    
    // The Node4->Node2 edge should NOT have the red color (no directive matches it)
    const node4ToNode2Edge = leftEdges.find(e => 
      e.source.id === 'Node4' && e.target.id === 'Node2'
    );
    expect(node4ToNode2Edge).toBeDefined();
    // It should have a default color, not red
    expect(node4ToNode2Edge?.color).not.toBe('#FF0000');
  });

  it('should combine selector and filter correctly', () => {
    // Selector filters source nodes, filter filters specific tuples
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#00FF00'
      selector: 'Node3'
      filter: 'left & (Node3 -> univ)'
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // All left edges should still be present
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(2);
    
    // The Node3->Node1 edge should be green (matches both selector and filter)
    const node3Edge = leftEdges.find(e => e.source.id === 'Node3');
    expect(node3Edge).toBeDefined();
    expect(node3Edge?.color).toBe('#00FF00');
    
    // The Node4->Node2 edge should NOT be green (Node4 not in selector)
    const node4Edge = leftEdges.find(e => e.source.id === 'Node4');
    expect(node4Edge).toBeDefined();
    expect(node4Edge?.color).not.toBe('#00FF00');
  });

  it('should not hide edges when filter does not match any tuples', () => {
    // Filter that matches nothing
    const layoutSpecStr = `
directives:
  - edgeColor:
      field: 'left'
      value: '#000000'
      filter: 'Node0 -> Node0'
      hidden: true
`;

    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const instance = new JSONDataInstance(binaryTreeData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // All left edges should still be present (filter matches nothing)
    const leftEdges = layout.edges.filter(e => e.relationName === 'left');
    expect(leftEdges.length).toBe(2);
  });
});
