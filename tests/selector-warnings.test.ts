import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

/**
 * Tests that simple-graph-query's unresolved-name diagnostics reach the user.
 *
 * From sgq 3.0 on, a name matching nothing in the instance evaluates to the empty
 * relation and raises a warning rather than throwing. That is the right call —
 * an instance carries only *populated* types and relations, so a legitimately
 * empty sig is indistinguishable from a typo — but it means an empty set
 * satisfies predicates vacuously and a mistyped selector produces exactly the
 * same *value* as one that legitimately matched nothing. The diagnostic is the
 * only thing separating them, so it has to survive all the way to the surface.
 */

function createEvaluator(instance: JSONDataInstance): SGraphQueryEvaluator {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    return evaluator;
}

const graphData: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
        {
            id: 'peer',
            name: 'peer',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'C'], types: ['Node', 'Node'] },
            ],
        },
    ],
};

describe('Selector warnings', () => {
    // ── Evaluator level ───────────────────────────────────────────

    describe('SGraphQueryEvaluator diagnostics', () => {
        it('reports an unresolved name, with a suggestion', () => {
            const evaluator = createEvaluator(new JSONDataInstance(graphData));
            const result = evaluator.evaluate('nxt');

            const diagnostics = result.getDiagnostics?.() ?? [];
            expect(diagnostics.length).toBe(1);
            expect(diagnostics[0].kind).toBe('unresolved-name');
            expect(diagnostics[0].name).toBe('nxt');
            expect(diagnostics[0].suggestion).toBe('next');
        });

        it('raises nothing for a name that resolves', () => {
            const evaluator = createEvaluator(new JSONDataInstance(graphData));
            const result = evaluator.evaluate('next');

            expect(result.getDiagnostics?.() ?? []).toHaveLength(0);
        });

        /**
         * The regression that matters most. `evaluate` memoizes by expression, so if
         * diagnostics were held anywhere but on the cached result object, the warning
         * would appear on the first evaluation and silently vanish on every hit after
         * — which is precisely the failure this feature exists to prevent. A single
         * render evaluates the same selector many times over (isAttributeField
         * re-evaluates its selector once per graph edge), so nearly every evaluation
         * after the first is a cache hit.
         */
        it('replays diagnostics on a cache hit', () => {
            const evaluator = createEvaluator(new JSONDataInstance(graphData));

            const first = evaluator.evaluate('nxt').getDiagnostics?.() ?? [];
            const second = evaluator.evaluate('nxt').getDiagnostics?.() ?? [];
            const third = evaluator.evaluate('nxt').getDiagnostics?.() ?? [];

            expect(first).toHaveLength(1);
            expect(second).toHaveLength(1);
            expect(third).toHaveLength(1);
            expect(second[0].name).toBe('nxt');
        });

        it('does not leak diagnostics between different expressions', () => {
            const evaluator = createEvaluator(new JSONDataInstance(graphData));

            evaluator.evaluate('nxt');
            const clean = evaluator.evaluate('next').getDiagnostics?.() ?? [];

            expect(clean).toHaveLength(0);
        });
    });

    // ── Layout level ──────────────────────────────────────────────

    describe('generateLayout warnings', () => {
        it('attributes an unresolved name to the constraint that used it', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: nxt
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(1);
            expect(warnings[0].code).toBe('unresolved-name');
            expect(warnings[0].severity).toBe('warning');
            expect(warnings[0].selector).toBe('nxt');
            expect(warnings[0].context).toBe('orientation selector');
            expect(warnings[0].specType).toBe('orientation');
            expect(warnings[0].specIndex).toBe(0);
            expect(warnings[0].name).toBe('nxt');
            expect(warnings[0].suggestion).toBe('next');
            // Our own wording, not sgq's pass-through: the name that missed and the
            // consequence, with the suggestion kept out of the sentence.
            expect(warnings[0].message).toBe(
                "'nxt' did not match any type, relation, or atom. "
                + 'This constraint does not apply to anything.'
            );
            // Constraints carry toHTML(), so the label names the actual constraint —
            // reduced to plain text, since it is rendered and logged as text.
            expect(warnings[0].label).toContain('nxt');
            expect(warnings[0].label).not.toContain('<code>');
        });

        it('calls a directive a directive, not a constraint', () => {
            const spec = parseLayoutSpec(`
directives:
  - atomStyle:
      selector: Nod
      fillStyle:
        color: red
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(1);
            expect(warnings[0].specType).toBe('atomStyle');
            expect(warnings[0].message).toContain('This directive does not apply to anything.');
        });

        it('indexes each constraint within its own section', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: next
      directions: [above]
  - orientation:
      selector: nxt
      directions: [left]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(1);
            expect(warnings[0].specIndex).toBe(1);
        });

        it('emits one warning per name, not one per evaluation', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: nxt
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(1);
        });

        it('reports two different constraints with the same typo separately', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: nxt
      directions: [above]
  - align:
      selector: nxt
      direction: horizontal
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(2);
            expect(warnings.map(w => w.specType).sort()).toEqual(['align', 'orientation']);
        });

        it('reports nothing when every selector resolves', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: next
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { warnings } = layoutInstance.generateLayout(instance);

            expect(warnings).toHaveLength(0);
        });

        it('carries warnings on the layout, so the diagram element sees them', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: nxt
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);
            const { layout } = layoutInstance.generateLayout(instance);

            expect(layout.warnings).toHaveLength(1);
            expect(layout.warnings![0].name).toBe('nxt');
        });

        it('resets warnings between renders rather than accumulating', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: nxt
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);

            layoutInstance.generateLayout(instance);
            layoutInstance.generateLayout(instance);
            const { warnings } = layoutInstance.generateLayout(instance);

            // An animated trace re-renders per frame; the badge must show the current
            // frame's state, not a list that grows without bound.
            expect(warnings).toHaveLength(1);
        });
    });

    // ── One bad selector must not take the others down ────────────

    describe('a failing selector is isolated to its own constraint', () => {
        /**
         * `evaluator.evaluate()` does not throw on a malformed selector — sgq returns
         * an error *result*, and the throw only happens later inside selectedTwoples().
         * At several sites that extractor sat outside the try/catch, so one bad
         * selector escaped the local handler and killed the whole layout.
         */
        it('does not abort the layout, and keeps the other constraints', () => {
            const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: "next +"
      directions: [above]
  - orientation:
      selector: next
      directions: [left]
  - align:
      selector: peer
      direction: horizontal
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);

            const result = layoutInstance.generateLayout(instance);

            expect(result.layout.nodes.length).toBe(3);
            const badSelector = result.selectorErrors.find(e => e.selector === 'next +');
            expect(badSelector).toBeDefined();
            expect(badSelector!.context).toBe('orientation selector');

            // The two good constraints still produced geometry.
            expect(result.layout.constraints.length).toBeGreaterThan(0);
        });

        it('leaves a group with a bad selector without dropping the rest', () => {
            const spec = parseLayoutSpec(`
constraints:
  - group:
      selector: "next +"
      name: broken
  - orientation:
      selector: next
      directions: [above]
`);
            const instance = new JSONDataInstance(graphData);
            const layoutInstance = new LayoutInstance(spec, createEvaluator(instance), 0, true);

            const result = layoutInstance.generateLayout(instance);

            expect(result.layout.nodes.length).toBe(3);
            expect(result.layout.groups).toHaveLength(0);
            expect(result.selectorErrors.some(e => e.context === 'groupBySelector selector')).toBe(true);
        });
    });
});
