import { describe, expect, it } from 'vitest';
import { computeDagreSeed, type DagreSeedEdge } from '../src/translators/webcola/dagre-seed';
import { WebColaTranslator, type WebColaLayoutOptions } from '../src/translators/webcola/webcolatranslator';
import { computeConstraintAwareSeed } from '../src/translators/webcola/constraint-aware-seed';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';

const diamond: Array<[number, number]> = [[0, 1], [0, 2], [1, 3], [2, 3]];

function fixture(count: number, pairs: Array<[number, number]>, symmetric = false, width = 100): InstanceLayout {
  const nodes: LayoutNode[] = Array.from({ length: count }, (_, index) => ({
    id: `N${String(index).padStart(2, '0')}`, label: String(index), width, height: 60,
    color: '#000', mostSpecificType: 'Node', showLabels: true,
  }));
  const edges = pairs.flatMap(([a, b]) => symmetric ? [[a, b], [b, a]] : [[a, b]])
    .map(([a, b], index) => ({ id: `e${index}`, source: nodes[a], target: nodes[b], label: 'r', relationName: 'r', color: '#000' }));
  return { nodes, edges, constraints: [], groups: [] };
}

function seeds(input: InstanceLayout, pairs: Array<[number, number]>) {
  const display: DagreSeedEdge[] = pairs.map(([a, b]) => ({ source: input.nodes[a].id, target: input.nodes[b].id, bidirectional: true }));
  return computeDagreSeed(input.nodes, display);
}

async function positions(input: InstanceLayout, options?: WebColaLayoutOptions) {
  const result = await new WebColaTranslator().translate(input, 800, 600, options);
  return [...result.colaNodes].sort((a, b) => a.id.localeCompare(b.id)).map(n => ({ id: n.id, x: n.x, y: n.y }));
}

describe('display-aligned deterministic DAGRE seeds', () => {
  it('removes the artificial rank from a symmetric diamond without changing displayed edges', async () => {
    const input = fixture(4, diamond, true);
    const graph = seeds(input, diamond);
    expect(graph.edgeCount()).toBe(4);
    expect(graph.graph().rankdir).toBe('TB');
    expect(graph.node('N01').y).toBe(graph.node('N02').y);
    const result = await new WebColaTranslator().translate(input);
    expect(result.colaEdges).toHaveLength(4);
    expect(result.colaEdges.every(e => e.bidirectional)).toBe(true);
    expect(result.colaConstraints).toEqual([]);
    expect(result.colaNodes[1].y).toBe(result.colaNodes[2].y);
  });

  it.each([
    { width: 1200, height: 500, boxWidth: 100, direction: 'LR' },
    { width: 500, height: 900, boxWidth: 100, direction: 'TB' },
    { width: 800, height: 600, boxWidth: 240, direction: 'TB' },
    { width: 900, height: 600, boxWidth: 100, direction: 'TB' }, // <10% coverage gain
    { width: 3000, height: 3000, boxWidth: 100, direction: 'TB' }, // TB fills more at 1:1
  ])('chooses $direction for a chain in $width x $height with $boxWidth px boxes', ({ width, height, boxWidth, direction }) => {
    const input = fixture(10, Array.from({ length: 9 }, (_, i) => [i, i + 1]), false, boxWidth);
    const edges = input.edges.map(e => ({ source: e.source.id, target: e.target.id }));
    expect(computeDagreSeed(input.nodes, edges, { width, height }).graph().rankdir).toBe(direction);
  });

  it('accounts for branching rather than treating every wide viewport as LR', () => {
    const input = fixture(10, Array.from({ length: 9 }, (_, i) => [0, i + 1]));
    const edges = input.edges.map(e => ({ source: e.source.id, target: e.target.id }));
    expect(computeDagreSeed(input.nodes, edges, { width: 1200, height: 500 }).graph().rankdir).toBe('TB');
  });

  it('keeps TB without a usable viewport, including empty and singleton graphs', () => {
    const input = fixture(2, [[0, 1]]);
    for (const viewport of [undefined, { width: 0, height: 600 }, { width: NaN, height: 600 }, { width: 800, height: Infinity }]) {
      expect(computeDagreSeed(input.nodes, [], viewport).graph().rankdir).toBe('TB');
    }
    for (const count of [0, 1]) {
      expect(computeDagreSeed(fixture(count, []).nodes, [], { width: 1200, height: 500 }).graph().rankdir).toBe('TB');
    }
  });

  it('selects LR for a fresh chain but retains TB seeds with priors, constraints, or groups', async () => {
    const input = fixture(10, Array.from({ length: 9 }, (_, i) => [i, i + 1]));
    const fresh = await new WebColaTranslator().translate(input, 1200, 500);
    expect(fresh.colaNodes[9].x).toBeGreaterThan(fresh.colaNodes[0].x!);
    expect(fresh.colaNodes[9].y).toBe(fresh.colaNodes[0].y);
    const tb = computeDagreSeed(input.nodes, input.edges.map(e => ({ source: e.source.id, target: e.target.id })));
    const priorPositions = { positions: [{ id: 'N00', x: 123, y: 456 }], transform: { k: 1, x: 0, y: 0 } };
    const warm = await new WebColaTranslator().translate(input, 1200, 500, { priorPositions });
    expect(warm.colaNodes[0]).toMatchObject({ x: 123, y: 456 });
    input.constraints = [{ sourceConstraint: {} as any, left: input.nodes[0], right: input.nodes[9], minDistance: 20 }];
    const constrained = await new WebColaTranslator().translate(input, 1200, 500, { seedMode: 'dagre' });
    input.constraints = [];
    input.groups = [{ name: 'group', keyNodeId: input.nodes[0].id, nodeIds: input.nodes.map(n => n.id), showLabel: true }];
    const grouped = await new WebColaTranslator().translate(input, 1200, 500);
    for (const result of [warm, constrained, grouped]) {
      expect(result.colaNodes[1]).toMatchObject({ x: tb.node('N01').x, y: tb.node('N01').y });
    }
  });

  it.each([false, true])('produces the same shuffled positions (symmetric=%s)', async symmetric => {
    const input = fixture(4, diamond, symmetric);
    const expected = await positions(input);
    for (let offset = 0; offset < input.nodes.length; offset++) {
      const reordered = { ...input, nodes: [...input.nodes.slice(offset), ...input.nodes.slice(0, offset)].reverse(), edges: [...input.edges].reverse() };
      expect(await positions(reordered)).toEqual(expected);
    }
    expect(input.nodes.map(n => n.id)).toEqual(['N00', 'N01', 'N02', 'N03']);
    expect(input.edges).toHaveLength(symmetric ? 8 : 4);
  });

  it('preserves asymmetric presentations and editable arrows', async () => {
    const input = fixture(2, [[0, 1]], true);
    input.edges[1].color = 'red';
    const result = await new WebColaTranslator().translate(input);
    expect(result.colaEdges).toHaveLength(2);
    expect(result.colaEdges.every(e => !e.bidirectional)).toBe(true);
    const editable = await new WebColaTranslator().translate(fixture(4, diamond, true), 800, 600, { collapseSymmetricEdges: false });
    expect(editable.colaEdges).toHaveLength(8);
    expect(editable.colaEdges.every(e => !e.bidirectional)).toBe(true);
  });

  it('keeps self-loops and separately directed relations', () => {
    const input = fixture(3, [[0, 0], [0, 1], [1, 0], [1, 2]]);
    const raw = input.edges.map(e => ({ source: e.source.id, target: e.target.id }));
    const graph = computeDagreSeed(input.nodes, raw);
    expect(graph.hasEdge('N00', 'N00')).toBe(true);
    expect(graph.hasEdge('N00', 'N01')).toBe(true);
    expect(graph.hasEdge('N01', 'N00')).toBe(true);
  });

  it('preserves prior coordinates and seeds missing nodes on warm renders', async () => {
    const input = fixture(4, diamond, true);
    const priorPositions = { positions: [{ id: 'N00', x: 123, y: 456 }], transform: { k: 1, x: 0, y: 0 } };
    const defaultSeed = await positions(input, { priorPositions });
    const fresh = await positions(input);
    expect(defaultSeed.slice(1)).toEqual(fresh.slice(1));
    expect(defaultSeed.find(n => n.id === 'N00')).toEqual({ id: 'N00', x: 123, y: 456 });
  });

  it('preserves the constraint-aware seed and constraint translation', async () => {
    const input = fixture(4, diamond, true);
    input.constraints = [{ sourceConstraint: {} as any, left: input.nodes[0], right: input.nodes[3], minDistance: 20 }];
    const expected = computeConstraintAwareSeed(input, 800, 600)!;
    expect(await positions(input)).toEqual(input.nodes.map(n => ({ id: n.id, ...expected.get(n.id)! })));
    const result = await new WebColaTranslator().translate(input, 800, 600);
    expect(result.colaConstraints).toHaveLength(1);
    expect(result.colaNodes.every(n => n.fixed === 0)).toBe(true);
  });
});
