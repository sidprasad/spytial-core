/**
 * Integration tests for the `edgeStyle` directive end-to-end: parse → match
 * (field/selector/filter) → resolve (compose / collide) → LayoutEdge fields.
 * Also pins the additive precedence over the legacy `edgeColor` path.
 */
import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { StyleCollisionError } from '../src/layout/style/style-resolver';

const treeData: IJsonDataInstance = {
    atoms: [
        { id: 'Node0', type: 'Node', label: 'Node0' },
        { id: 'Node1', type: 'Node', label: 'Node1' },
        { id: 'Node2', type: 'Node', label: 'Node2' },
        { id: 'Node3', type: 'Node', label: 'Node3' },
        { id: 'Node4', type: 'Node', label: 'Node4' },
    ],
    relations: [
        {
            id: 'left',
            name: 'left',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['Node3', 'Node1'], types: ['Node', 'Node'] },
                { atoms: ['Node4', 'Node2'], types: ['Node', 'Node'] },
            ],
        },
        {
            id: 'right',
            name: 'right',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['Node1', 'Node4'], types: ['Node', 'Node'] }],
        },
    ],
};

function layoutFor(specStr: string) {
    const layoutSpec = parseLayoutSpec(specStr);
    const instance = new JSONDataInstance(treeData);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    return () => layoutInstance.generateLayout(instance);
}

describe('edgeStyle directive — end to end', () => {
    it('applies line color / pattern / weight to every matching edge', () => {
        const { layout } = layoutFor(`
directives:
  - edgeStyle:
      field: left
      lineStyle:
        color: '#3366cc'
        pattern: dashed
        weight: 3
`)();
        const left = layout.edges.filter((e) => e.relationName === 'left');
        expect(left).toHaveLength(2);
        for (const e of left) {
            expect(e.color).toBe('#3366cc');
            expect(e.style).toBe('dashed');
            expect(e.weight).toBe(3);
        }
        // 'right' edges are untouched — legacy default color, no style.
        const right = layout.edges.filter((e) => e.relationName === 'right');
        expect(right[0].color).toBe('black');
        expect(right[0].style).toBeUndefined();
    });

    it('carries textStyle (edge-label styling) onto the LayoutEdge', () => {
        const { layout } = layoutFor(`
directives:
  - edgeStyle:
      field: left
      textStyle:
        size: large
        color: '#a00'
`)();
        const e = layout.edges.find((edge) => edge.relationName === 'left');
        expect(e?.textStyle).toEqual({ size: 'large', color: '#a00' });
    });

    it('honors the selector, styling only edges from matching sources', () => {
        const { layout } = layoutFor(`
directives:
  - edgeStyle:
      field: left
      selector: Node3
      lineStyle:
        color: '#ff0000'
`)();
        const styled = layout.edges.find((e) => e.relationName === 'left' && e.source.id === 'Node3');
        const other = layout.edges.find((e) => e.relationName === 'left' && e.source.id === 'Node4');
        expect(styled?.color).toBe('#ff0000');
        expect(other?.color).toBe('black');
    });

    it('composes two overlapping rules leaf-wise (color from one, weight from the other)', () => {
        const { layout } = layoutFor(`
directives:
  - edgeStyle:
      field: left
      lineStyle:
        color: '#3366cc'
  - edgeStyle:
      field: left
      lineStyle:
        weight: 5
`)();
        const e = layout.edges.find((edge) => edge.relationName === 'left');
        expect(e?.color).toBe('#3366cc');
        expect(e?.weight).toBe(5);
    });

    it('HARD ERRORS when two matching rules disagree on a leaf', () => {
        const run = layoutFor(`
directives:
  - edgeStyle:
      field: left
      lineStyle:
        color: '#3366cc'
  - edgeStyle:
      field: left
      lineStyle:
        color: '#ff0000'
`);
        expect(run).toThrow(StyleCollisionError);
    });

    it('composes a legacy edgeColor with an edgeStyle (different properties)', () => {
        const { layout } = layoutFor(`
directives:
  - edgeColor:
      field: left
      value: '#111111'
  - edgeStyle:
      field: left
      lineStyle:
        weight: 5
`)();
        const e = layout.edges.find((edge) => edge.relationName === 'left');
        expect(e?.color).toBe('#111111'); // from the desugared edgeColor
        expect(e?.weight).toBe(5); // from the edgeStyle
    });

    it('HARD ERRORS when a legacy edgeColor and an edgeStyle disagree on a property', () => {
        const run = layoutFor(`
directives:
  - edgeColor:
      field: left
      value: '#111111'
  - edgeStyle:
      field: left
      lineStyle:
        color: '#3366cc'
`);
        expect(run).toThrow(StyleCollisionError);
    });
});

describe('edgeColor → edgeStyle desugar', () => {
    it('desugars a standalone edgeColor into an edgeStyle rule (and empties edgeColors)', () => {
        const spec = parseLayoutSpec(`
directives:
  - edgeColor:
      field: left
      value: '#111111'
      style: dashed
      weight: 2
`);
        expect(spec.directives.edgeColors).toEqual([]);
        expect(spec.directives.edgeStyles).toHaveLength(1);
        expect(spec.directives.edgeStyles[0].style).toEqual({
            lineStyle: { color: '#111111', pattern: 'dashed', weight: 2 },
        });
    });

    it('warns that edgeColor is deprecated', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        parseLayoutSpec("directives:\n  - edgeColor: { field: left, value: '#111111' }");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("'edgeColor' is deprecated"));
        warn.mockRestore();
    });

    it('preserves a capitalized legacy style (Dashed → dashed) through to the LayoutEdge', () => {
        // The old edgeColor path lowercased via normalizeEdgeStyle; the desugar must too.
        const { layout } = layoutFor(`
directives:
  - edgeColor:
      field: left
      value: '#111111'
      style: Dashed
`)();
        const e = layout.edges.find((edge) => edge.relationName === 'left');
        expect(e?.style).toBe('dashed');
    });
});

describe('inferredEdge — lineStyle/textStyle block adoption', () => {
    it('parses lineStyle + textStyle blocks onto the inferred edge', () => {
        const spec = parseLayoutSpec(`
directives:
  - inferredEdge:
      name: reachable
      selector: '^next'
      lineStyle:
        color: '#a0f'
        pattern: dotted
        weight: 2
      textStyle:
        size: small
`);
        expect(spec.directives.inferredEdges).toHaveLength(1);
        const ie = spec.directives.inferredEdges[0];
        expect(ie.name).toBe('reachable');
        expect(ie.color).toBe('#a0f'); // lineStyle.color → flat color field (unchanged consumption)
        expect(ie.style).toBe('dotted'); // lineStyle.pattern → flat style field
        expect(ie.weight).toBe(2);
        expect(ie.textStyle).toEqual({ size: 'small' });
    });

    it('still accepts legacy inline color/style/weight and warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const spec = parseLayoutSpec(`
directives:
  - inferredEdge:
      name: reachable
      selector: '^next'
      color: '#a0f'
      style: dotted
`);
        const ie = spec.directives.inferredEdges[0];
        expect(ie.color).toBe('#a0f');
        expect(ie.style).toBe('dotted');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("inferredEdge's inline"));
        warn.mockRestore();
    });

    it('prefers the lineStyle block over a legacy inline value', () => {
        const spec = parseLayoutSpec(`
directives:
  - inferredEdge:
      name: reachable
      selector: '^next'
      color: '#000'
      lineStyle:
        color: '#a0f'
`);
        expect(spec.directives.inferredEdges[0].color).toBe('#a0f');
    });
});
