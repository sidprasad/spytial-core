import { describe, it, expect, beforeEach } from 'vitest';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

describe('Accessibility Integration', () => {
  let layoutInstance: LayoutInstance;
  let dataInstance: JSONDataInstance;
  let evaluator: SGraphQueryEvaluator;

  beforeEach(() => {
    // Create test data with nodes and relationships
    const testData = {
      atoms: [
        { id: 'Alice', type: 'Person', label: 'Alice' },
        { id: 'Bob', type: 'Person', label: 'Bob' },
        { id: 'CompanyA', type: 'Company', label: 'CompanyA' }
      ],
      relations: [
        {
          id: 'works_for',
          name: 'works_for',
          types: ['Person', 'Company'],
          tuples: [
            { atoms: ['Alice', 'CompanyA'], types: ['Person', 'Company'] },
            { atoms: ['Bob', 'CompanyA'], types: ['Person', 'Company'] }
          ]
        },
        {
          id: 'knows',
          name: 'knows', 
          types: ['Person', 'Person'],
          tuples: [
            { atoms: ['Alice', 'Bob'], types: ['Person', 'Person'] }
          ]
        }
      ]
    };

    const layoutSpecYaml = `
nodes:
  - { id: Person, type: atom, color: "#FF6B35" }
  - { id: Company, type: atom, color: "#4ECDC4" }
constraints:
  - orient:
      selector: Person->Company
      directions: [below]
  - orient:
      selector: Person->Person  
      directions: [directlyRight]
groups:
  - groupByField:
      name: "employees"
      relationName: "works_for"
      groupOn: 1
      addToGroup: 0
`;

    const layoutSpec = parseLayoutSpec(layoutSpecYaml);
    dataInstance = new JSONDataInstance(testData);
    evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    
    layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
  });

  it('should generate layout with accessibility data', () => {
    const { layout } = layoutInstance.generateLayout(dataInstance, {});
    
    // Verify basic layout generation
    expect(layout.nodes).toBeDefined();
    expect(layout.edges).toBeDefined();
    expect(layout.groups).toBeDefined();
    expect(layout.nodes.length).toBeGreaterThan(0);
    
    // Generate accessibility data
    const accessibilityData = layoutInstance.generateAccessibilityData(layout);
    
    // Verify Data Navigator structure
    expect(accessibilityData.nodes).toBeDefined();
    expect(accessibilityData.edges).toBeDefined();
    expect(accessibilityData.navigationRules).toBeDefined();
    expect(accessibilityData.elementData).toBeDefined();
    
    // Check that nodes have been translated
    const nodeIds = Object.keys(accessibilityData.nodes);
    expect(nodeIds.length).toBe(layout.nodes.length);
    
    // Check that each node has accessibility metadata
    for (const nodeId of nodeIds) {
      const node = accessibilityData.nodes[nodeId];
      expect(node.id).toBe(nodeId);
      expect(node.renderId).toBeDefined();
      
      const renderData = accessibilityData.elementData![nodeId];
      expect(renderData).toBeDefined();
      expect(renderData.semantics).toBeDefined();
      expect(renderData.semantics!.label).toBeDefined();
      expect(renderData.semantics!.role).toBeDefined();
    }
    
    // Check that edges have been translated
    const edgeIds = Object.keys(accessibilityData.edges);
    expect(edgeIds.length).toBe(layout.edges.length);
    
    // Check that navigation rules exist
    expect(Object.keys(accessibilityData.navigationRules!).length).toBeGreaterThan(0);
  });

  it('should generate accessibility data with custom options', () => {
    const { layout } = layoutInstance.generateLayout(dataInstance, {});
    
    // Generate accessibility data with custom options
    const accessibilityData = layoutInstance.generateAccessibilityData(layout, {
      includeSpatialProperties: false,
      generateNavigationRules: false,
      nodeSemanticGenerator: (node) => ({
        label: `Custom: ${node.label}`,
        elementType: 'div',
        role: 'region'
      })
    });
    
    // Check that custom semantic generator was used
    const firstNodeId = Object.keys(accessibilityData.nodes)[0];
    const renderData = accessibilityData.elementData![firstNodeId];
    expect(renderData.semantics!.label).toContain('Custom: ');
    expect(renderData.semantics!.role).toBe('region');
    
    // Check that spatial properties were excluded
    expect(renderData.spatialProperties).toBeUndefined();
  });

  it('should handle groups in accessibility data', () => {
    const { layout } = layoutInstance.generateLayout(dataInstance, {});
    
    // Only proceed if groups were actually generated
    if (layout.groups.length > 0) {
      const accessibilityData = layoutInstance.generateAccessibilityData(layout);
      
      // Check that dimensions were created for groups
      expect(accessibilityData.dimensions).toBeDefined();
      expect(Object.keys(accessibilityData.dimensions!).length).toBeGreaterThan(0);
      
      // Check that group navigation rules exist
      const navRules = accessibilityData.navigationRules!;
      expect(navRules['nav_sibling_next']).toBeDefined();
      expect(navRules['nav_sibling_prev']).toBeDefined();
      expect(navRules['nav_child_enter']).toBeDefined();
      expect(navRules['nav_parent_exit']).toBeDefined();
    }
  });

  it('should work with empty layouts', () => {
    const emptyData = {
      atoms: [],
      relations: []
    };
    
    const emptyDataInstance = new JSONDataInstance(emptyData);
    const emptyEvaluator = new SGraphQueryEvaluator();
    emptyEvaluator.initialize({ sourceData: emptyDataInstance });
    
    const simpleSpec = parseLayoutSpec('constraints: []');
    const emptyLayoutInstance = new LayoutInstance(simpleSpec, emptyEvaluator, 0, true);
    
    const { layout } = emptyLayoutInstance.generateLayout(emptyDataInstance, {});
    const accessibilityData = emptyLayoutInstance.generateAccessibilityData(layout);
    
    expect(accessibilityData.nodes).toBeDefined();
    expect(accessibilityData.edges).toBeDefined();
    expect(Object.keys(accessibilityData.nodes)).toHaveLength(0);
    expect(Object.keys(accessibilityData.edges)).toHaveLength(0);
  });

  it('should preserve all node information in accessibility metadata', () => {
    const { layout } = layoutInstance.generateLayout(dataInstance, {});
    const accessibilityData = layoutInstance.generateAccessibilityData(layout);
    
    // Find a person node to test
    const personNode = layout.nodes.find(node => node.mostSpecificType === 'Person');
    if (personNode) {
      const accessibilityNode = accessibilityData.nodes[personNode.id];
      const renderData = accessibilityData.elementData![personNode.id];
      
      // Check that node properties are preserved
      expect(accessibilityNode.type).toBe('Person');
      expect(renderData.semantics!.label).toContain(personNode.label);
      
      // Check that type information is included in the label
      if (personNode.mostSpecificType !== personNode.label) {
        expect(renderData.semantics!.label).toContain(personNode.mostSpecificType);
      }
      
      // Check spatial properties
      expect(renderData.spatialProperties).toBeDefined();
      expect(renderData.spatialProperties!.width).toBe(personNode.width);
      expect(renderData.spatialProperties!.height).toBe(personNode.height);
    }
  });
});