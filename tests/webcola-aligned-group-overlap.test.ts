// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Group, Node } from 'webcola';
import { requireCola } from '../src/translators/webcola/routing/cola-runtime';

// Exercise the browser's vendored solver, not the separate npm runtime.
const cola = requireCola();
const EPSILON = 1e-4;

class SynchronousLayout extends cola.Layout {
  finish(): void {
    for (let tick = 0; tick < 1000; tick++) {
      if (this.tick()) return;
    }
    throw new Error('Vendored WebCola did not converge within 1000 ticks');
  }
}

function solveGroups(aligned: boolean, explicitSeparation = false) {
  // Each group is internally ordered, but their initial rectangles overlap.
  // There is deliberately no required order BETWEEN the groups.
  const nodes: Node[] = [0, 200, 80, 280].map(x => ({
    x, y: 0, width: 60, height: 40,
  }));
  const groups: Group[] = [
    { leaves: [nodes[0], nodes[1]], padding: 12 },
    { leaves: [nodes[2], nodes[3]], padding: 12 },
  ];
  const constraints = [
    { axis: 'x', left: 0, right: 1, gap: 100, equality: false },
    { axis: 'x', left: 2, right: 3, gap: 100, equality: false },
  ];
  if (aligned) {
    for (let i = 1; i < nodes.length; i++) {
      constraints.push({ axis: 'y', left: 0, right: i, gap: 0, equality: true });
    }
  }
  // Diagnostic control only: demonstrate that the aligned input has a solution.
  // This is not the proposed fix, since it imposes a particular group order.
  if (explicitSeparation) {
    for (const left of [0, 1]) {
      for (const right of [2, 3]) {
        constraints.push({ axis: 'x', left, right, gap: 60 + 12 + 12 + 10, equality: false });
      }
    }
  }

  const layout = new SynchronousLayout()
    .nodes(nodes)
    .links([])
    .groups(groups)
    .constraints(constraints)
    .size([800, 600])
    .avoidOverlaps(true)
    // Isolate overlap removal from disconnected-component packing.
    .handleDisconnected(false)
    .convergenceThreshold(0.001);
  layout.start(0, 10, 100, 0, false);
  layout.finish();

  for (const node of nodes) {
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
    node.bounds = new cola.Rectangle(node.x! - 30, node.x! + 30, node.y! - 20, node.y! + 20);
  }
  expect(nodes[1].x! - nodes[0].x!).toBeGreaterThanOrEqual(100 - EPSILON);
  expect(nodes[3].x! - nodes[2].x!).toBeGreaterThanOrEqual(100 - EPSILON);
  if (aligned) {
    const ys = nodes.map(n => n.y!);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(EPSILON);
  }

  // Use the runtime's actual group hull computation, including group padding,
  // refreshed from final positions rather than stale projection bounds.
  return groups.map(group => cola.computeGroupBounds(group));
}

function expectDisjoint([a, b]: ReturnType<typeof solveGroups>) {
  const overlapX = a.overlapX(b);
  const overlapY = a.overlapY(b);
  expect(
    overlapX <= EPSILON || overlapY <= EPSILON,
    `Disjoint groups overlap by ${overlapX.toFixed(3)} × ${overlapY.toFixed(3)} pixels`,
  ).toBe(true);
}

describe('issue #585: vendored WebCola group overlap', () => {
  it('separates group rectangles when their members are exactly horizontally aligned', () => {
    expectDisjoint(solveGroups(true));
  });

  it('control: separates the same groups when alignment is removed', () => {
    expectDisjoint(solveGroups(false));
  });

  it('control: can satisfy alignment and explicit group separation together', () => {
    expectDisjoint(solveGroups(true, true));
  });
});
