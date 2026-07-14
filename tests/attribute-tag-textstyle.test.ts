/**
 * Integration tests for the shared `textStyle` block (size + color) on the
 * `attribute` and `tag` directives: parse → LayoutNode.attributeTextStyles.
 *
 * #491 introduced text sizing for these directives with no test coverage; this
 * pins the full shared block (size + color) end to end, including the sparse
 * (color-only) and absent cases.
 */
import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

const data: IJsonDataInstance = {
    atoms: [
        { id: 'p1', type: 'Person', label: 'Alice' },
        { id: 'p2', type: 'Person', label: 'Bob' },
        { id: 'n30', type: 'Int', label: '30' },
        { id: 'n27', type: 'Int', label: '27' },
    ],
    relations: [
        {
            id: 'age',
            name: 'age',
            types: ['Person', 'Int'],
            tuples: [
                { atoms: ['p1', 'n30'], types: ['Person', 'Int'] },
                { atoms: ['p2', 'n27'], types: ['Person', 'Int'] },
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

const nodeById = (layout: any, id: string) => layout.nodes.find((n: any) => n.id === id);

describe('attribute directive — textStyle parsing', () => {
    it('parses size + color into the shared textStyle block', () => {
        const spec = parseLayoutSpec(`
directives:
  - attribute:
      field: age
      textStyle:
        size: large
        color: '#c0392b'
`);
        expect(spec.directives.attributes[0].textStyle).toEqual({ size: 'large', color: '#c0392b' });
    });

    it('keeps textStyle sparse — color only, no size', () => {
        const spec = parseLayoutSpec(`
directives:
  - attribute:
      field: age
      textStyle:
        color: '#2980b9'
`);
        expect(spec.directives.attributes[0].textStyle).toEqual({ color: '#2980b9' });
    });

    it('leaves textStyle undefined when omitted', () => {
        const spec = parseLayoutSpec(`
directives:
  - attribute:
      field: age
`);
        expect(spec.directives.attributes[0].textStyle).toBeUndefined();
    });
});

describe('tag directive — textStyle parsing', () => {
    it('parses size + color into the shared textStyle block', () => {
        const spec = parseLayoutSpec(`
directives:
  - tag:
      toTag: Person
      name: years
      value: age
      textStyle:
        size: small
        color: '#2980b9'
`);
        expect(spec.directives.tags[0].textStyle).toEqual({ size: 'small', color: '#2980b9' });
    });
});

describe('attribute directive — textStyle end to end', () => {
    it('carries size + color onto the source node attributeTextStyles', () => {
        const { layout } = layoutFor(`
directives:
  - attribute:
      field: age
      textStyle:
        size: large
        color: '#c0392b'
`);
        const p1 = nodeById(layout, 'p1');
        expect(p1.attributeTextStyles).toBeDefined();
        // Keyed by the attribute line's key; assert on the value to stay robust.
        expect(Object.values(p1.attributeTextStyles)).toContainEqual({ size: 'large', color: '#c0392b' });
    });

    it('leaves attributeTextStyles empty when no textStyle is set', () => {
        const { layout } = layoutFor(`
directives:
  - attribute:
      field: age
`);
        const p1 = nodeById(layout, 'p1');
        // The attribute still renders; it just carries no per-line style overrides.
        expect(p1.attributes && Object.keys(p1.attributes).length).toBeGreaterThan(0);
        expect(Object.keys(p1.attributeTextStyles ?? {})).toHaveLength(0);
    });
});

describe('tag directive — textStyle end to end', () => {
    it('carries size + color onto the tagged node attributeTextStyles', () => {
        const { layout } = layoutFor(`
directives:
  - tag:
      toTag: Person
      name: years
      value: age
      textStyle:
        size: small
        color: '#2980b9'
`);
        const p1 = nodeById(layout, 'p1');
        expect(Object.values(p1.attributeTextStyles ?? {})).toContainEqual({ size: 'small', color: '#2980b9' });
    });
});
