import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { validateItem, newId, type SpecItem } from '../src/spec-editor';
import { validateSpytialSpec } from '../src/components/NoCodeView';

/**
 * Tests that using a deprecated spec form is *visible* — on the diagram, the
 * same badge selector warnings use, and in the spec editor.
 *
 * The parse has always warned about `atomColor`, `edgeColor`, group-by-field and
 * `inferredEdge`'s inline line styling, but only to `console.warn` and to a
 * field on the parse result. Neither reaches the person editing the spec: the
 * console is a place you have to already suspect something to look, and the
 * hosts that read the result (spytial-py, spytial-rust, the docs site) hand the
 * diagram element only the layout. So a spec sitting on a form that is being
 * removed rendered exactly like one that isn't.
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
    ],
    relations: [
        {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }],
        },
    ],
};

/** Parse with `console.warn` silenced (the parse writes there too, for back-compat). */
function parseQuietly(yaml: string) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        return parseLayoutSpec(yaml);
    } finally {
        warn.mockRestore();
    }
}

function layoutWarningsFor(yaml: string) {
    const spec = parseQuietly(yaml);
    const instance = new JSONDataInstance(graphData);
    const li = new LayoutInstance(spec, createEvaluator(instance), 0, true);
    return li.generateLayout(instance).warnings;
}

function item(type: string, params: Record<string, unknown>, kind: 'constraint' | 'directive'): SpecItem {
    return { id: newId(), kind, type, params };
}

describe('Deprecation warnings', () => {
    // ── Parse level: every deprecated form names itself ────────────

    describe('parseLayoutSpec attributes each deprecation to a spec form', () => {
        const cases: Array<[string, string]> = [
            ['atomColor', "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }"],
            ['edgeColor', "directives:\n  - edgeColor: { field: next, value: '#111111' }"],
            ['icon', 'directives:\n  - icon: { selector: Node, path: person }'],
            [
                'inferredEdge',
                "directives:\n  - inferredEdge: { name: n, selector: next, color: '#00ff00' }",
            ],
            [
                'group',
                'constraints:\n  - group: { field: next, groupOn: 0, addToGroup: 1 }',
            ],
        ];

        for (const [specType, yaml] of cases) {
            it(`reports ${specType} with a machine-readable specType`, () => {
                const warnings = (parseQuietly(yaml).warnings ?? []).filter(
                    (w) => w.code === 'deprecated',
                );
                expect(warnings).toHaveLength(1);
                expect(warnings[0].specType).toBe(specType);
                // The message names the replacement, not just the problem.
                expect(warnings[0].message.length).toBeGreaterThan(0);
            });
        }

        it('names the replacement for group-by-field', () => {
            const warnings = parseQuietly(
                'constraints:\n  - group: { field: next, groupOn: 0, addToGroup: 1 }',
            ).warnings!;
            expect(warnings[0].message).toMatch(/selector/);
        });

        it('leaves a spec on the supported forms clean', () => {
            const spec = parseQuietly(
                "directives:\n  - atomStyle: { selector: Node, fillStyle: { color: '#ff0000' } }\n" +
                'constraints:\n  - group: { selector: next, name: g }',
            );
            expect(spec.warnings).toEqual([]);
        });
    });

    // ── Diagram: the deprecation rides out on the layout ────────────

    describe('generateLayout forwards parse deprecations onto the layout', () => {
        it('carries the deprecation as a layout warning, labelled by form', () => {
            const warnings = layoutWarningsFor(
                "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
            );

            const deprecations = warnings.filter((w) => w.code === 'deprecated');
            expect(deprecations).toHaveLength(1);
            expect(deprecations[0].severity).toBe('warning');
            expect(deprecations[0].specType).toBe('atomColor');
            expect(deprecations[0].label).toBe('atomColor');
            expect(deprecations[0].message).toMatch(/atomColor/);
            // Not about a selector — it was raised before anything was evaluated.
            expect(deprecations[0].selector).toBeUndefined();
        });

        it('reaches the diagram element by riding on the layout itself', () => {
            const spec = parseQuietly(
                "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
            );
            const instance = new JSONDataInstance(graphData);
            const li = new LayoutInstance(spec, createEvaluator(instance), 0, true);

            const { layout } = li.generateLayout(instance);
            expect(layout.warnings?.some((w) => w.code === 'deprecated')).toBe(true);
        });

        it('reports one warning per deprecated form, not per use of it', () => {
            const warnings = layoutWarningsFor(
                "directives:\n" +
                "  - atomColor: { selector: A, value: '#ff0000' }\n" +
                "  - atomColor: { selector: B, value: '#00ff00' }",
            );
            expect(warnings.filter((w) => w.code === 'deprecated')).toHaveLength(1);
        });

        it('reports each deprecated form separately', () => {
            const warnings = layoutWarningsFor(
                "directives:\n" +
                "  - atomColor: { selector: Node, value: '#ff0000' }\n" +
                "  - edgeColor: { field: next, value: '#111111' }",
            );
            expect(
                warnings.filter((w) => w.code === 'deprecated').map((w) => w.specType).sort(),
            ).toEqual(['atomColor', 'edgeColor']);
        });

        it('keeps reporting on every render — the spec is still deprecated', () => {
            const spec = parseQuietly(
                "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
            );
            const instance = new JSONDataInstance(graphData);
            const li = new LayoutInstance(spec, createEvaluator(instance), 0, true);

            const first = li.generateLayout(instance).warnings;
            const second = li.generateLayout(instance).warnings;
            // Same list each frame: replayed, not accumulated (a trace would
            // otherwise grow one copy per frame).
            expect(second.filter((w) => w.code === 'deprecated')).toHaveLength(1);
            expect(second.length).toBe(first.length);
        });

        it('sits alongside selector warnings rather than replacing them', () => {
            const warnings = layoutWarningsFor(
                "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }\n" +
                'constraints:\n  - orientation: { selector: nxt, directions: [left] }',
            );
            expect(warnings.map((w) => w.code).sort()).toEqual([
                'deprecated',
                'unresolved-name',
            ]);
        });

        it('says nothing for a spec on the supported forms', () => {
            const warnings = layoutWarningsFor(
                "directives:\n  - atomStyle: { selector: Node, fillStyle: { color: '#ff0000' } }",
            );
            expect(warnings).toEqual([]);
        });
    });

    // ── Spec validation API ────────────────────────────────────────

    describe('validateSpytialSpec', () => {
        it('reports a deprecated form among its warnings, without failing', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = validateSpytialSpec(
                "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
            );
            warn.mockRestore();

            expect(result.isValid).toBe(true);
            expect(result.error).toBe(null);
            expect(result.warnings).toContainEqual(expect.stringContaining('atomColor'));
            // The console prefix is not part of a returned message.
            expect(result.warnings.some((w) => w.startsWith('[spytial]'))).toBe(false);
        });

        it('stays quiet for a spec on the supported forms', () => {
            const result = validateSpytialSpec(
                "directives:\n  - atomStyle: { selector: Node, fillStyle: { color: '#ff0000' } }",
            );
            expect(result.warnings).toHaveLength(0);
        });
    });

    // ── Spec editor: the same fact, in the builder ─────────────────

    describe('spec editor diagnostics', () => {
        it('flags a deprecated type and names its replacement', () => {
            const diags = validateItem(
                item('atomColor', { selector: 'Node', value: '#ff0000' }, 'directive'),
            );
            const deprecated = diags.filter((d) => d.code === 'deprecated');
            expect(deprecated).toHaveLength(1);
            expect(deprecated[0].severity).toBe('warning');
            expect(deprecated[0].message).toMatch(/atomStyle/);
        });

        it('flags a deprecated *key* on a supported type, naming its replacement', () => {
            const diags = validateItem(
                item('inferredEdge', { name: 'e', selector: 'next', color: '#f00' }, 'directive'),
            );
            const deprecated = diags.filter((d) => d.code === 'deprecated');
            expect(deprecated).toHaveLength(1);
            expect(deprecated[0].message).toMatch(/lineStyle\.color/);
            // Item-level, not field-level: `color` is not a builder field, so a
            // field-scoped diagnostic would render against a control that does
            // not exist.
            expect(deprecated[0].fieldKey).toBeUndefined();
        });

        it('does not call a deprecated key unknown', () => {
            const diags = validateItem(
                item(
                    'inferredEdge',
                    { name: 'e', selector: 'next', color: '#f00', style: 'dashed', weight: 2 },
                    'directive',
                ),
            );
            expect(diags.filter((d) => d.code === 'unknown-key')).toHaveLength(0);
            expect(diags.filter((d) => d.code === 'deprecated')).toHaveLength(3);
        });

        it('does not mistake a prototype member for a deprecated key', () => {
            // The deprecated-key table is looked up with a key straight out of
            // the spec. Backed by an object literal, `table['toString']` answers
            // with something off Object.prototype — so a spec key named after
            // any prototype member drew a nonsense deprecation naming a native
            // function, and swallowed the unknown-key warning it should have got.
            const diags = validateItem(
                item('orientation', { selector: 'p', directions: ['left'], toString: 'x' }, 'constraint'),
            );
            expect(diags.filter((d) => d.code === 'deprecated')).toHaveLength(0);
            expect(diags.filter((d) => d.code === 'unknown-key')).toHaveLength(1);
        });

        it('leaves the supported form of the same directive clean', () => {
            const diags = validateItem(
                item(
                    'inferredEdge',
                    { name: 'e', selector: 'next', lineStyle: { color: '#f00' } },
                    'directive',
                ),
            );
            expect(diags).toHaveLength(0);
        });
    });
});
