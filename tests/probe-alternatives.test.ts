import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { isLeftConstraint, isTopConstraint, isBoundingBoxConstraint } from '../src/layout/interfaces';

/**
 * Issue #661. Before the search, the validator now removes each alternative
 * that leaves some other disjunction with no alternative. Without this, the
 * two systems below made the search run for minutes.
 */
const stats = (r: ReturnType<typeof solve>) =>
    (r.validator as QualitativeConstraintValidator).getStats();

describe('one-step look-ahead before the search (#661)', () => {
    it('rejects a never-group on two members of a group, with no search', () => {
        // The never-group {A, B} needs a node between A and B on the two
        // axes. A and B are members of G1, so only F, the third member, can
        // be there. But F is in the row of B.
        const result = solve(
            'G <x D, D <x A, E =y H, A <y C, C =x H, B =y F, {G0: H, D}, {G1: A, B, F}, {!N1: A, B}');
        expect(result.sat).toBe(false);
        expect(stats(result).conflicts).toBe(0);
    });

    it('rejects the second slow system, with no search', () => {
        const result = solve(
            'D =x F, C <x A, E =y B, E =x D, C <y D, F =x D, {G0: A, B, F}, {G1: C, G}, {!N1: E, A}');
        expect(result.sat).toBe(false);
        expect(stats(result).conflicts).toBe(0);
    });

    it('accepts the never-group when the third member can be between the two', () => {
        // The same shape, but F is free. F goes between A and B.
        const result = solve('G <x D, {G1: A, B, F}, {!N1: A, B}');
        expect(result.sat).toBe(true);

        const committed = result.validator.layout.constraints.filter(c => !isBoundingBoxConstraint(c));
        const between = (isOrder: (c: any) => boolean, first: (c: any) => string, second: (c: any) => string) => {
            const orders = committed.filter(isOrder);
            return ['A', 'B'].some(lo => {
                const hi = lo === 'A' ? 'B' : 'A';
                return orders.some(c => first(c) === lo && second(c) === 'F')
                    && orders.some(c => first(c) === 'F' && second(c) === hi);
            });
        };
        expect(between(isLeftConstraint, c => c.left.id, c => c.right.id)).toBe(true);
        expect(between(isTopConstraint, c => c.top.id, c => c.bottom.id)).toBe(true);
    });

    it('keeps a system with a solution satisfiable', () => {
        const result = solve('A <x B, [B <x C | C <x A], [C <y A | A <y C], {G: A, B}');
        expect(result.sat).toBe(true);
    });

    it('keeps the facts that the look-ahead commits in the modal queries', () => {
        // Each alternative of the second disjunction has "B <x A". Thus the
        // look-ahead removes "A <x B" and commits "B <x C & C <x A". B and
        // C are left of A in every solution.
        const result = solve('[A <x B | B <x C & C <x A], [B <x A & B <x C | B <x A & B <x D]');
        expect(result.sat).toBe(true);
        const validator = result.validator as QualitativeConstraintValidator;
        expect(validator.getMust('A', 'leftOf')).toEqual(new Set(['B', 'C']));
        expect(validator.getCannot('A', 'rightOf').has('B')).toBe(true);
    });
});
