import { describe, it, expect } from 'vitest';
import { solve } from './helpers/constraint-dsl';
import { isBoundingBoxConstraint } from '../src/layout/interfaces';

/**
 * Issue #644. A never-group draws no box. Its members are thus not "in a
 * group" for the rule that keeps a node out of the box around a group it is
 * not a member of.
 */
describe('a never-group member stays outside other groups (#644)', () => {
    // E is not a member of G. E is in the row of A, between A and B, so E is
    // inside the box around G.
    const E_INSIDE_G = 'A <x E, E <x B, A =y E, {G: A, B}';

    it('rejects a node that must be inside a group', () => {
        expect(solve(E_INSIDE_G).sat).toBe(false);
    });

    it('gives the same answer when the node is also a never-group member', () => {
        // C sits between E and F on the two axes, so the never-group holds.
        const result = solve(`E <x C, C <x F, E <y C, C <y F, ${E_INSIDE_G}, {!N: E, F}`);
        expect(result.sat).toBe(false);
    });

    it('puts a never-group member on one side of a group', () => {
        // E and F are the never-group. C sits between them, so the rule holds.
        // E is not a member of G and must be on one side of G.
        const result = solve('E <x C, C <x F, {G: A, B}, {!N: E, F}');
        expect(result.sat).toBe(true);
        const sides = result.validator.layout.constraints.filter(c =>
            isBoundingBoxConstraint(c) && c.group.name === 'G');
        const nodes = new Set(sides.map(c => isBoundingBoxConstraint(c) ? c.node.id : ''));
        expect(nodes.has('E')).toBe(true);
        expect(nodes.has('F')).toBe(true);
        expect(nodes.has('C')).toBe(true);
    });
});
