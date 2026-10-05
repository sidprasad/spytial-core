import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Group, Layout, Node } from 'webcola';
import type { InstanceLayout, LayoutConstraint, LayoutNode } from '../src/layout/interfaces';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { requireCola } from '../src/translators/webcola/routing/cola-runtime';

// Only browser measurements are stubbed. These tests render through the real
// translator, vendored solver, initial settling loop, and renderer end handler.
const measurements: [object, string, PropertyDescriptor][] = [
  [SVGElement.prototype, 'getBBox', { value: function (this: SVGElement) {
    return { x: 0, y: 0, width: (this.textContent?.length ?? 0) * 9, height: 12 };
  } }],
  [SVGElement.prototype, 'getTotalLength', { value: () => 100 }],
  [SVGElement.prototype, 'getPointAtLength', { value: (x: number) => ({ x, y: 0 }) }],
  [SVGSVGElement.prototype, 'width', { get: () => ({ baseVal: { value: 800 } }) }],
  [SVGSVGElement.prototype, 'height', { get: () => ({ baseVal: { value: 600 } }) }],
];
const originals = measurements.map(([object, key]) => Object.getOwnPropertyDescriptor(object, key));
beforeAll(() => {
  measurements.forEach(([object, key, descriptor]) => {
    Object.defineProperty(object, key, { ...descriptor, configurable: true });
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (text: string) => ({ width: text.length * 9 }),
  }) as any);
});
afterEach(() => {
  document.querySelectorAll('webcola-cnd-graph').forEach(element => {
    // Cancel the pending camera tween before restoring SVG measurements.
    (element as unknown as { svg: { interrupt(): void } }).svg.interrupt();
    (element as WebColaCnDGraph).dispose();
    element.remove();
  });
});
afterAll(() => {
  vi.restoreAllMocks();
  measurements.forEach(([object, key], i) => {
    if (originals[i]) Object.defineProperty(object, key, originals[i]!);
    else Reflect.deleteProperty(object, key);
  });
});

function chain(axis: 'x' | 'y', minDistance = 20, grouped = false): InstanceLayout {
  const nodes: LayoutNode[] = (grouped ? [146, 161, 106, 130] : [146, 161, 106]).map((size, i) => ({
    id: `n${i}`, label: `Node ${i}`, color: '#000', mostSpecificType: 'Node', showLabels: true,
    width: axis === 'x' ? size : 60, height: axis === 'y' ? size : 60,
  }));
  const constraints: LayoutConstraint[] = nodes.slice(1).flatMap((node, i) => [
    axis === 'x'
      ? { sourceConstraint: {} as any, left: nodes[i], right: node, minDistance }
      : { sourceConstraint: {} as any, top: nodes[i], bottom: node, minDistance },
    { sourceConstraint: {} as any, node1: nodes[i], node2: node, axis: axis === 'x' ? 'y' as const : 'x' as const },
  ]);
  return {
    nodes, constraints,
    edges: nodes.slice(1).map((node, i) => ({
      id: `e${i}`, source: nodes[i], target: node, label: 'next', relationName: 'next', color: '#000',
    })),
    groups: grouped ? [0, 2].map(i => ({
      name: `group${i}`, nodeIds: [nodes[i].id, nodes[i + 1].id], keyNodeId: nodes[i].id, showLabel: true,
    })) : [],
  };
}

async function render(input: InstanceLayout, graph = new WebColaCnDGraph()): Promise<Layout> {
  const errors = vi.fn();
  graph.addEventListener('layout-error', errors);
  document.body.appendChild(graph);
  await graph.renderLayout(input, { transitionMode: 'replace' });
  // A silent fallback to unsolved seed positions must not count as a pass.
  expect(errors).not.toHaveBeenCalled();
  const layout = (graph as unknown as { colaLayout: Layout }).colaLayout;
  expect(layout.alpha()).toBe(0);
  return layout;
}

function expectConstraints(layout: Layout) {
  const nodes = layout.nodes();
  for (const constraint of layout.constraints()) {
    const { axis, left, right, gap, equality } = constraint as {
      axis: 'x' | 'y'; left: number; right: number; gap: number; equality?: boolean;
    };
    const distance = nodes[right][axis]! - nodes[left][axis]!;
    if (equality) expect(distance).toBeCloseTo(gap, 4);
    else expect(distance).toBeGreaterThanOrEqual(gap - 1e-4);
  }
}

function expectNearTargets(layout: Layout) {
  for (const link of layout.links()) {
    const source = link.source as Node, target = link.target as Node;
    const distance = Math.hypot(target.x! - source.x!, target.y! - source.y!);
    // This chain can attain its existing soft distance targets while honoring
    // every constraint. Grid snapping used to produce a long/cramped pair.
    expect(Math.abs(distance - layout.getLinkLength(link))).toBeLessThan(2);
  }
}

function positions(layout: Layout) {
  return layout.nodes().map(n => ({ x: n.x!, y: n.y! }));
}

function expectPositions(layout: Layout, expected: { x: number; y: number }[]) {
  layout.nodes().forEach((node, i) => {
    expect(node.x).toBeCloseTo(expected[i].x, 4);
    expect(node.y).toBeCloseTo(expected[i].y, 4);
  });
}

function dragAndRelease(layout: Layout, subject: Node | Group, dx: number, dy: number) {
  const synchronous = layout as unknown as { kick(): void; tick(): boolean };
  // Use the vendored adaptor's actual drag operations and resume path. Only
  // replace the animation timer; start() would rebuild the descent state.
  const kick = vi.spyOn(synchronous, 'kick').mockImplementation(() => {
    for (let i = 0; i < 500; i++) if (synchronous.tick()) return;
    throw new Error('Resumed layout did not settle');
  });
  const cola = requireCola();
  const { x, y } = cola.Layout.dragOrigin(subject);
  try {
    cola.Layout.dragStart(subject);
    for (let step = 1; step <= 8; step++) {
      cola.Layout.drag(subject, { x: x + dx * step / 8, y: y + dy * step / 8 });
      layout.resume();
    }
    expectConstraints(layout);
    const released = positions(layout);
    cola.Layout.dragEnd(subject);
    layout.resume();
    // Releasing the pointer must not restart attraction or cause snap-back.
    expectPositions(layout, released);
    expectConstraints(layout);
  } finally {
    cola.Layout.dragEnd(subject);
    kick.mockRestore();
  }
}

describe('first settled WebCola spacing', () => {
  it('chooses LR from the measured viewport for a fresh unconstrained chain', async () => {
    const input = chain('x');
    input.nodes = Array.from({ length: 10 }, (_, i) => ({ ...input.nodes[0], id: `n${i}`, width: 100, height: 60 }));
    input.edges = input.nodes.slice(1).map((node, i) => ({
      id: `e${i}`, source: input.nodes[i], target: node, label: 'next', relationName: 'next', color: '#000',
    }));
    input.constraints = [];
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 500, width: 1200, height: 500, toJSON: () => ({}),
    });
    try {
      const nodes = (await render(input)).nodes();
      for (let i = 1; i < nodes.length; i++) {
        expect(nodes[i].x).toBeGreaterThan(nodes[i - 1].x!);
        expect(nodes[i].y).toBeCloseTo(nodes[0].y!, 4);
      }
    } finally { rect.mockRestore(); }
  });

  it.each(['x', 'y'] as const)('retains attainable edge distances and exact alignment along %s', async axis => {
    const layout = await render(chain(axis));
    expectNearTargets(layout);
    expectConstraints(layout);
  });

  it.each(['x', 'y'] as const)('honors an author gap larger than the soft target along %s', async axis => {
    const layout = await render(chain(axis, 400));
    expectConstraints(layout);
    const nodes = layout.nodes();
    expect(nodes[1][axis]! - nodes[0][axis]!).toBeGreaterThan(layout.getLinkLength(layout.links()[0]));
  });

  it('keeps aligned disjoint groups separated without snapping', async () => {
    const layout = await render(chain('x', 20, true));
    expectConstraints(layout);
    const [a, b] = layout.groups();
    expect(a.bounds!.X).toBeLessThanOrEqual(b.bounds!.x + 1e-4);
  });

  it.each(['x', 'y'] as const)('lets a user stretch and shorten an edge along %s without pulling its neighbors', async axis => {
    const layout = await render(chain(axis));
    expectNearTargets(layout);
    const expected = positions(layout);
    for (const distance of [200, -100]) {
      expected[2][axis] += distance;
      dragAndRelease(layout, layout.nodes()[2], axis === 'x' ? distance : 0, axis === 'y' ? distance : 0);
      expectPositions(layout, expected);
    }
  });

  it('keeps connected neighbors still even without authored constraints', async () => {
    const input = chain('x');
    input.constraints = [];
    const layout = await render(input);
    const rightmost = layout.nodes().reduce((a, b) => a.x! > b.x! ? a : b);
    const expected = positions(layout);
    expected[layout.nodes().indexOf(rightmost)].x += 200;
    dragAndRelease(layout, rightmost, 200, 0);
    expectPositions(layout, expected);
  });

  it.each(['x', 'y'] as const)('still moves neighbors when alignment or minimum separation along %s requires it', async axis => {
    const layout = await render(chain(axis));
    const otherAxis = axis === 'x' ? 'y' : 'x';
    const before = positions(layout);
    dragAndRelease(layout, layout.nodes()[2], axis === 'x' ? 0 : 100, axis === 'y' ? 0 : 100);
    expect(layout.nodes()[0][otherAxis]! - before[0][otherAxis]).toBeGreaterThan(99);
    // Move the first node toward its neighbors until separation must push them.
    dragAndRelease(layout, layout.nodes()[0], axis === 'x' ? 300 : 0, axis === 'y' ? 300 : 0);
    expect(layout.nodes()[1][axis]! - before[1][axis]).toBeGreaterThan(1);
  });

  it('still prevents overlap when dragging nodes with no authored constraints', async () => {
    const input = chain('x');
    input.constraints = [];
    const layout = await render(input);
    const [a, b] = layout.nodes();
    dragAndRelease(layout, a, b.x! - a.x!, b.y! - a.y!);
    const nodes = layout.nodes();
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const xGap = Math.abs(nodes[i].x! - nodes[j].x!) - (nodes[i].width! + nodes[j].width!) / 2;
        const yGap = Math.abs(nodes[i].y! - nodes[j].y!) - (nodes[i].height! + nodes[j].height!) / 2;
        expect(Math.max(xGap, yGap)).toBeGreaterThanOrEqual(-1e-4);
      }
    }
  });

  it('lets a group member move without pulling other members or connected groups', async () => {
    const layout = await render(chain('x', 20, true));
    const expected = positions(layout);
    expected[3].x += 200;
    dragAndRelease(layout, layout.nodes()[3], 200, 0);
    expectPositions(layout, expected);
    const [a, b] = layout.groups();
    expect(a.bounds!.X).toBeLessThanOrEqual(b.bounds!.x + 1e-4);
  });

  it('lets a whole group move without pulling a connected group', async () => {
    const layout = await render(chain('x', 20, true));
    const expected = positions(layout);
    expected[2].x += 200;
    expected[3].x += 200;
    dragAndRelease(layout, layout.groups()[1], 200, 0);
    expectPositions(layout, expected);
  });

  it('uses distance attraction again when a new layout is explicitly rendered', async () => {
    const graph = new WebColaCnDGraph();
    const layout = await render(chain('x'), graph);
    dragAndRelease(layout, layout.nodes()[2], 200, 0);
    const replacement = await render(chain('x'), graph);
    expectNearTargets(replacement);
    expectConstraints(replacement);
  });
});
