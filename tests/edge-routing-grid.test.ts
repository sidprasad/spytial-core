import { describe, it, expect } from 'vitest';
import {
  buildGridRouter,
  requireCola,
  segmentEntersRect,
} from '../src/translators/webcola/routing';

/**
 * Orthogonal (grid) routing, and the two repairs the vendored WebCola
 * GridRouter needed to survive a circular doubly linked list — a row of nodes
 * with `next` running one way and `prev` the other.
 *
 * Both failures were invisible in the diagram, because gridify catches
 * everything and falls back to centre-to-centre lines: on a single row those
 * collapse into one horizontal line hidden behind the nodes.
 */

const cola = requireCola() as any;

const rect = (cx: number, cy: number, w: number, h: number) =>
  new cola.Rectangle(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2);

/** One row of five nodes, as a constrained linked-list layout produces. */
const buildRow = () => {
  const Y = 442, H = 72;
  const nodes = [
    { id: 'n0', cx: -37, w: 144 },
    { id: 'n1', cx: 131.4, w: 134 },
    { id: 'n2', cx: 293.8, w: 134 },
    { id: 'n3', cx: 456.2, w: 134 },
    { id: 'n4', cx: 618.6, w: 134 },
  ].map((s, i) => ({
    id: s.id, index: i, x: s.cx, y: Y, width: s.w, height: H,
    bounds: rect(s.cx, Y, s.w, H),
  })) as any[];

  const byId: Record<string, any> = {};
  nodes.forEach(n => (byId[n.id] = n));

  // next: n0→n1→n2→n3→n4→n0. prev: the same cycle backwards. The wrap-around
  // edge of each relation has to get from one end of the row to the other.
  //
  // Edge ORDER matters here, so it matches what a relation-by-relation
  // translation produces: every `next` tuple, then every `prev` tuple.
  // orderEdges compares pairs in sequence and reverses paths as it goes, so a
  // different interleaving walks a different set of comparisons and can miss
  // the one that used to throw.
  const ring = ['n4', 'n3', 'n2', 'n1', 'n0'];
  const at = (i: number) => byId[ring[(i + ring.length) % ring.length]];
  const edges = [
    // next steps forward round the cycle: n4→n0, n3→n4, … n0→n1.
    ...ring.map((id, i) => ({ id: `next:${id}`, source: byId[id], target: at(i - 1) })),
    // prev steps back: n4→n3, n3→n2, … n0→n4.
    ...ring.map((id, i) => ({ id: `prev:${id}`, source: byId[id], target: at(i + 1) })),
  ] as any[];

  return { nodes, edges, band: { minY: Y - H / 2, maxY: Y + H / 2 } };
};

const routeRow = () => {
  const { nodes, edges, band } = buildRow();
  const router = buildGridRouter(nodes, [], 25, 10) as any;
  const routes = router.routeEdges(
    edges, 10,
    (e: any) => e.source.routerNode.id,
    (e: any) => e.target.routerNode.id,
  );
  return { nodes, edges, routes, band };
};

describe('GridRouter.orderEdges — paths that share a single vertex', () => {
  const orderEdges = (e: unknown[], f: unknown[]) =>
    (cola.GridRouter as any).orderEdges([e, f]);

  it('orders two paths that meet only at the END of one of them', () => {
    // The shape that threw: the shared run is one vertex, and it is the last
    // vertex of `e`, so the ordering code read one past the end of the path.
    // Two edges arriving at the same node from opposite directions — `next`
    // wrapping to the head while `prev` steps into it — produce exactly this.
    const shared = { x: 100, y: 100 };
    const e = [{ x: 0, y: 0 }, { x: 25, y: 0 }, { x: 50, y: 0 }, { x: 75, y: 0 }, shared];
    const f = [{ x: 0, y: 200 }, { x: 50, y: 200 }, shared];

    expect(() => orderEdges(e, f)).not.toThrow();
    expect(typeof orderEdges(e, f)).toBe('function');
  });

  it('orders two paths that meet only at the START of one of them', () => {
    // The mirror case, reached through the other branch: the shared run is the
    // FIRST vertex of `e`, so there is no vertex before it to turn around.
    const shared = { x: 0, y: 0 };
    const e = [shared, { x: 25, y: 0 }, { x: 50, y: 0 }, { x: 75, y: 0 }];
    const f = [{ x: 0, y: 200 }, shared, { x: 0, y: -50 }, { x: 0, y: -100 }];

    expect(() => orderEdges(e, f)).not.toThrow();
    expect(typeof orderEdges(e, f)).toBe('function');
  });

  it('still orders paths that share a long run', () => {
    // The ordinary case the repairs must not disturb.
    const run = [{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 150, y: 50 }];
    const e = [{ x: 0, y: 0 }, ...run, { x: 200, y: 0 }];
    const f = [{ x: 0, y: 100 }, ...run, { x: 200, y: 100 }];

    const order = orderEdges(e, f);
    expect(typeof order).toBe('function');
    // Exactly one of the two orderings holds.
    expect(order(0, 1) !== order(1, 0)).toBe(true);
  });
});

describe('grid routing a single row of nodes', () => {
  it('routes every edge instead of throwing', () => {
    const { edges, routes } = routeRow();
    expect(routes).toHaveLength(edges.length);
    for (const route of routes) {
      expect(Array.isArray(route)).toBe(true);
      expect(route.length).toBeGreaterThan(0);
    }
  });

  it('never runs a segment through a node', () => {
    // The grid's travel corridors used to sit ±10px from the row's CENTRE —
    // inside 72px-tall nodes — so every horizontal line was blocked, no path
    // reached its target, and the route was drawn straight across the row.
    const { nodes, routes } = routeRow();
    const obstacles = nodes.map(n => ({
      minX: n.bounds.x, minY: n.bounds.y, maxX: n.bounds.X, maxY: n.bounds.Y,
    }));

    for (const route of routes) {
      for (const [a, b] of route) {
        for (const o of obstacles) {
          expect(segmentEntersRect(a, b, o)).toBe(false);
        }
      }
    }
  });

  it('takes the wrap-around edges clear of the row', () => {
    // With nowhere to go around the row, the only route left is through it.
    const { edges, routes, band } = routeRow();
    const wrapIndex = edges.findIndex(
      (e: any) => e.source.id === 'n4' && e.target.id === 'n0');
    expect(wrapIndex).toBeGreaterThanOrEqual(0);

    const ys = routes[wrapIndex].flat().map((p: any) => p.y);
    const clears = ys.some((y: number) => y < band.minY) ||
                   ys.some((y: number) => y > band.maxY);
    expect(clears).toBe(true);
  });

  it('keeps the two directions apart between neighbouring nodes', () => {
    // next n1→n2 and prev n2→n1 cover the same gap; nudging separates them.
    const { edges, routes } = routeRow();
    const yOf = (id: string) => {
      const i = edges.findIndex((e: any) => e.id === id);
      return routes[i].flat().map((p: any) => p.y);
    };
    const nextYs = yOf('next:n1');
    const prevYs = yOf('prev:n2');
    const gap = Math.abs(Math.min(...nextYs) - Math.min(...prevYs));
    expect(gap).toBeGreaterThan(1);
  });
});
