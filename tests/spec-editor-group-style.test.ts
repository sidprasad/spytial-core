/**
 * Builder coverage for the group directive's style surfaces:
 *   - the group's own label `textStyle` round-trips through the codec;
 *   - a block-form `addEdge` (`{ points, lineStyle, textStyle }`) authored in
 *     YAML keeps its direction when ingested (the Builder doesn't yet model the
 *     connector's own styling, but must not lose the direction).
 */
import { describe, it, expect } from 'vitest';
import { parseYamlToState, serializeStateToYaml } from '../src/spec-editor';

describe('group Builder — label textStyle', () => {
    const YAML = [
        'constraints:',
        '  - group:',
        '      selector: Team.members',
        '      name: Team',
        '      textStyle:',
        "        color: '#7c3aed'",
    ].join('\n');

    it('ingests the group label textStyle', () => {
        const state = parseYamlToState(YAML);
        const item = state.constraints.find((c) => c.type === 'groupselector');
        expect(item?.params.textStyle).toEqual({ color: '#7c3aed' });
    });

    it('round-trips the group label textStyle (emit → parse is stable)', () => {
        const first = parseYamlToState(YAML);
        const out = serializeStateToYaml(first);
        const second = parseYamlToState(out);
        expect(second.constraints.find((c) => c.type === 'groupselector')?.params.textStyle).toEqual({
            color: '#7c3aed',
        });
    });
});

describe('group Builder — block addEdge direction is preserved', () => {
    it('keeps the connector direction from a block-form addEdge', () => {
        const YAML = [
            'constraints:',
            '  - group:',
            '      selector: Team.members',
            '      name: Team',
            '      addEdge:',
            '        points: togroup',
            "        lineStyle: { color: '#0aa', pattern: dashed }",
        ].join('\n');
        const state = parseYamlToState(YAML);
        const item = state.constraints.find((c) => c.type === 'groupselector');
        expect(item?.params.addEdge).toBe('togroup'); // direction survives (styling is YAML-only for now)
    });
});
