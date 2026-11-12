import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';

/**
 * Issue #657. When learned clauses remove all alternatives of a disjunction
 * that has no assignment, the search must treat that as a conflict. Before
 * the fix it returned SAT and the disjunction had no true alternative.
 */
describe('search with no alternative left for a disjunction (#657)', () => {
    it('rejects a never-group whose two members are in one row', { timeout: 60_000 }, () => {
        // F and H are in one row. No node can be between them on the
        // vertical axis, so the never-group cannot hold.
        const result = solve('H =y F, H <y D, E =y B, {G0: D, F}, {G1: B, H}, {!N1: F, H}');
        expect(result.sat).toBe(false);
    });

    it('rejects the same never-group without the other constraints', { timeout: 60_000 }, () => {
        const result = solve('H =y F, {G0: D, F}, {G1: B, H}, {!N1: F, H}');
        expect(result.sat).toBe(false);
    });

    it('accepts the never-group when a node can be between the members', () => {
        const result = solve('F <y D, D <y H, F <x D, D <x H, {!N1: F, H}');
        expect(result.sat).toBe(true);
    });
});
