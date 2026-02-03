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

  describe('lineIntersectsRect', () => {
    it('detects line passing through rectangle', () => {
      const p1 = { x: 0, y: 50 };
      const p2 = { x: 100, y: 50 };
      const rect = { x: 40, y: 40, width: () => 20, height: () => 20 };

      const result = proto.lineIntersectsRect(p1, p2, rect);
      expect(result).toBe(true);
    });

    it('detects no intersection when line misses rectangle', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 100, y: 0 };
      const rect = { x: 40, y: 40, width: () => 20, height: () => 20 };

      const result = proto.lineIntersectsRect(p1, p2, rect);
      expect(result).toBe(false);
    });

    it('detects vertical line passing through rectangle', () => {
      const p1 = { x: 50, y: 0 };
      const p2 = { x: 50, y: 100 };
      const rect = { x: 40, y: 40, width: () => 20, height: () => 20 };

      const result = proto.lineIntersectsRect(p1, p2, rect);
      expect(result).toBe(true);
    });
  });

  describe('findBlockingNodes (transitive blocking)', () => {
    it('finds intermediate nodes that block direct edge path', () => {
      // Setup: A at top, B in middle, C at bottom - edge from A to C should detect B as blocking
      const nodeA = { id: 'A', x: 50, y: 15, width: 50, height: 30 };
      const nodeB = { id: 'B', x: 50, y: 65, width: 50, height: 30 }; // In the middle
      const nodeC = { id: 'C', x: 50, y: 115, width: 50, height: 30 };

      const fakeThis: any = {
        currentLayout: { nodes: [nodeA, nodeB, nodeC] },
        normalizeNodeBounds: proto.normalizeNodeBounds,
        lineIntersectsRect: proto.lineIntersectsRect
      };

      const blocking = proto.findBlockingNodes.call(fakeThis, nodeA, nodeC, 'A', 'C');

      expect(blocking.length).toBe(1);
      expect(blocking[0].node.id).toBe('B');
    });

    it('returns empty array when no nodes block the path', () => {
      // Setup: A on left, B on right, C below - edge from A to B doesn't pass through C
      const nodeA = { id: 'A', x: 25, y: 50, width: 50, height: 30 };
      const nodeB = { id: 'B', x: 125, y: 50, width: 50, height: 30 };
      const nodeC = { id: 'C', x: 75, y: 150, width: 50, height: 30 };

      const fakeThis: any = {
        currentLayout: { nodes: [nodeA, nodeB, nodeC] },
        normalizeNodeBounds: proto.normalizeNodeBounds,
        lineIntersectsRect: proto.lineIntersectsRect
      };

      const blocking = proto.findBlockingNodes.call(fakeThis, nodeA, nodeB, 'A', 'B');

      expect(blocking.length).toBe(0);
    });

    it('finds multiple blocking nodes sorted by distance', () => {
      // Setup: A, B, C, D vertically stacked - edge from A to D should find B and C
      const nodeA = { id: 'A', x: 50, y: 15, width: 50, height: 30 };
      const nodeB = { id: 'B', x: 50, y: 65, width: 50, height: 30 };
      const nodeC = { id: 'C', x: 50, y: 115, width: 50, height: 30 };
      const nodeD = { id: 'D', x: 50, y: 165, width: 50, height: 30 };

      const fakeThis: any = {
        currentLayout: { nodes: [nodeA, nodeB, nodeC, nodeD] },
        normalizeNodeBounds: proto.normalizeNodeBounds,
        lineIntersectsRect: proto.lineIntersectsRect
      };

      const blocking = proto.findBlockingNodes.call(fakeThis, nodeA, nodeD, 'A', 'D');

      expect(blocking.length).toBe(2);
      expect(blocking[0].node.id).toBe('B'); // Closer to A
      expect(blocking[1].node.id).toBe('C'); // Farther from A
    });
  });

  describe('computeRouteAroundBlockingNodes', () => {
    it('routes around vertically stacked blocking nodes via left/right', () => {
      const sourceBounds = { x: 25, y: 0, width: () => 50, height: () => 30 };
      const targetBounds = { x: 25, y: 100, width: () => 50, height: () => 30 };
      const blockingNodes = [
        { node: { id: 'B' }, bounds: { x: 25, y: 50, width: () => 50, height: () => 30 } }
      ];

      const result = proto.computeRouteAroundBlockingNodes(sourceBounds, targetBounds, blockingNodes);

      // Should route to left or right, not through the middle
      // Source and target x should be at the edge of the nodes
      expect(result.sourcePoint.x === 25 || result.sourcePoint.x === 75).toBe(true);
      expect(result.middlePoints.length).toBe(2);
      // Middle points should be outside the x-range of the nodes
      expect(
        result.middlePoints[0].x < 25 || result.middlePoints[0].x > 75
      ).toBe(true);
    });

    it('routes around horizontally arranged blocking nodes via top/bottom', () => {
      const sourceBounds = { x: 0, y: 25, width: () => 50, height: () => 30 };
      const targetBounds = { x: 150, y: 25, width: () => 50, height: () => 30 };
      const blockingNodes = [
        { node: { id: 'B' }, bounds: { x: 75, y: 25, width: () => 50, height: () => 30 } }
      ];

      const result = proto.computeRouteAroundBlockingNodes(sourceBounds, targetBounds, blockingNodes);

      // Should route above or below, not through the middle
      expect(result.sourcePoint.y === 25 || result.sourcePoint.y === 55).toBe(true);
      expect(result.middlePoints.length).toBe(2);
      // Middle points should be outside the y-range of the nodes
      expect(
        result.middlePoints[0].y < 25 || result.middlePoints[0].y > 55
      ).toBe(true);
    });
  });

  describe('getNearTouchPerpendicularRoute (with transitive support)', () => {
    it('returns null when no blocking nodes and not near-touching', () => {
      const edgeData = {
        source: { id: 'A', x: 25, y: 15, width: 50, height: 30 },
        target: { id: 'C', x: 200, y: 200, width: 50, height: 30 }
      };

      const fakeThis: any = {
        currentLayout: { nodes: [edgeData.source, edgeData.target] },
        normalizeNodeBounds: proto.normalizeNodeBounds,
        getTouchDirection: proto.getTouchDirection,
        computePerpendicularRoute: proto.computePerpendicularRoute,
        findBlockingNodes: proto.findBlockingNodes,
        computeRouteAroundBlockingNodes: proto.computeRouteAroundBlockingNodes,
        lineIntersectsRect: proto.lineIntersectsRect
      };

      const result = proto.getNearTouchPerpendicularRoute.call(fakeThis, edgeData);
      expect(result).toBeNull();
    });

    it('returns route when intermediate node blocks the path', () => {
      // A at top, B in middle (blocking), C at bottom
      const nodeA = { id: 'A', x: 50, y: 15, width: 50, height: 30 };
      const nodeB = { id: 'B', x: 50, y: 65, width: 50, height: 30 };
      const nodeC = { id: 'C', x: 50, y: 115, width: 50, height: 30 };

      const edgeData = { source: nodeA, target: nodeC };

      const fakeThis: any = {
        currentLayout: { nodes: [nodeA, nodeB, nodeC] },
        normalizeNodeBounds: proto.normalizeNodeBounds,
        getTouchDirection: proto.getTouchDirection,
        computePerpendicularRoute: proto.computePerpendicularRoute,
        findBlockingNodes: proto.findBlockingNodes,
        computeRouteAroundBlockingNodes: proto.computeRouteAroundBlockingNodes,
        lineIntersectsRect: proto.lineIntersectsRect
      };

      const result = proto.getNearTouchPerpendicularRoute.call(fakeThis, edgeData);

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4); // source, 2 middle points, target
      // The route should go to the side (left or right x values outside node bounds)
      const allXValues = result!.map(p => p.x);
      const minRouteX = Math.min(...allXValues);
      const maxRouteX = Math.max(...allXValues);
      // Route should go outside the x-range 25-75 (node width centered at 50)
      expect(minRouteX < 25 || maxRouteX > 75).toBe(true);
    });
  });
});