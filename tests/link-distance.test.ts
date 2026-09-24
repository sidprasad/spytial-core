import { describe, expect, it, vi } from 'vitest';
import { Layout as ColaLayout } from 'webcola';
import { idealLinkDistance } from '../src/translators/webcola/link-distance';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';

const small = { visualWidth: 100, visualHeight: 60, width: 116, height: 76 };
const large = { visualWidth: 240, visualHeight: 90, width: 256, height: 106 };

describe('default WebCola edge distances', () => {
  it('keeps one long edge label from stretching unrelated edges', () => {
    const ordinary = idealLinkDistance(small, small, 3, 5);
    const longLabel = idealLinkDistance(small, small, 3, 5, 400);

    expect(longLabel).toBeGreaterThan(ordinary);
    expect(longLabel - ordinary).toBeLessThan(50);
    expect(idealLinkDistance(small, small, 3, 5)).toBe(ordinary);
  });

  it('uses visual endpoint size rather than padded collision bounds', () => {
    const ordinary = idealLinkDistance(small, small, 3, 5);
    const wideEndpoint = idealLinkDistance(small, large, 3, 5);
    expect(wideEndpoint).toBeGreaterThan(ordinary);
    expect(wideEndpoint).toBe(idealLinkDistance(
      { ...small, width: 300, height: 300 }, { ...large, width: 400, height: 400 }, 3, 5,
    ));
  });

  it('treats the distance as a soft target while satisfying a larger author gap', () => {
    const nodes = [
      { x: 100, y: 100, width: 116, height: 76 },
      { x: 300, y: 100, width: 116, height: 76 },
    ];
    const link = { source: 0, target: 1 };
    const requiredGap = 300;
    new ColaLayout()
      .nodes(nodes)
      .links([link])
      .constraints([{ type: 'separation', axis: 'x', left: 0, right: 1, gap: requiredGap }])
      .linkDistance(idealLinkDistance(small, small, 2, 5))
      .avoidOverlaps(true)
      .size([800, 400])
      .start(10, 50, 200, 10, false);

    expect(nodes[1].x - nodes[0].x).toBeGreaterThanOrEqual(requiredGap - 1);
  });

  it('passes distinct targets to the first settled renderer solve', async () => {
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: () => 100 });
    Object.defineProperty(SVGElement.prototype, 'getPointAtLength', { configurable: true, value: (length: number) => ({ x: length, y: 0 }) });
    Object.defineProperty(SVGSVGElement.prototype, 'width', { configurable: true, get: () => ({ baseVal: { value: 800 } }) });
    Object.defineProperty(SVGSVGElement.prototype, 'height', { configurable: true, get: () => ({ baseVal: { value: 600 } }) });
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      font: '', measureText: (text: string) => ({ width: text.length * 9 }),
    }) as any);
    const nodes = ['a', 'b', 'c'].map((id, i) => ({
      id, label: id, color: '#000', width: [146, 161, 106][i], height: 60,
      mostSpecificType: 'Node', showLabels: true,
    } as LayoutNode));
    const edges = [
      { id: 'ab', source: nodes[0], target: nodes[1], label: 'A very long edge label that used to stretch the entire graph', relationName: 'r', color: '#000' },
      { id: 'bc', source: nodes[1], target: nodes[2], label: '', relationName: 'r', color: '#000' },
    ];
    const input: InstanceLayout = { nodes, edges, groups: [], constraints: [
      { sourceConstraint: {} as any, left: nodes[0], right: nodes[1], minDistance: 20 },
      { sourceConstraint: {} as any, left: nodes[1], right: nodes[2], minDistance: 20 },
    ] };
    const graph = new WebColaCnDGraph();
    document.body.appendChild(graph);
    try {
      await graph.renderLayout(input, { transitionMode: 'replace' });
      const layout = (graph as any).colaLayout as ColaLayout;
      const links = (graph as any).currentLayout.links as Array<{ id: string }>;
      const lengths = new Map(links.map(link => [link.id, layout.getLinkLength(link as any)]));
      expect(lengths.get('ab')).toBeGreaterThan(lengths.get('bc')!);
      expect(lengths.get('bc')).toBeCloseTo(idealLinkDistance(nodes[1], nodes[2], 3, 5));
      expect(lengths.get('ab')).toBeLessThan(300);

      // A late grid snap used to replace the two near-target gaps with one
      // oversized gap and one nearly-minimal gap, despite valid constraints.
      const settled = new Map((graph as any).currentLayout.nodes.map((node: any) => [node.id, node.x]));
      const ab = (settled.get('b') as number) - (settled.get('a') as number);
      const bc = (settled.get('c') as number) - (settled.get('b') as number);
      expect(Math.abs(ab - lengths.get('ab')!)).toBeLessThan(25);
      expect(Math.abs(bc - lengths.get('bc')!)).toBeLessThan(25);
      expect(ab).toBeGreaterThanOrEqual((nodes[0].width + nodes[1].width) / 2 + 20);
      expect(bc).toBeGreaterThanOrEqual((nodes[1].width + nodes[2].width) / 2 + 20);
    } finally {
      graph.dispose();
      graph.remove();
      canvas.mockRestore();
    }
  });
});
