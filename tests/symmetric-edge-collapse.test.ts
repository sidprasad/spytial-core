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

  function reversePair(overrides: Partial<LayoutEdge> = {}): LayoutEdge[] {
    const forward: LayoutEdge = {
      source: nodeA, target: nodeB, label: 'relation', relationName: 'relation',
      id: 'edge_AB', color: '#000000'
    };
    return [
      { ...forward, ...overrides },
      { ...forward, source: nodeB, target: nodeA, id: 'edge_BA' }
    ];
  }

  const differences: [string, Partial<LayoutEdge>][] = [
    ['label', { label: 'other' }],
    ['relation', { relationName: 'other' }],
    ['color', { color: 'red' }],
    ['pattern', { style: 'dashed' }],
    ['weight', { weight: 5 }],
    ['highlight', { highlight: 'yellow' }],
    ['label visibility', { showLabel: false }],
    ['label size', { textStyle: { size: 'large' } }],
    ['label color', { textStyle: { color: 'red' } }],
    ['group', { groupId: 'group' }],
    ['key node', { keyNodeId: 'A' }],
    ['source attachment', { sourceGroupId: 'group' }],
    ['target attachment', { targetGroupId: 'group' }],
    ['inferred edge kind', { id: '_inferred_AB' }],
    ['alignment edge kind', { id: '_alignment_AB' }],
    ['group edge kind', { id: '_g_AB' }],
  ];

  describe.each([false, true])('reversed node order: %s', (reverseNodes) => {
    it.each(differences)('preserves both directions when %s differs', async (_name, overrides) => {
      const edges = reversePair(overrides);
      const result = await translator.translate({
        nodes: reverseNodes ? [nodeB, nodeA] : [nodeA, nodeB],
        edges, constraints: [], groups: []
      });
      expect(result.links).toHaveLength(2);
      for (const edge of edges) {
        const link = result.links.find(link => link.id === edge.id);
        expect(link).toMatchObject({
          label: edge.label, relName: edge.relationName, color: edge.color,
          style: edge.style, weight: edge.weight, highlight: edge.highlight,
          showLabel: edge.showLabel, textStyle: edge.textStyle,
          sourceGroupId: edge.sourceGroupId, targetGroupId: edge.targetGroupId,
        });
        expect(link?.bidirectional).toBeUndefined();
      }
    });
  });

  it('collapses matching styles by value, with reversed group attachments', async () => {
    const styling: Partial<LayoutEdge> = {
      color: 'red', style: 'dashed', weight: 5, highlight: 'yellow',
      showLabel: false, textStyle: { size: 'large', color: 'blue' }
    };
    const [forward, reverse] = reversePair(styling);
    const result = await translator.translate({
      nodes: [nodeA, nodeB],
      edges: [
        { ...forward, sourceGroupId: 'group' },
        { ...reverse, ...styling, textStyle: { color: 'blue', size: 'large' }, targetGroupId: 'group' }
      ],
      constraints: [], groups: []
    });
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({ ...styling, bidirectional: true });
  });

  it('keeps multiple matching pairs with the same label and different styles', async () => {
    const [forward, reverse] = reversePair();
    const result = await translator.translate({
      nodes: [nodeA, nodeB],
      // The first reverse candidate has the wrong style; search must continue.
      edges: [forward, { ...reverse, id: 'red_BA', color: 'red' },
        reverse, { ...forward, id: 'red_AB', color: 'red' }],
      constraints: [], groups: []
    });
    expect(result.links).toHaveLength(2);
    expect(result.links.every(link => link.bidirectional)).toBe(true);
    expect(result.links.map(link => link.color).sort()).toEqual(['#000000', 'red']);
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
