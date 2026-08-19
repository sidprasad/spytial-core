/**
 * Both tick paths must move the edge endpoint handles.
 *
 * The renderer has two position updaters — `updatePositions` for the standard
 * pipeline and `gridUpdatePositions` for the orthogonal one — and both redraw
 * the edge geometry that the draggable endpoint handles sit on. Only the
 * standard one moved the handles with it, so under grid routing the handles
 * were placed once when input mode opened and then stayed behind as the layout
 * moved: measured 72–110px adrift after a single grid tick.
 *
 * Both updaters now end in the `onPositionsUpdated` hook, and the editing
 * subclass moves the handles from there. That is a two-link chain, so this
 * pins both links: each updater calls the hook, and the hook moves the handles.
 */
import { describe, it, expect, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';

const proto = WebColaCnDGraph.prototype as any;
const editProto = StructuredInputGraph.prototype as any;

/**
 * A d3 selection that answers every call with itself and never invokes the
 * value callbacks. The updaters walk long `.select().attr().attr()` chains; we
 * only care that they reach the end, not what they would have painted.
 */
function inertSelection(): any {
  const sel: any = new Proxy(function () { /* callable for .call(fn) */ } as any, {
    get: (_t, key) => (key === 'node' ? () => null : () => sel),
    apply: () => sel
  });
  return sel;
}

/** The `this` each updater reads, with every collaborator stubbed inert. */
function tickHost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sel = inertSelection();
  return {
    container: sel,
    svgNodes: sel,
    svgGroups: sel,
    svgGroupLabels: sel,
    svgGroupLabelBgs: sel,
    svgLinkGroups: sel,
    parentNode: null,
    isConnected: true,
    lineFunction: () => '',
    gridLineFunction: () => '',
    ensureNodeBounds: () => {},
    getLinkPathElement: () => null,
    getCurrentZoomScale: () => 1,
    calculateNewPosition: () => ({ x: 0, y: 0 }),
    createGridSelfLoopRoute: () => [],
    createGroupSelfLoopRoute: () => [],
    resolveGroupEdgeEndpoints: () => null,
    isGroupSelfLoop: () => false,
    isAlignmentEdge: () => false,
    iconX: () => 0,
    iconY: () => 0,
    onPositionsUpdated: vi.fn(),
    ...overrides
  };
}

describe('tick paths keep the edge endpoint handles on the edge', () => {
  it('the standard updater calls the hook', () => {
    const host = tickHost();
    proto.updatePositions.call(host);
    expect(host.onPositionsUpdated).toHaveBeenCalledOnce();
  });

  it('the grid updater calls the hook too', () => {
    const host = tickHost();
    proto.gridUpdatePositions.call(host);
    expect(host.onPositionsUpdated).toHaveBeenCalledOnce();
  });

  it('the editing subclass moves the handles from the hook', () => {
    const host = { updateEdgeEndpointMarkers: vi.fn() };
    editProto.onPositionsUpdated.call(host);
    expect(host.updateEdgeEndpointMarkers).toHaveBeenCalledOnce();
  });
});
