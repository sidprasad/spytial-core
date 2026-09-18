import { describe, expect, it } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

/** Exercise the actual link markup and the marker layer together. */
function fixture() {
  const graph = new WebColaCnDGraph() as any;
  const edges = [
    { id: 'next', source: { id: 'a', x: 0, y: 0 }, target: { id: 'b', x: 100, y: 0 }, color: '#125abc', relName: 'next' },
    { id: 'two-way', source: { id: 'a' }, target: { id: 'c' }, bidirectional: true },
    { id: '_alignment_hidden', source: { id: 'a' }, target: { id: 'c' } },
  ];
  graph.currentLayout = { nodes: [], links: edges };
  graph.svgLinkGroups = graph.setupLinks(edges, null);
  graph.svgLinkGroups.select('path[data-link-id]').attr('d', 'M0,0L100,0');
  const node = graph.container.append('g').attr('class', 'node').node();
  const caption = graph.container.append('text').attr('class', 'groupLabel').text('Group').node();
  graph.updateArrowheads();
  const container = graph.container.node() as SVGGElement;
  return { graph, container, node, caption };
}

function carriers(container: Element): SVGPathElement[] {
  return Array.from(container.querySelectorAll('.arrowhead-layer path'));
}

describe('arrowhead visibility', () => {
  it('paints only arrowheads above nodes and captions, leaving shafts behind them', () => {
    const { container, node, caption } = fixture();
    const layer = container.querySelector('.arrowhead-layer')!;
    expect(container.lastElementChild).toBe(layer);
    expect(node.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.compareDocumentPosition(layer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const source = container.querySelector<SVGPathElement>('path[data-link-id="next"]')!;
    expect(source.parentElement!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(source.style.markerEnd).toBe('none');
    const head = carriers(container)[0];
    expect(head.style.markerEnd).toBe('url(#end-arrow)');
    expect(head.style.strokeWidth).toBe('0');
    expect(head.style.getPropertyPriority('stroke-width')).toBe('important');
    expect(head.style.pointerEvents).toBe('none');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(head.hasAttribute('data-link-id')).toBe(false);
  });

  it('excludes alignment links and preserves one-way and bidirectional markers', () => {
    const { container } = fixture();
    const heads = carriers(container);
    expect(heads).toHaveLength(2);
    expect(heads[0].style.markerStart).toBe('none');
    expect(heads[1].style.markerStart).toBe('url(#start-arrow)');
    expect(heads[1].style.markerEnd).toBe('url(#end-arrow)');
  });

  it('follows rerouted paths without changing node data or duplicating layers', () => {
    const { graph, container } = fixture();
    const before = JSON.stringify(graph.currentLayout);
    const path = container.querySelector('path[data-link-id="next"]')!;
    const routed = 'M10,10L50,10L50,90Q50,100 60,100L100,100';
    path.setAttribute('d', routed);
    // A later caption paint must not obscure the marker layer again.
    container.appendChild(container.querySelector('.groupLabel')!);
    graph.updateArrowheads();
    graph.updateArrowheads();
    expect(carriers(container)[0].getAttribute('d')).toBe(routed);
    expect(container.querySelectorAll('.arrowhead-layer')).toHaveLength(1);
    expect(container.lastElementChild!.classList.contains('arrowhead-layer')).toBe(true);
    expect(JSON.stringify(graph.currentLayout)).toBe(before);
  });

  it('tracks authored colors, theme changes and relation highlighting', () => {
    const { graph, container } = fixture();
    graph.setTheme('dark');
    const heads = carriers(container);
    expect(heads[0].getAttribute('stroke')).toBe('#125abc');
    expect(heads[1].getAttribute('stroke')).toBe(graph.edgeStrokeColor(graph.currentLayout.links[1]));
    graph.highlightRelation('next');
    expect(carriers(container)[0].classList.contains('highlighted')).toBe(true);
    expect(carriers(container)[0].style.strokeWidth).toBe('0');
    graph.clearHighlightRelation('next');
    expect(carriers(container)[0].classList.contains('highlighted')).toBe(false);
  });

  it('keeps entering edges hidden and respects the draw-in visibility flag', () => {
    const { graph, container } = fixture();
    graph.morphEnteringNodeIds = new Set();
    graph.morphEnteringEdgeIds = new Set(['next']);
    graph.hideEnteringElements();
    expect(carriers(container)[0].getAttribute('opacity')).toBe('0');
    expect(carriers(container)[1].getAttribute('opacity')).toBe('1');
    const group = container.querySelector('path[data-link-id="next"]')!.parentElement!;
    group.setAttribute('opacity', '1');
    group.setAttribute('data-arrowheads-hidden', 'true');
    graph.updateArrowheads();
    expect(carriers(container)[0].getAttribute('opacity')).toBe('0');
    group.removeAttribute('data-arrowheads-hidden');
    graph.updateArrowheads();
    expect(carriers(container)[0].getAttribute('opacity')).toBe('1');
  });

  it('removes stale arrowheads when edges are deleted or the graph is cleared', () => {
    const { graph, container } = fixture();
    container.querySelector('path[data-link-id="next"]')!.parentElement!.remove();
    graph.updateArrowheads();
    expect(carriers(container)).toHaveLength(1);
    expect(carriers(container)[0].getAttribute('data-arrowhead-for')).toBe('two-way');
    container.querySelectorAll('.link-group').forEach(group => group.remove());
    graph.updateArrowheads();
    expect(container.querySelector('.arrowhead-layer')).toBeNull();
  });

  it('anchors both arrow tips exactly at the path endpoints at a fixed size', () => {
    const { graph } = fixture();
    const start = graph.shadowRoot.querySelector('#start-arrow');
    const end = graph.shadowRoot.querySelector('#end-arrow');
    expect(start.getAttribute('refX')).toBe('0');
    expect(end.getAttribute('refX')).toBe('12');
    expect(start.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    expect(end.getAttribute('markerUnits')).toBe('userSpaceOnUse');
  });
});
