import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';

/**
 * Issues #649 and #650. When the search finds a disjunction with no possible
 * alternative, it learns a clause: "these decisions cannot all hold".
 *
 * Before the fix, the clause was built from the assignments that block SOME
 * of the alternatives. For a node on one side of a group, the code looked
 * only at the edge to the virtual group node, and not at the order or the
 * alignment of a group member that really blocks the alternative. The clause
 * then did not name all the necessary assignments and it forbade too much.
 */
const conflicts = (r: ReturnType<typeof solve>) =>
    (r.validator as QualitativeConstraintValidator).getStats().conflicts;

// The search stops at approximately 3776 conflicts (the restart limit).
const FAR_BELOW_THE_LIMIT = 200;

describe('the clause from a theory conflict is correct (#649, #650)', () => {
    it('finds the solution of a system with overlapping groups and a never-group', () => {
        // This system has a solution. Before the fix, the search ran to the
        // restart limit and the validator reported a conflict.
        const result = solve(
            'E <x A, D <y E, C <y D, B =x C, B <y A, ' +
            '{G0: C, B, E, D}, {G1: A, B, E}, {G2: D, A}, {!N1: A, B, C}');
        expect(result.sat).toBe(true);
        expect(conflicts(result)).toBeLessThan(FAR_BELOW_THE_LIMIT);
    });

    it('finds the solution of a system on which the search did not end', () => {
        // Before the fix, the search for this system ran for more than 90
        // seconds with no result.
        const result = solve(
            'E <y H, F =y A, E =x C, D <x F, H =x G, ' +
            '{G4: D, C}, {G3: A, E, D, H, F}, {G2: D, G}, {G1: B, F, D}, {!N1: D, E, C}');
        expect(result.sat).toBe(true);
        expect(conflicts(result)).toBeLessThan(FAR_BELOW_THE_LIMIT);
    });

    it('does not find the same conflict again and again', () => {
        // A clause that names only an assignment made by propagation does
        // not stop the search: the same decisions give the same propagation
        // and the same conflict. The clause must name decisions.
        const result = solve('E <x D, E =x A, C =x D, {G0: D, A}, {G1: A, B}, {!N1: A, D, B}');
        expect(result.sat).toBe(false);
        expect(conflicts(result)).toBeLessThan(FAR_BELOW_THE_LIMIT);
    });
});
