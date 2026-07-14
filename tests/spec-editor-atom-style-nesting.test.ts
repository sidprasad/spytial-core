/**
 * Builder/registry coverage for the nested `atomStyle` directive: it's registered
 * with nested fillStyle/borderStyle/textStyle blocks, `atomColor` is hidden from
 * the add menu (deprecated), nested params round-trip through the codec, and
 * emission stays sparse (empty blocks dropped, no seeded defaults). Mirrors
 * spec-editor-style-nesting.test.ts for the edge side.
 */
import { describe, it, expect } from 'vitest';
import {
    parseYamlToState,
    serializeStateToYaml,
    getDefinitions,
    defaultParamsFor,
} from '../src/spec-editor';

describe('registry — atomStyle registration + atomColor deprecation', () => {
    it('offers atomStyle in the directive add-menu and hides deprecated atomColor', () => {
        const menu = getDefinitions('directive').map((d) => d.type);
        expect(menu).toContain('atomStyle');
        expect(menu).not.toContain('atomColor');
    });

    it('still resolves atomColor when deprecated entries are requested', () => {
        const all = getDefinitions('directive', { includeDeprecated: true }).map((d) => d.type);
        expect(all).toContain('atomColor');
        expect(all).toContain('atomStyle');
    });

    it('seeds no defaults for atomStyle — style blocks stay sparse', () => {
        expect(defaultParamsFor('atomStyle')).toEqual({});
    });
});

describe('codec — nested atomStyle blocks', () => {
    const NESTED = [
        'directives:',
        '  - atomStyle:',
        '      selector: Person',
        '      fillStyle:',
        "        color: '#e0f2ff'",
        '      borderStyle:',
        "        color: '#0369a1'",
        '        width: 4',
        '      textStyle:',
        "        color: '#b91c1c'",
    ].join('\n');

    it('ingests nested fillStyle/borderStyle/textStyle into nested params', () => {
        const state = parseYamlToState(NESTED);
        const item = state.directives.find((d) => d.type === 'atomStyle');
        expect(item?.params).toEqual({
            selector: 'Person',
            fillStyle: { color: '#e0f2ff' },
            borderStyle: { color: '#0369a1', width: 4 },
            textStyle: { color: '#b91c1c' },
        });
    });

    it('round-trips the nested blocks (emit → parse is stable)', () => {
        const first = parseYamlToState(NESTED);
        const out = serializeStateToYaml(first);
        const second = parseYamlToState(out);
        expect(second.directives.find((d) => d.type === 'atomStyle')?.params).toEqual(
            first.directives.find((d) => d.type === 'atomStyle')?.params,
        );
    });

    it('drops an added-but-empty block on emit (sparse)', () => {
        const withEmpty = [
            'directives:',
            '  - atomStyle:',
            '      selector: Person',
            "      fillStyle: { color: '#e0f2ff' }",
            '      borderStyle: {}',
        ].join('\n');
        const out = serializeStateToYaml(parseYamlToState(withEmpty));
        expect(out).toContain('fillStyle');
        expect(out).not.toContain('borderStyle'); // empty block omitted
    });
});
