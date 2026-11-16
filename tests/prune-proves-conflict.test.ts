import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';

/**
 * Issue #650. The search had a restart limit. At the limit it stopped with
 * no proof, and the validator reported a conflict. Systems of this type
 * reached the limit after 3776 conflicts and several seconds.
 *
 * Two changes make them quick:
 *  - the prune passes check all constraints of an alternative together;
 *  - a disjunction with no alternative that fits is a proof of a conflict,
 *    so the search does not start.
 * The limit stays: some true conflicts still need it to stop the search.
 */
const stats = (r: ReturnType<typeof solve>) =>
    (r.validator as QualitativeConstraintValidator).getStats();

describe('the prune proves a conflict without a search (#650)', () => {
    // In each system the never-group is on the two members of a group. No
    // other node can be inside the box around them, so the never-group
    // cannot hold. Before the fix each system needed more than 1500 search
    // conflicts.
    const LIMIT_CASES = [
        'E =x J, A =y E, H <y C, E =x B, A <y I, C =y F, {G0: D, C}, {!N1: D, C}',
        'A <y B, J =y D, E <y G, E =y F, {G0: D, H}, {!N1: D, H}',
        'J <y E, I <y F, G <x F, B <y C, C <x G, H <x G, {G0: B, I}, {!N1: I, B}',
    ];

    it.each(LIMIT_CASES)('reports a conflict with no search conflicts: %s', (spec) => {
        const result = solve(spec);
        expect(result.sat).toBe(false);
        expect(stats(result).conflicts).toBe(0);
    });

    it('removes an alternative whose constraints cannot hold together', () => {
        // A and J are in one column. "A left of N, N left of J" is then not
        // possible, but each of the two parts is possible by itself. The
        // prune must remove that alternative and commit the other one.
        const result = solve('A =x J, [A <x N & N <x J | N <y A]');
        expect(result.sat).toBe(true);
        expect(stats(result).prunedByDecomposition).toBe(1);
        expect(stats(result).conflicts).toBe(0);
    });

    it('leaves the graphs unchanged after it rejects or accepts an alternative', () => {
        // Two alternatives that fit. The check adds and removes each one, so
        // no constraint of the alternative that is not selected can stay.
        const result = solve('[A <x B & B <x C | C <x B & B <x A], [A <y B | B <y A]');
        expect(result.sat).toBe(true);
        const committed = result.validator.layout.constraints.length;
        // One alternative of each disjunction: 2 + 1 constraints.
        expect(committed).toBe(3);
    });
});
