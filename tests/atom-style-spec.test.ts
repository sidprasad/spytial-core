import { describe, it, expect } from 'vitest';
import {
    parseAtomStyleSpec,
    resolveAtomStyle,
    atomColorToAtomStyleRule,
} from '../src/layout/style/atom-style-spec';
import type { AtomStyleRule } from '../src/layout/style/atom-style-spec';
import { StyleCollisionError } from '../src/layout/style/style-resolver';

describe('parseAtomStyleSpec', () => {
    it('extracts fillStyle / borderStyle / textStyle blocks', () => {
        expect(
            parseAtomStyleSpec({
                fillStyle: { color: '#eef' },
                borderStyle: { color: '#33c', width: 2 },
                textStyle: { size: 'large', color: '#003' },
            }),
        ).toEqual({
            fillStyle: { color: '#eef' },
            borderStyle: { color: '#33c', width: 2 },
            textStyle: { size: 'large', color: '#003' },
        });
    });

    it('is sparse — omits unset keys and blocks', () => {
        expect(parseAtomStyleSpec({ fillStyle: { color: '#eef' } })).toEqual({ fillStyle: { color: '#eef' } });
        expect(parseAtomStyleSpec({})).toEqual({});
        expect(parseAtomStyleSpec(undefined)).toEqual({});
    });

    it('drops a non-positive border width', () => {
        expect(parseAtomStyleSpec({ borderStyle: { width: 0 } })).toEqual({});
        expect(parseAtomStyleSpec({ borderStyle: { color: '#000', width: -1 } })).toEqual({
            borderStyle: { color: '#000' },
        });
    });
});

describe('atomColorToAtomStyleRule — border-preserving desugar', () => {
    it('maps value → borderStyle.color (preserves the outline behavior)', () => {
        expect(atomColorToAtomStyleRule({ value: '#eef', selector: 'Person' })).toEqual({
            selector: 'Person',
            style: { borderStyle: { color: '#eef' } },
        });
    });

    it('returns null for a missing/blank selector (atomColor requires one — never a global recolor)', () => {
        expect(atomColorToAtomStyleRule({ value: '#eef' })).toBeNull();
        expect(atomColorToAtomStyleRule({ value: '#eef', selector: '' })).toBeNull();
        expect(atomColorToAtomStyleRule({ value: '#eef', selector: '   ' })).toBeNull();
    });
});

describe('resolveAtomStyle — compose + collide', () => {
    it('composes fill from one rule with border from another (inheritance via selectors)', () => {
        const rules: AtomStyleRule[] = [
            { selector: 'Node', style: { fillStyle: { color: '#eef' } } },
            { selector: 'RedNode', style: { borderStyle: { color: 'red' } } },
        ];
        expect(resolveAtomStyle(rules)).toEqual({
            fillStyle: { color: '#eef' },
            borderStyle: { color: 'red' },
        });
    });

    it('HARD ERRORS when two matching rules disagree on a leaf', () => {
        const rules: AtomStyleRule[] = [
            { selector: 'Node', style: { borderStyle: { color: 'blue' } } },
            { selector: 'RedNode', style: { borderStyle: { color: 'red' } } },
        ];
        expect(() => resolveAtomStyle(rules)).toThrow(StyleCollisionError);
    });
});
