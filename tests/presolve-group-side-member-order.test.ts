import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { isBoundingBoxConstraint, isTopConstraint, isLeftConstraint } from '../src/layout/interfaces';

/**
 * Issue #643. When presolve commits a group side for a node ("D is above
 * group G"), the node must also be ordered against each member of the group.
 * The CDCL path does this; the presolve path did not.
 */
describe('presolve orders a node against each group member (#643)', () => {
    it('rejects a group and a never-group on the same members', () => {
        // A is the only node outside the group. The orientation constraints
        // leave "above" as the only side for A, so presolve commits it.
        // The never-group then needs A inside the box around D, C, B.
        const result = solve('A <y C, D =x A, B <y D, D =y C, {G: D, C, B}, {!N: D, C, B}');
        expect(result.sat).toBe(false);
    });

    it('does not order a member above a node that is above the group', () => {
        // D is in the column of A, so D can only be above or below group G.
        // D <y C leaves "above". A is a member of G and is aligned with D.
        const result = solve('A =x D, D <y C, A <x C, {G: C, B, A}');
        expect(result.sat).toBe(true);

        const committed = result.validator.layout.constraints;
        const dAboveGroup = committed.some(c =>
            isBoundingBoxConstraint(c) && c.node.id === 'D' && c.side === 'top');
        expect(dAboveGroup).toBe(true);

        // No committed constraint puts a member of G above D.
        const members = new Set(['A', 'B', 'C']);
        const memberAboveD = committed.filter(c =>
            !isBoundingBoxConstraint(c) && isTopConstraint(c)
            && members.has(c.top.id) && c.bottom.id === 'D');
        expect(memberAboveD).toEqual([]);
    });

    it('keeps the same rule for the left and right sides', () => {
        // The same case on the other axis.
        const result = solve('A =y D, D <x C, A <y C, {G: C, B, A}');
        expect(result.sat).toBe(true);
        const members = new Set(['A', 'B', 'C']);
        const memberLeftOfD = result.validator.layout.constraints.filter(c =>
            !isBoundingBoxConstraint(c) && isLeftConstraint(c)
            && members.has(c.left.id) && c.right.id === 'D');
        expect(memberLeftOfD).toEqual([]);
    });
});
