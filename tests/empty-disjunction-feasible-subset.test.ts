import { describe, it, expect } from 'vitest';
import { solve, describeConstraint } from './helpers/constraint-dsl';
import type { PositionalConstraintError } from '../src/layout/constraint-types';

/**
 * Issue #651. A never-group with no node outside it has no alternative at
 * all, so it fails by itself. The feasible subset for the error diagram must
 * still keep the other constraints, with one alternative for each
 * disjunction that can hold.
 */
describe('feasible subset when a disjunction has no alternatives (#651)', () => {
    // All three nodes are members, so no node is left to be inside the box.
    const NEVER_GROUP_OF_ALL = '{!N: A, B, C}';

    function feasible(spec: string): string[] {
        const result = solve(spec);
        expect(result.sat).toBe(false);
        const error = result.error as PositionalConstraintError;
        return (error.maximalFeasibleSubset ?? []).map(describeConstraint);
    }

    it('keeps one alternative of each disjunction that can hold', () => {
        const subset = feasible(`A <y B, [B <x C | C <x B], [A <x C | C <x A], ${NEVER_GROUP_OF_ALL}`);
        expect(subset).toContain('A <y B');
        // One alternative from each of the two disjunctions.
        expect(subset.filter(l => l === 'B <x C' || l === 'C <x B')).toHaveLength(1);
        expect(subset.filter(l => l === 'A <x C' || l === 'C <x A')).toHaveLength(1);
        expect(subset).toHaveLength(3);
    });

    it('applies the same subset to the layout', () => {
        const result = solve(`A <y B, [B <x C | C <x B], ${NEVER_GROUP_OF_ALL}`);
        expect(result.sat).toBe(false);
        expect(result.validator.layout.constraints.map(describeConstraint).sort())
            .toEqual(['A <y B', 'B <x C']);
    });
});
