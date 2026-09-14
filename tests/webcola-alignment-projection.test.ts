// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Group, Node, Rectangle } from 'webcola';
import { requireCola } from '../src/translators/webcola/routing/cola-runtime';

const cola = requireCola();
type BoundedNode = Node & { bounds?: Rectangle };
const EPSILON = 1e-4;

function projectionFor(nodes: BoundedNode[], groups: Group[], roots: Group[], constraints: object[]) {
  const projection = new cola.Projection(nodes, groups, { leaves: [], groups: roots, padding: 0 }, constraints, true);
  let x = nodes.map(n => n.x).concat(groups.flatMap(g => [g.bounds!.x + g.padding / 2, g.bounds!.X - g.padding / 2]));
  let y = nodes.map(n => n.y).concat(groups.flatMap(g => [g.bounds!.y + g.padding / 2, g.bounds!.Y - g.padding / 2]));
  return {
    project() {
      for (let i = 0; i < 5; i++) {
        const nextX = [...x], nextY = [...y];
        projection.xProject(x, y, nextX);
        projection.yProject(nextX, y, nextY);
        x = nextX;
        y = nextY;
      }
      for (let i = 0; i < nodes.length; i++) {
        expect(Number.isFinite(x[i])).toBe(true);
        expect(Number.isFinite(y[i])).toBe(true);
      }
      return { x, y };
    },
    translateX(offsets: number[]) {
      x = x.map((value, i) => value + offsets[i]);
    },
  };
}

function nodesAt(xs: number[]): BoundedNode[] {
  return xs.map(x => ({ x, y: 0, width: 60, height: 40 }));
}
function alignY(count: number) {
  return Array.from({ length: count - 1 }, (_, i) => ({ axis: 'y', left: i, right: i + 1, gap: 0, equality: true }));
}
function expectSeparated(a: Group, b: Group) {
  expect(a.bounds!.overlapX(b.bounds!) <= EPSILON || a.bounds!.overlapY(b.bounds!) <= EPSILON).toBe(true);
}

describe('vendored WebCola alignment-aware projection (#585)', () => {
  it('uses descendant alignment to separate nested outer hulls', () => {
    const nodes = nodesAt([0, 200, 80, 280, 100]);
    const child: Group = { leaves: nodes.slice(0, 2), padding: 12 };
    const outer: Group = { leaves: [nodes[4]], groups: [child], padding: 20 };
    const other: Group = { leaves: nodes.slice(2, 4), padding: 12 };
    const { y } = projectionFor(nodes, [child, outer, other], [outer, other], alignY(5)).project();
    expect(Math.max(...y.slice(0, 5)) - Math.min(...y.slice(0, 5))).toBeLessThan(EPSILON);
    expectSeparated(outer, other);
    expect(outer.bounds!.x).toBeLessThanOrEqual(child.bounds!.x - outer.padding + EPSILON);
    expect(outer.bounds!.X).toBeGreaterThanOrEqual(child.bounds!.X + outer.padding - EPSILON);
  });

  it('separates groups when only one cross-group member pair is aligned', () => {
    const nodes = nodesAt([0, 200, 80, 280]);
    nodes[1].y = 15;
    nodes[3].y = -15;
    const groups: Group[] = [{ leaves: nodes.slice(0, 2), padding: 12 }, { leaves: nodes.slice(2), padding: 12 }];
    const { y } = projectionFor(nodes, groups, groups, [
      { axis: 'y', left: 0, right: 2, gap: 0, equality: true },
    ]).project();
    expect(Math.abs(y[0] - y[2])).toBeLessThan(EPSILON);
    expectSeparated(groups[0], groups[1]);
  });

  it('permits shared-member hulls to overlap while preserving exact alignment', () => {
    const nodes = nodesAt([0, 100, 200]);
    const groups: Group[] = [{ leaves: [nodes[0], nodes[1]], padding: 12 }, { leaves: [nodes[1], nodes[2]], padding: 12 }];
    const { y } = projectionFor(nodes, groups, groups, alignY(3)).project();
    expect(Math.max(...y.slice(0, 3)) - Math.min(...y.slice(0, 3))).toBeLessThan(EPSILON);
    expect(groups[0].bounds!.overlapX(groups[1].bounds!)).toBeGreaterThan(0);
    expect(groups[0].bounds!.overlapY(groups[1].bounds!)).toBeGreaterThan(0);
  });

  it('does not mistake a nonzero equality offset for exact same-coordinate alignment', () => {
    const nodes = nodesAt([0, 200, 0, 200]);
    nodes[2].y = nodes[3].y = 200;
    const groups: Group[] = [{ leaves: nodes.slice(0, 2), padding: 12 }, { leaves: nodes.slice(2), padding: 12 }];
    const { y } = projectionFor(nodes, groups, groups, [
      { axis: 'y', left: 0, right: 1, gap: 0, equality: true },
      { axis: 'y', left: 2, right: 3, gap: 0, equality: true },
      { axis: 'y', left: 0, right: 2, gap: 200, equality: true },
    ]).project();
    expect(y[2] - y[0]).toBeCloseTo(200);
    expect(groups[0].bounds!.overlapX(groups[1].bounds!)).toBeGreaterThan(0);
    expectSeparated(groups[0], groups[1]);
  });

  it('recomputes temporary group order from new desired positions on the same projector', () => {
    const nodes = nodesAt([0, 100, 300, 400]);
    const groups: Group[] = [{ leaves: nodes.slice(0, 2), padding: 12 }, { leaves: nodes.slice(2), padding: 12 }];
    const solver = projectionFor(nodes, groups, groups, alignY(4));
    solver.project();
    expect(groups[0].bounds!.X).toBeLessThan(groups[1].bounds!.x);
    // Supply another valid arrangement (not a continuous drag through overlap).
    // Group variable entries follow the four node entries in X.
    solver.translateX([600, 600, -600, -600, 600, 600, -600, -600]);
    solver.project();
    expect(groups[1].bounds!.X).toBeLessThan(groups[0].bounds!.x);
  });
});
