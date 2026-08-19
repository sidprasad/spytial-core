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
 * The handles themselves are positioned by `updateEdgeEndpointMarkers`, which
 * is already covered where it is called from. What was missing was the call,
 * so that is what this pins: whichever updater runs, the handles get updated.
 */
import { describe, it, expect, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const proto = WebColaCnDGraph.prototype as any;

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
    isInputModeActive: true,
    lineFunction: () => '',
    gridLineFunction: () => '',
    ensureNodeBounds: () => {},
    getLinkPathElement: () => null,
    getEdgePathPoint: () => null,
    getCurrentZoomScale: () => 1,
    calculateNewPosition: () => ({ x: 0, y: 0 }),
    createGridSelfLoopRoute: () => [],
    createGroupSelfLoopRoute: () => [],
    resolveGroupEdgeEndpoints: () => null,
    isGroupSelfLoop: () => false,
    isAlignmentEdge: () => false,
    iconX: () => 0,
    iconY: () => 0,
    updateEdgeEndpointMarkers: vi.fn(),
    ...overrides
  };
}

describe('tick paths keep the edge endpoint handles on the edge', () => {
  it('the standard updater moves the handles', () => {
    const host = tickHost();
    proto.updatePositions.call(host);
    expect(host.updateEdgeEndpointMarkers).toHaveBeenCalledOnce();
  });

  it('the grid updater moves the handles too', () => {
    const host = tickHost();
    proto.gridUpdatePositions.call(host);
    expect(host.updateEdgeEndpointMarkers).toHaveBeenCalledOnce();
  });
});
