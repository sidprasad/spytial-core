import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';

/**
 * Issue #657. When learned clauses remove all alternatives of a disjunction
 * that has no assignment, the search must treat that as a conflict. Before
 * the fix it returned SAT and the disjunction had no true alternative.
 */
describe('search with no alternative left for a disjunction (#657)', () => {
    it('rejects a never-group on the two members of a group', { timeout: 60_000 }, () => {
        // I and F are the only members of the group G0, so no other node
        // can be inside the box around them. The never-group needs such a
        // node, so it cannot hold.
        const result = solve('F =x A, A <y I, B <y J, F <x J, {G0: I, F}, {G1: H, J}, {!N1: I, F}');
        expect(result.sat).toBe(false);
    });

    it('rejects the same never-group with fewer other constraints', { timeout: 60_000 }, () => {
        const result = solve('F =x A, A <y I, {G0: I, F}, {G1: H, J}, {!N1: I, F}');
        expect(result.sat).toBe(false);
    });

    it('accepts the never-group when a node can be between the members', () => {
        const result = solve('F <y D, D <y H, F <x D, D <x H, {!N1: F, H}');
        expect(result.sat).toBe(true);
    });
});
