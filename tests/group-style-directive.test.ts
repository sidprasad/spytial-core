/**
 * Coverage for the group directive's two style surfaces:
 *   1. the `addEdge` connector (an edge) — block form
 *      `addEdge: { points, lineStyle, textStyle }` styles its line + label;
 *   2. the group's own label — top-level `textStyle`.
 * The legacy `addEdge: <string>` shorthand still sets the direction, unstyled.
 *
 * Tested at parse (GroupBySelector fields), computed layout (the `_g_` connector
 * LayoutEdge + the LayoutGroup), and renderer (group-label color mapping).
 */
import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const data: IJsonDataInstance = {
    atoms: [
        { id: 'k1', type: 'Node', label: 'k1' },
        { id: 'a', type: 'Node', label: 'a' },
        { id: 'b', type: 'Node', label: 'b' },
    ],
    relations: [
        {
            id: 'mem',
            name: 'mem',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['k1', 'a'], types: ['Node', 'Node'] },
                { atoms: ['k1', 'b'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

function layoutFor(specStr: string) {
    const layoutSpec = parseLayoutSpec(specStr);
    const instance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    return layoutInstance.generateLayout(instance);
}

describe('group directive — parse (block addEdge + top-level textStyle)', () => {
    it('parses connector lineStyle/textStyle from a block addEdge and the group label textStyle', () => {
        const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: mem
      name: Cluster
      addEdge:
        points: togroup
        lineStyle:
          color: '#0aa'
          pattern: dashed
        textStyle:
          color: '#a00'
      textStyle:
        color: '#333'
`);
        const gbs = spec.constraints.grouping.byselector[0];
        expect(gbs.addEdge).toBe('togroup'); // direction read from points
        expect(gbs.connectorLineStyle).toEqual({ color: '#0aa', pattern: 'dashed' });
        expect(gbs.connectorTextStyle).toEqual({ color: '#a00' });
        expect(gbs.labelTextStyle).toEqual({ color: '#333' });
    });

    it('still accepts the legacy string addEdge (direction only, no connector style)', () => {
        const spec = parseLayoutSpec('constraints:\n  - group: { selector: mem, name: Cluster, addEdge: togroup }');
        const gbs = spec.constraints.grouping.byselector[0];
        expect(gbs.addEdge).toBe('togroup');
        expect(gbs.connectorLineStyle).toBeUndefined();
        expect(gbs.connectorTextStyle).toBeUndefined();
        expect(gbs.labelTextStyle).toBeUndefined();
    });
});

describe('group directive — computed layout', () => {
    it('applies the addEdge block style to the connector edge and the textStyle to the group label', () => {
        const { layout } = layoutFor(`
constraints:
  - group:
      selector: mem
      name: Cluster
      addEdge:
        points: togroup
        lineStyle:
          color: '#0aa'
          pattern: dashed
          weight: 3
        textStyle:
          size: small
          color: '#a00'
      textStyle:
        color: '#333'
`);
        // The connector is a `_g_` edge; its line + label carry the authored style.
        const connector = layout.edges.find((e) => e.id.startsWith('_g_'));
        expect(connector).toBeDefined();
        expect(connector?.color).toBe('#0aa');
        expect(connector?.style).toBe('dashed');
        expect(connector?.weight).toBe(3);
        expect(connector?.textStyle).toEqual({ size: 'small', color: '#a00' });

        // The group's own label carries its textStyle.
        const grp = layout.groups.find((g) => g.name.startsWith('Cluster'));
        expect(grp?.labelTextStyle).toEqual({ color: '#333' });
    });

    it('leaves the connector unstyled (default) for a legacy string addEdge', () => {
        const { layout } = layoutFor('constraints:\n  - group: { selector: mem, name: Cluster, addEdge: togroup }');
        const connector = layout.edges.find((e) => e.id.startsWith('_g_'));
        expect(connector).toBeDefined();
        expect(connector?.color).toBe('black'); // default edge color
        expect(connector?.textStyle).toBeUndefined();
        const grp = layout.groups.find((g) => g.name.startsWith('Cluster'));
        expect(grp?.labelTextStyle).toBeUndefined();
    });
});

describe('webcola-cnd-graph — group label color', () => {
    const proto = WebColaCnDGraph.prototype as any;
    const color = (d: unknown) => proto.groupLabelColor.call({}, d);

    it('maps a group label textStyle color to the fill', () => {
        expect(color({ labelTextStyle: { color: '#333' } })).toBe('#333');
    });

    it('returns null when no group label color is set (→ keep the default)', () => {
        expect(color({ labelTextStyle: {} })).toBeNull();
        expect(color({})).toBeNull();
    });
});
