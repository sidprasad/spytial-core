/**
 * Integration tests for the `atomStyle` directive end-to-end: parse → match
 * (selector) → resolve (compose / collide, inheritance via selectors) →
 * LayoutNode fields (`color` = border outline, `fillColor`, `borderWidth`,
 * `textStyle`). Also pins the border-preserving `atomColor` desugar.
 *
 * `RedNode` is a subtype of `Node`, so a `Node` selector already returns the
 * `RedNode` atom — that's how gap-fill inheritance up the type ancestry falls
 * out of ordinary selector matching, with no explicit ancestry walk.
 */
import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { ColorSource } from '../src/layout/interfaces';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { StyleCollisionError } from '../src/layout/style/style-resolver';

const data: IJsonDataInstance = {
    atoms: [
        { id: 'n1', type: 'Node', label: 'n1' },
        { id: 'r1', type: 'RedNode', label: 'r1' },
    ],
    relations: [
        {
            id: 'link',
            name: 'link',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['n1', 'r1'], types: ['Node', 'RedNode'] }],
        },
    ],
    // Type `atoms` carry full atom objects (not id strings); RedNode extends Node
    // so a `Node` selector already returns r1 — the basis of the inheritance test.
    types: [
        { id: 'Node', types: ['Node'], atoms: [{ id: 'n1', type: 'Node', label: 'n1' }], isBuiltin: false },
        { id: 'RedNode', types: ['RedNode', 'Node'], atoms: [{ id: 'r1', type: 'RedNode', label: 'r1' }], isBuiltin: false },
    ],
};

function layoutFor(specStr: string) {
    const layoutSpec = parseLayoutSpec(specStr);
    const instance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    return () => layoutInstance.generateLayout(instance);
}

const nodeById = (layout: any, id: string) => layout.nodes.find((n: any) => n.id === id);

describe('atomStyle directive — end to end', () => {
    it('carries fillColor, border color+width, and label textStyle onto the LayoutNode', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      fillStyle:
        color: '#eef'
      borderStyle:
        color: '#33c'
        width: 3
      textStyle:
        color: '#003'
`)();
        const n = nodeById(layout, 'n1');
        expect(n.fillColor).toBe('#eef');
        expect(n.color).toBe('#33c'); // borderStyle.color drives the node's outline color
        expect(n.colorSource).toBe(ColorSource.Directive); // explicit → renderer preserves it
        expect(n.borderWidth).toBe(3);
        expect(n.textStyle).toEqual({ color: '#003' });
    });

    it('styles only atoms matching the selector; others keep the default palette', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      fillStyle:
        color: '#eef'
`)();
        expect(nodeById(layout, 'n1').fillColor).toBe('#eef');
        const r = nodeById(layout, 'r1');
        expect(r.fillColor).toBeUndefined();
        expect(r.borderWidth).toBeUndefined();
        expect(r.colorSource).toBe(ColorSource.DefaultPalette);
    });

    it('inherits a supertype rule and composes it with a subtype rule (no explicit ancestry walk)', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: Node
      fillStyle:
        color: '#eef'
  - atomStyle:
      selector: RedNode
      borderStyle:
        color: red
`)();
        const r = nodeById(layout, 'r1');
        expect(r.fillColor).toBe('#eef'); // inherited from the Node rule (RedNode is-a Node)
        expect(r.color).toBe('red'); // from the RedNode rule
        // n1 matches only the Node rule.
        expect(nodeById(layout, 'n1').fillColor).toBe('#eef');
    });

    it('HARD ERRORS when a supertype and subtype rule disagree on the same leaf', () => {
        const run = layoutFor(`
directives:
  - atomStyle:
      selector: Node
      borderStyle:
        color: blue
  - atomStyle:
      selector: RedNode
      borderStyle:
        color: red
`);
        expect(run).toThrow(StyleCollisionError); // r1 sees blue (from Node) vs red (from RedNode)
    });

    it('composes two overlapping rules on the same selector leaf-wise', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      fillStyle:
        color: '#eef'
  - atomStyle:
      selector: n1
      borderStyle:
        width: 4
`)();
        const n = nodeById(layout, 'n1');
        expect(n.fillColor).toBe('#eef');
        expect(n.borderWidth).toBe(4);
    });

    it('desugars a legacy atomColor into the border color (border-preserving, no fill)', () => {
        const { layout } = layoutFor(`
directives:
  - atomColor:
      selector: n1
      value: '#f80'
`)();
        const n = nodeById(layout, 'n1');
        expect(n.color).toBe('#f80'); // outline preserved exactly as before
        expect(n.colorSource).toBe(ColorSource.Directive);
        expect(n.fillColor).toBeUndefined(); // no interior fill
    });

    it('composes a legacy atomColor border with an atomStyle fill', () => {
        const { layout } = layoutFor(`
directives:
  - atomColor:
      selector: n1
      value: '#111'
  - atomStyle:
      selector: n1
      fillStyle:
        color: '#eef'
`)();
        const n = nodeById(layout, 'n1');
        expect(n.color).toBe('#111'); // from the desugared atomColor
        expect(n.fillColor).toBe('#eef'); // from the atomStyle
    });

    it('HARD ERRORS when a legacy atomColor and an atomStyle disagree on the border color', () => {
        const run = layoutFor(`
directives:
  - atomColor:
      selector: n1
      value: '#111'
  - atomStyle:
      selector: n1
      borderStyle:
        color: '#222'
`);
        expect(run).toThrow(StyleCollisionError);
    });
});

describe('atomColor → atomStyle desugar (parse level)', () => {
    it('desugars a standalone atomColor into a border-preserving atomStyle rule (and empties atomColors)', () => {
        const spec = parseLayoutSpec(`
directives:
  - atomColor:
      selector: Root
      value: '#f80'
`);
        expect(spec.directives.atomColors).toEqual([]);
        expect(spec.directives.atomStyles).toHaveLength(1);
        expect(spec.directives.atomStyles[0]).toEqual({
            selector: 'Root',
            style: { borderStyle: { color: '#f80' } },
        });
    });

    it('warns that atomColor is deprecated', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        parseLayoutSpec("directives:\n  - atomColor: { selector: Root, value: '#f80' }");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("'atomColor' is deprecated"));
        warn.mockRestore();
    });

    it('drops a selectorless atomColor instead of desugaring it into a global rule', () => {
        // atomColor's selector is required; a missing one was a no-op, so it must
        // NOT become an atomStyle that recolors every atom.
        const spec = parseLayoutSpec("directives:\n  - atomColor: { value: '#f00' }");
        expect(spec.directives.atomStyles).toEqual([]);
    });

    it('a selectorless atomColor does not recolor every node (end to end)', () => {
        const { layout } = layoutFor("directives:\n  - atomColor: { value: '#f00' }")();
        expect(nodeById(layout, 'n1').color).not.toBe('#f00');
        expect(nodeById(layout, 'r1').color).not.toBe('#f00');
    });
});

describe('atomStyle shape — end to end', () => {
    it('carries the shape onto the LayoutNode and leaves unmatched nodes rectangular', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      shape: diamond
`)();
        expect(nodeById(layout, 'n1').shape).toBe('diamond');
        expect(nodeById(layout, 'r1').shape).toBeUndefined();
    });

    it('inflates the auto-sized box so the label fits the shape (circle goes square)', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      shape: circle
`)();
        const circle = nodeById(layout, 'n1');
        expect(circle.width).toBe(circle.height);
        // The rectangle default for this short label is 100×60.
        const plain = nodeById(layout, 'r1');
        expect(plain.width).toBe(100);
        expect(plain.height).toBe(60);
    });

    it('never inflates an explicit size directive (sat_size stays exact)', () => {
        const { layout } = layoutFor(`
constraints:
  - size:
      selector: n1
      width: 40
      height: 30
directives:
  - atomStyle:
      selector: n1
      shape: ellipse
`)();
        const node = nodeById(layout, 'n1');
        expect(node.shape).toBe('ellipse');
        expect(node.width).toBe(40);
        expect(node.height).toBe(30);
    });
});
