/**
 * The legacy directive forms removed in 6.0.0.
 *
 * Each of these parsed and desugared with a deprecation warning for several
 * releases. They now throw. The alternative was worse: the parser ignores keys
 * it does not recognize, so simply dropping the code would have let an old spec
 * parse clean and quietly lose its styling — a wrong diagram with nothing to
 * suggest anything went wrong.
 *
 * These tests pin two things: that each form fails, and that the message names
 * the rewrite. The second half matters more than the first — the error is the
 * only migration instruction most authors will read.
 *
 * The size-validation cases at the bottom moved here when the dual-syntax suite
 * was deleted; they are about `size` itself, not about where it is written.
 */
import { describe, it, expect } from 'vitest';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { validateSpytialSpec } from '../src/components/NoCodeView/shims';
import { getLanguageManifest } from '../src/language/manifest';

describe('directive forms removed in 6.0.0', () => {
    it('rejects icon, naming atomStyle and how showLabels splits', () => {
        expect(() => parseLayoutSpec(
            "directives:\n  - icon: { selector: Node, path: '/i.svg', showLabels: true }",
        )).toThrow(/'icon' was removed in 6\.0\.0[\s\S]*atomStyle[\s\S]*iconStyle[\s\S]*showLabel/);
    });

    it('rejects atomColor, naming atomStyle and the border-preserving rewrite', () => {
        expect(() => parseLayoutSpec(
            "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
        )).toThrow(/'atomColor' was removed in 6\.0\.0[\s\S]*borderStyle\.color/);
    });

    it('rejects edgeColor, naming edgeStyle and each field it maps to', () => {
        expect(() => parseLayoutSpec(
            "directives:\n  - edgeColor: { field: next, value: red, style: dashed }",
        )).toThrow(/'edgeColor' was removed in 6\.0\.0[\s\S]*lineStyle\.color[\s\S]*lineStyle\.pattern/);
    });

    it('rejects size in the directives section, naming the section to move it to', () => {
        expect(() => parseLayoutSpec(
            'directives:\n  - size: { selector: Node, height: 10, width: 10 }',
        )).toThrow(/'size' was removed from the 'directives' section[\s\S]*constraints/);
    });

    it('rejects hideAtom in the directives section, naming the section to move it to', () => {
        expect(() => parseLayoutSpec(
            'directives:\n  - hideAtom: { selector: Node }',
        )).toThrow(/'hideAtom' was removed from the 'directives' section[\s\S]*constraints/);
    });

    it("rejects inferredEdge's inline styling, and says 'style' is spelled 'pattern' now", () => {
        expect(() => parseLayoutSpec(
            "directives:\n  - inferredEdge: { name: e, selector: next, color: '#f00' }",
        )).toThrow(/inferredEdge's inline[\s\S]*were removed in 6\.0\.0[\s\S]*lineStyle[\s\S]*pattern/);
    });

    it('accepts each replacement form', () => {
        const spec = parseLayoutSpec(`
constraints:
  - size: { selector: Node, height: 10, width: 10 }
  - hideAtom: { selector: Other }
directives:
  - atomStyle:
      selector: Node
      borderStyle: { color: '#ff0000' }
      iconStyle: { path: '/i.svg', placement: badge }
      showLabel: true
  - edgeStyle:
      field: next
      lineStyle: { color: red, pattern: dashed }
  - inferredEdge:
      name: e
      selector: next
      lineStyle: { color: '#f00' }
`);
        expect(spec.directives.atomStyles).toHaveLength(1);
        expect(spec.directives.edgeStyles).toHaveLength(1);
        expect(spec.directives.sizes).toHaveLength(1);
        expect(spec.directives.hiddenAtoms).toHaveLength(1);
        expect(spec.warnings ?? []).toHaveLength(0);
    });

    it('leaves nothing deprecated in the language manifest', () => {
        // The manifest is the contract code generators read. A form that throws
        // must not still be advertised as "deprecated but accepted".
        expect(getLanguageManifest('6.0.0').deprecations).toEqual([]);
    });

    it('reports the removed form as invalid through validateSpytialSpec', () => {
        const result = validateSpytialSpec(
            "directives:\n  - atomColor: { selector: Node, value: '#ff0000' }",
        );
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/atomColor/);
    });
});

describe('size validation rejects non-positive values', () => {
    const invalidSizes: { label: string; height: number; width: number }[] = [
        { label: 'zero width', height: 100, width: 0 },
        { label: 'zero height', height: 0, width: 100 },
        { label: 'negative width', height: 100, width: -50 },
        { label: 'negative height', height: -25, width: 100 },
        { label: 'both zero', height: 0, width: 0 },
    ];

    for (const { label, height, width } of invalidSizes) {
        it(`rejects size with ${label}`, () => {
            expect(() => parseLayoutSpec(`
constraints:
  - size:
      selector: Type1
      height: ${height}
      width: ${width}
`)).toThrow(/must be greater than 0/);
        });
    }
});
