import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

/**
 * Tests for the direct-line fast path in computeSingleRoute. The fast path
 * bypasses WebCola's visibility-graph router for edges whose source→target
 * line is visually unobstructed, fixing the "exit angle points away from the
 * target" routing pathology described in the BDD demo at
 * https://blog.brownplt.org/2026/05/22/spytial.html (Node0→Node1 tortuosity
 * 4.46 in stage 5).
 */
describe('tryDirectLineRoute', () => {
  const proto = WebColaCnDGraph.prototype as any;

  const mkNode = (id: string, x: number, y: number, w = 50, h = 30) => ({
    id, x, y,
    visualWidth: w,
    visualHeight: h,
    bounds: {
      x: x - w / 2,
      y: y - h / 2,
      X: x + w / 2,
      Y: y + h / 2,
      width: () => w,
      height: () => h,
    }
  });

  const setupFakeThis = (nodes: any[], edges: any[] = []) => ({
    currentLayout: { nodes, links: edges },
    edgeRoutingCache: {
      edgesBetweenNodes: new Map(),
      alignmentEdges: new Set(),
      nodeEdgesBySide: new Map(),
    },
    normalizeNodeBounds: proto.normalizeNodeBounds,
    getVisibleBounds: proto.getVisibleBounds,
    getRenderedBounds: proto.getRenderedBounds,
    lineIntersectsRect: proto.lineIntersectsRect,
    getAllEdgesBetweenNodes: proto.getAllEdgesBetweenNodes,
    isAlignmentEdge: proto.isAlignmentEdge,
    getNodePairKey: proto.getNodePairKey,
    getTouchDirection: proto.getTouchDirection,
    clipLineToRectExit: proto.clipLineToRectExit,
    tryDirectLineRoute: proto.tryDirectLineRoute,
  });

  it('returns a direct 2-point route when the source→target line is clear', () => {
    // Node A at (0,0) — Node B at (200, 200). Nothing between them.
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 200, 200);
    const edge = { id: 'e1', source: a, target: b };

    const fakeThis = setupFakeThis([a, b], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).not.toBeNull();
    expect(route).toHaveLength(2);
    // Endpoints should be on the rectangle perimeters, not at the centers.
    expect(route[0]).not.toEqual({ x: 0, y: 0 });
    expect(route[1]).not.toEqual({ x: 200, y: 200 });
    // The two points should lie on the same line (source-center → target-center).
    // dy/dx should match for both segments.
    const slopeFromSourceCenter = (route[0].y - 0) / (route[0].x - 0);
    const slopeToTargetCenter = (200 - route[1].y) / (200 - route[1].x);
    expect(slopeFromSourceCenter).toBeCloseTo(slopeToTargetCenter, 5);
  });

  it('clips endpoints to source/target perimeters', () => {
    // A at (0,0) size 50x30; B at (200, 0) — purely horizontal.
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 200, 0);
    const edge = { id: 'e1', source: a, target: b };

    const fakeThis = setupFakeThis([a, b], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).not.toBeNull();
    // Source exits at right edge of A (x = 25), target enters at left edge of B (x = 175).
    expect(route[0].x).toBeCloseTo(25, 1);
    expect(route[0].y).toBeCloseTo(0, 5);
    expect(route[1].x).toBeCloseTo(175, 1);
    expect(route[1].y).toBeCloseTo(0, 5);
  });

  it('returns null when another node sits between source and target', () => {
    // Blocker sits directly on the source-center → target-center line.
    const a = mkNode('A', 0, 0);
    const blocker = mkNode('M', 100, 0);
    const b = mkNode('B', 200, 0);
    const edge = { id: 'e1', source: a, target: b };

    const fakeThis = setupFakeThis([a, blocker, b], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).toBeNull();
  });

  it('returns null when there are parallel sibling edges', () => {
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 200, 200);
    const e1 = { id: 'e1', source: a, target: b };
    const e2 = { id: 'e2', source: a, target: b };

    const fakeThis = setupFakeThis([a, b], [e1, e2]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, e1);

    expect(route).toBeNull();
  });

  it('returns null for self-loops', () => {
    const a = mkNode('A', 0, 0);
    const selfEdge = { id: 'e1', source: a, target: a };

    const fakeThis = setupFakeThis([a], [selfEdge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, selfEdge);

    expect(route).toBeNull();
  });

  it('returns null when nodes are near-touching (perpendicular logic owns those)', () => {
    // 3px horizontal gap — under the NEAR_TOUCH_THRESHOLD of 5.
    const a = mkNode('A', 0, 0);
    const b = mkNode('B', 53, 0); // a.right = 25, b.left = 28; gap = 3px
    const edge = { id: 'e1', source: a, target: b };

    const fakeThis = setupFakeThis([a, b], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).toBeNull();
  });

  it('clips to the visible perimeter, not the inflated collision bounds', () => {
    // After WebCola.prepareEdgeRouting, node.bounds is inflated by a few px
    // for collision avoidance, while the rendered rectangle is still
    // visualWidth × visualHeight. Clipping to bounds would put the arrow tip
    // in the padding region; the marker body (12 px) would extend back into
    // the visible rect and be covered by node fill. tryDirectLineRoute must
    // use visualWidth/visualHeight, not bounds, for the perimeter clip.
    const sourceVisual = 50, targetVisual = 50;
    const inflation = 4; // simulate WebCola's prepareEdgeRouting inflation

    const inflatedSource = {
      id: 'A',
      x: 0, y: 0,
      visualWidth: sourceVisual,
      visualHeight: 30,
      bounds: {
        x: -sourceVisual / 2 - inflation,
        y: -15 - inflation,
        X: sourceVisual / 2 + inflation,
        Y: 15 + inflation,
        width: () => sourceVisual + 2 * inflation,
        height: () => 30 + 2 * inflation,
      }
    };
    const inflatedTarget = {
      id: 'B',
      x: 200, y: 0,
      visualWidth: targetVisual,
      visualHeight: 30,
      bounds: {
        x: 200 - targetVisual / 2 - inflation,
        y: -15 - inflation,
        X: 200 + targetVisual / 2 + inflation,
        Y: 15 + inflation,
        width: () => targetVisual + 2 * inflation,
        height: () => 30 + 2 * inflation,
      }
    };
    const edge = { id: 'e1', source: inflatedSource, target: inflatedTarget };

    const fakeThis = setupFakeThis([inflatedSource, inflatedTarget], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).not.toBeNull();
    // Source exit should be on the VISIBLE right edge (x=25), NOT the inflated one (x=29).
    expect(route[0].x).toBeCloseTo(25, 1);
    expect(route[0].x).not.toBeCloseTo(25 + inflation, 1);
    // Target entry should be on the VISIBLE left edge (x=175), NOT the inflated one (x=171).
    expect(route[1].x).toBeCloseTo(175, 1);
    expect(route[1].x).not.toBeCloseTo(175 - inflation, 1);
  });

  it('handles the BDD Node0→Node1 case: vertically stacked, clear path', () => {
    // Mirror stage 5 of the blog BDD: Node0 directly above Node1, with
    // Node4 to the right (the blog renders Node0→Node1 with tortuosity 4.46,
    // looping around Node4). With the fast path, the direct line should win
    // because Node4 is not on the source→target line.
    const node0 = mkNode('Node0', 100, 50);
    const node1 = mkNode('Node1', 100, 165); // 115px below Node0
    const node4 = mkNode('Node4', 250, 165); // 150px to the right of Node1, NOT between Node0 and Node1
    const edge = { id: 'e_Node0_Node1', source: node0, target: node1 };

    const fakeThis = setupFakeThis([node0, node1, node4], [edge]);
    const route = fakeThis.tryDirectLineRoute.call(fakeThis, edge);

    expect(route).not.toBeNull();
    expect(route).toHaveLength(2);
    // Source exit should be on the BOTTOM of Node0 (heading toward Node1 below).
    expect(route[0].y).toBeCloseTo(65, 1); // Node0 bottom = 50 + 30/2 = 65
    expect(route[0].x).toBeCloseTo(100, 1);
    // Target entry should be on the TOP of Node1.
    expect(route[1].y).toBeCloseTo(150, 1); // Node1 top = 165 - 30/2 = 150
    expect(route[1].x).toBeCloseTo(100, 1);
    // Exit angle should point toward target (positive dy), not away from it.
    const dx = route[1].x - route[0].x;
    const dy = route[1].y - route[0].y;
    expect(dy).toBeGreaterThan(0);
    const targetDirX = node1.x - node0.x;
    const targetDirY = node1.y - node0.y;
    const dot = dx * targetDirX + dy * targetDirY;
    expect(dot).toBeGreaterThan(0); // exit direction agrees with target direction
  });
});

describe('applyPortBasedEndpointsToDirectRoute', () => {
  const proto = WebColaCnDGraph.prototype as any;

  const mkNode = (id: string, x: number, y: number, w = 50, h = 30) => ({
    id, x, y,
    visualWidth: w,
    visualHeight: h,
    bounds: {
      x: x - w / 2,
      y: y - h / 2,
      X: x + w / 2,
      Y: y + h / 2,
      width: () => w,
      height: () => h,
    }
  });

  const setupThis = () => ({
    normalizeNodeBounds: proto.normalizeNodeBounds,
    getVisibleBounds: proto.getVisibleBounds,
    getRenderedBounds: proto.getRenderedBounds,
    lineIntersectsRect: proto.lineIntersectsRect,
    getAllEdgesBetweenNodes: proto.getAllEdgesBetweenNodes,
    isAlignmentEdge: proto.isAlignmentEdge,
    getNodePairKey: proto.getNodePairKey,
    getTouchDirection: proto.getTouchDirection,
    clipLineToRectExit: proto.clipLineToRectExit,
    tryDirectLineRoute: proto.tryDirectLineRoute,
    applyPortBasedEndpoints: proto.applyPortBasedEndpoints,
    applyPortBasedEndpointsToDirectRoute: proto.applyPortBasedEndpointsToDirectRoute,
    isPointOnRectPerimeter: proto.isPointOnRectPerimeter,
    getDominantDirection: proto.getDominantDirection,
    computePortMargin: proto.computePortMargin,
    currentLayout: null as any,
    edgeRoutingCache: {
      edgesBetweenNodes: new Map(),
      alignmentEdges: new Set(),
      nodeEdgesBySide: new Map(),
    },
  });

  it('passes the route through unchanged when no port info is stamped', () => {
    const src = mkNode('A', 0, 0);
    const tgt = mkNode('B', 200, 200);
    const route = [{ x: 25, y: 15 }, { x: 175, y: 185 }];
    const edge = { id: 'e1', source: src, target: tgt };

    const ctx = setupThis();
    const result = ctx.applyPortBasedEndpointsToDirectRoute.call(ctx, edge, route);

    expect(result).toEqual(route);
  });

  it('spreads sibling endpoints on a shared source side (BDD terminal-style)', () => {
    // Three edges arriving at TRUE from above — port distribution should
    // spread them along TRUE's top edge.
    const trueNode = mkNode('TRUE', 100, 200);
    const src1 = mkNode('Node2', 50, 100);
    const src2 = mkNode('Node3', 100, 100);
    const src3 = mkNode('Node4', 150, 100);

    // All three edges share the target's top side. _targetPortCount=3 stamps
    // them as a triplet; _targetPortIndex 0/1/2 sorts by source x.
    const mkEdge = (id: string, src: any, idx: number) => ({
      id, source: src, target: trueNode,
      _targetPortIndex: idx,
      _targetPortCount: 3,
    });
    const e1 = mkEdge('e1', src1, 0);
    const e2 = mkEdge('e2', src2, 1);
    const e3 = mkEdge('e3', src3, 2);

    const ctx = setupThis();
    // Each edge enters TRUE from above — natural clip puts the endpoint on
    // TRUE's top edge (y = 200 - 15 = 185).
    const route1 = [{ x: 50, y: 115 }, { x: 50, y: 185 }];
    const route2 = [{ x: 100, y: 115 }, { x: 100, y: 185 }];
    const route3 = [{ x: 150, y: 115 }, { x: 150, y: 185 }];

    const r1 = ctx.applyPortBasedEndpointsToDirectRoute.call(ctx, e1, route1);
    const r2 = ctx.applyPortBasedEndpointsToDirectRoute.call(ctx, e2, route2);
    const r3 = ctx.applyPortBasedEndpointsToDirectRoute.call(ctx, e3, route3);

    // Endpoints stay on the top edge (y unchanged, ~185).
    expect(r1[1].y).toBeCloseTo(185, 0);
    expect(r2[1].y).toBeCloseTo(185, 0);
    expect(r3[1].y).toBeCloseTo(185, 0);
    // ...and they're spread out along x (port distribution).
    expect(r1[1].x).toBeLessThan(r2[1].x);
    expect(r2[1].x).toBeLessThan(r3[1].x);
    // All three lie within TRUE's top edge (75 ≤ x ≤ 125).
    for (const r of [r1, r2, r3]) {
      expect(r[1].x).toBeGreaterThanOrEqual(75);
      expect(r[1].x).toBeLessThanOrEqual(125);
    }
  });

  it('falls back to the un-distributed clip when port distribution would shift the endpoint off-perimeter', () => {
    // Diagonal-corner case: dominant direction says 'right' (target right of
    // source), but the natural clip exits the bottom edge because the line
    // is steep enough relative to the rect aspect ratio. applyPortBasedEndpoints
    // would distribute Y along height — pulling the endpoint inside the rect.
    const src = mkNode('A', 0, 0);  // 50x30 at origin; bottom edge at y=15
    const tgt = mkNode('B', 60, 40);
    // Natural clip from (0,0) toward (60,40): bottom wins (t = 15/40 = 0.375
    // vs right t = 25/60 = 0.417). Exit at (22.5, 15).
    const route = [{ x: 22.5, y: 15 }, { x: 35, y: 25 }];
    const edge = {
      id: 'e1', source: src, target: tgt,
      _sourcePortIndex: 0,
      _sourcePortCount: 2,
    };

    const ctx = setupThis();
    const result = ctx.applyPortBasedEndpointsToDirectRoute.call(ctx, edge, route);

    // applyPortBasedEndpoints would shift Y inside the rect — verify we
    // detect that and return the original clip instead.
    expect(result[0]).toEqual({ x: 22.5, y: 15 });
  });
});

describe('clipLineToRectExit', () => {
  const proto = WebColaCnDGraph.prototype as any;

  const rect = (x: number, y: number, w: number, h: number) => ({
    x, y, width: () => w, height: () => h,
  });

  it('clips a horizontal line to the right edge', () => {
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 }; // center
    const outside = { x: 100, y: 15 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(50, 5);
    expect(exit.y).toBeCloseTo(15, 5);
  });

  it('clips a vertical line to the bottom edge', () => {
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 };
    const outside = { x: 25, y: 100 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(25, 5);
    expect(exit.y).toBeCloseTo(30, 5);
  });

  it('clips a diagonal line to the correct edge (whichever it hits first)', () => {
    // 50x30 rect with center (25,15). Going SE at 45° hits bottom (y=30) at
    // parametric t = 15/dy. Going SE at a shallower angle hits right (x=50) first.
    const r = rect(0, 0, 50, 30);
    const inside = { x: 25, y: 15 };
    // Shallow angle: dx = 50, dy = 10 → t for right = 25/50 = 0.5, t for bottom = 15/10 = 1.5
    // Right wins.
    const outside = { x: 75, y: 25 };
    const exit = proto.clipLineToRectExit.call({}, inside, outside, r);
    expect(exit.x).toBeCloseTo(50, 5);
    expect(exit.y).toBeCloseTo(20, 5);
  });
});
