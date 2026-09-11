import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import {
  applyCurvatureToRoute,
  MAX_EDGE_CURVATURE_PX,
  MAX_EDGE_CURVATURE_RATIO,
} from '../src/translators/webcola/routing';

/**
 * Fanning parallel edges: the bow that separates siblings running between the
 * same pair of nodes.
 *
 * These are regression tests for one pair of node-to-node edges: `next` and
 * `prev` around a circular linked list, where the wrap-around pair runs the
 * whole length of the row. The taut route for such an edge leaves its node
 * through a PERPENDICULAR stub and then travels at right angles to it, which is
 * where the fan used to go wrong twice over: it read its axis off the stub
 * (bowing the route along its own direction of travel, so the two siblings
 * stayed exactly on top of each other and overshot the row at both ends) and
 * it scaled the bow by the full polyline length (throwing an 800px route
 * hundreds of pixels clear of the diagram).
 */

/** Span past which the ratio stops buying bow. */
const SPAN_CAP = MAX_EDGE_CURVATURE_PX / MAX_EDGE_CURVATURE_RATIO;

const pts = (...xy: Array<[number, number]>) => xy.map(([x, y]) => ({ x, y }));

describe('applyCurvatureToRoute', () => {
  it('bows perpendicular to the travel angle — sideways for a horizontal edge', () => {
    const route = applyCurvatureToRoute(pts([0, 0], [25, 0], [50, 0]), 0.3, 0, 50);
    expect(route[1].x).toBeCloseTo(25, 6); // no shift along travel
    expect(route[1].y).toBeCloseTo(0.3 * 50, 6);
  });

  it('bows perpendicular to the travel angle — sideways for a vertical edge', () => {
    const route = applyCurvatureToRoute(pts([0, 0], [0, 25], [0, 50]), 0.3, Math.PI / 2, 50);
    expect(route[1].x).toBeCloseTo(0.3 * 50, 6);
    expect(route[1].y).toBeCloseTo(25, 6); // no shift along travel
  });

  it('leaves the endpoints alone — they are already on their node perimeters', () => {
    const route = applyCurvatureToRoute(pts([0, 0], [50, 0], [100, 0]), 0.6, 0, 100);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[2]).toEqual({ x: 100, y: 0 });
  });

  it('stays proportional to the span while the edge is short', () => {
    const route = applyCurvatureToRoute(pts([0, 0], [20, 0], [40, 0]), 0.2, 0, 40);
    expect(route[1].y).toBeCloseTo(0.2 * 40, 6);
  });

  it('bounds the bow on a long edge instead of ballooning with its length', () => {
    const bowFor = (span: number) =>
      applyCurvatureToRoute(pts([0, 0], [span / 2, 0], [span, 0]), MAX_EDGE_CURVATURE_RATIO, 0, span)[1].y;

    // 0.6 × 800 = 480px of bow before the bound; the bound is what keeps a
    // wrap-around pointer inside the diagram it belongs to.
    expect(bowFor(800)).toBeCloseTo(MAX_EDGE_CURVATURE_PX, 6);
    expect(bowFor(8000)).toBeCloseTo(MAX_EDGE_CURVATURE_PX, 6);
  });

  it('keeps the siblings of one fan proportional to each other at the bound', () => {
    const bowFor = (curvature: number) =>
      applyCurvatureToRoute(pts([0, 0], [400, 0], [800, 0]), curvature, 0, 800)[1].y;

    // Capping each bow independently would collapse 0.2 and 0.6 onto the same
    // 40px offset — two edges drawn on top of each other. Capping the span they
    // multiply keeps them 1:3 apart.
    expect(bowFor(0.2)).toBeCloseTo(0.2 * SPAN_CAP, 6);
    expect(bowFor(0.6)).toBeCloseTo(0.6 * SPAN_CAP, 6);
    expect(bowFor(0.6) / bowFor(0.2)).toBeCloseTo(3, 6);
  });
});

describe('handleMultipleEdgeRouting — wrap-around siblings over a row of nodes', () => {
  const proto = WebColaCnDGraph.prototype as any;

  // The two ends of the wrap-around pair: the row's last node and its first,
  // both 72px tall, as the taut router leaves them (ports on the TOP side, so
  // the route's first segment is a vertical stub).
  const lastNode = { id: 'n4', x: 626, y: 450, width: 134, height: 72 };
  const firstNode = { id: 'n0', x: -29.6, y: 450, width: 144, height: 72 };

  /** A taut route: port, stub, stub, port — over the tops of the nodes between. */
  const tautRoute = (fromX: number, toX: number) =>
    pts([fromX, 414], [fromX, 404], [toX, 404], [toX, 414]);

  const fanSibling = (portIndex: number) => {
    const edge: any = {
      id: `e${portIndex}`,
      source: lastNode,
      target: firstNode,
      _exitSide: 'top',
      _entrySide: 'top',
      _sourcePortIndex: portIndex,
      _sourcePortCount: 2,
      _targetPortIndex: portIndex,
      _targetPortCount: 2,
    };
    const siblings = [{ id: 'e0' }, { id: 'e1' }];
    const fakeThis = { getAllEdgesBetweenNodes: () => siblings };
    const input = tautRoute(602.5, -54.8);
    const before = input.map(p => ({ ...p }));
    return { before, route: proto.handleMultipleEdgeRouting.call(fakeThis, edge, input, 1) };
  };

  it('bows across the direction of travel, not along it', () => {
    const { before, route } = fanSibling(0);
    // The horizontal run moves sideways and stays where it was along the run.
    // Taking the axis off the vertical exit stub shifted it 71px along x.
    for (const i of [1, 2]) {
      expect(route[i].x).toBeCloseTo(before[i].x, 6);
    }
    expect(Math.abs(route[1].y - before[1].y)).toBeGreaterThan(1);
  });

  it('keeps the route inside the row it wraps around', () => {
    // The nodes span x ∈ [-101.6, 693]; the old fan pushed the horizontal run
    // 71px past both ends, which is what dragged the viewport out with it.
    for (const portIndex of [0, 1]) {
      const { route } = fanSibling(portIndex);
      for (const p of route) {
        expect(p.x).toBeGreaterThanOrEqual(-101.6);
        expect(p.x).toBeLessThanOrEqual(693);
      }
    }
  });

  it('separates the two siblings by a bounded amount', () => {
    const [a, b] = [fanSibling(0).route, fanSibling(1).route];
    const separation = Math.abs(a[1].y - b[1].y);
    expect(separation).toBeGreaterThan(10); // tellable apart
    expect(separation).toBeLessThanOrEqual(2 * MAX_EDGE_CURVATURE_PX);
    // Opposite sides of the base route, so neither sibling is left in place.
    expect(Math.sign(a[1].y - 404)).not.toBe(Math.sign(b[1].y - 404));
  });

  it('leaves a lone edge between the two nodes untouched', () => {
    const edge: any = { id: 'only', source: lastNode, target: firstNode };
    const fakeThis = { getAllEdgesBetweenNodes: () => [{ id: 'only' }] };
    const input = tautRoute(602.5, -54.8);
    const before = input.map(p => ({ ...p }));
    expect(proto.handleMultipleEdgeRouting.call(fakeThis, edge, input, 1)).toEqual(before);
  });
});
