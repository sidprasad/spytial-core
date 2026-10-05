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
