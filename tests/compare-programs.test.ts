import { describe, it, expect } from 'vitest';
import { comparePrograms, ComparisonProgram } from '../src/layout/compare-programs';

const datum = {
    atoms: [{ id: 'a', type: 'Node', label: 'a' }, { id: 'b', type: 'Node', label: 'b' }],
    relations: [{ id: 'r', name: 'r', types: ['Node', 'Node'], tuples: [{ atoms: ['a', 'b'], types: ['Node', 'Node'] }] }],
};
const right = { orientation: { selector: 'r', directions: ['right'] } };
const below = { orientation: { selector: 'r', directions: ['below'] } };
const program = (...constraints: any[]): ComparisonProgram => ({ constraints, directives: [] });

describe('whole-program comparison', () => {
    it('constructs directed differences on the same datum without mutating candidates', () => {
        const a = program(right), b = program(below);
        const original = JSON.stringify([a, b]);
        const result = comparePrograms(datum, a, b);
        expect(result.status).toBe('different');
        expect(result.sides?.map(s => s.excludes)).toEqual(['b', 'a']);
        expect(result.sides?.[0].program.constraints).toEqual([right, { orientation: { ...below.orientation, hold: 'never' } }]);
        expect(JSON.stringify([a, b])).toBe(original);
    });

    it('keeps a satisfying counterpart when only one directed difference exists', () => {
        const a = program(right), b = program(right, below);
        const result = comparePrograms(datum, a, b);
        expect(result.status).toBe('different');
        expect(result.sides?.map(s => s.excludes)).toEqual(['b', null]);
        expect(result.sides?.[1].program).toEqual(b);
        // Every constraint of A remains present in the witness.
        expect(result.sides?.[0].program.constraints).toContainEqual(right);
    });

    it('checks combined programs, not just individual rules', () => {
        const conflicting = program(right, { orientation: { selector: 'r', directions: ['left'] } });
        expect(comparePrograms(datum, program(right), conflicting).status).toBe('infeasible');
    });

    it('does not manufacture a difference between identical programs', () => {
        expect(comparePrograms(datum, program(right), program(right)).status).toBe('no-difference');
    });

    it('does not call a vacuous flipped constraint a distinguishing witness', () => {
        const empty = { ...datum, relations: [{ ...datum.relations[0], tuples: [] }] };
        expect(comparePrograms(empty, program(), program(right)).status).toBe('no-difference');
        expect(comparePrograms(empty, program(right), program(right)).status).toBe('no-difference');
    });

    it('flips an already negated constraint back to always', () => {
        const result = comparePrograms(datum, program(), program({ orientation: { ...right.orientation, hold: 'never' } }));
        expect(result.sides?.[0].program.constraints[0].orientation.hold).toBe('always');
    });

    it('does not claim a positional difference across different presentations', () => {
        const b = { ...program(right), directives: [{ hideAtom: { selector: 'Node' } }] };
        expect(comparePrograms(datum, program(), b).status).toBe('unsupported');
    });

    it('rejects unsupported constraints rather than silently dropping them', () => {
        expect(comparePrograms(datum, program({ bogus: {} }), program()).status).toBe('unsupported');
    });

    it('rejects a selector of the wrong arity rather than displaying an unchecked diagram', () => {
        expect(() => comparePrograms(datum, program({ orientation: { selector: 'Node', directions: ['right'] } }), program())).toThrow();
    });

    it('rejects an invalid direction before the parser can discard it', () => {
        expect(() => comparePrograms(datum, program({ orientation: { selector: 'r', directions: ['diagonal'] } }), program())).toThrow('Invalid orientation');
    });
});
