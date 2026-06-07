import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

/**
 * Tests for the consolidated "taut" curved router (corner-visibility shortest
 * path + fillet smoothing), gated behind useTautRouter. These exercise the new
 * geometric core directly via prototype injection, the way the legacy
 * direct-line tests do.
 */

const proto = WebColaCnDGraph.prototype as any;

// Obstacles are passed to routeTautPolyline in already-inflated min/max form.
const obs = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

const port = (x: number, y: number, nx: number, ny: number) => ({
  point: { x, y },
  normal: { x: nx, y: ny },
});

const routerThis = () => ({
  anyObstacleBlocks: proto.anyObstacleBlocks,
  segmentEntersRect: proto.segmentEntersRect,
  pointInAnyObstacle: proto.pointInAnyObstacle,
  lBendFallback: proto.lBendFallback,
  simplifyCollinear: proto.simplifyCollinear,
  routeTautPolyline: proto.routeTautPolyline,
});

describe('segmentEntersRect', () => {
  const r = obs(100, 100, 200, 200);

  it('is true when the segment passes through the interior', () => {
    expect(proto.segmentEntersRect.call({}, { x: 0, y: 150 }, { x: 300, y: 150 }, r)).toBe(true);
  });

  it('is false when the segment only grazes an edge', () => {
    // Runs exactly along the top edge y=100 — touches but never enters interior.
    expect(proto.segmentEntersRect.call({}, { x: 0, y: 100 }, { x: 300, y: 100 }, r)).toBe(false);
  });

  it('is false when the segment touches only a corner', () => {
    expect(proto.segmentEntersRect.call({}, { x: 0, y: 0 }, { x: 100, y: 100 }, r)).toBe(false);
  });

  it('is false when the segment misses the rect entirely', () => {
    expect(proto.segmentEntersRect.call({}, { x: 0, y: 0 }, { x: 50, y: 50 }, r)).toBe(false);
  });
});

describe('routeTautPolyline', () => {
  it('returns a straight 2-point route when the path is clear', () => {
    const route = proto.routeTautPolyline.call(
      routerThis(),
      port(25, 0, 1, 0),
      port(175, 0, -1, 0),
      [] // no obstacles
    );
    expect(route).toHaveLength(2);
    expect(route[0]).toEqual({ x: 25, y: 0 });
    expect(route[1]).toEqual({ x: 175, y: 0 });
  });

  it('routes around a blocking obstacle without entering its interior', () => {
    const blocker = obs(130, 80, 170, 120); // straddles the straight line at y=100
    const route = proto.routeTautPolyline.call(
      routerThis(),
      port(0, 100, 1, 0),
      port(300, 100, -1, 0),
      [blocker]
    );
    // More than a straight line.
    expect(route.length).toBeGreaterThan(2);
    // No segment of the result penetrates the obstacle interior.
    for (let i = 0; i < route.length - 1; i++) {
      expect(proto.segmentEntersRect.call({}, route[i], route[i + 1], blocker)).toBe(false);
    }
    // Endpoints preserved exactly.
    expect(route[0]).toEqual({ x: 0, y: 100 });
    expect(route[route.length - 1]).toEqual({ x: 300, y: 100 });
  });

  it('exits perpendicular to the source side (normal stub) when blocked', () => {
    const blocker = obs(130, 80, 170, 120);
    const route = proto.routeTautPolyline.call(
      routerThis(),
      port(0, 100, 1, 0), // exits pointing +x
      port(300, 100, -1, 0),
      [blocker]
    );
    // First step should advance along +x (the source normal), not jump sideways.
    expect(route[1].x).toBeGreaterThan(route[0].x);
    expect(route[1].y).toBeCloseTo(route[0].y, 5);
  });

  it('falls back to a clear L-bend when the obstacle cap is exceeded', () => {
    // 25 tiny obstacles clustered near the line → over MAX_ROUTER_OBSTACLES (24),
    // but an L-bend via (T.x, S.y) is clear above them.
    const many = [];
    for (let i = 0; i < 25; i++) many.push(obs(10 + i * 2, 95, 11 + i * 2, 105));
    const route = proto.routeTautPolyline.call(
      routerThis(),
      port(0, 100, 1, 0),
      port(300, 50, -1, 0),
      many
    );
    // Should produce a route (straight or L-bend), never crash.
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(route[0]).toEqual({ x: 0, y: 100 });
    expect(route[route.length - 1]).toEqual({ x: 300, y: 50 });
  });
});

describe('simplifyCollinear', () => {
  it('drops collinear interior points', () => {
    const out = proto.simplifyCollinear.call({}, [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ]);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it('drops duplicate points', () => {
    const out = proto.simplifyCollinear.call({}, [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 },
    ]);
    expect(out).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('filletPath', () => {
  it('emits a straight line for a 2-point route', () => {
    const d = proto.filletPath.call({}, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(d).toBe('M 0 0 L 100 0');
  });

  it('rounds an interior corner with a quadratic Bézier', () => {
    const d = proto.filletPath.call({}, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    expect(d).toContain('Q 100 0'); // control point at the corner vertex
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('100 100')).toBe(true);
  });
});

describe('getPortAttachment', () => {
  const mkNode = (id: string, x: number, y: number, w = 50, h = 30) => ({
    id, x, y, visualWidth: w, visualHeight: h,
    bounds: { x: x - w / 2, y: y - h / 2, X: x + w / 2, Y: y + h / 2, width: () => w, height: () => h },
  });

  const ctx = () => ({
    getRenderedBounds: proto.getRenderedBounds,
    getVisibleBounds: proto.getVisibleBounds,
    normalizeNodeBounds: proto.normalizeNodeBounds,
    clipLineToRectExit: proto.clipLineToRectExit,
    applyPortBasedEndpoints: proto.applyPortBasedEndpoints,
    isPointOnRectPerimeter: proto.isPointOnRectPerimeter,
    computePortMargin: proto.computePortMargin,
    getDominantDirection: proto.getDominantDirection,
    sideNormal: proto.sideNormal,
    getPortAttachment: proto.getPortAttachment,
  });

  it('lands the source on the side facing the target with the correct outward normal', () => {
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 200, 0);
    const edge = { id: 'e1', source: a, target: b };
    const att = ctx().getPortAttachment.call(ctx(), edge, 'source');
    expect(att.point.x).toBeCloseTo(25, 1); // right edge of A
    expect(att.point.y).toBeCloseTo(0, 5);
    expect(att.normal).toEqual({ x: 1, y: 0 }); // outward = +x
  });

  it('lands the target on the side facing the source', () => {
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 200, 0);
    const edge = { id: 'e1', source: a, target: b };
    const att = ctx().getPortAttachment.call(ctx(), edge, 'target');
    expect(att.point.x).toBeCloseTo(175, 1); // left edge of B
    expect(att.normal).toEqual({ x: -1, y: 0 });
  });
});
