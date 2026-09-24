import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Layout, Node } from 'webcola';
import type { InstanceLayout, LayoutConstraint, LayoutNode } from '../src/layout/interfaces';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

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

async function render(input: InstanceLayout): Promise<Layout> {
  const graph = new WebColaCnDGraph();
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

describe('first settled WebCola spacing', () => {
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

  it('continues honoring distances and constraints after a drag and release', async () => {
    const layout = await render(chain('x'));
    const synchronous = layout as unknown as { kick(): void; tick(): boolean };
    // Drive the normal resume path synchronously instead of waiting for D3's
    // animation timer. Do not restart: that would reset the descent state.
    const kick = vi.spyOn(synchronous, 'kick').mockImplementation(() => {
      for (let i = 0; i < 500; i++) if (synchronous.tick()) return;
      throw new Error('Resumed layout did not settle');
    });
    try {
      const dragged = layout.nodes()[2];
      dragged.fixed = 1;
      dragged.px = dragged.x! + 200;
      dragged.py = dragged.y!;
      layout.resume();
      expect(dragged.x).toBeCloseTo(dragged.px, 4);
      expectConstraints(layout);
      dragged.fixed = 0;
      layout.resume();
      expectNearTargets(layout);
      expectConstraints(layout);
    } finally {
      kick.mockRestore();
    }
  });
});
