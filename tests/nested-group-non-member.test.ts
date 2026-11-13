import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';

/**
 * Issue #645. With nested groups, a node that is a member of the outer group
 * only must stay out of the box around the inner group. Before the fix, such
 * a node got no rule against the inner group, because it was "in a group".
 */
describe('a member of the outer group only stays out of the inner group (#645)', () => {
    // G = {A, B} is inside H = {A, B, C}. C is a member of H only.
    const NESTED = '{G: A, B}, {H: A, B, C}';

    it('rejects the node in the column of one member and the row of the other', () => {
        // This position is inside the box around A and B.
        expect(solve(`C =x A, B =y C, ${NESTED}`).sat).toBe(false);
    });

    it('rejects the node between the two members in their row', () => {
        expect(solve(`A <x C, C <x B, A =y B, B =y C, ${NESTED}`).sat).toBe(false);
    });

    it('accepts the node between the two members when it can be in a different row', () => {
        expect(solve(`A <x C, C <x B, ${NESTED}`).sat).toBe(true);
    });

    it('accepts the node beside the inner group', () => {
        expect(solve(`A <x B, B <x C, A =y B, B =y C, ${NESTED}`).sat).toBe(true);
    });

    it('applies the rule at each level of three nested groups', () => {
        const threeLevels = '{G: A, B}, {H: A, B, C}, {I: A, B, C, D}';
        // D is a member of I only. It cannot be inside the box of G.
        expect(solve(`A <x D, D <x B, A =y B, B =y D, ${threeLevels}`).sat).toBe(false);
        // C is a member of H and I. It cannot be inside the box of G.
        expect(solve(`A <x C, C <x B, A =y B, B =y C, ${threeLevels}`).sat).toBe(false);
        expect(solve(`A <x B, B <x C, C <x D, ${threeLevels}`).sat).toBe(true);
    });

    it('still keeps a node of a separate group out, by the group-to-group rule', () => {
        const separate = '{G: A, B}, {K: C, D}';
        expect(solve(`A <x C, C <x B, A =y B, B =y C, ${separate}`).sat).toBe(false);
        expect(solve(`A <x B, B <x C, ${separate}`).sat).toBe(true);
    });
});
