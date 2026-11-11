import { describe, it, expect } from 'vitest';
import { solve, describeConstraint } from './helpers/constraint-dsl';
import type { PositionalConstraintError } from '../src/layout/constraint-types';

/**
 * Issue #646. Two nodes that are aligned on the two axes are in the same
 * position. The conflict report must name the alignment constraints on the
 * two axes, not only the one that the validator rejected.
 */
function conflictLines(spec: string): string[] {
    const result = solve(spec);
    expect(result.sat).toBe(false);
    const error = result.error as PositionalConstraintError;
    return [...error.minimalConflictingSet.values()].flat().map(describeConstraint).sort();
}

describe('conflict report for alignment on the two axes (#646)', () => {
    it('names the two alignment constraints', () => {
        const lines = conflictLines('C =x B, B =y C');
        expect(lines).toHaveLength(2);
        expect(lines.some(l => l.includes('=x'))).toBe(true);
        expect(lines.some(l => l.includes('=y'))).toBe(true);
    });

    it('names the constraint on the other axis when one axis has a duplicate', () => {
        const lines = conflictLines('C =x B, B =y C, C =y B');
        expect(lines.some(l => l.includes('=x'))).toBe(true);
        expect(lines.some(l => l.includes('=y'))).toBe(true);
    });

    it('names each constraint of an alignment chain', () => {
        // A, B, C are in one column. A and C are then put in one row.
        const lines = conflictLines('A =x B, B =x C, A =y C');
        expect(lines).toHaveLength(3);
        expect(lines.filter(l => l.includes('=x'))).toHaveLength(2);
        expect(lines.filter(l => l.includes('=y'))).toHaveLength(1);
    });

    it('does not name an alignment that is not part of the conflict', () => {
        const lines = conflictLines('D =x E, C =x B, B =y C');
        expect(lines).toHaveLength(2);
        expect(lines.some(l => l.includes('D'))).toBe(false);
    });
});
