/**
 * Integration tests for icons as part of `atomStyle`: parse → match (selector) →
 * resolve (compose / collide / inherit) → LayoutNode fields (`icon`,
 * `iconPlacement`, `iconOpacity`, `showLabels`).
 *
 * The point of the move is that `showLabels` — one boolean that used to drive
 * label visibility, icon size, icon position AND box transparency — splits into
 * two orthogonal knobs: atomStyle's own `showLabel`, and `iconStyle.placement`.
 * The legacy `icon` directive desugars onto that pair losslessly, which is what
 * the desugar block below pins.
 *
 * `RedNode` is a subtype of `Node`, so a `Node` selector already returns the
 * `RedNode` atom — the basis of the inheritance test.
 */
import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec, type LayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance, normalizeLegacyDirectives } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { StyleCollisionError } from '../src/layout/style/style-resolver';
import { resolveIconPath } from '../src/layout/icon-registry';

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

const PERSON_ICON = resolveIconPath('person');

describe('atomStyle iconStyle — end to end', () => {
    it('carries a resolved path, placement, and opacity onto the LayoutNode', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      iconStyle:
        path: person
        placement: badge
        opacity: 0.5
`)();
        const n = nodeById(layout, 'n1');
        expect(n.icon).toBe(PERSON_ICON); // bundled name resolved at parse time
        expect(n.icon).toMatch(/^data:image\/svg\+xml/);
        expect(n.iconPlacement).toBe('badge');
        expect(n.iconOpacity).toBe(0.5);
    });

    it('defaults placement to full and leaves opacity unset', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      iconStyle:
        path: person
`)();
        const n = nodeById(layout, 'n1');
        expect(n.iconPlacement).toBe('full');
        expect(n.iconOpacity).toBeUndefined();
    });

    it('shows the label by default, even with a full-bleed icon (the watermark idiom)', () => {
        // The old `icon` directive defaulted to hiding the label; on the atomStyle
        // surface an atom keeps its label unless a rule says otherwise.
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      iconStyle:
        path: person
        opacity: 0.15
`)();
        const n = nodeById(layout, 'n1');
        expect(n.showLabels).toBe(true);
        expect(n.iconPlacement).toBe('full');
    });

    it('hides the label via showLabel, independently of any icon', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      showLabel: false
`)();
        const n = nodeById(layout, 'n1');
        expect(n.showLabels).toBe(false);
        expect(n.icon).toBe(''); // label hidden with no icon at all — impossible before
    });

    it('leaves atoms with no icon rule unstyled and labelled', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: n1
      iconStyle:
        path: person
`)();
        const r = nodeById(layout, 'r1');
        expect(r.icon).toBe('');
        expect(r.iconOpacity).toBeUndefined();
        expect(r.showLabels).toBe(true);
    });

    it('drops an out-of-range or non-finite opacity rather than clamping it', () => {
        const spec = parseLayoutSpec(`
directives:
  - atomStyle:
      selector: n1
      iconStyle:
        path: person
        opacity: 1.5
`);
        expect(spec.directives.atomStyles[0].style.iconStyle).toEqual({ path: PERSON_ICON });
    });

    it('accepts the 0 and 1 endpoints', () => {
        const spec = parseLayoutSpec(`
directives:
  - atomStyle: { selector: n1, iconStyle: { path: person, opacity: 0 } }
  - atomStyle: { selector: r1, iconStyle: { path: person, opacity: 1 } }
`);
        expect(spec.directives.atomStyles[0].style.iconStyle?.opacity).toBe(0);
        expect(spec.directives.atomStyles[1].style.iconStyle?.opacity).toBe(1);
    });

    it('ignores an unknown placement instead of inventing geometry', () => {
        const spec = parseLayoutSpec(`
directives:
  - atomStyle: { selector: n1, iconStyle: { path: person, placement: sideways } }
`);
        expect(spec.directives.atomStyles[0].style.iconStyle).toEqual({ path: PERSON_ICON });
    });

    it('inherits an icon from a supertype rule and tunes only its opacity in a subtype rule', () => {
        // The capability the flat directive could not express: `Node` supplies the
        // path, `RedNode` fades it. Gap-fill falls out of ordinary selector matching.
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: Node
      iconStyle:
        path: person
  - atomStyle:
      selector: RedNode
      iconStyle:
        opacity: 0.2
`)();
        const r = nodeById(layout, 'r1');
        expect(r.icon).toBe(PERSON_ICON);
        expect(r.iconOpacity).toBe(0.2);

        const n = nodeById(layout, 'n1'); // Node only — inherits nothing from RedNode
        expect(n.icon).toBe(PERSON_ICON);
        expect(n.iconOpacity).toBeUndefined();
    });

    it('HARD ERRORS when two rules disagree on the icon path', () => {
        // Replaces the bespoke "Icon Conflict" throw with the shared resolver's
        // no-override rule.
        const run = layoutFor(`
directives:
  - atomStyle:
      selector: Node
      iconStyle:
        path: person
  - atomStyle:
      selector: RedNode
      iconStyle:
        path: star
`);
        expect(run).toThrow(StyleCollisionError);
    });

    it('composes agreeing rules rather than colliding', () => {
        const { layout } = layoutFor(`
directives:
  - atomStyle:
      selector: Node
      iconStyle:
        path: person
  - atomStyle:
      selector: RedNode
      iconStyle:
        path: person
        placement: badge
`)();
        const r = nodeById(layout, 'r1');
        expect(r.icon).toBe(PERSON_ICON);
        expect(r.iconPlacement).toBe('badge');
    });
});

/**
 * A LayoutSpec can reach the layout as an *object* — via the
 * `setupLayout(spec: LayoutSpec, ...)` overload or `new LayoutInstance(spec)` —
 * which never touches `parseLayoutSpec`, so nothing desugars its legacy
 * directives. Since the layout now reads only `atomStyles`, such a spec would
 * silently lose its icons without the normalization these pin.
 */