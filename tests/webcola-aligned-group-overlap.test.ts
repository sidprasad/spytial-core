// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Group, Node, Rectangle } from 'webcola';
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

interface FixtureOptions {
  vertical?: boolean;
  positions?: number[];
  nativeAlignment?: boolean;
  numericMembers?: boolean;
}

function solveGroups(aligned: boolean, explicitSeparation = false, options: FixtureOptions = {}) {
  // Each group is internally ordered, but their initial rectangles overlap.
  // There is deliberately no required order BETWEEN the groups.
  const { vertical = false, positions = [0, 200, 80, 280] } = options;
  const axis = vertical ? 'y' : 'x';
  const alignedAxis = vertical ? 'x' : 'y';
  const nodes: (Node & { bounds?: Rectangle })[] = positions.map(position => ({
    x: vertical ? 0 : position, y: vertical ? position : 0,
    width: vertical ? 40 : 60, height: vertical ? 60 : 40,
  }));
  const groups: Group[] = [
    { leaves: [nodes[0], nodes[1]], padding: 12 },
    { leaves: [nodes[2], nodes[3]], padding: 12 },
  ];
  if (options.numericMembers) {
    // WebCola's input also accepts indices, although its Group type describes
    // the node objects after normalization. Exercise the production input form.
    groups[0].leaves = [0, 1] as unknown as Node[];
    groups[1].leaves = [2, 3] as unknown as Node[];
  }
  const constraints: Record<string, unknown>[] = [
    { axis, left: 0, right: 1, gap: 100, equality: false },
    { axis, left: 2, right: 3, gap: 100, equality: false },
  ];
  if (aligned) {
    if (options.nativeAlignment) {
      constraints.push({ type: 'alignment', axis: alignedAxis,
        offsets: nodes.map((_, node) => ({ node, offset: 0 })) });
    } else {
      // Transitive equalities must work, not just a star with one common node.
      for (let i = 1; i < nodes.length; i++) {
        constraints.push({ axis: alignedAxis, left: i - 1, right: i, gap: 0, equality: true });
      }
    }
  }
  // Diagnostic control only: demonstrate that the aligned input has a solution.
  // This is not the proposed fix, since it imposes a particular group order.
  if (explicitSeparation) {
    for (const left of [0, 1]) {
      for (const right of [2, 3]) {
        constraints.push({ axis, left, right, gap: 60 + 12 + 12 + 10, equality: false });
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
    node.bounds = new cola.Rectangle(node.x - node.width! / 2, node.x + node.width! / 2,
      node.y - node.height! / 2, node.y + node.height! / 2);
  }
  expect(nodes[1][axis] - nodes[0][axis]).toBeGreaterThanOrEqual(100 - EPSILON);
  expect(nodes[3][axis] - nodes[2][axis]).toBeGreaterThanOrEqual(100 - EPSILON);
  if (aligned) {
    const ys = nodes.map(n => n[alignedAxis]);
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

  it.each([
    { name: 'reversed group positions', positions: [80, 280, 0, 200] },
    { name: 'coincident group centres', positions: [-100, 100, -50, 50] },
    { name: 'coincident nodes', positions: [0, 0, 0, 0] },
  ])('handles $name with horizontal or vertical alignment and either member input form', ({ positions }) => {
    for (const vertical of [false, true]) {
      for (const numericMembers of [false, true]) {
        expectDisjoint(solveGroups(true, false, { positions, vertical, numericMembers }));
      }
    }
  });

  it.each([false, true])('handles WebCola alignment constraints (vertical=%s)', vertical => {
    expectDisjoint(solveGroups(true, false, { vertical, nativeAlignment: true, numericMembers: true }));
  });

  it('control: separates the same groups when alignment is removed', () => {
    expectDisjoint(solveGroups(false));
  });

  it('control: can satisfy alignment and explicit group separation together', () => {
    expectDisjoint(solveGroups(true, true));
  });
});
