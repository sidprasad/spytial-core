/**
 * The inferredEdge Builder def now uses the shared nested lineStyle/textStyle
 * blocks (like edgeStyle), instead of flat color/style/weight fields. This
 * verifies the nested params round-trip through the codec and that the emitted
 * (nested) form parses cleanly — i.e. the Builder no longer emits the deprecated
 * inline shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseYamlToState, serializeStateToYaml } from '../src/spec-editor';
import { parseLayoutSpec } from '../src/layout/layoutspec';

const NESTED = [
    'directives:',
    '  - inferredEdge:',
    '      name: reachable',
    "      selector: '^next'",
    '      lineStyle:',
    "        color: '#a0f'",
    '        pattern: dotted',
    '        weight: 2',
    '      textStyle:',
    '        size: small',
].join('\n');

describe('inferredEdge Builder — nested lineStyle/textStyle', () => {
    it('ingests nested blocks into nested params', () => {
        const state = parseYamlToState(NESTED);
        const item = state.directives.find((d) => d.type === 'inferredEdge');
        expect(item?.params).toEqual({
            name: 'reachable',
            selector: '^next',
            lineStyle: { color: '#a0f', pattern: 'dotted', weight: 2 },
            textStyle: { size: 'small' },
        });
    });

    it('round-trips the nested blocks (emit → parse is stable)', () => {
        const first = parseYamlToState(NESTED);
        const out = serializeStateToYaml(first);
        const second = parseYamlToState(out);
        expect(second.directives.find((d) => d.type === 'inferredEdge')?.params).toEqual(
            first.directives.find((d) => d.type === 'inferredEdge')?.params,
        );
    });

    it('the Builder-emitted (nested) form parses with no deprecation warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const out = serializeStateToYaml(parseYamlToState(NESTED));
        parseLayoutSpec(out);
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("inferredEdge's inline"));
        warn.mockRestore();
    });
});
