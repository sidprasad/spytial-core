import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Edge routing port distribution and crossing detection', () => {
  const proto = WebColaCnDGraph.prototype as any;

  describe('sortEdgePortsByAngle — parallel edges get distinct ports', () => {
    it('two A→B edges on the same side receive port indices 0 and 1', () => {
      // Simulate two parallel edges A→B exiting A's right side.
      // Both have identical remoteX/remoteY (B's center) — without a tie-breaker
      // they would either both land at index 0 or be ordered nondeterministically.
      const edge1: any = { id: 'e1' };
      const edge2: any = { id: 'e2' };
      const sides = {
        top: [], bottom: [], left: [], right: [
          { edge: edge1, role: 'source', remoteX: 200, remoteY: 100 },
          { edge: edge2, role: 'source', remoteX: 200, remoteY: 100 }
        ]
      };
      const fakeThis: any = {
        edgeRoutingCache: { nodeEdgesBySide: new Map([['A', sides]]) }
      };

      proto.sortEdgePortsByAngle.call(fakeThis);

      const indices = [edge1._sourcePortIndex, edge2._sourcePortIndex].sort();
      expect(indices).toEqual([0, 1]);
      expect(edge1._sourcePortCount).toBe(2);
      expect(edge2._sourcePortCount).toBe(2);
    });

    it('three fanning edges A→B, A→C, A→D get ordered ports along the side', () => {
      // All three edges leave A's right side; their remote nodes are at
      // distinct Y coordinates. Port indices must reflect that ordering.
      const eToB: any = { id: 'a2b' };
      const eToC: any = { id: 'a2c' };
      const eToD: any = { id: 'a2d' };
      const sides = {
        top: [], bottom: [], left: [], right: [
          { edge: eToC, role: 'source', remoteX: 300, remoteY: 200 }, // middle
          { edge: eToB, role: 'source', remoteX: 300, remoteY: 50 },  // top
          { edge: eToD, role: 'source', remoteX: 300, remoteY: 350 }  // bottom
        ]
      };
      const fakeThis: any = {
        edgeRoutingCache: { nodeEdgesBySide: new Map([['A', sides]]) }
      };
      proto.sortEdgePortsByAngle.call(fakeThis);

      // Ascending Y order: B (top) < C (middle) < D (bottom) → indices 0, 1, 2
      expect(eToB._sourcePortIndex).toBe(0);
      expect(eToC._sourcePortIndex).toBe(1);
      expect(eToD._sourcePortIndex).toBe(2);
    });
  });

  describe('getVisibleBounds — clips to rendered rectangle', () => {
    it('uses visualWidth/visualHeight when present (plain node)', () => {
      const node = { x: 100, y: 50, visualWidth: 80, visualHeight: 40, width: 120, height: 60 };
      const bounds = proto.getVisibleBounds.call({}, node);
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBe(60);   // 100 - 40
      expect(bounds!.X).toBe(140);  // 100 + 40
      expect(bounds!.y).toBe(30);   // 50 - 20
      expect(bounds!.Y).toBe(70);   // 50 + 20
      expect(bounds!.width()).toBe(80);
      expect(bounds!.height()).toBe(40);
    });

    it('uses bounds inset by GROUP_VISUAL_MARGIN_PX for group nodes', () => {
      // Group: rendered rectangle is bounds inset by 10px (the group margin).
      const group = {
        x: 100, y: 100,
        leaves: [{ index: 0 }],
        bounds: {
          x: 50, X: 150, y: 60, Y: 140,
          width: () => 100, height: () => 80
        }
      };
      const bounds = proto.getVisibleBounds.call({}, group);
      expect(bounds).not.toBeNull();
      // Expected inset: hw = 50 - 10 = 40; hh = 40 - 10 = 30
      expect(bounds!.width()).toBe(80);
      expect(bounds!.height()).toBe(60);
      expect(bounds!.x).toBe(60);   // 100 - 40
      expect(bounds!.X).toBe(140);  // 100 + 40
      expect(bounds!.y).toBe(70);   // 100 - 30
      expect(bounds!.Y).toBe(130);  // 100 + 30
    });

    it('returns null when no visible dimensions can be derived', () => {
      const result = proto.getVisibleBounds.call({}, { x: 0, y: 0 });
      expect(result).toBeNull();
    });
  });

  describe('applyPortBasedEndpointsOrthogonal — preserves orthogonality', () => {
    const isAxisAligned = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01;

    it('shifts route[0] along the source side and bends to keep segments orthogonal', () => {
      // Source node: visible rectangle x∈[80, 120], y∈[40, 60]
      // Edge exits to the right, so route[0] is on x=120 (right side).
      // Route originally: (120, 50) → (200, 50) → (200, 150).
      // With port 1-of-2, route[0] shifts to (120, 55) — first segment becomes
      // diagonal, so an L-bend should be inserted.
      const source = { x: 100, y: 50, visualWidth: 40, visualHeight: 20 };
      const target = { x: 200, y: 150, visualWidth: 40, visualHeight: 20 };
      const edgeData: any = {
        id: 'e',
        source: { ...source, id: 'A' },
        target: { ...target, id: 'B' },
        _sourcePortIndex: 1,
        _sourcePortCount: 2
      };
      const route = [
        { x: 120, y: 50 },
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      ];

      const fakeThis: any = {
        getVisibleBounds: proto.getVisibleBounds,
        computePortMargin: proto.computePortMargin,
        shiftRouteEndpointToPort: proto.shiftRouteEndpointToPort
      };
      const result = proto.applyPortBasedEndpointsOrthogonal.call(fakeThis, edgeData, route);

      // First and last endpoints must lie on the visible boundary
      // and every consecutive pair must share x or y (orthogonal).
      for (let i = 0; i < result.length - 1; i++) {
        expect(isAxisAligned(result[i], result[i + 1])).toBe(true);
      }
      // Source endpoint stays on x = 120 (the right side of the visible rect)
      expect(result[0].x).toBeCloseTo(120, 5);
      // The shift must move the y away from the original 50 (to a port location)
      expect(result[0].y).not.toBe(50);
    });

    it('returns route unchanged when port count is 1', () => {
      const edgeData: any = {
        id: 'e',
        source: { x: 0, y: 0, id: 'A', visualWidth: 10, visualHeight: 10 },
        target: { x: 100, y: 0, id: 'B', visualWidth: 10, visualHeight: 10 },
        _sourcePortIndex: 0,
        _sourcePortCount: 1
      };
      const route = [{ x: 5, y: 0 }, { x: 95, y: 0 }];
      const fakeThis: any = {
        getVisibleBounds: proto.getVisibleBounds,
        computePortMargin: proto.computePortMargin,
        shiftRouteEndpointToPort: proto.shiftRouteEndpointToPort
      };
      const result = proto.applyPortBasedEndpointsOrthogonal.call(fakeThis, edgeData, route);
      expect(result).toEqual(route);
    });
  });

  describe('detectEdgeCrossings — catches crossings past a shared node', () => {
    // Helper: build a fake "this" with a currentLayout, computedRoutes, and the
    // exact set of methods detectEdgeCrossings depends on.
    const buildFakeThis = (
      links: Array<{ id: string; source: { id: string }; target: { id: string } }>,
      routes: Map<string, Array<{ x: number; y: number }>>
    ) => ({
      currentLayout: { links },
      computedRoutes: routes,
      isAlignmentEdge: () => false,
      routesCross: proto.routesCross,
      segmentsIntersect: proto.segmentsIntersect,
      cross: proto.cross,
      getRouteLength: proto.getRouteLength
    });

    it('detects two edges sharing source A whose routes cross past A', () => {
      // A is at (0,0). Edges go to B at (100, 50) and C at (100, -50).
      // Buggy port assignment swaps endpoints so the routes cross around (50, 0).
      const links = [
        { id: 'AB', source: { id: 'A' }, target: { id: 'B' } },
        { id: 'AC', source: { id: 'A' }, target: { id: 'C' } }
      ];
      const routes = new Map<string, Array<{ x: number; y: number }>>([
        // A→B route exits A on top (toward C's region) — crossing
        ['AB', [{ x: 0, y: -5 }, { x: 100, y: 50 }]],
        // A→C route exits A on bottom (toward B's region) — crossing
        ['AC', [{ x: 0, y: 5 }, { x: 100, y: -50 }]]
      ]);

      const fakeThis = buildFakeThis(links, routes);
      const crossings = proto.detectEdgeCrossings.call(fakeThis);
      expect(crossings.length).toBe(1);
      const pair = crossings[0].slice().sort();
      expect(pair).toEqual(['AB', 'AC']);
    });

    it('does not flag two edges sharing source A whose routes diverge cleanly', () => {
      const links = [
        { id: 'AB', source: { id: 'A' }, target: { id: 'B' } },
        { id: 'AC', source: { id: 'A' }, target: { id: 'C' } }
      ];
      const routes = new Map<string, Array<{ x: number; y: number }>>([
        ['AB', [{ x: 0, y: 5 }, { x: 100, y: 50 }]],   // exits down toward B (lower)
        ['AC', [{ x: 0, y: -5 }, { x: 100, y: -50 }]]  // exits up toward C (higher)
      ]);
      const fakeThis = buildFakeThis(links, routes);
      const crossings = proto.detectEdgeCrossings.call(fakeThis);
      expect(crossings.length).toBe(0);
    });

    it('skips parallel edges (both endpoints shared)', () => {
      // Two A→B edges should not be flagged here — port distribution handles them.
      const links = [
        { id: 'e1', source: { id: 'A' }, target: { id: 'B' } },
        { id: 'e2', source: { id: 'A' }, target: { id: 'B' } }
      ];
      const routes = new Map<string, Array<{ x: number; y: number }>>([
        ['e1', [{ x: 0, y: 0 }, { x: 100, y: 0 }]],
        ['e2', [{ x: 0, y: 0 }, { x: 100, y: 0 }]]
      ]);
      const fakeThis = buildFakeThis(links, routes);
      const crossings = proto.detectEdgeCrossings.call(fakeThis);
      expect(crossings.length).toBe(0);
    });
  });
});
