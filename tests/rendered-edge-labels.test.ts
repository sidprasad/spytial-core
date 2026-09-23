import { afterEach, describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { arrowheadBounds, placeRenderedEdgeLabels } from '../src/translators/webcola/edge-labels';
import { labelOverlap, type LabelRect } from '../src/translators/webcola/routing/edge-label-placement';

const ns = 'http://www.w3.org/2000/svg';
afterEach(() => document.body.replaceChildren());
function fixture() {
  const graph = new WebColaCnDGraph() as any;
  document.body.append(graph);
  const container = graph.container.node() as SVGGElement;
  // jsdom does not invalidate computed styles after changes inside a shadow
  // root. Keep the renderer's selection, but measure in a light-DOM SVG here.
  const svg = document.createElementNS(ns, 'svg');
  svg.append(container);
  document.body.append(svg);
  const obstacle = (className: string, box: LabelRect) => {
    const element = document.createElementNS(ns, 'rect');
    element.setAttribute('class', className);
    element.getBBox = () => box as DOMRect;
    container.append(element);
    return element;
  };
  const edge = (id: string, caption = 'relation', y = 0) => {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', 'link-group');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('data-link-id', id);
    path.setAttribute('d', `M0,${y}L100,${y}`);
    path.getTotalLength = () => 100;
    path.getPointAtLength = distance => ({ x: distance, y }) as DOMPoint;
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'linklabel');
    text.textContent = caption;
    text.setAttribute('x', '50');
    text.setAttribute('y', String(y));
    // Deliberately asymmetric baseline: visual center is 2px below the anchor.
    text.getBBox = () => ({ x: Number(text.getAttribute('x')) - 20,
      y: Number(text.getAttribute('y')) - 4, width: 40, height: 12 }) as DOMRect;
    group.append(path, text);
    container.append(group);
    return { group, path, text };
  };
  return { graph, container, obstacle, edge };
}

describe('measured SVG edge labels', () => {
  it('uses actual text bounds, preserves edge ownership and leaves layout data untouched', () => {
    const { graph, container, edge, obstacle } = fixture();
    const { text, group, path } = edge('relation["unsafe"]');
    const box = { x: 35, y: -10, width: 30, height: 20 };
    obstacle('node', box);
    graph.currentLayout = { nodes: [{ id: 'fixed', x: 50, y: 0, fixed: true }], constraints: [{ gap: 20 }] };
    const before = JSON.stringify(graph.currentLayout);
    graph.updateLinkLabelsAfterRouting();
    expect(labelOverlap(text.getBBox(), box)).toBe(0);
    expect(text.parentElement).toBe(group);
    expect(path.getAttribute('d')).toBe('M0,0L100,0');
    expect(JSON.stringify(graph.currentLayout)).toBe(before);
    const first = [text.getAttribute('x'), text.getAttribute('y')];
    container.setAttribute('transform', 'translate(500,200) scale(3)');
    graph.updateLinkLabelsAfterRouting();
    expect([text.getAttribute('x'), text.getAttribute('y')]).toEqual(first);
  });

  it('centers the measured glyphs rather than assuming a font baseline', () => {
    const { container, edge } = fixture();
    const { text } = edge('e');
    placeRenderedEdgeLabels(container);
    expect(text.getAttribute('x')).toBe('50');
    expect(text.getAttribute('y')).toBe('-2');
  });

  it('protects captions but permits the empty interior of groups', () => {
    const { container, edge, obstacle } = fixture();
    const { text } = edge('e');
    obstacle('group', { x: -30, y: -70, width: 160, height: 140 });
    const caption = { x: 20, y: -12, width: 60, height: 24 };
    const bg = obstacle('groupLabelBg', caption);
    placeRenderedEdgeLabels(container);
    expect(labelOverlap(text.getBBox(), caption)).toBe(0);
    bg.style.display = 'none';
    expect(getComputedStyle(bg).display).toBe('none');
    placeRenderedEdgeLabels(container);
    expect(text.getAttribute('x')).toBe('50');
    expect(text.getAttribute('y')).toBe('-2');
  });

  it('protects arrowheads of unlabeled edges even when the lower marker copy is suppressed', () => {
    const { container, edge } = fixture();
    const { text } = edge('label');
    const other = edge('unlabeled', '');
    other.path.getTotalLength = () => 60;
    other.path.getPointAtLength = distance => ({ x: 50, y: distance - 60 }) as DOMPoint;
    other.path.setAttribute('marker-end', 'url(#end-arrow)');
    other.path.style.markerEnd = 'none';
    placeRenderedEdgeLabels(container);
    const arrow = arrowheadBounds({ x: 50, y: 0 }, { x: 50, y: -1 })!;
    expect(labelOverlap(text.getBBox(), arrow)).toBe(0);
  });

  it('ignores alignment edges and tolerates missing SVG geometry', () => {
    const { container, edge } = fixture();
    const { text } = edge('normal');
    const alignment = edge('hidden', '');
    alignment.path.classList.add('alignmentLink');
    alignment.path.getPointAtLength = distance => ({ x: 50, y: distance - 50 }) as DOMPoint;
    const detached = edge('detached');
    detached.path.getTotalLength = () => { throw new Error('not rendered'); };
    expect(() => placeRenderedEdgeLabels(container)).not.toThrow();
    expect(text.getAttribute('x')).toBe('50');
    expect(text.getAttribute('y')).toBe('-2');
    expect(detached.text.getAttribute('y')).toBe('0');
  });

  it('bounds markers in both directions and rejects a degenerate tangent', () => {
    expect(arrowheadBounds({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual({ x: -1, y: -5, width: 14, height: 10 });
    expect(arrowheadBounds({ x: 0, y: 0 }, { x: -1, y: 0 })).toEqual({ x: -13, y: -5, width: 14, height: 10 });
    expect(arrowheadBounds({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});
