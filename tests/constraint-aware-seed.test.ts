import { describe, it, expect } from 'vitest';
import { computeConstraintAwareSeed } from '../src/translators/webcola/constraint-aware-seed';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import type { InstanceLayout, LayoutNode, LayoutEdge } from '../src/layout/interfaces';

/**
 * Unit tests for the constraint-aware symmetric seed (issue #427 prototype).
 * These check the seed itself — constraint satisfaction and displayed
 * symmetry — before WebCola ever runs.
 */

function makeNode(id: string): LayoutNode {
  return {
    id,
    label: id,
    color: '#000',
    width: 100,
    height: 60,
    attributes: {},
    mostSpecificType: 'atom',
    showLabels: true,
    icon: '',
  } as LayoutNode;
}

function makeEdge(source: LayoutNode, target: LayoutNode, relationName: string, id: string): LayoutEdge {
  return {
    source,
    target,
    relationName,
    id,
    label: relationName,
  } as LayoutEdge;
}

const sourceConstraint = {} as any;

describe('Constraint-aware symmetric seed', () => {
  it('lays a left-constrained linked list on a single horizontal line', () => {
    const nodes = ['n0', 'n1', 'n2', 'n3', 'n4'].map(makeNode);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = nodes.slice(0, -1).map((n, i) =>
      makeEdge(n, nodes[i + 1], 'next', `e${i}`)
    );
    // n_i left of n_{i+1} — the spec says the list flows rightward.
    const constraints = nodes.slice(0, -1).map((n, i) => ({
      sourceConstraint,
      left: n,
      right: nodes[i + 1],
      minDistance: 15,
    }));
    const layout: InstanceLayout = { nodes, edges, constraints, groups: [] };

    const seed = computeConstraintAwareSeed(layout, 800, 800)!;
    expect(seed).not.toBeNull();

    // Constraints satisfied: strictly increasing x with at least the gap.
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = seed.get(`n${i}`)!;
      const b = seed.get(`n${i + 1}`)!;
      expect(b.x - a.x).toBeGreaterThanOrEqual(100 + 15); // widths/2 + minDistance
    }
    // Symmetry/readability: every node on the same row (no staircase).
    const ys = nodes.map(n => seed.get(n.id)!.y);
    for (const y of ys) {
      expect(Math.abs(y - ys[0])).toBeLessThan(0.001);
    }
  });

  it('mirrors a complete binary tree when only vertical constraints exist', () => {
    // Depth-2 complete binary tree: root -> a, b; a -> a1, a2; b -> b1, b2.
    const ids = ['root', 'a', 'b', 'a1', 'a2', 'b1', 'b2'];
    const nodes = ids.map(makeNode);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edgeSpec: Array<[string, string]> = [
      ['root', 'a'], ['root', 'b'],
      ['a', 'a1'], ['a', 'a2'],
      ['b', 'b1'], ['b', 'b2'],
    ];
    const edges = edgeSpec.map(([s, t], i) =>
      makeEdge(byId.get(s)!, byId.get(t)!, 'child', `e${i}`)
    );
    // Only "parent above child" — x is entirely free for the seeder.
    const constraints = edgeSpec.map(([s, t]) => ({
      sourceConstraint,
      top: byId.get(s)!,
      bottom: byId.get(t)!,
      minDistance: 20,
    }));
    const layout: InstanceLayout = { nodes, edges, constraints, groups: [] };

    const seed = computeConstraintAwareSeed(layout, 800, 800)!;
    expect(seed).not.toBeNull();

    // Constraints satisfied: children strictly below parents.
    for (const [s, t] of edgeSpec) {
      expect(seed.get(t)!.y - seed.get(s)!.y).toBeGreaterThanOrEqual(60 + 20);
    }

    // Displayed symmetry: the two isomorphic subtrees mirror around the
    // root's vertical axis, and each parent is centered over its children.
    const rootX = seed.get('root')!.x;
    expect(seed.get('a')!.x + seed.get('b')!.x).toBeCloseTo(2 * rootX, 5);
    expect(seed.get('a1')!.x + seed.get('b2')!.x).toBeCloseTo(2 * rootX, 5);
    expect(seed.get('a2')!.x + seed.get('b1')!.x).toBeCloseTo(2 * rootX, 5);
    expect((seed.get('a1')!.x + seed.get('a2')!.x) / 2).toBeCloseTo(seed.get('a')!.x, 5);
    // Same rank -> same y.
    expect(seed.get('a')!.y).toBeCloseTo(seed.get('b')!.y, 5);
    expect(seed.get('a1')!.y).toBeCloseTo(seed.get('b2')!.y, 5);
  });

  it('respects horizontal orderings when left/right constraints exist too', () => {
    const ids = ['root', 'l', 'r'];
    const nodes = ids.map(makeNode);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = [
      makeEdge(byId.get('root')!, byId.get('l')!, 'left', 'e0'),
      makeEdge(byId.get('root')!, byId.get('r')!, 'right', 'e1'),
    ];
    const constraints = [
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('l')!, minDistance: 20 },
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('r')!, minDistance: 20 },
      // l left of root, root left of r — the classic BST arrangement.
      { sourceConstraint, left: byId.get('l')!, right: byId.get('root')!, minDistance: 15 },
      { sourceConstraint, left: byId.get('root')!, right: byId.get('r')!, minDistance: 15 },
    ];
    const layout: InstanceLayout = { nodes, edges, constraints, groups: [] };

    const seed = computeConstraintAwareSeed(layout, 800, 800)!;
    expect(seed).not.toBeNull();

    expect(seed.get('l')!.x).toBeLessThan(seed.get('root')!.x);
    expect(seed.get('root')!.x).toBeLessThan(seed.get('r')!.x);
    expect(seed.get('l')!.y).toBeGreaterThan(seed.get('root')!.y);
    expect(seed.get('r')!.y).toBeGreaterThan(seed.get('root')!.y);
    // Symmetric because the separation chain is itself symmetric.
    expect(seed.get('l')!.x + seed.get('r')!.x).toBeCloseTo(2 * seed.get('root')!.x, 5);
  });

  it('is used by the translator for cold renders (no priors)', async () => {
    const ids = ['root', 'a', 'b'];
    const nodes = ids.map(makeNode);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = [
      makeEdge(byId.get('root')!, byId.get('a')!, 'l', 'e0'),
      makeEdge(byId.get('root')!, byId.get('b')!, 'r', 'e1'),
    ];
    const constraints = [
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('a')!, minDistance: 20 },
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('b')!, minDistance: 20 },
    ];
    const layout: InstanceLayout = { nodes, edges, constraints, groups: [] };

    const expected = computeConstraintAwareSeed(layout, 800, 800)!;
    const translator = new WebColaTranslator();
    const result = await translator.translate(layout, 800, 800);
    for (const node of result.colaNodes) {
      expect(node.x, `${node.id}.x should come from the seed`).toBeCloseTo(expected.get(node.id)!.x, 5);
      expect(node.y, `${node.id}.y should come from the seed`).toBeCloseTo(expected.get(node.id)!.y, 5);
      // Start positions only: the seed must never lock nodes.
      expect(node.fixed, `${node.id} must stay free`).toBe(0);
    }
  });

  it('adds no constraints, links, or locks beyond the legacy path', async () => {
    // The "cannot break anything" guarantee: the seed changes initial x/y
    // and NOTHING else. Translate the same layout with the legacy DAGRE
    // seed and with the constraint-aware seed, and compare everything
    // except positions.
    const ids = ['root', 'a', 'b'];
    const nodes = ids.map(makeNode);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = [
      makeEdge(byId.get('root')!, byId.get('a')!, 'l', 'e0'),
      makeEdge(byId.get('root')!, byId.get('b')!, 'r', 'e1'),
    ];
    const constraints = [
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('a')!, minDistance: 20 },
      { sourceConstraint, top: byId.get('root')!, bottom: byId.get('b')!, minDistance: 20 },
    ];
    const layout: InstanceLayout = { nodes, edges, constraints, groups: [] };

    const legacy = await new WebColaTranslator().translate(layout, 800, 800, { seedMode: 'dagre' });
    const seeded = await new WebColaTranslator().translate(layout, 800, 800);

    expect(seeded.colaConstraints).toEqual(legacy.colaConstraints);
    expect(seeded.colaEdges.length).toBe(legacy.colaEdges.length);
    expect(seeded.colaNodes.map(n => n.fixed)).toEqual(legacy.colaNodes.map(n => n.fixed));
  });

  it('returns null on a cyclic constraint system', () => {
    const nodes = ['a', 'b'].map(makeNode);
    const constraints = [
      { sourceConstraint, left: nodes[0], right: nodes[1], minDistance: 10 },
      { sourceConstraint, left: nodes[1], right: nodes[0], minDistance: 10 },
    ];
    const layout: InstanceLayout = { nodes, edges: [], constraints, groups: [] };
    expect(computeConstraintAwareSeed(layout, 800, 800)).toBeNull();
  });
});
