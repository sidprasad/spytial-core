import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec, parseInferredEdgeDraw } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

/**
 * inferredEdge `draw` — group endpoints.
 *
 * Data shape used throughout: regions r1/r2 with cities inside them (via `contains`),
 * plus a `connected` relation between region keys. A keyed group constraint
 * (`regions`, selector `contains`) produces one group per region: regions[r1], regions[r2].
 */

const regionsData: IJsonDataInstance = {
  atoms: [
    { id: 'r1', type: 'Region', label: 'r1' },
    { id: 'r2', type: 'Region', label: 'r2' },
    { id: 'c1', type: 'City', label: 'c1' },
    { id: 'c2', type: 'City', label: 'c2' },
    { id: 'c3', type: 'City', label: 'c3' }
  ],
  relations: [
    {
      id: 'contains',
      name: 'contains',
      types: ['Region', 'City'],
      tuples: [
        { atoms: ['r1', 'c1'], types: ['Region', 'City'] },
        { atoms: ['r1', 'c2'], types: ['Region', 'City'] },
        { atoms: ['r2', 'c3'], types: ['Region', 'City'] }
      ]
    },
    {
      id: 'connected',
      name: 'connected',
      types: ['Region', 'Region'],
      tuples: [
        { atoms: ['r1', 'r2'], types: ['Region', 'Region'] }
      ]
    }
  ]
};

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

function generate(specStr: string, data: IJsonDataInstance = regionsData) {
  const instance = new JSONDataInstance(data);
  const evaluator = createEvaluator(instance);
  const spec = parseLayoutSpec(specStr);
  const layoutInstance = new LayoutInstance(spec, evaluator, 0, true);
  return layoutInstance.generateLayout(instance).layout;
}

describe('parseInferredEdgeDraw', () => {
  it('parses group -> group', () => {
    expect(parseInferredEdgeDraw('regions -> regions')).toEqual({ source: 'regions', target: 'regions' });
  });

  it('parses _ -> group and group -> _', () => {
    expect(parseInferredEdgeDraw('_ -> regions')).toEqual({ source: null, target: 'regions' });
    expect(parseInferredEdgeDraw('regions -> _')).toEqual({ source: 'regions', target: null });
  });

  it('normalizes _ -> _ (and absent input) to undefined', () => {
    expect(parseInferredEdgeDraw('_ -> _')).toBeUndefined();
    expect(parseInferredEdgeDraw(undefined)).toBeUndefined();
    expect(parseInferredEdgeDraw(null)).toBeUndefined();
  });

  it('rejects malformed values', () => {
    expect(() => parseInferredEdgeDraw('regions')).toThrow(/exactly one '->'/);
    expect(() => parseInferredEdgeDraw('a -> b -> c')).toThrow(/exactly one '->'/);
    expect(() => parseInferredEdgeDraw(' -> regions')).toThrow(/empty endpoint/);
    expect(() => parseInferredEdgeDraw(42)).toThrow(/must be a string/);
  });
});

describe('inferredEdge draw — spec validation', () => {
  it('rejects a draw reference to an unknown group name at parse time', () => {
    const spec = `
constraints:
  - group:
      name: regions
      selector: contains
directives:
  - inferredEdge:
      name: connected
      selector: connected
      draw: zones -> regions
`;
    expect(() => parseLayoutSpec(spec)).toThrow(/references group 'zones'/);
  });

  it('accepts a draw reference to a defined group name', () => {
    const spec = `
constraints:
  - group:
      name: regions
      selector: contains
directives:
  - inferredEdge:
      name: connected
      selector: connected
      draw: regions -> regions
`;
    const parsed = parseLayoutSpec(spec);
    expect(parsed.directives.inferredEdges[0].draw).toEqual({ source: 'regions', target: 'regions' });
  });
});

describe('inferredEdge draw — endpoint resolution', () => {
  const groupedSpec = (drawLine: string, selector = 'connected') => `
constraints:
  - group:
      name: regions
      selector: contains
directives:
  - inferredEdge:
      name: connected
      selector: ${selector}
      draw: ${drawLine}
`;

  it('stamps both ends for group -> group and anchors on members', () => {
    const layout = generate(groupedSpec('regions -> regions'));

    const edge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edge).toBeDefined();
    expect(edge?.sourceGroupId).toBe('regions[r1]');
    expect(edge?.targetGroupId).toBe('regions[r2]');
    // Anchors are group MEMBERS (cities), never the keys.
    expect(['c1', 'c2']).toContain(edge?.source.id);
    expect(edge?.target.id).toBe('c3');
  });

  it('stamps only the qualified end for _ -> group', () => {
    const layout = generate(groupedSpec('_ -> regions'));

    const edge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edge).toBeDefined();
    expect(edge?.sourceGroupId).toBeUndefined();
    expect(edge?.targetGroupId).toBe('regions[r2]');
    // Unqualified end anchors on the atom itself.
    expect(edge?.source.id).toBe('r1');
  });

  it('supports unary selectors: the atom feeds both ends (key -> own group)', () => {
    const layout = generate(groupedSpec('_ -> regions', 'Region'));

    const edges = layout.edges.filter(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edges).toHaveLength(2);

    const r1Edge = edges.find(e => e.id.includes('r1'));
    expect(r1Edge?.source.id).toBe('r1');
    expect(r1Edge?.targetGroupId).toBe('regions[r1]');
    const r2Edge = edges.find(e => e.id.includes('r2'));
    expect(r2Edge?.source.id).toBe('r2');
    expect(r2Edge?.targetGroupId).toBe('regions[r2]');
  });

  it('skips tuples whose atom keys no group in this instance', () => {
    const withEmptyRegion: IJsonDataInstance = {
      ...regionsData,
      atoms: [...regionsData.atoms, { id: 'r3', type: 'Region', label: 'r3' }]
    };
    // r3 has no cities, so `regions` builds no group for it — its edge is skipped.
    const layout = generate(groupedSpec('_ -> regions', 'Region'), withEmptyRegion);

    const edges = layout.edges.filter(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edges).toHaveLength(2);
    expect(edges.some(e => e.id.includes('r3'))).toBe(false);
  });

  it('skips edges whose ends resolve to the same group', () => {
    const withSelfLoop: IJsonDataInstance = {
      ...regionsData,
      relations: regionsData.relations.map(r =>
        r.id === 'connected'
          ? {
              ...r,
              tuples: [
                { atoms: ['r1', 'r2'], types: ['Region', 'Region'] },
                { atoms: ['r1', 'r1'], types: ['Region', 'Region'] }
              ]
            }
          : r
      )
    };
    const layout = generate(groupedSpec('regions -> regions'), withSelfLoop);

    const edges = layout.edges.filter(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceGroupId).toBe('regions[r1]');
    expect(edges[0].targetGroupId).toBe('regions[r2]');
  });

  it('survives hidden group keys: group ends anchor on members, not keys', () => {
    const spec = `
constraints:
  - group:
      name: regions
      selector: contains
  - hideAtom:
      selector: Region
directives:
  - inferredEdge:
      name: connected
      selector: connected
      draw: regions -> regions
`;
    const layout = generate(spec);

    // Keys are hidden, groups (and their members) remain.
    expect(layout.nodes.some(n => n.id === 'r1' || n.id === 'r2')).toBe(false);

    const edge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edge).toBeDefined();
    expect(edge?.sourceGroupId).toBe('regions[r1]');
    expect(edge?.targetGroupId).toBe('regions[r2]');
  });

  it('leaves plain inferredEdges (no draw) untouched', () => {
    const spec = `
constraints:
  - group:
      name: regions
      selector: contains
directives:
  - inferredEdge:
      name: connected
      selector: connected
`;
    const layout = generate(spec);

    const edge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('connected'));
    expect(edge).toBeDefined();
    expect(edge?.source.id).toBe('r1');
    expect(edge?.target.id).toBe('r2');
    expect(edge?.sourceGroupId).toBeUndefined();
    expect(edge?.targetGroupId).toBeUndefined();
  });
});

describe('addEdge connector desugar — per-end stamps', () => {
  const connectorSpec = (direction: string) => `
constraints:
  - group:
      name: regions
      selector: contains
      addEdge: ${direction}
`;

  it("stamps the member (target) end for 'togroup' and keeps legacy fields", () => {
    const layout = generate(connectorSpec('togroup'));

    const connectors = layout.edges.filter(e => e.id.startsWith('_g_'));
    expect(connectors).toHaveLength(2); // one per group: regions[r1], regions[r2]

    const r1Conn = connectors.find(e => e.groupId === 'regions[r1]');
    expect(r1Conn).toBeDefined();
    // togroup runs key → member: the member (target) end is the group end.
    expect(r1Conn?.source.id).toBe('r1');
    expect(r1Conn?.sourceGroupId).toBeUndefined();
    expect(r1Conn?.targetGroupId).toBe('regions[r1]');
    // Legacy informational fields survive the unification (consumers read them).
    expect(r1Conn?.keyNodeId).toBe('r1');
    expect(r1Conn?.groupId).toBe('regions[r1]');
  });

  it("stamps the member (source) end for 'fromgroup'", () => {
    const layout = generate(connectorSpec('fromgroup'));

    const r2Conn = layout.edges.find(e => e.id.startsWith('_g_') && e.groupId === 'regions[r2]');
    expect(r2Conn).toBeDefined();
    // fromgroup runs member → key: the member (source) end is the group end.
    expect(r2Conn?.target.id).toBe('r2');
    expect(r2Conn?.sourceGroupId).toBe('regions[r2]');
    expect(r2Conn?.targetGroupId).toBeUndefined();
    expect(r2Conn?.keyNodeId).toBe('r2');
  });

  it('leaves connectors unstamped when addEdge is none', () => {
    const layout = generate(connectorSpec('none'));
    expect(layout.edges.some(e => e.id.startsWith('_g_'))).toBe(false);
  });
});
