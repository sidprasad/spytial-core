import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

// Create a tic-tac-toe like grid structure
const ticTacToeData: IJsonDataInstance = {
  atoms: [
    // Top row
    { id: 'Cell00', type: 'Cell', label: 'Top-Left' },
    { id: 'Cell01', type: 'Cell', label: 'Top-Center' },
    { id: 'Cell02', type: 'Cell', label: 'Top-Right' },
    
    // Middle row  
    { id: 'Cell10', type: 'Cell', label: 'Mid-Left' },
    { id: 'Cell11', type: 'Cell', label: 'Mid-Center' },
    { id: 'Cell12', type: 'Cell', label: 'Mid-Right' },
    
    // Bottom row
    { id: 'Cell20', type: 'Cell', label: 'Bot-Left' },
    { id: 'Cell21', type: 'Cell', label: 'Bot-Center' },
    { id: 'Cell22', type: 'Cell', label: 'Bot-Right' }
  ],
  relations: [
    // Create a grid structure with horizontal and vertical connections
    {
      id: 'right',
      name: 'right',
      types: ['Cell', 'Cell'],
      tuples: [
        { atoms: ['Cell00', 'Cell01'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell01', 'Cell02'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell10', 'Cell11'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell11', 'Cell12'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell20', 'Cell21'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell21', 'Cell22'], types: ['Cell', 'Cell'] }
      ]
    },
    {
      id: 'below',
      name: 'below',
      types: ['Cell', 'Cell'],
      tuples: [
        { atoms: ['Cell00', 'Cell10'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell01', 'Cell11'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell02', 'Cell12'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell10', 'Cell20'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell11', 'Cell21'], types: ['Cell', 'Cell'] },
        { atoms: ['Cell12', 'Cell22'], types: ['Cell', 'Cell'] }
      ]
    },
    // Create a special relation just for grouping top corners
    {
      id: 'topCornerPair',
      name: 'topCornerPair',
      types: ['Cell', 'Cell'],
      tuples: [
        { atoms: ['Cell00', 'Cell02'], types: ['Cell', 'Cell'] }
      ]
    }
  ]
};

const layoutSpecWithProblematicGroup = `
constraints:
  - orientation:
      selector: right
      directions:
        - right
  - orientation:
      selector: below
      directions:
        - below
  - group:
      selector: "topCornerPair"
      name: "TopCorners"
`;

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Group Boundary Constraints', () => {
  
  it('should prevent non-member nodes from being positioned within group boundaries', () => {
    const instance = new JSONDataInstance(ticTacToeData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(layoutSpecWithProblematicGroup);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout, error } = layoutInstance.generateLayout(instance, {});

    // Should not have errors
    expect(error).toBeNull();
    
    // Debug: Check what groups are actually created
    console.log('Created groups:', layout.groups.map(g => ({ name: g.name, nodeIds: g.nodeIds })));
    
    // Should have the problematic group (note: when using binary relations, the group name gets the key node appended)
    const topCornersGroup = layout.groups.find(g => g.name.startsWith('TopCorners'));
    expect(topCornersGroup).toBeDefined();
    
    // For binary selectors, Cell00 is the key and Cell02 gets added to the group
    expect(topCornersGroup?.nodeIds).toContain('Cell02');
    expect(topCornersGroup?.keyNodeId).toBe('Cell00');
    
    // The middle element (Cell01) should NOT be in the group members
    expect(topCornersGroup?.nodeIds).not.toContain('Cell01');
    
    // There should be constraints that prevent Cell01 from being positioned within the group boundary
    // This is what we're going to implement - constraints that keep non-members outside group boundaries
    const groupBoundaryConstraints = layout.constraints.filter(c => 
      c.sourceConstraint && 
      (c.sourceConstraint as any).reason && 
      (c.sourceConstraint as any).reason.includes('Group Boundary')
    );
    
    // After our fix, there should be constraints preventing Cell01 from being inside the TopCorners group
    expect(groupBoundaryConstraints.length).toBeGreaterThan(0);
  });

  it('should generate layout with correct node positioning', () => {
    const instance = new JSONDataInstance(ticTacToeData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(layoutSpecWithProblematicGroup);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance, {});

    // Should have all 9 nodes
    expect(layout.nodes).toHaveLength(9);
    
    // Should have the right number of edges
    expect(layout.edges.length).toBeGreaterThan(0);
    
    // Should have constraints
    expect(layout.constraints.length).toBeGreaterThan(0);
  });
});