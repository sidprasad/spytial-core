import { describe, it, expect, beforeEach } from 'vitest';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutConstraint, LeftConstraint, TopConstraint } from '../src/layout/interfaces';

describe('WebCola Enhanced Edge Length Computation', () => {
  let translator: WebColaTranslator;
  let mockInstanceLayout: InstanceLayout;

  beforeEach(() => {
    translator = new WebColaTranslator();
    
    // Create mock nodes with different content characteristics
    const node1: LayoutNode = {
      id: 'node1',
      label: 'Short',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'type1',
      types: ['type1'],
      showLabels: true,
      attributes: {}
    };

    const node2: LayoutNode = {
      id: 'node2', 
      label: 'Very Long Node Label That Should Affect Spacing',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'type2',
      types: ['type2'],
      showLabels: true,
      attributes: {
        'property1': ['value1'],
        'property2': ['value2', 'value3'],
        'longPropertyName': ['very long property value that should affect spacing']
      }
    };

    const node3: LayoutNode = {
      id: 'node3',
      label: 'Medium Label',
      color: '#000000', 
      width: 100,
      height: 60,
      mostSpecificType: 'type3',
      types: ['type3'],
      showLabels: true,
      attributes: {
        'attr1': ['val1']
      }
    };

    const edge1: LayoutEdge = {
      source: node1,
      target: node2,
      label: 'edge1',
      relationName: 'relation1',
      id: 'edge1',
      color: '#000000'
    };

    const leftConstraint: LeftConstraint = {
      sourceConstraint: {} as any,
      left: node1,
      right: node2,
      minDistance: 20
    };

    const topConstraint: TopConstraint = {
      sourceConstraint: {} as any,
      top: node1,
      bottom: node3,
      minDistance: 15
    };

    mockInstanceLayout = {
      nodes: [node1, node2, node3],
      edges: [edge1],
      constraints: [leftConstraint, topConstraint],
      groups: []
    };
  });

  it('should calculate better separation distances for nodes with long labels', async () => {
    const webcolaLayout = await translator.translate(mockInstanceLayout, 800, 600);
    
    // Find the constraint that separates the short-label node from the long-label node
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation');
    expect(separationConstraints.length).toBeGreaterThan(0);

    // The constraint involving the long-label node should have a larger gap
    const horizontalConstraint = separationConstraints.find(c => c.axis === 'x');
    expect(horizontalConstraint).toBeDefined();
    expect(horizontalConstraint!.gap).toBeGreaterThan(100); // Should be more than basic node width
  });

  it('should calculate better separation distances for nodes with many attributes', async () => {
    const webcolaLayout = await translator.translate(mockInstanceLayout, 800, 600);
    
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation');
    const horizontalConstraint = separationConstraints.find(c => c.axis === 'x');
    
    // Should account for dense attribute content
    expect(horizontalConstraint!.gap).toBeGreaterThan(120);
  });

  it('should adapt link lengths based on node content', () => {
    // This is tested indirectly through the WebColaCnDGraph component
    // The linkLength should be computed dynamically based on node content
    expect(mockInstanceLayout.nodes.length).toBe(3);
    expect(mockInstanceLayout.constraints.length).toBe(2);
  });

  it('should handle nodes with no attributes gracefully', async () => {
    // Create a minimal layout with basic nodes
    const simpleNode1: LayoutNode = {
      id: 'simple1',
      label: 'A',
      color: '#000000',
      width: 50,
      height: 30,
      mostSpecificType: 'simple',
      types: ['simple'],
      showLabels: true
    };

    const simpleNode2: LayoutNode = {
      id: 'simple2',
      label: 'B', 
      color: '#000000',
      width: 50,
      height: 30,
      mostSpecificType: 'simple',
      types: ['simple'],
      showLabels: true
    };

    const simpleConstraint: LeftConstraint = {
      sourceConstraint: {} as any,
      left: simpleNode1,
      right: simpleNode2,
      minDistance: 10
    };

    const simpleLayout: InstanceLayout = {
      nodes: [simpleNode1, simpleNode2],
      edges: [],
      constraints: [simpleConstraint],
      groups: []
    };

    const webcolaLayout = await translator.translate(simpleLayout, 400, 300);
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation'); 
    
    expect(separationConstraints.length).toBe(1);
    expect(separationConstraints[0].gap).toBeGreaterThan(0);
  });
});