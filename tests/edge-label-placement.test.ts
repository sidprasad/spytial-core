import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { labelOverlap, placeEdgeLabels, LABEL_CLEARANCE, type EdgeLabelBox, type LabelRect, type LabelRoute } from '../src/translators/webcola/routing/edge-label-placement';

const horizontal: LabelRoute = { id: 'edge', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
const label = (route = horizontal, width = 40, height = 12): EdgeLabelBox => ({ id: route.id, route, width, height });
const place = (box: EdgeLabelBox, obstacles: LabelRect[] = [], routes = [box.route]) =>
  placeEdgeLabels([box], obstacles, routes).get(box.id)!;

describe('edge-attached label placement', () => {
  it('keeps a clear midpoint unchanged', () => {
    expect(place(label())).toMatchObject({ x: 50, y: 0 });
  });

  it('makes a long label readable beside a short vertical connection', () => {
    const route = { id: 'short', points: [{ x: 0, y: 0 }, { x: 0, y: 18 }] };
    const obstacles = [
      { x: -40, y: -40, width: 80, height: 40 },
      { x: -40, y: 18, width: 80, height: 40 },
    ];
    const result = place(label(route, 100, 22), obstacles);
    expect(obstacles.every(o => labelOverlap(result.box, o) === 0)).toBe(true);
    expect(Math.abs(result.x)).toBeGreaterThan(50);
    // Escape the 40px-wide node half-width without unbounded displacement.
    expect(Math.abs(result.x) - result.box.width / 2).toBeLessThanOrEqual(43);
    expect(result.y).toBeGreaterThan(0);
    expect(result.y).toBeLessThan(18);
  });

  it('moves off a node covering the midpoint without changing the route', () => {
    const obstacle = { x: 35, y: -12, width: 30, height: 24 };
    const before = JSON.stringify(horizontal);
    expect(labelOverlap(place(label(), [obstacle]).box, obstacle)).toBe(0);
    expect(JSON.stringify(horizontal)).toBe(before);
  });

  it('reserves arrowhead and caption space, even for a single edge label', () => {
    const obstacles = [
      { x: 45, y: -10, width: 20, height: 20 },
      { x: 5, y: -15, width: 30, height: 30 },
      { x: 88, y: -4, width: 12, height: 8 },
    ];
    const result = place(label(), obstacles);
    expect(obstacles.every(o => labelOverlap(result.box, o) === 0)).toBe(true);
  });

  it('separates labels on nearby parallel edges deterministically', () => {
    const routes = [0, 4, 8].map((y, i) => ({ id: `e${i}`, points: [{ x: 0, y }, { x: 180, y }] }));
    const labels = routes.map(route => label(route, 50));
    const result = placeEdgeLabels(labels, [], routes);
    const boxes = [...result.values()].map(p => p.box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(labelOverlap(boxes[i], boxes[j])).toBe(0);
    }
    expect(placeEdgeLabels([...labels].reverse(), [], [...routes].reverse())).toEqual(result);
  });

  it('staggers crowded sibling labels along their edges, including a reverse edge', () => {
    for (const reverse of [false, true]) {
      const routes = [0, 7, 14].map((y, i) => ({ id: `e${i}`, bundleId: 'a-b',
        points: [{ x: 0, y }, { x: 280, y }] }));
      if (reverse) routes[1].points.reverse();
      const labels = routes.map(route => label(route, 118, 16));
      const result = placeEdgeLabels(labels, [], routes);
      expect(result.get('e0')!.x).toBeLessThan(result.get('e1')!.x);
      expect(result.get('e1')!.x).toBeLessThan(result.get('e2')!.x);
      for (const placement of result.values()) {
        if (!placement.leader) continue;
        const { from, to } = placement.leader;
        expect(from.x).toBeCloseTo(to.x); // attachment stays on its horizontal edge
        expect([0, 7, 14]).toContain(from.y);
        expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeLessThanOrEqual(43);
        expect(Math.min(Math.abs(to.y - placement.box.y), Math.abs(to.y - placement.box.y - placement.box.height))).toBeLessThan(1e-6);
      }
      expect(placeEdgeLabels([...labels].reverse(), [], [...routes].reverse())).toEqual(result);
    }
  });

  it('keeps already clear sibling labels centered without adding attachment marks', () => {
    const routes = [0, 80].map((y, i) => ({ id: `e${i}`, bundleId: 'a-b', points: [{ x: 0, y }, { x: 280, y }] }));
    const result = placeEdgeLabels(routes.map(route => label(route)), [], routes);
    for (const route of routes) {
      expect(result.get(route.id)).toMatchObject({ x: 140, y: route.points[0].y });
      expect(result.get(route.id)!.leader).toBeUndefined();
    }
  });

  it('places a boundary-edge label beside the group caption with a visible attachment', () => {
    const route = { id: 'caption-edge', points: [{ x: 40, y: 0 }, { x: 320, y: 0 }] };
    const caption = { x: 120, y: -15, width: 120, height: 30 };
    const result = place(label(route, 112, 16), [caption, { x: 0, y: 0, width: 360, height: 2 }]);
    expect(labelOverlap(result.box, caption)).toBe(0);
    expect(result.box.x + result.box.width <= caption.x || result.box.x >= caption.x + caption.width).toBe(true);
    expect(Math.abs(result.y)).toBeLessThan(20);
  });

  it('avoids masking an unrelated crossing edge when a clear position exists', () => {
    const crossing = { id: 'crossing', points: [{ x: 50, y: -50 }, { x: 50, y: 50 }] };
    const result = place(label(horizontal, 20), [], [horizontal, crossing]);
    expect(result.box.x + result.box.width < 50 || result.box.x > 50).toBe(true);
  });

  it('can place a loop label outside its node', () => {
    const loop = { id: 'loop', points: [{ x: 0, y: 0 }, { x: 30, y: -25 }, { x: 60, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 0 }] };
    const node = { x: -20, y: -10, width: 70, height: 40 };
    expect(labelOverlap(place(label(loop), [node]).box, node)).toBe(0);
  });

  it('allows group interiors while keeping labels off the boundary', () => {
    const borders = [
      { x: -20, y: -40, width: 140, height: 2 }, { x: -20, y: 40, width: 140, height: 2 },
      { x: -20, y: -40, width: 2, height: 80 }, { x: 118, y: -40, width: 2, height: 80 },
    ];
    expect(place(label(), borders)).toMatchObject({ x: 50, y: 0 });
  });

  it('retains finite, bounded positions when the entire neighborhood is crowded', () => {
    const obstacle = { x: -1000, y: -1000, width: 2000, height: 2000 };
    const input = label();
    const result = place(input, [obstacle]);
    expect(result).toMatchObject({ x: 50, y: 0 });
    expect(result.box.width).toBe(input.width + 2 * LABEL_CLEARANCE);
    expect(result.box.height).toBe(input.height + 2 * LABEL_CLEARANCE);
  });

  it('is translation-invariant and rejects invalid text or geometry', () => {
    const original = place(label(), [{ x: 35, y: -12, width: 30, height: 24 }]);
    const translated = place(label({ id: 'edge', points: horizontal.points.map(p => ({ x: p.x + 800, y: p.y - 200 })) }),
      [{ x: 835, y: -212, width: 30, height: 24 }]);
    expect(translated.x).toBeCloseTo(original.x + 800);
    expect(translated.y).toBeCloseTo(original.y - 200);
    expect(placeEdgeLabels([label(horizontal, NaN), label({ id: 'bad', points: [{ x: Infinity, y: 0 }] })], [], [])).toEqual(new Map());
  });

  it('never increases total overlap over midpoint placement in crowded diagrams', () => {
    const geometry = fc.record({ x: fc.integer({ min: -100, max: 100 }), y: fc.integer({ min: -100, max: 100 }),
      width: fc.integer({ min: 10, max: 100 }), height: fc.integer({ min: 8, max: 40 }) });
    fc.assert(fc.property(fc.array(geometry, { minLength: 1, maxLength: 12 }),
      fc.array(geometry, { maxLength: 12 }), (items, obstacles) => {
        const labels = items.map((item, i) => label({ id: String(i), points: [
          { x: item.x - 40, y: item.y - 10 }, { x: item.x + 40, y: item.y + 10 },
        ] }, item.width, item.height));
        const midpoints = items.map(item => ({ x: item.x - item.width / 2 - LABEL_CLEARANCE,
          y: item.y - item.height / 2 - LABEL_CLEARANCE,
          width: item.width + 2 * LABEL_CLEARANCE, height: item.height + 2 * LABEL_CLEARANCE }));
        const energy = (boxes: LabelRect[]) => boxes.reduce((sum, box, i) => sum
          + obstacles.reduce((s, o) => s + labelOverlap(box, o), 0)
          + boxes.slice(i + 1).reduce((s, other) => s + labelOverlap(box, other), 0), 0);
        const result = placeEdgeLabels(labels, obstacles, labels.map(l => l.route));
        expect(energy([...result.values()].map(p => p.box))).toBeLessThanOrEqual(energy(midpoints) + 1e-5);
      }), { seed: 71234, numRuns: 100 });
  });
});
