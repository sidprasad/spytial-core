import { describe, expect, it, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

/**
 * Regression tests for the teardown bugs in issue #474:
 *
 * 1. disconnectedCallback → dispose() → updateEdgeEndpointMarkers() threw
 *    InvalidStateError (getTotalLength()/getPointAtLength() on a detached
 *    path), which escaped into the host's removeChild and broke unmounts.
 * 2. clear() stopped the layout but left WebCola tick/end handlers attached,
 *    so a tick queued before clear() ran against the nulled selections.
 */

const proto = WebColaCnDGraph.prototype as any;

/** Chainable d3-selection stub that records resolved attr values. */
function markerSelection(datum: any) {
  const applied: Record<string, any> = {};
  const sel: any = {
    attr(name: string, value: any) {
      applied[name] = typeof value === 'function' ? value(datum) : value;
      return sel;
    },
    style() { return sel; },
    raise() { return sel; },
  };
  return { sel, applied };
}

/** SVGPathElement stub behaving like a non-rendered path in a browser. */
const throwingPath = {
  getTotalLength() { throw new DOMException('non-rendered path', 'InvalidStateError'); },
  getPointAtLength() { throw new DOMException('non-rendered path', 'InvalidStateError'); },
};

describe('WebColaCnDGraph teardown (#474)', () => {
  describe('updateEdgeEndpointMarkers', () => {
    it('is a no-op when the element is detached from the DOM', () => {
      const select = vi.fn();
      const fakeThis: any = {
        isConnected: false,
        svgLinkGroups: { select },
      };

      expect(() => proto.updateEdgeEndpointMarkers.call(fakeThis)).not.toThrow();
      expect(select).not.toHaveBeenCalled();
    });

    it('falls back to layout coordinates when path geometry reads throw', () => {
      const datum = { id: 'e1', source: { x: 1, y: 2 }, target: { x: 30, y: 40 } };
      const target = markerSelection(datum);
      const source = markerSelection(datum);
      const fakeThis: any = {
        isConnected: true,
        isInputModeActive: false,
        svgLinkGroups: {
          select: (selector: string) =>
            selector === '.target-marker' ? target.sel : source.sel,
        },
        shadowRoot: { querySelector: () => throwingPath },
        getEdgePathPoint: proto.getEdgePathPoint,
      };

      expect(() => proto.updateEdgeEndpointMarkers.call(fakeThis)).not.toThrow();
      // Handles are positioned via a translate transform on the group, falling
      // back to the edge's layout coordinates when the path geometry is unreadable.
      expect(target.applied.transform).toBe('translate(30, 40)');
      expect(source.applied.transform).toBe('translate(1, 2)');
    });
  });

  describe('getEdgePathPoint', () => {
    it('returns the path point when the path is rendered', () => {
      const fakeThis: any = {
        shadowRoot: {
          querySelector: () => ({
            getTotalLength: () => 10,
            getPointAtLength: (length: number) => ({ x: length, y: 5 }),
          }),
        },
      };

      expect(proto.getEdgePathPoint.call(fakeThis, 'e1', 'end')).toEqual({ x: 10, y: 5 });
      expect(proto.getEdgePathPoint.call(fakeThis, 'e1', 'start')).toEqual({ x: 0, y: 5 });
    });

    it('returns null when the path is missing or not rendered', () => {
      const missing: any = { shadowRoot: { querySelector: () => null } };
      expect(proto.getEdgePathPoint.call(missing, 'e1', 'end')).toBeNull();

      const detached: any = { shadowRoot: { querySelector: () => throwingPath } };
      expect(proto.getEdgePathPoint.call(detached, 'e1', 'end')).toBeNull();
      expect(proto.getEdgePathPoint.call(detached, 'e1', 'start')).toBeNull();
    });
  });

  describe('disconnectedCallback', () => {
    it('never lets dispose() errors escape into the host', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const fakeThis: any = {
          dispose: () => { throw new DOMException('detached', 'InvalidStateError'); },
        };

        expect(() => proto.disconnectedCallback.call(fakeThis)).not.toThrow();
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('clear', () => {
    function clearableThis(colaLayout: any) {
      return {
        colaLayout,
        container: null,
        svg: null,
        morphSlideTimer: null,
        morphOldPositions: null,
        morphEnteringNodeIds: new Set(['stale']),
        morphEnteringEdgeIds: new Set(['stale']),
        currentLayout: {},
        svgNodes: {},
        svgLinks: {},
        svgGroups: {},
        edgeRoutingCache: { edgesBetweenNodes: new Map(), alignmentEdges: new Map() },
        dragStartPositions: new Map(),
        hideLoading: vi.fn(),
        teardownInflightRender: proto.teardownInflightRender,
      } as any;
    }

    it('detaches tick/end handlers before nulling the layout', () => {
      const on = vi.fn();
      const stop = vi.fn();
      const fakeThis = clearableThis({ stop, on });

      proto.clear.call(fakeThis);

      expect(stop).toHaveBeenCalled();
      expect(on).toHaveBeenCalledWith('tick', null);
      expect(on).toHaveBeenCalledWith('end', null);
      expect(fakeThis.colaLayout).toBeNull();
      expect(fakeThis.svgNodes).toBeNull();
    });

    it('still detaches handlers when stop() throws', () => {
      const on = vi.fn();
      const fakeThis = clearableThis({ stop: () => { throw new Error('boom'); }, on });

      expect(() => proto.clear.call(fakeThis)).not.toThrow();
      expect(on).toHaveBeenCalledWith('tick', null);
      expect(on).toHaveBeenCalledWith('end', null);
    });
  });
});

/**
 * Regression tests for the overlapping-render race: a renderLayout() call
 * arriving while a previous render's solve or morph animation is still in
 * flight must tear the old one down first, or the stale solver's tick/end
 * closures keep firing against the new render's state (stuck loading overlay,
 * frozen positions, morph-hidden elements never revealed).
 */
describe('WebColaCnDGraph overlapping renders', () => {
  /** Minimal state teardownInflightRender touches, with an active fake solve. */
  function inflightThis(overrides: Record<string, any> = {}) {
    const stop = vi.fn();
    const on = vi.fn();
    const slideStop = vi.fn();
    const exitLayerRemove = vi.fn();
    const hideLoading = vi.fn();
    const exitLayerSel = { interrupt: vi.fn(() => ({ remove: exitLayerRemove })) };
    const fakeThis: any = {
      colaLayout: { stop, on },
      morphSlideTimer: { stop: slideStop },
      svg: { selectAll: vi.fn(() => exitLayerSel) },
      morphEnteringNodeIds: new Set(['n1']),
      morphEnteringEdgeIds: new Set(['e1']),
      teardownInflightRender: proto.teardownInflightRender,
      hideLoading,
      ...overrides,
    };
    return { fakeThis, stop, on, slideStop, exitLayerRemove, hideLoading };
  }

  describe('teardownInflightRender', () => {
    it('stops the solver, detaches handlers, cancels the morph timer, clears morph leftovers, and hides the overlay', () => {
      const { fakeThis, stop, on, slideStop, exitLayerRemove, hideLoading } = inflightThis();

      proto.teardownInflightRender.call(fakeThis);

      expect(stop).toHaveBeenCalled();
      expect(on).toHaveBeenCalledWith('tick', null);
      expect(on).toHaveBeenCalledWith('end', null);
      expect(slideStop).toHaveBeenCalled();
      expect(fakeThis.morphSlideTimer).toBeNull();
      expect(fakeThis.svg.selectAll).toHaveBeenCalledWith('.morph-exit-layer');
      expect(exitLayerRemove).toHaveBeenCalled();
      expect(fakeThis.morphEnteringNodeIds.size).toBe(0);
      expect(fakeThis.morphEnteringEdgeIds.size).toBe(0);
      // The wedged-"Finalizing…"-overlay fix: a superseded render's overlay
      // must be hidden by whoever supersedes it.
      expect(hideLoading).toHaveBeenCalled();
    });

    it('still detaches handlers and hides the overlay when stop() throws', () => {
      const on = vi.fn();
      const { fakeThis, hideLoading } = inflightThis({
        colaLayout: { stop: () => { throw new Error('boom'); }, on },
      });

      expect(() => proto.teardownInflightRender.call(fakeThis)).not.toThrow();
      expect(on).toHaveBeenCalledWith('tick', null);
      expect(on).toHaveBeenCalledWith('end', null);
      expect(hideLoading).toHaveBeenCalled();
    });

    it('is a no-op before the first render (nothing initialized)', () => {
      const fakeThis: any = {
        colaLayout: null,
        morphSlideTimer: null,
        svg: null,
        morphEnteringNodeIds: new Set(),
        morphEnteringEdgeIds: new Set(),
        hideLoading: vi.fn(),
      };
      expect(() => proto.teardownInflightRender.call(fakeThis)).not.toThrow();
    });
  });

  describe('renderLayout entry', () => {
    it('tears down the in-flight render before reading any other state', async () => {
      const order: string[] = [];
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const fakeThis: any = {
          renderGeneration: 0,
          teardownInflightRender: vi.fn(() => order.push('teardown')),
          resolveTransitionMode: vi.fn(() => { order.push('resolveTransitionMode'); return 'replace'; }),
          hasValidTransform: () => false,
          applyViewportRenderPolicy: vi.fn(),
          shouldCollapseSymmetricEdges: () => true,
          svg: null,
          zoomBehavior: null,
          showError: vi.fn(),
        };
        const emptyLayout: any = { nodes: [], edges: [], constraints: [], groups: [] };

        // Resolves (via the internal error path on missing d3) rather than
        // hanging or throwing — and the teardown ran first.
        await expect(proto.renderLayout.call(fakeThis, emptyLayout)).resolves.toBeUndefined();

        expect(fakeThis.teardownInflightRender).toHaveBeenCalledTimes(1);
        expect(order[0]).toBe('teardown');
        expect(order[1]).toBe('resolveTransitionMode');
        // The render claimed the next generation before doing any work.
        expect(fakeThis.renderGeneration).toBe(1);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('rejects invalid layouts without touching the in-flight render', async () => {
      const fakeThis: any = {
        teardownInflightRender: vi.fn(),
      };
      await expect(proto.renderLayout.call(fakeThis, { not: 'a layout' })).rejects.toThrow(/Invalid instance layout/);
      expect(fakeThis.teardownInflightRender).not.toHaveBeenCalled();
    });
  });
});
