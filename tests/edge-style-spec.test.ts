import { describe, it, expect } from 'vitest';
import { parseEdgeStyleSpec, resolveEdgeStyle } from '../src/layout/style/edge-style-spec';
import type { EdgeStyleRule } from '../src/layout/style/edge-style-spec';
import { StyleCollisionError } from '../src/layout/style/style-resolver';
import { parseLayoutSpec } from '../src/layout/layoutspec';

describe('parseEdgeStyleSpec', () => {
    it('extracts the nested lineStyle block', () => {
        expect(
            parseEdgeStyleSpec({ lineStyle: { color: '#36c', pattern: 'dashed', weight: 2, highlight: '#fc0' } }),
        ).toEqual({ lineStyle: { color: '#36c', pattern: 'dashed', weight: 2, highlight: '#fc0' } });
    });

    it('extracts the textStyle block and behavior flags', () => {
        expect(
            parseEdgeStyleSpec({ textStyle: { size: 'small', color: '#666' }, showLabel: true, hidden: false }),
        ).toEqual({ textStyle: { size: 'small', color: '#666' }, showLabel: true, hidden: false });
    });

    it('is sparse — omits keys the author did not set', () => {
        expect(parseEdgeStyleSpec({ lineStyle: { color: '#36c' } })).toEqual({ lineStyle: { color: '#36c' } });
    });

    it('drops an invalid line pattern rather than inventing one', () => {
        expect(parseEdgeStyleSpec({ lineStyle: { pattern: 'zigzag' } })).toEqual({});
    });

    it('drops an invalid text size', () => {
        expect(parseEdgeStyleSpec({ textStyle: { size: 'huge' } })).toEqual({});
    });

    it('drops a non-positive or non-finite weight', () => {
        expect(parseEdgeStyleSpec({ lineStyle: { weight: 0 } })).toEqual({});
        expect(parseEdgeStyleSpec({ lineStyle: { weight: -3 } })).toEqual({});
        expect(parseEdgeStyleSpec({ lineStyle: { color: '#000', weight: 2 } })).toEqual({
            lineStyle: { color: '#000', weight: 2 },
        });
    });

    it('ignores field/selector/filter (matching keys, not style)', () => {
        expect(
            parseEdgeStyleSpec({ field: 'knows', selector: 'Person', filter: 'x', lineStyle: { color: '#000' } }),
        ).toEqual({ lineStyle: { color: '#000' } });
    });

    it('produces an empty spec for empty or non-object input', () => {
        expect(parseEdgeStyleSpec({})).toEqual({});
        expect(parseEdgeStyleSpec(undefined)).toEqual({});
        expect(parseEdgeStyleSpec('nope')).toEqual({});
    });
});

describe('resolveEdgeStyle', () => {
    it('merges disjoint leaves from two matching rules', () => {
        const rules: EdgeStyleRule[] = [
            { field: 'knows', selector: 'A', style: { lineStyle: { color: '#36c' } } },
            { field: 'knows', selector: 'B', style: { textStyle: { size: 'small' } } },
        ];
        expect(resolveEdgeStyle(rules)).toEqual({ lineStyle: { color: '#36c' }, textStyle: { size: 'small' } });
    });

    it('merges lineStyle sub-leaves without collision', () => {
        const rules: EdgeStyleRule[] = [
            { field: 'knows', selector: 'A', style: { lineStyle: { color: '#36c' } } },
            { field: 'knows', selector: 'B', style: { lineStyle: { weight: 2 } } },
        ];
        expect(resolveEdgeStyle(rules)).toEqual({ lineStyle: { color: '#36c', weight: 2 } });
    });

    it('HARD ERRORS when two matching rules disagree on a leaf', () => {
        const rules: EdgeStyleRule[] = [
            { field: 'knows', selector: 'A', style: { lineStyle: { color: '#36c' } } },
            { field: 'knows', selector: 'B', style: { lineStyle: { color: '#c33' } } },
        ];
        expect(() => resolveEdgeStyle(rules)).toThrow(StyleCollisionError);
    });
});

describe('parseLayoutSpec — edgeStyle directive', () => {
    it('parses an edgeStyle directive into directives.edgeStyles', () => {
        const yaml = [
            'directives:',
            '  - edgeStyle:',
            '      field: knows',
            '      selector: Person',
            '      lineStyle:',
            "        color: '#36c'",
            '        pattern: dashed',
            '        weight: 2',
            '      textStyle:',
            '        size: small',
        ].join('\n');

        const spec = parseLayoutSpec(yaml);
        expect(spec.directives.edgeStyles).toHaveLength(1);
        const rule = spec.directives.edgeStyles[0];
        expect(rule.field).toBe('knows');
        expect(rule.selector).toBe('Person');
        expect(rule.style).toEqual({
            lineStyle: { color: '#36c', pattern: 'dashed', weight: 2 },
            textStyle: { size: 'small' },
        });
    });

    it('defaults to an empty edgeStyles list when none are present', () => {
        expect(parseLayoutSpec('').directives.edgeStyles).toEqual([]);
    });
});
