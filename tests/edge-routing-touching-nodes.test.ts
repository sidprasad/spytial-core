import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

describe('Edge routing near-touching nodes', () => {
  const proto = (WebColaCnDGraph.prototype as any);

  it('chooseBoundaryPoint picks a side away from the other point', () => {
    const bounds = { x: -25, y: -15, width: () => 50, height: () => 30 };
    const centerX = 0;
    const centerY = 0;
    const other = { x: 26, y: 0 };

    const chosen = proto.chooseBoundaryPoint(centerX, centerY, bounds, other);

    expect(chosen).toEqual({ x: -25, y: 0 });
  });

  it('adjustGridRouteForArrowPositioning moves endpoints for near-touching nodes', () => {
    const edgeData: any = {
      source: { x: 0, y: 0, width: 50, height: 30 },
      target: { x: 52, y: 0, width: 50, height: 30 }
    };

    // Simulate a grid route with center points
    const route = [
      [{ x: 0, y: 0 }, { x: 26, y: 0 }],
      [{ x: 26, y: 0 }, { x: 52, y: 0 }]
    ];

    // Fake "this" with only the helpers used by the function to avoid DOM initialization
    const fakeThis: any = {
      gridRouteToPoints: proto.gridRouteToPoints,
      getRectangleIntersection: proto.getRectangleIntersection,
      chooseBoundaryPoint: proto.chooseBoundaryPoint,
      areBoundsNear: proto.areBoundsNear,
      // Simple path generator for tests
      gridLineFunction: (pts: any[]) => `M${pts.map(p => `${p.x},${p.y}`).join(' L ')}`
    };

    const path = proto.adjustGridRouteForArrowPositioning.call(fakeThis, edgeData, 'dummy', route);

    expect(typeof path).toBe('string');
    // Expect the start to use the left midpoint (-25,0) for the source to be visible
    expect(path).toMatch(/-25\.?\d*,\s*0\.?\d*/);
  });
});