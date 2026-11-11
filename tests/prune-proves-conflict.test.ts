import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';

/**
 * Issue #650. The search had a restart limit. At the limit it stopped with
 * no proof, and the validator reported a conflict. These systems reached the
 * limit after 3776 conflicts and several seconds.
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
    // In each system the two members of the never-group are aligned, so no
    // node can be between them on that axis. On main each one reached the
    // restart limit.
    const LIMIT_CASES = [
        'A =x J, H =x C, F =x G, {G0: F, G, E}, {G1: A, I}, {G2: B, C}, {!N1: A, J}',
        'J =x E, J <x G, F <x H, B =y J, {G0: A, E}, {G1: F, I}, {!N1: J, E}',
        'J <y G, H =y J, {G0: B, E, J}, {G1: F, I}, {G2: C, D}, {!N1: H, J}',
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
