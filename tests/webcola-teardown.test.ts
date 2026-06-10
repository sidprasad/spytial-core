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
      expect(target.applied.cx).toBe(30);
      expect(target.applied.cy).toBe(40);
      expect(source.applied.cx).toBe(1);
      expect(source.applied.cy).toBe(2);
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
        currentLayout: {},
        svgNodes: {},
        svgLinks: {},
        svgGroups: {},
        edgeRoutingCache: { edgesBetweenNodes: new Map(), alignmentEdges: new Map() },
        dragStartPositions: new Map(),
        hideLoading: vi.fn(),
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
