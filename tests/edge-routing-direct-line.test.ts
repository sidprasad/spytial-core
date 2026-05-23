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
