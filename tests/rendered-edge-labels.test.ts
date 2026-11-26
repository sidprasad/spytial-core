import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyToPoints, compose, fromDefinition, fromTransformAttribute } from 'transformation-matrix';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { arrowheadBounds, placeRenderedEdgeLabels } from '../src/translators/webcola/edge-labels';
import { labelOverlap, type LabelRect } from '../src/translators/webcola/routing/edge-label-placement';

const ns = 'http://www.w3.org/2000/svg';
afterEach(() => document.body.replaceChildren());

// jsdom supplies neither SVG transform matrices nor rendered bounding rectangles.
function diagramBounds(element: SVGElement, points: [number, number][]): DOMRect {
  const transform = element.getAttribute('transform');
  if (transform) points = applyToPoints(compose(fromDefinition(fromTransformAttribute(transform))), points);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return new DOMRect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function glyphBounds(text: SVGTextElement): DOMRect {
  const { x, y, width, height } = text.getBBox();
  return diagramBounds(text, [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]);
}

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
    const base = text.getBBox();
    const grown = glyphBounds(text);
    expect(grown.width / base.width).toBeCloseTo(1.5);
    expect(grown.left + grown.width / 2).toBeCloseTo(base.x + base.width / 2);
    expect(grown.top + grown.height / 2).toBeCloseTo(base.y + base.height / 2);
    graph.labelHighlights.register({ kind: 'edge', edgeId: 'e' }, text);
    graph.highlightLabels([{ kind: 'edge', edgeId: 'e' }]);
    const mark = text.parentElement!.querySelector<SVGPolygonElement>('.label-highlight-marker')!;
    const checkHighlight = () => {
      const points = mark.getAttribute('points')!.trim().split(/\s+/).map(pair => pair.split(',').map(Number) as [number, number]);
      const backing = diagramBounds(mark, points);
      const glyphs = glyphBounds(text);
      expect(backing.left).toBeLessThanOrEqual(glyphs.left);
      expect(backing.right).toBeGreaterThanOrEqual(glyphs.right);
      expect(backing.top).toBeLessThan(glyphs.bottom);
      expect(backing.bottom).toBeGreaterThan(glyphs.top);
      return backing.width;
    };
    const grownHighlightWidth = checkHighlight();
    sample.mockClear();
    zoom(1.5);
    await Promise.resolve();
    expect(glyphBounds(text).width).toBeCloseTo(base.width);
    expect(checkHighlight()).toBeLessThan(grownHighlightWidth);
    expect(text.style.fontSize).toBe('17px');
    zoom(0.25);
    expect(glyphBounds(text).width).toBeCloseTo(grown.width);
    expect(sample).not.toHaveBeenCalled();
    const node = { x: 124, y: -10, width: 15, height: 20 };
    obstacle('node', node);
    graph.updateLinkLabelsAfterRouting();
    expect(labelOverlap(glyphBounds(text), node)).toBe(0);
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
    const { left, right, top, bottom } = glyphBounds(text);
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
    const scale = (text: SVGTextElement) => glyphBounds(text).width / text.getBBox().width;
    expect(scale(open.text)).toBeCloseTo(scale(tight.text));
    expect(scale(styled.text)).toBeGreaterThan(scale(open.text));
    expect(scale(different.text)).toBeGreaterThan(scale(open.text));
    const constrained = scale(tight.text);
    // Once the tight copy has room too, both default captions grow together.
    tight.path.getTotalLength = () => 240;
    graph.updateLinkLabelsAfterRouting();
    graph.svg.call(graph.zoomBehavior.transform, identity.scale(0.8));
    expect(scale(open.text)).toBeCloseTo(scale(tight.text));
    expect(scale(tight.text)).toBeGreaterThan(constrained);
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
    const viewportWidth = 360, viewportHeight = 320;
    Object.defineProperties(graph.svg.node(), {
      clientWidth: { value: viewportWidth }, clientHeight: { value: viewportHeight },
    });
    graph.zoomBehavior.extent([[0, 0], [viewportWidth, viewportHeight]]);
    const identity = graph.svg.node().__zoom;
    graph.updateLinkLabelsAfterRouting();
    let firstFitWidth: number | undefined;
    for (const start of [1, 1.5, 0.2]) {
      graph.svg.call(graph.zoomBehavior.transform, identity.scale(start));
      const settled = new Promise<void>(resolve => graph.zoomBehavior.on('end.test', () => resolve()));
      graph.resetViewToFitContent();
      await settled;
      const { k, x, y } = graph.getCurrentTransform();
      const glyphs = glyphBounds(text);
      expect(glyphs.width).toBeGreaterThan(text.getBBox().width);
      expect(x + k * glyphs.left).toBeGreaterThanOrEqual(0);
      expect(x + k * glyphs.right).toBeLessThanOrEqual(viewportWidth);
      expect(y + k * glyphs.top).toBeGreaterThanOrEqual(0);
      expect(y + k * glyphs.bottom).toBeLessThanOrEqual(viewportHeight);
      const fittedWidth = k * glyphs.width;
      expect(fittedWidth).toBeGreaterThan(viewportWidth / 2);
      firstFitWidth ??= fittedWidth;
      expect(Math.abs(fittedWidth - firstFitWidth)).toBeLessThan(1);
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
