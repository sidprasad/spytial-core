import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Edge routing near-touching nodes', () => {
  const proto = (WebColaCnDGraph.prototype as any);

  describe('getTouchDirection', () => {
    it('detects horizontal touch (left-right adjacency)', () => {
      // Node A on left, Node B on right, touching horizontally
      const boundsA = { x: 0, y: 0, width: () => 50, height: () => 30 };
      const boundsB = { x: 52, y: 5, width: () => 50, height: () => 30 }; // 2px gap, overlapping vertically

      const direction = proto.getTouchDirection(boundsA, boundsB, 5);
      expect(direction).toBe('horizontal');
    });

    it('detects vertical touch (top-bottom adjacency)', () => {
      // Node A on top, Node B below, touching vertically
      const boundsA = { x: 10, y: 0, width: () => 50, height: () => 30 };
      const boundsB = { x: 15, y: 33, width: () => 50, height: () => 30 }; // 3px gap, overlapping horizontally

      const direction = proto.getTouchDirection(boundsA, boundsB, 5);
      expect(direction).toBe('vertical');
    });

    it('returns none when nodes are far apart', () => {
      const boundsA = { x: 0, y: 0, width: () => 50, height: () => 30 };
      const boundsB = { x: 100, y: 100, width: () => 50, height: () => 30 };

      const direction = proto.getTouchDirection(boundsA, boundsB, 5);
      expect(direction).toBe('none');
    });
  });

  describe('computePerpendicularRoute', () => {
    it('routes horizontally-touching nodes via top/bottom', () => {
      // Two nodes side by side
      const sourceBounds = { x: 0, y: 0, width: () => 50, height: () => 30 };
      const targetBounds = { x: 52, y: 0, width: () => 50, height: () => 30 };

      const result = proto.computePerpendicularRoute(sourceBounds, targetBounds, 'horizontal');

      // Source point should be at top of source (y = 0)
      expect(result.sourcePoint.y).toBe(0);
      // Target point should be at top of target (y = 0)
      expect(result.targetPoint.y).toBe(0);
      // Middle points should route above (negative y)
      expect(result.middlePoints[0].y).toBeLessThan(0);
    });

    it('routes vertically-touching nodes via left/right', () => {
      // Two nodes stacked
      const sourceBounds = { x: 0, y: 0, width: () => 50, height: () => 30 };
      const targetBounds = { x: 0, y: 33, width: () => 50, height: () => 30 };

      const result = proto.computePerpendicularRoute(sourceBounds, targetBounds, 'vertical');

      // Source point should be at left of source (x = 0)
      expect(result.sourcePoint.x).toBe(0);
      // Target point should be at left of target (x = 0)
      expect(result.targetPoint.x).toBe(0);
      // Middle points should route to the left (negative x)
      expect(result.middlePoints[0].x).toBeLessThan(0);
    });
  });

  describe('adjustGridRouteForArrowPositioning', () => {
    it('reroutes edge for horizontally-touching nodes', () => {
      const edgeData: any = {
        source: { x: 25, y: 15, width: 50, height: 30 },
        target: { x: 77, y: 15, width: 50, height: 30 } // 2px gap horizontally
      };

      const route = [
        [{ x: 25, y: 15 }, { x: 51, y: 15 }],
        [{ x: 51, y: 15 }, { x: 77, y: 15 }]
      ];

      const fakeThis: any = {
        gridRouteToPoints: proto.gridRouteToPoints,
        getRectangleIntersection: proto.getRectangleIntersection,
        getTouchDirection: proto.getTouchDirection,
        computePerpendicularRoute: proto.computePerpendicularRoute,
        areBoundsNear: proto.areBoundsNear,
        chooseBoundaryPoint: proto.chooseBoundaryPoint,
        gridLineFunction: (pts: any[]) => `M${pts.map(p => `${p.x},${p.y}`).join(' L ')}`
      };

      const path = proto.adjustGridRouteForArrowPositioning.call(fakeThis, edgeData, 'dummy', route);

      expect(typeof path).toBe('string');
      // The path should NOT go through the touching zone (around x=50-52)
      // Instead it should route via top or bottom (y coordinates outside 0-30 range)
      expect(path).toMatch(/L.*,-\d+/); // Should have negative y (above) or y > 30 (below)
    });
  });
});