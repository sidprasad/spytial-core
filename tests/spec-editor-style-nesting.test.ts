/**
 * Builder/registry coverage for the nested style directives: `edgeStyle` is
 * registered with nested lineStyle/textStyle blocks, `edgeColor` is hidden from
 * the add menu (deprecated), nested params round-trip through the codec, and
 * emission stays sparse (empty blocks dropped, no seeded defaults).
 */
import { describe, it, expect } from 'vitest';
import {
    parseYamlToState,
    serializeStateToYaml,
    getDefinitions,
    defaultParamsFor,
} from '../src/spec-editor';

describe('registry — edgeStyle registration + edgeColor deprecation', () => {
    it('offers edgeStyle in the directive add-menu and hides deprecated edgeColor', () => {
        const menu = getDefinitions('directive').map((d) => d.type);
        expect(menu).toContain('edgeStyle');
        expect(menu).not.toContain('edgeColor');
    });

    it('still resolves edgeColor when deprecated entries are requested', () => {
        const all = getDefinitions('directive', { includeDeprecated: true }).map((d) => d.type);
        expect(all).toContain('edgeColor');
        expect(all).toContain('edgeStyle');
    });

    it('seeds no defaults for edgeStyle — style blocks stay sparse', () => {
        expect(defaultParamsFor('edgeStyle')).toEqual({});
    });
});

describe('codec — nested edgeStyle blocks', () => {
    const NESTED = [
        'directives:',
        '  - edgeStyle:',
        '      field: knows',
        '      lineStyle:',
        "        color: '#3366cc'",
        '        pattern: dashed',
        '      textStyle:',
        '        size: small',
    ].join('\n');

    it('ingests nested lineStyle/textStyle into nested params', () => {
        const state = parseYamlToState(NESTED);
        const item = state.directives.find((d) => d.type === 'edgeStyle');
        expect(item?.params).toEqual({
            field: 'knows',
            lineStyle: { color: '#3366cc', pattern: 'dashed' },
            textStyle: { size: 'small' },
        });
    });

    it('round-trips the nested blocks (emit → parse is stable)', () => {
        const first = parseYamlToState(NESTED);
        const out = serializeStateToYaml(first);
        const second = parseYamlToState(out);
        expect(second.directives.find((d) => d.type === 'edgeStyle')?.params).toEqual(
            first.directives.find((d) => d.type === 'edgeStyle')?.params,
        );
    });

    it('drops an added-but-empty block on emit (sparse)', () => {
        const withEmpty = [
            'directives:',
            '  - edgeStyle:',
            '      field: knows',
            "      lineStyle: { color: '#3366cc' }",
            '      textStyle: {}',
        ].join('\n');
        const out = serializeStateToYaml(parseYamlToState(withEmpty));
        expect(out).toContain('lineStyle');
        expect(out).not.toContain('textStyle'); // empty block omitted
    });
});

describe('codec — nested attribute/tag textStyle blocks', () => {
    it('registers the textStyle group on attribute and tag', () => {
        const byType = (t: string) => getDefinitions('directive').find((d) => d.type === t);
        for (const type of ['attribute', 'tag']) {
            const ts = byType(type)?.fields.find((f) => f.key === 'textStyle');
            expect(ts, `${type} should expose a textStyle field`).toBeDefined();
            expect(ts?.kind).toBe('group');
            expect(ts?.children?.map((c) => c.key)).toEqual(['size', 'color']);
        }
    });

    it('ingests + round-trips an attribute textStyle block (size + color)', () => {
        const yaml = [
            'directives:',
            '  - attribute:',
            '      field: age',
            '      textStyle:',
            '        size: large',
            "        color: '#c0392b'",
        ].join('\n');
        const first = parseYamlToState(yaml);
        expect(first.directives.find((d) => d.type === 'attribute')?.params).toEqual({
            field: 'age',
            textStyle: { size: 'large', color: '#c0392b' },
        });
        // emit → parse is stable
        const second = parseYamlToState(serializeStateToYaml(first));
        expect(second.directives.find((d) => d.type === 'attribute')?.params).toEqual(
            first.directives.find((d) => d.type === 'attribute')?.params,
        );
    });

    it('ingests + round-trips a tag textStyle block (size + color)', () => {
        const yaml = [
            'directives:',
            '  - tag:',
            '      toTag: Person',
            '      name: role',
            '      value: role',
            '      textStyle:',
            '        size: small',
            "        color: '#2980b9'",
        ].join('\n');
        const first = parseYamlToState(yaml);
        expect(first.directives.find((d) => d.type === 'tag')?.params).toEqual({
            toTag: 'Person',
            name: 'role',
            value: 'role',
            textStyle: { size: 'small', color: '#2980b9' },
        });
        const second = parseYamlToState(serializeStateToYaml(first));
        expect(second.directives.find((d) => d.type === 'tag')?.params).toEqual(
            first.directives.find((d) => d.type === 'tag')?.params,
        );
    });
});
