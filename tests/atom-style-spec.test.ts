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
