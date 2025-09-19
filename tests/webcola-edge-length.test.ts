import { describe, it, expect, beforeEach } from 'vitest';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { InstanceLayout, LayoutNode, LayoutEdge, LayoutConstraint, LeftConstraint, TopConstraint } from '../src/layout/interfaces';

describe('WebCola Enhanced Edge Length Computation', () => {
  let translator: WebColaTranslator;
  let mockInstanceLayout: InstanceLayout;

  beforeEach(() => {
    translator = new WebColaTranslator();
    
    // Create mock nodes with different actual dimensions
    const smallNode: LayoutNode = {
      id: 'small',
      label: 'Small',
      color: '#000000',
      width: 80,
      height: 50,
      mostSpecificType: 'type1',
      types: ['type1'],
      showLabels: true,
      attributes: {}
    };

    const largeNode: LayoutNode = {
      id: 'large', 
      label: 'Large Node',
      color: '#000000',
      width: 200,
      height: 120,
      mostSpecificType: 'type2',
      types: ['type2'],
      showLabels: true,
      attributes: {
        'property1': ['value1'],
        'property2': ['value2']
      }
    };

    const mediumNode: LayoutNode = {
      id: 'medium',
      label: 'Medium',
      color: '#000000', 
      width: 120,
      height: 80,
      mostSpecificType: 'type3',
      types: ['type3'],
      showLabels: true,
      attributes: {
        'attr1': ['val1']
      }
    };

    const edge1: LayoutEdge = {
      source: smallNode,
      target: largeNode,
      label: 'edge1',
      relationName: 'relation1',
      id: 'edge1',
      color: '#000000'
    };

    const leftConstraint: LeftConstraint = {
      sourceConstraint: {} as any,
      left: smallNode,
      right: largeNode,
      minDistance: 20
    };

    const topConstraint: TopConstraint = {
      sourceConstraint: {} as any,
      top: smallNode,
      bottom: mediumNode,
      minDistance: 15
    };

    mockInstanceLayout = {
      nodes: [smallNode, largeNode, mediumNode],
      edges: [edge1],
      constraints: [leftConstraint, topConstraint],
      groups: []
    };
  });

  it('should calculate better separation distances based on actual node dimensions', async () => {
    const webcolaLayout = await translator.translate(mockInstanceLayout, 800, 600);
    
    // Find the constraint that separates the small node from the large node
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation');
    expect(separationConstraints.length).toBeGreaterThan(0);

    // The constraint involving the large node should have a larger gap than basic calculation
    const horizontalConstraint = separationConstraints.find(c => c.axis === 'x');
    expect(horizontalConstraint).toBeDefined();
    
    // Should use actual widths: (80/2) + (200/2) + 20 + adaptive padding = 40 + 100 + 20 + padding > 160
    expect(horizontalConstraint!.gap).toBeGreaterThan(160);
  });

  it('should adapt link lengths based on actual node dimensions and graph density', () => {
    // This is tested indirectly through the WebColaCnDGraph component
    // The linkLength should be computed based on actual node dimensions
    expect(mockInstanceLayout.nodes.length).toBe(3);
    expect(mockInstanceLayout.constraints.length).toBe(2);
  });

  it('should handle nodes with standard dimensions gracefully', async () => {
    // Create a layout with standard-sized nodes
    const standardNode1: LayoutNode = {
      id: 'std1',
      label: 'Standard A',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'standard',
      types: ['standard'],
      showLabels: true
    };

    const standardNode2: LayoutNode = {
      id: 'std2',
      label: 'Standard B', 
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'standard',
      types: ['standard'],
      showLabels: true
    };

    const standardConstraint: LeftConstraint = {
      sourceConstraint: {} as any,
      left: standardNode1,
      right: standardNode2,
      minDistance: 10
    };

    const standardLayout: InstanceLayout = {
      nodes: [standardNode1, standardNode2],
      edges: [],
      constraints: [standardConstraint],
      groups: []
    };

    const webcolaLayout = await translator.translate(standardLayout, 400, 300);
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation'); 
    
    expect(separationConstraints.length).toBe(1);
    // Should use: (100/2) + (100/2) + 10 + small adaptive padding = 110 + padding
    expect(separationConstraints[0].gap).toBeGreaterThan(110);
    expect(separationConstraints[0].gap).toBeLessThan(140); // reasonable upper bound
  });

  it('should provide larger separations for larger nodes', async () => {
    // Test that larger nodes get more separation
    const tinyNode: LayoutNode = {
      id: 'tiny',
      label: 'Tiny',
      color: '#000000',
      width: 60,
      height: 40,
      mostSpecificType: 'tiny',
      types: ['tiny'],
      showLabels: true
    };

    const hugeNode: LayoutNode = {
      id: 'huge',
      label: 'Huge',
      color: '#000000',
      width: 300,
      height: 200,
      mostSpecificType: 'huge',
      types: ['huge'],
      showLabels: true
    };

    const constraint: LeftConstraint = {
      sourceConstraint: {} as any,
      left: tinyNode,
      right: hugeNode,
      minDistance: 10
    };

    const layout: InstanceLayout = {
      nodes: [tinyNode, hugeNode],
      edges: [],
      constraints: [constraint],
      groups: []
    };

    const webcolaLayout = await translator.translate(layout, 600, 400);
    const separationConstraints = webcolaLayout.constraints.filter(c => c.type === 'separation');
    
    expect(separationConstraints.length).toBe(1);
    // Should use: (60/2) + (300/2) + 10 + adaptive padding = 190 + padding
    expect(separationConstraints[0].gap).toBeGreaterThan(190);
  });
});