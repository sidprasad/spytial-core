import { describe, it, expect, beforeEach } from 'vitest';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { InstanceLayout, LayoutNode, LayoutEdge } from '../src/layout/interfaces';

describe('Symmetric Edge Collapse', () => {
  let translator: WebColaTranslator;
  let nodeA: LayoutNode;
  let nodeB: LayoutNode;

  beforeEach(() => {
    translator = new WebColaTranslator();
    
    nodeA = {
      id: 'A',
      label: 'Node A',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'Type1',
      types: ['Type1'],
      showLabels: true,
      attributes: {}
    };

    nodeB = {
      id: 'B',
      label: 'Node B',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'Type1',
      types: ['Type1'],
      showLabels: true,
      attributes: {}
    };
  });

  it('should collapse symmetric edges with the same label into a single bidirectional edge', async () => {
    const edgeAB: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'relation',
      relationName: 'relation',
      id: 'edge_AB',
      color: '#000000'
    };

    const edgeBA: LayoutEdge = {
      source: nodeB,
      target: nodeA,
      label: 'relation',
      relationName: 'relation',
      id: 'edge_BA',
      color: '#000000'
    };

    const mockInstanceLayout: InstanceLayout = {
      nodes: [nodeA, nodeB],
      edges: [edgeAB, edgeBA],
      constraints: [],
      groups: []
    };

    const webcolaLayout = await translator.translate(mockInstanceLayout);
    
    // Should have collapsed into a single bidirectional edge
    expect(webcolaLayout.links.length).toBe(1);
    expect(webcolaLayout.links[0].bidirectional).toBe(true);
    expect(webcolaLayout.links[0].label).toBe('relation');
  });

  it('should NOT collapse edges with different labels', async () => {
    const edgeAB: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'relationX',
      relationName: 'relationX',
      id: 'edge_AB',
      color: '#000000'
    };

    const edgeBA: LayoutEdge = {
      source: nodeB,
      target: nodeA,
      label: 'relationY',
      relationName: 'relationY',
      id: 'edge_BA',
      color: '#000000'
    };

    const mockInstanceLayout: InstanceLayout = {
      nodes: [nodeA, nodeB],
      edges: [edgeAB, edgeBA],
      constraints: [],
      groups: []
    };

    const webcolaLayout = await translator.translate(mockInstanceLayout);
    
    // Should keep both edges since labels are different
    expect(webcolaLayout.links.length).toBe(2);
    expect(webcolaLayout.links[0].bidirectional).toBeUndefined();
    expect(webcolaLayout.links[1].bidirectional).toBeUndefined();
  });

  it('should keep unidirectional edges as-is', async () => {
    const edgeAB: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'relation',
      relationName: 'relation',
      id: 'edge_AB',
      color: '#000000'
    };

    const mockInstanceLayout: InstanceLayout = {
      nodes: [nodeA, nodeB],
      edges: [edgeAB],
      constraints: [],
      groups: []
    };

    const webcolaLayout = await translator.translate(mockInstanceLayout);
    
    // Should keep the single edge as-is
    expect(webcolaLayout.links.length).toBe(1);
    expect(webcolaLayout.links[0].bidirectional).toBeUndefined();
    expect(webcolaLayout.links[0].label).toBe('relation');
  });

  it('should handle multiple pairs of symmetric edges', async () => {
    const nodeC: LayoutNode = {
      id: 'C',
      label: 'Node C',
      color: '#000000',
      width: 100,
      height: 60,
      mostSpecificType: 'Type1',
      types: ['Type1'],
      showLabels: true,
      attributes: {}
    };

    const edgeAB: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'rel1',
      relationName: 'rel1',
      id: 'edge_AB',
      color: '#000000'
    };

    const edgeBA: LayoutEdge = {
      source: nodeB,
      target: nodeA,
      label: 'rel1',
      relationName: 'rel1',
      id: 'edge_BA',
      color: '#000000'
    };

    const edgeBC: LayoutEdge = {
      source: nodeB,
      target: nodeC,
      label: 'rel2',
      relationName: 'rel2',
      id: 'edge_BC',
      color: '#000000'
    };

    const edgeCB: LayoutEdge = {
      source: nodeC,
      target: nodeB,
      label: 'rel2',
      relationName: 'rel2',
      id: 'edge_CB',
      color: '#000000'
    };

    const mockInstanceLayout: InstanceLayout = {
      nodes: [nodeA, nodeB, nodeC],
      edges: [edgeAB, edgeBA, edgeBC, edgeCB],
      constraints: [],
      groups: []
    };

    const webcolaLayout = await translator.translate(mockInstanceLayout);
    
    // Should have collapsed both pairs
    expect(webcolaLayout.links.length).toBe(2);
    expect(webcolaLayout.links.every(link => link.bidirectional)).toBe(true);
  });

  it('should handle mixed symmetric and asymmetric edges', async () => {
    const edgeAB: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'relation',
      relationName: 'relation',
      id: 'edge_AB',
      color: '#000000'
    };

    const edgeBA: LayoutEdge = {
      source: nodeB,
      target: nodeA,
      label: 'relation',
      relationName: 'relation',
      id: 'edge_BA',
      color: '#000000'
    };

    const edgeAB2: LayoutEdge = {
      source: nodeA,
      target: nodeB,
      label: 'other',
      relationName: 'other',
      id: 'edge_AB2',
      color: '#000000'
    };

    const mockInstanceLayout: InstanceLayout = {
      nodes: [nodeA, nodeB],
      edges: [edgeAB, edgeBA, edgeAB2],
      constraints: [],
      groups: []
    };

    const webcolaLayout = await translator.translate(mockInstanceLayout);
    
    // Should have one bidirectional edge (relation) and one unidirectional (other)
    expect(webcolaLayout.links.length).toBe(2);
    const bidirectionalEdges = webcolaLayout.links.filter(link => link.bidirectional);
    const unidirectionalEdges = webcolaLayout.links.filter(link => !link.bidirectional);
    expect(bidirectionalEdges.length).toBe(1);
    expect(unidirectionalEdges.length).toBe(1);
    expect(bidirectionalEdges[0].label).toBe('relation');
    expect(unidirectionalEdges[0].label).toBe('other');
  });
});
