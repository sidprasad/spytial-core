import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

/**
 * Operators that simple-graph-query 3.1.0 newly evaluates correctly.
 *
 * Under 3.0.1 each of these either threw, silently returned the empty set, or
 * answered as if a different operator had been written — so a selector using
 * one produced a wrong diagram rather than a complaint. The fixes live in sgq,
 * but selectors are user-facing spytial surface, so pin the behaviour here:
 * these are the expressions a spec author may now write.
 *
 * Companion to `selector-warnings.test.ts`, which covers the diagnostics side
 * of the same evaluator.
 */

const data: IJsonDataInstance = {
    atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' },
    ],
    relations: [
        {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
                { atoms: ['A', 'B'], types: ['Node', 'Node'] },
                { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ],
        },
        {
            id: 'peer',
            name: 'peer',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['A', 'C'], types: ['Node', 'Node'] }],
        },
    ],
};

function evaluate(expr: string) {
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: new JSONDataInstance(data) });
    return evaluator.evaluate(expr);
}

/** Pairs as `src->dst` strings, sorted, so assertions read at a glance. */
function pairs(expr: string): string[] {
    const result = evaluate(expr);
    expect(result.isError()).toBe(false);
    return result.selectedTwoples().map((t) => t.join('->')).sort();
}

describe('simple-graph-query 3.1.0 operators', () => {
    it('evaluates ++ as relational override', () => {
        // peer replaces next's tuples for the atoms peer constrains (A);
        // B->C is untouched.
        expect(pairs('next ++ peer')).toEqual(['A->C', 'B->C']);
    });

    it('evaluates <: as domain restriction', () => {
        expect(pairs('Node <: next')).toEqual(['A->B', 'B->C']);
    });

    it('evaluates :> as range restriction', () => {
        expect(pairs('next :> Node')).toEqual(['A->B', 'B->C']);
    });

    it('reads ni as reverse containment, not negated containment', () => {
        // A.next is B, so `A.next ni B` asks "is B in A.next" -> true.
        // 3.0.1 read it as `not (A.next in B)` and answered false.
        const result = evaluate('A.next ni B');
        expect(result.isError()).toBe(false);
        expect(result.singleResult()).toBe(true);
    });

    it('treats =< as an alias of <=', () => {
        const alias = evaluate('1 =< 2');
        expect(alias.isError()).toBe(false);
        expect(alias.singleResult()).toBe(evaluate('1 <= 2').singleResult());
    });

    it('rejects an arrow carrying multiplicity annotations', () => {
        // Declaration syntax, not an expression. 3.0.1 answered with the full
        // cross product, as if the annotations had not been written.
        expect(evaluate('Node one -> lone Node').isError()).toBe(true);
    });
});
