/**
 * Unit tests for the constraint DSL and the qualitative validator.
 *
 * Uses the string DSL for concise, readable test cases.
 */

import { describe, it, expect } from 'vitest';
import { sat, unsat, solve, parseConstraintSpec } from './helpers/constraint-dsl';

// ═══════════════════════════════════════════════════════════════════════════════
// DSL parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe('DSL parsing', () => {
    it('parses empty spec', () => {
        const layout = parseConstraintSpec('');
        expect(layout.nodes).toHaveLength(0);
        expect(layout.constraints).toHaveLength(0);
    });

    it('auto-creates nodes from constraints', () => {
        const layout = parseConstraintSpec('A <x B, C <y D');
        expect(layout.nodes).toHaveLength(4);
        expect(layout.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('reuses nodes across constraints', () => {
        const layout = parseConstraintSpec('A <x B, B <x C');
        expect(layout.nodes).toHaveLength(3);
    });

    it('parses ordering constraints', () => {
        const layout = parseConstraintSpec('A <x B, C <y D');
        expect(layout.constraints).toHaveLength(2);
    });

    it('parses alignment constraints', () => {
        const layout = parseConstraintSpec('A =x B, C =y D');
        expect(layout.constraints).toHaveLength(2);
    });

    it('parses disjunctions', () => {
        const layout = parseConstraintSpec('[A <x B | B <x A]');
        expect(layout.disjunctiveConstraints).toHaveLength(1);
        expect(layout.disjunctiveConstraints![0].alternatives).toHaveLength(2);
    });

    it('parses disjunctions with conjunction alternatives using &', () => {
        const layout = parseConstraintSpec('[A <x B & A =y B | B <x A]');
        expect(layout.disjunctiveConstraints).toHaveLength(1);
        expect(layout.disjunctiveConstraints![0].alternatives[0]).toHaveLength(2);
        expect(layout.disjunctiveConstraints![0].alternatives[1]).toHaveLength(1);
    });

    it('parses groups', () => {
        const layout = parseConstraintSpec('{G: A, B, C}');
        expect(layout.groups).toHaveLength(1);
        expect(layout.groups[0].name).toBe('G');
        expect(layout.groups[0].nodeIds).toEqual(['A', 'B', 'C']);
        expect(layout.groups[0].negated).toBeFalsy();
    });

    it('parses negated groups', () => {
        const layout = parseConstraintSpec('{!G: A, B}');
        expect(layout.groups).toHaveLength(1);
        expect(layout.groups[0].negated).toBe(true);
    });

    it('parses mixed specs', () => {
        const layout = parseConstraintSpec('A <x B, [B <y C | C <y B], {G: A, B}');
        expect(layout.constraints).toHaveLength(1);
        expect(layout.disjunctiveConstraints).toHaveLength(1);
        expect(layout.groups).toHaveLength(1);
    });

    it('applies custom dimensions', () => {
        const layout = parseConstraintSpec('A <x B', { A: [50, 30], B: [80, 40] });
        const a = layout.nodes.find(n => n.id === 'A')!;
        const b = layout.nodes.find(n => n.id === 'B')!;
        expect(a.width).toBe(50);
        expect(a.height).toBe(30);
        expect(b.width).toBe(80);
        expect(b.height).toBe(40);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Basic ordering constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('ordering constraints', () => {
    it('single ordering is SAT', () => {
        sat('A <x B');
    });

    it('chain is SAT', () => {
        sat('A <x B, B <x C, C <x D');
    });

    it('2-cycle is UNSAT', () => {
        unsat('A <x B, B <x A');
    });

    it('3-cycle is UNSAT', () => {
        unsat('A <x B, B <x C, C <x A');
    });

    it('mixed axes are independent — no cross-axis conflict', () => {
        sat('A <x B, B <y A');
    });

    it('parallel chains on same axis are SAT', () => {
        sat('A <x B, C <x D');
    });

    it('diamond is SAT', () => {
        sat('A <x B, A <x C, B <x D, C <x D');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Alignment constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('alignment constraints', () => {
    it('single alignment is SAT', () => {
        sat('A =x B');
    });

    it('transitive alignment is SAT', () => {
        sat('A =x B, B =x C');
    });

    it('alignment on different axes is SAT', () => {
        sat('A =x B, A =y C');
    });

    it('ordering + same-axis alignment is UNSAT', () => {
        unsat('A <x B, A =x B');
    });

    it('transitive ordering + alignment is UNSAT', () => {
        unsat('A <x B, B <x C, A =x C');
    });

    it('ordering + cross-axis alignment is SAT', () => {
        sat('A <x B, A =y B');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Disjunctive constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('disjunctive constraints', () => {
    it('disjunction with a feasible alternative is SAT', () => {
        sat('[A <x B | B <x A]');
    });

    it('disjunction where all alts create cycles is UNSAT', () => {
        unsat('A <x B, B <x C, [C <x A | C <x A]');
    });

    it('conjunctive + disjunctive is SAT when compatible', () => {
        sat('A <x B, [B <y C | C <y B]');
    });

    it('disjunction with alignment alternative is SAT when no conflict', () => {
        sat('[A <x B | A =x B]');
    });

    it('disjunction with alignment alternative is UNSAT when ordering conflicts', () => {
        // A must be right of B (B <x A), and disjunction says A <x B or A =x B
        // Both alternatives conflict with B <x A
        unsat('B <x A, [A <x B | A =x B]');
    });

    it('multiple disjunctions are SAT when compatible', () => {
        sat('[A <x B | B <x A], [C <y D | D <y C]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Groups
// ═══════════════════════════════════════════════════════════════════════════════

describe('group constraints', () => {
    it('group with orderings inside is SAT', () => {
        sat('A <x B, {G: A, B}');
    });

    it('group with three members is SAT', () => {
        sat('A <x B, B <x C, {G: A, B, C}');
    });

    // ── Group containment invariants ─────────────────────────────────
    // Being ordered relative to ONE member does NOT imply being ordered
    // relative to the entire group. The group bbox is defined by the
    // extreme members, not by any single member.

    it('x left of one member does not mean x left of group', () => {
        // x <x a1, but a2 or a3 could be further left than x,
        // so x is inside the group's horizontal span and can escape vertically
        sat('x <x a1, {A: a1, a2, a3}');
    });

    it('x right of one member does not mean x right of group', () => {
        sat('a1 <x x, {A: a1, a2, a3}');
    });

    it('x left of two members (not all) does not mean x left of group', () => {
        // a3 could still be further left than x
        sat('x <x a1, x <x a2, {A: a1, a2, a3}');
    });

    it('x left of ALL members is outside the group (SAT)', () => {
        sat('x <x a1, x <x a2, x <x a3, {A: a1, a2, a3}');
    });

    it('x between members horizontally can escape vertically (SAT)', () => {
        // x is between a1 and a2 on x-axis, so it must escape top or bottom
        sat('a1 <x x, x <x a2, {A: a1, a2, a3}');
    });

    it('x trapped inside group on both axes is UNSAT', () => {
        // x is between a1 and a2 horizontally AND vertically — no escape
        unsat('a1 <x x, x <x a2, a1 <y x, x <y a2, {A: a1, a2, a3}');
    });

    it('x trapped inside 4-member group on both axes is UNSAT', () => {
        // a1 left of x, x left of a2 (horizontal trap)
        // a3 above x, x above a4 (vertical trap)
        unsat('a1 <x x, x <x a2, a3 <y x, x <y a4, {A: a1, a2, a3, a4}');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Regression tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('regression tests', () => {
    it('alignment feasibility bug: right + negated right should be UNSAT', () => {
        // This was the bug fixed in the deprecation PR: findSatisfyingAlternative
        // didn't check alignment alternatives against existing orderings
        unsat('A <x B, [B <x A | A =x B]');
    });

    it('alignment feasibility bug: multiple tuples', () => {
        unsat('A <x B, B <x C, [B <x A | A =x B], [C <x B | B =x C]');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
    it('empty spec is SAT', () => {
        const result = solve('');
        expect(result.sat).toBe(true);
    });

    it('self-alignment is SAT (trivially)', () => {
        sat('A =x A');
    });

    it('many independent constraints are SAT', () => {
        sat('A <x B, C <x D, E <y F, G =x H');
    });
});
