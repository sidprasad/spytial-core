import { afterEach, describe, expect, it, vi } from 'vitest';
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
  svg.getClientRects = () => [{ width: 800, height: 600 }] as unknown as DOMRectList;
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

  it('sizes a settled caption and its highlight on zoom and rechecks clearance after routing', async () => {
    const { graph, edge, obstacle } = fixture();
    const { path, text } = edge('e');
    text.style.fontSize = '17px'; // authored edge size
    path.getTotalLength = () => 200;
    const sample = vi.spyOn(path, 'getPointAtLength');
    graph.zoomBehavior.extent([[0, 0], [800, 600]]);
    const identity = graph.svg.node().__zoom;
    const zoom = (k: number) => graph.svg.call(graph.zoomBehavior.transform, identity.scale(k));
    zoom(0.5); // a restored camera, before the route is ready
    graph.updateLinkLabelsAfterRouting();
    expect(text.getAttribute('transform')).toBe('matrix(1.5 0 0 1.5 -50 0)');
    graph.labelHighlights.register({ kind: 'edge', edgeId: 'e' }, text);
    graph.highlightLabels([{ kind: 'edge', edgeId: 'e' }]);
    const mark = text.previousElementSibling!;
    expect(mark.getAttribute('transform')).toBe(text.getAttribute('transform'));
    sample.mockClear();
    zoom(1.5);
    await Promise.resolve();
    expect(text.hasAttribute('transform')).toBe(false);
    expect(mark.hasAttribute('transform')).toBe(false);
    expect(text.style.fontSize).toBe('17px');
    zoom(0.25);
    expect(text.getAttribute('transform')).toBe('matrix(1.5 0 0 1.5 -50 0)');
    expect(sample).not.toHaveBeenCalled();
    obstacle('node', { x: 124, y: -10, width: 15, height: 20 });
    graph.updateLinkLabelsAfterRouting();
    expect(text.hasAttribute('transform')).toBe(false);
    expect(text.getAttribute('x')).toBe('100');
  });

  it('keeps a growing caption clear of a long route that bends between coarse samples', () => {
    const { graph, edge } = fixture();
    const { path, text } = edge('caption', 'M');
    path.getTotalLength = () => 200;
    path.getPointAtLength = d => ({ x: d - 100, y: 0 }) as DOMPoint;
    text.getBBox = () => ({ x: Number(text.getAttribute('x')) - 10,
      y: Number(text.getAttribute('y')) - 7, width: 20, height: 14 }) as DOMRect;
    const foreign = edge('neighbor', '').path;
    // At 4096 units the old 64 segments cut this corner diagonally.
    foreign.setAttribute('d', 'M2030,2 H14 V2082');
    foreign.getTotalLength = () => 4096;
    foreign.getPointAtLength = d => (d <= 2016 ? { x: 2030 - d, y: 2 } : { x: 14, y: 2 + d - 2016 }) as DOMPoint;
    graph.zoomBehavior.extent([[0, 0], [800, 600]]);
    graph.svg.call(graph.zoomBehavior.transform, graph.svg.node().__zoom.scale(0.5));
    graph.updateLinkLabelsAfterRouting();
    const scale = Number(text.getAttribute('transform')?.match(/^matrix\(([^ ]+)/)?.[1] ?? 1);
    const centerX = Number(text.getAttribute('x')), centerY = Number(text.getAttribute('y'));
    const left = centerX - 10 * scale, right = centerX + 10 * scale;
    const top = centerY - 7 * scale, bottom = centerY + 7 * scale;
    expect(top <= 2 && bottom >= 2 && right >= 14 && left <= 2030).toBe(false);
    expect(left <= 14 && right >= 14 && bottom >= 2 && top <= 2082).toBe(false);
  });

  it('shares zoom sizing by displayed caption and respects an explicit font-size directive', () => {
    const { graph, edge } = fixture();
    const open = edge('long', 'value');
    const tight = edge('short', 'value', 100);
    const styled = edge('large', 'value', 200);
    const different = edge('different', 'entry', 300);
    for (const { path } of [open, styled, different]) path.getTotalLength = () => 240;
    open.text.style.fill = 'purple'; // a color directive still shares the default size
    styled.text.style.fontSize = '17px'; // the renderer's textStyle.size override
    graph.zoomBehavior.extent([[0, 0], [800, 600]]);
    const identity = graph.svg.node().__zoom;
    graph.updateLinkLabelsAfterRouting();
    graph.svg.call(graph.zoomBehavior.transform, identity.scale(0.5));
    expect(open.text.hasAttribute('transform')).toBe(false);
    expect(tight.text.hasAttribute('transform')).toBe(false);
    expect(styled.text.getAttribute('transform')).toMatch(/^matrix\(1.5 /);
    expect(different.text.getAttribute('transform')).toMatch(/^matrix\(1.5 /);
    // Once the tight copy has room too, both default captions grow together.
    tight.path.getTotalLength = () => 240;
    graph.updateLinkLabelsAfterRouting();
    graph.svg.call(graph.zoomBehavior.transform, identity.scale(0.8));
    for (const { text } of [open, tight]) expect(text.getAttribute('transform')).toMatch(/^matrix\(1.25 /);
    expect(styled.text.style.fontSize).toBe('17px');
  });

  it('fits the enlarged caption at the destination zoom on initial fit and after zooming in', async () => {
    const { graph, edge } = fixture();
    const { path, text } = edge('long');
    path.getTotalLength = () => 220;
    path.getPointAtLength = d => ({ x: 0, y: d }) as DOMPoint;
    text.getBBox = () => ({ x: Number(text.getAttribute('x')) - 310,
      y: Number(text.getAttribute('y')) - 7, width: 620, height: 14 }) as DOMRect;
    graph.currentLayout = { nodes: [], links: [], groups: [] };
    Object.defineProperty(graph.svg.node(), 'clientWidth', { value: 360 });
    graph.zoomBehavior.extent([[0, 0], [360, 320]]);
    const identity = graph.svg.node().__zoom;
    graph.updateLinkLabelsAfterRouting();
    for (const start of [1, 1.5, 0.2]) {
      graph.svg.call(graph.zoomBehavior.transform, identity.scale(start));
      graph.resetViewToFitContent();
      // Allow subsequent Fit to View camera transitions to settle.
      await vi.waitFor(() => expect(graph.getCurrentTransform().k).toBeCloseTo(280 / (620 * 1.5 + 10), 5));
      const { k, x } = graph.getCurrentTransform();
      expect(text.getAttribute('transform')).toMatch(/^matrix\(1.5 /);
      const center = x + k * Number(text.getAttribute('x'));
      const halfWidth = k * 620 * 1.5 / 2;
      // 40 CSS px of fit padding on each side, plus the text metric inset.
      expect(center - halfWidth).toBeGreaterThanOrEqual(40);
      expect(center + halfWidth).toBeLessThanOrEqual(320);
    }
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
