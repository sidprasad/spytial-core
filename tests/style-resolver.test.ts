import { describe, it, expect } from 'vitest';
import {
    resolveStyle,
    resolveTypedStyle,
    flattenLeaves,
    StyleCollisionError,
} from '../src/layout/style/style-resolver';
import type { StyleContribution, SparseStyle } from '../src/layout/style/style-resolver';

/** Terse contribution builder for the tests. */
const rule = (source: string, style: SparseStyle): StyleContribution => ({ source, style });
/** Flattened leaves as a plain object, for readable assertions. */
const leaves = (s: SparseStyle) => Object.fromEntries(flattenLeaves(s));

describe('flattenLeaves', () => {
    it('flattens nested blocks into dotted leaf paths', () => {
        expect(leaves({ border: { color: 'red', width: 2 } })).toEqual({
            'border.color': 'red',
            'border.width': 2,
        });
    });

    it('keeps top-level leaves as-is', () => {
        expect(leaves({ hidden: true })).toEqual({ hidden: true });
    });

    it('treats null/undefined leaves as unspecified (sparse)', () => {
        expect(leaves({ a: undefined as unknown as string, b: 'x' })).toEqual({ b: 'x' });
    });

    it('produces nothing for an empty partial', () => {
        expect(leaves({})).toEqual({});
    });
});

describe('resolveStyle — composition of partial styles', () => {
    it('merges disjoint leaves from two rules', () => {
        const out = resolveStyle([
            rule('A', { fill: { color: 'gray' } }),
            rule('B', { border: { color: 'red' } }),
        ]);
        expect(out).toEqual({ fill: { color: 'gray' }, border: { color: 'red' } });
    });

    it('deep-merges different leaves inside the same block (no collision)', () => {
        const out = resolveStyle([
            rule('A', { border: { color: 'blue' } }),
            rule('B', { border: { width: 2 } }),
        ]);
        expect(out).toEqual({ border: { color: 'blue', width: 2 } });
    });

    it('an empty partial contributes nothing', () => {
        expect(resolveStyle([rule('A', {})])).toEqual({});
    });
});

describe('resolveStyle — no silent override', () => {
    it('accepts the same leaf set to the SAME value by two rules', () => {
        const out = resolveStyle([
            rule('A', { border: { color: 'red' } }),
            rule('B', { border: { color: 'red' } }),
        ]);
        expect(out).toEqual({ border: { color: 'red' } });
    });

    it('throws when two rules set the same leaf to DIFFERENT values', () => {
        expect(() =>
            resolveStyle([
                rule('A', { border: { color: 'blue' } }),
                rule('B', { border: { color: 'red' } }),
            ]),
        ).toThrow(StyleCollisionError);
    });

    it('detects the collision regardless of contribution order', () => {
        const a = rule('A', { border: { color: 'blue' } });
        const b = rule('B', { border: { color: 'red' } });
        expect(() => resolveStyle([a, b])).toThrow(StyleCollisionError);
        expect(() => resolveStyle([b, a])).toThrow(StyleCollisionError);
    });

    it('reports the dotted path, both sources, and both values', () => {
        let err: unknown;
        try {
            resolveStyle([
                rule('atomStyle(Node)', { border: { color: 'blue' } }),
                rule('atomStyle(RedNode)', { border: { color: 'red' } }),
            ]);
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(StyleCollisionError);
        const c = err as StyleCollisionError;
        expect(c.path).toBe('border.color');
        expect(c.existing.value).toBe('blue');
        expect(c.incoming.value).toBe('red');
        expect(new Set([c.existing.source, c.incoming.source])).toEqual(
            new Set(['atomStyle(Node)', 'atomStyle(RedNode)']),
        );
    });
});

describe('resolveStyle — defaults applied last', () => {
    it('fills only leaves left unset', () => {
        const out = resolveStyle([rule('A', { line: { weight: 3 } })], {
            defaults: { line: { weight: 1, style: 'solid' } },
        });
        expect(out).toEqual({ line: { weight: 3, style: 'solid' } });
    });

    it('a default never collides with an explicit value', () => {
        expect(() =>
            resolveStyle([rule('A', { line: { weight: 3 } })], {
                defaults: { line: { weight: 1 } },
            }),
        ).not.toThrow();
    });
});

describe('resolveTypedStyle — inheritance along the type ancestry', () => {
    // getAtomType(id).types is most-specific first: [ownType, ...ancestors, 'univ'].
    const chain = ['RedNode', 'Node', 'univ'];

    it('gap-fills: a supertype supplies leaves the subtype leaves unset', () => {
        const rules = new Map<string, StyleContribution[]>([
            ['Node', [rule('atomStyle(Node)', { fill: { color: 'gray' } })]],
            ['RedNode', [rule('atomStyle(RedNode)', { border: { color: 'red' } })]],
        ]);
        expect(resolveTypedStyle(chain, rules)).toEqual({
            fill: { color: 'gray' },
            border: { color: 'red' },
        });
    });

    it('inherits a leaf specified only on an ancestor', () => {
        const rules = new Map<string, StyleContribution[]>([
            ['Node', [rule('atomStyle(Node)', { fill: { color: 'gray' } })]],
        ]);
        expect(resolveTypedStyle(chain, rules)).toEqual({ fill: { color: 'gray' } });
    });

    it('HARD ERRORS when a subtype and its supertype set the same leaf differently', () => {
        // The canonical example: no override, ever — even for comparable types.
        const rules = new Map<string, StyleContribution[]>([
            ['Node', [rule('atomStyle(Node)', { border: { color: 'blue' } })]],
            ['RedNode', [rule('atomStyle(RedNode)', { border: { color: 'red' } })]],
        ]);
        expect(() => resolveTypedStyle(chain, rules)).toThrow(StyleCollisionError);
    });

    it('allows a subtype and supertype to AGREE on a leaf', () => {
        const rules = new Map<string, StyleContribution[]>([
            ['Node', [rule('atomStyle(Node)', { border: { color: 'red' } })]],
            ['RedNode', [rule('atomStyle(RedNode)', { border: { color: 'red' } })]],
        ]);
        expect(resolveTypedStyle(chain, rules)).toEqual({ border: { color: 'red' } });
    });

    it('HARD ERRORS on two rules at the same level that disagree', () => {
        const rules = new Map<string, StyleContribution[]>([
            [
                'Node',
                [
                    rule('atomStyle(Node)#1', { fill: { color: 'blue' } }),
                    rule('atomStyle(Node)#2', { fill: { color: 'green' } }),
                ],
            ],
        ]);
        expect(() => resolveTypedStyle(['Node', 'univ'], rules)).toThrow(StyleCollisionError);
    });

    it('ignores types in the chain that carry no rules', () => {
        const rules = new Map<string, StyleContribution[]>([
            ['RedNode', [rule('atomStyle(RedNode)', { fill: { color: 'red' } })]],
        ]);
        expect(resolveTypedStyle(chain, rules)).toEqual({ fill: { color: 'red' } });
    });

    it('applies defaults after inheritance', () => {
        const rules = new Map<string, StyleContribution[]>([
            ['RedNode', [rule('atomStyle(RedNode)', { fill: { color: 'red' } })]],
        ]);
        expect(
            resolveTypedStyle(chain, rules, {
                defaults: { fill: { color: 'white' }, opacity: 1 },
            }),
        ).toEqual({ fill: { color: 'red' }, opacity: 1 });
    });
});
