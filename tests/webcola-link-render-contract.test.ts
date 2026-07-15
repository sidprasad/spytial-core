import { describe, expect, it } from 'vitest';
import * as d3 from 'd3';

/**
 * The render-side half of the link-path lookup coverage.
 *
 * webcola-link-selector.test.ts pins getLinkPathElement's behaviour against a
 * hand-built fixture. A fixture can drift: it is shaped like today's markup,
 * and it keeps passing if the renderer stops producing that markup. This file
 * closes that gap by driving the real creation code — setupLinks, which builds
 * the .link-group, its path, its label and its endpoint markers — and then
 * asserting the lookup resolves against what was actually rendered.
 *
 * So this fails if anyone hoists labels out of the link-group, renames the
 * class, drops data-link-id from the main path, or puts data-link-id on the
 * highlight underlay. Those are precisely the changes that would silently
 * un-fix the quoted-id bug (#497), because the lookup degrades to null and
 * callers quietly fall back to computed midpoints rather than throwing.
 *
 * The renderer captures `window.d3` at module load, so d3 is installed before
 * the dynamic import below — a static import would be hoisted above it.
 */
(window as any).d3 = d3;
const { WebColaCnDGraph } = await import('../src/translators/webcola/webcola-cnd-graph');
const proto = WebColaCnDGraph.prototype as any;

// Real ids from the reported sample: Alloy subtyping relations carry quotes,
// which is what used to make an id-built selector throw.
const K4 = '_inferred_<: <:"k4"->n3';
const K1 = '_inferred_<: <:"k1"->n3';

const EDGES = [
  { id: 'next-1', label: 'next', source: { x: 0, y: 0 }, target: { x: 10, y: 10 } },
  { id: K4, label: '<:', source: { x: 0, y: 0 }, target: { x: 10, y: 10 } },
  { id: K1, label: '<:', source: { x: 0, y: 0 }, target: { x: 10, y: 10 } },
  { id: 'bracket]id[', label: 'odd', source: { x: 0, y: 0 }, target: { x: 10, y: 10 } },
  // Carries a highlight, so setupLinkPaths also inserts an underlay sibling.
  { id: 'highlighted', label: 'hot', highlight: '#ff0000', source: { x: 0, y: 0 }, target: { x: 10, y: 10 } },
];

/** Render link groups through the component's own creation path. */
function renderLinks(links: any[]) {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const container = d3.select(shadowRoot as any).append('svg').append('g');

  const graph: any = {
    container,
    // The real markup-producing code — the whole point of this file.
    setupLinks: proto.setupLinks,
    setupLinkPaths: proto.setupLinkPaths,
    setupLinkLabels: proto.setupLinkLabels,
    setupEdgeEndpointMarkers: proto.setupEdgeEndpointMarkers,
    getLinkPathElement: proto.getLinkPathElement,
    // Pure helpers: real implementations, so their output is the renderer's.
    getEdgeDasharray: proto.getEdgeDasharray,
    edgeLabelFontSize: proto.edgeLabelFontSize,
    edgeLabelFill: proto.edgeLabelFill,
    // Stubs for the environment the creation code reads but this test isn't about.
    isInputModeActive: false,
    isAlignmentEdge: () => false,
    isInferredEdge: (d: any) => String(d.id).startsWith('_inferred'),
    edgeStrokeColor: () => 'black',
    getFontFamily: () => 'sans-serif',
  };

  proto.setupLinks.call(graph, links, null);
  return { graph, shadowRoot };
}

/** The edge datum d3 bound to a rendered element. */
const datumOf = (el: Element) => (el as any).__data__;

describe('rendered link-group → path lookup contract', () => {
  it('renders a label and a data-link-id path per edge', () => {
    const { shadowRoot } = renderLinks(EDGES);
    // Guards the rest of the file: if these ever render differently, the
    // assertions below would pass vacuously over an empty selection.
    expect(shadowRoot.querySelectorAll('.link-group')).toHaveLength(EDGES.length);
    expect(shadowRoot.querySelectorAll('.linklabel')).toHaveLength(EDGES.length);
    expect(shadowRoot.querySelectorAll('path[data-link-id]')).toHaveLength(EDGES.length);
  });

  it('resolves every rendered label to its own edge path', () => {
    const { graph, shadowRoot } = renderLinks(EDGES);
    const labels = [...shadowRoot.querySelectorAll('.linklabel')];

    for (const label of labels) {
      const found = proto.getLinkPathElement.call(graph, label);
      expect(found, `no path for label of edge ${datumOf(label).id}`).not.toBeNull();
      // Not just "a path" — the one belonging to this label's edge.
      expect(found.getAttribute('data-link-id')).toBe(datumOf(label).id);
    }
  });

  it('resolves labels for the quoted ids that used to throw', () => {
    const { graph, shadowRoot } = renderLinks(EDGES);
    const labels = [...shadowRoot.querySelectorAll('.linklabel')];
    const byId = (id: string) => labels.find((l) => datumOf(l).id === id)!;

    for (const id of [K4, K1]) {
      expect(proto.getLinkPathElement.call(graph, byId(id))?.getAttribute('data-link-id')).toBe(id);
    }
  });

  it('resolves every rendered endpoint marker to its own edge path', () => {
    const { graph, shadowRoot } = renderLinks(EDGES);
    const markers = [...shadowRoot.querySelectorAll('.source-marker, .target-marker')];
    expect(markers.length).toBeGreaterThan(0);

    for (const marker of markers) {
      const found = proto.getLinkPathElement.call(graph, marker);
      expect(found?.getAttribute('data-link-id')).toBe(datumOf(marker).id);
    }
  });

  it('picks the main path over the highlight underlay rendered beneath it', () => {
    const { graph, shadowRoot } = renderLinks(EDGES);
    const group = [...shadowRoot.querySelectorAll('.link-group')].find(
      (g) => datumOf(g).id === 'highlighted'
    )!;
    // Precondition: the renderer really did add an underlay for this edge.
    expect(group.querySelector('path.highlight-underlay')).not.toBeNull();

    const label = group.querySelector('.linklabel')!;
    const found = proto.getLinkPathElement.call(graph, label);
    expect(found.getAttribute('data-link-id')).toBe('highlighted');
    expect(found.classList.contains('highlight-underlay')).toBe(false);
  });
});
