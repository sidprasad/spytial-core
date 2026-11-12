import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import { DisjunctiveConstraint } from '../src/layout/interfaces';
import { parseConstraintSpec, describeConstraint, leftOf, SRC } from './helpers/constraint-dsl';

/**
 * Issue #652. The greedy step for the feasible subset tries the disjunctions
 * with the lowest search activity first. Activity is stored by position in
 * the list after presolve. The greedy step uses the list before presolve.
 * This test sets the two lists directly, because a search with conflicts is
 * not deterministic enough for a stable test.
 */
describe('feasible subset uses the activity of the correct disjunction (#652)', () => {
    it('tries a disjunction with search conflicts last', () => {
        const layout = parseConstraintSpec('A <y C, B <y C');
        const [a, b, c] = ['A', 'B', 'C'].map(id => layout.nodes.find(n => n.id === id)!);

        // `first` and `last` cannot hold together. `middle` is neutral.
        const first = new DisjunctiveConstraint(SRC, [[leftOf(a, b)]]);
        const middle = new DisjunctiveConstraint(SRC, [[leftOf(a, c)]]);
        const last = new DisjunctiveConstraint(SRC, [[leftOf(b, a)]]);

        const validator = new QualitativeConstraintValidator(layout) as any;
        // Before presolve: three disjunctions.
        validator.originalDisjunctions = [first, middle, last];
        // After presolve: only `last` stays, so its position is 0, not 2.
        validator.allDisjunctions = [new DisjunctiveConstraint(SRC, last.alternatives)];
        validator.branchStride = 1;
        validator.activityFlat = new Float64Array([5]);

        const { feasibleConstraints, infeasibleDisjunctions } = validator.computeMaximalFeasibleSubset();

        // `last` has the search activity, so it is tried last and is the one
        // that cannot be added.
        expect(infeasibleDisjunctions).toEqual([last]);
        expect(feasibleConstraints.map(describeConstraint)).toContain('A <x B');
        expect(feasibleConstraints.map(describeConstraint)).not.toContain('B <x A');
    });
});
