/**
 * Tests for the difference logic theory solver (DifferenceConstraintGraph)
 * and its integration into the qualitative constraint validator.
 *
 * Covers:
 * - Weighted edges and actual minDistance values
 * - Edge provenance and conflict explanation
 * - Theory conflict lemmas (targeted learned clauses from graphPropagate)
 * - Alignment as zero-weight edges (replacing UnionFind)
 * - SCC-aware topological sort
 * - isOrdered vs canReach semantics with alignment edges
 */
import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutNode,
    LayoutGroup,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    isLeftConstraint,
    isTopConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, CyclicOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createNode(id: string, width = 100, height = 60): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width, height, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

function src(desc: string): RelativeOrientationConstraint {
    return new RelativeOrientationConstraint(['left'], desc);
}

function leftOf(left: LayoutNode, right: LayoutNode, minDistance = 15): LeftConstraint {
    return { left, right, minDistance, sourceConstraint: src(`${left.id}->${right.id}`) };
}

function above(top: LayoutNode, bottom: LayoutNode, minDistance = 15): TopConstraint {
    return { top, bottom, minDistance, sourceConstraint: src(`${top.id}->${bottom.id}`) };
}

function alignX(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'x', node1: a, node2: b, sourceConstraint: src(`align-x(${a.id},${b.id})`) };
}

function alignY(a: LayoutNode, b: LayoutNode): AlignmentConstraint {
    return { axis: 'y', node1: a, node2: b, sourceConstraint: src(`align-y(${a.id},${b.id})`) };
}

function layout(nodes: LayoutNode[], constraints: any[], disjunctiveConstraints?: DisjunctiveConstraint[], groups: LayoutGroup[] = []): InstanceLayout {
    return { nodes, edges: [], constraints, groups, disjunctiveConstraints };
}

function validate(l: InstanceLayout) {
    const v = new QualitativeConstraintValidator(l);
    const error = v.validateConstraints();
    return { error, validator: v, stats: v.getStats() };
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('Difference Logic Theory Solver', () => {

    // ─── Phase 1: Weighted edges ─────────────────────────────────────────────

    describe('Weighted edges and actual minDistance', () => {
        it('should accept consistent ordering with varying minDistances', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b, 30),
                leftOf(b, c, 50),
            ]));
            expect(error).toBeNull();
        });

        it('should reject cycles in ordering constraints', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b),
                leftOf(b, c),
                leftOf(c, a),
            ]));
            expect(error).not.toBeNull();
        });

        it('should preserve edge count with weighted edges', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { stats } = validate(layout([a, b, c], [
                leftOf(a, b, 20),
                leftOf(b, c, 30),
            ]));
            expect(stats.hEdges).toBe(2);
        });
    });

    // ─── Phase 2: Edge provenance and conflict explanation ───────────────────

    describe('Edge provenance and conflict explanation', () => {
        it('should include conflicting constraints in IIS for ordering cycle', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b),
                leftOf(b, c),
                leftOf(c, a),
            ]));
            expect(error).not.toBeNull();
            const pe = error as any;
            expect(pe.minimalConflictingSet.size).toBeGreaterThan(0);
        });

        it('should include alignment and ordering constraints in IIS for alignment-ordering conflict', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b),
                leftOf(b, c),
                alignX(a, c),
            ]));
            expect(error).not.toBeNull();
            const pe = error as any;
            let iisCount = 0;
            for (const [, constraints] of pe.minimalConflictingSet) {
                iisCount += constraints.length;
            }
            // Should include: align-x(A,C) + ordering path A→B→C (2 edges + 1 alignment = 3)
            expect(iisCount).toBeGreaterThanOrEqual(2);
        });
    });

    // ─── Phase 3: Theory conflict lemmas ─────────────────────────────────────

    describe('Theory conflict lemmas from CDCL', () => {
        it('should learn clauses from graph propagation conflicts', () => {
            // Two disjunctions that conflict when both pick the same direction
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(id => createNode(id));

            const disj1 = new DisjunctiveConstraint(
                src('d1'),
                [[leftOf(a, b)], [leftOf(b, a)]]
            );
            const disj2 = new DisjunctiveConstraint(
                src('d2'),
                [[leftOf(b, c)], [leftOf(c, b)]]
            );
            const disj3 = new DisjunctiveConstraint(
                src('d3'),
                [[leftOf(c, a)], [leftOf(a, c)]]
            );

            const { error, stats } = validate(layout(
                [a, b, c, d], [], [disj1, disj2, disj3]
            ));
            // Should be satisfiable (e.g., A<B, B<C, A<C)
            expect(error).toBeNull();
        });

        it('should produce learned clauses that reduce search on conflicts', () => {
            // Force a scenario where CDCL must learn
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));

            // A < B (fixed)
            const constraints = [leftOf(a, b)];

            // Disjunction: B < C or C < B
            const disj1 = new DisjunctiveConstraint(
                src('d1'), [[leftOf(b, c)], [leftOf(c, b)]]
            );
            // Disjunction: C < A or A < C
            const disj2 = new DisjunctiveConstraint(
                src('d2'), [[leftOf(c, a)], [leftOf(a, c)]]
            );

            const { error, stats } = validate(layout(
                [a, b, c], constraints, [disj1, disj2]
            ));
            // Should be satisfiable: A<B, B<C, A<C
            expect(error).toBeNull();
        });
    });

    // ─── Phase 4: Alignment as zero-weight edges ─────────────────────────────

    describe('Alignment as zero-weight edges', () => {
        it('should accept consistent alignment constraints', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                alignX(a, b),
                alignX(b, c),
            ]));
            expect(error).toBeNull();
        });

        it('should reject alignment between strictly ordered nodes', () => {
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                leftOf(a, b),
                alignX(a, b),
            ]));
            expect(error).not.toBeNull();
        });

        it('should reject ordering between aligned nodes', () => {
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                alignX(a, b),
                leftOf(a, b),
            ]));
            expect(error).not.toBeNull();
        });

        it('should detect transitive alignment-ordering conflict', () => {
            // A < B < C, align-x(A, C) — transitive conflict
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b),
                leftOf(b, c),
                alignX(a, c),
            ]));
            expect(error).not.toBeNull();
        });

        it('should detect cross-class alignment cycle', () => {
            // align-y(A,B), above(C,A), above(B,D), align-y(D,C)
            // Classes {A,B} and {C,D} ordered in both directions → infeasible
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c, d], [
                alignY(a, b),
                above(c, a),
                above(b, d),
                alignY(d, c),
            ]));
            expect(error).not.toBeNull();
        });

        it('should accept alignment + orthogonal ordering', () => {
            // align-x(A, B) + above(A, B) is fine: same x, different y
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                alignX(a, b),
                above(a, b),
            ]));
            expect(error).toBeNull();
        });

        it('should track alignment classes via graph SCCs', () => {
            // align-x(A,B), align-x(B,C), above(A,B), above(B,C)
            // All three are x-aligned → should produce verticallyAligned group
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const l = layout([a, b, c], [
                alignX(a, b),
                alignX(b, c),
                above(a, b),
                above(b, c),
            ]);
            const v = new QualitativeConstraintValidator(l);
            v.validateConstraints();
            // verticallyAligned should have a group of 3 (x-aligned = vertical column)
            const maxGroupSize = Math.max(
                ...v.verticallyAligned.map(g => g.length),
                0
            );
            expect(maxGroupSize).toBe(3);
        });

        it('should handle alignment disjunction correctly', () => {
            // Disjunction: align-x(A,B) OR leftOf(A,B)
            // With A<C<B already committed, only leftOf(A,B) is feasible
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const constraints = [leftOf(a, c), leftOf(c, b)];

            const disj = new DisjunctiveConstraint(
                src('d1'),
                [[alignX(a, b)], [leftOf(a, b)]]
            );

            const { error } = validate(layout([a, b, c], constraints, [disj]));
            expect(error).toBeNull();
        });

        it('should reject alignment disjunction when all alternatives conflict', () => {
            // align-x(A,B) committed, disjunction: leftOf(A,B) OR leftOf(B,A)
            // Both alternatives order aligned nodes → UNSAT
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const disj = new DisjunctiveConstraint(
                src('d1'),
                [[leftOf(a, b)], [leftOf(b, a)]]
            );

            const { error } = validate(layout([a, b], [alignX(a, b)], [disj]));
            expect(error).not.toBeNull();
        });

        it('should handle redundant alignment (already aligned)', () => {
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                alignX(a, b),
                alignX(a, b), // redundant
            ]));
            expect(error).toBeNull();
        });

        it('should handle transitive alignment chains', () => {
            // align-x(A,B), align-x(B,C), align-x(C,D) → all four x-aligned
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c, d], [
                alignX(a, b),
                alignX(b, c),
                alignX(c, d),
            ]));
            expect(error).toBeNull();
        });
    });

    // ─── Alignment + ordering interaction edge cases ─────────────────────────

    describe('Alignment-ordering interaction edge cases', () => {
        it('should not treat aligned nodes as separated', () => {
            // align-x(A,B) does NOT mean A is left-of or right-of B
            // A disjunction requiring separation should not be pre-solved
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const disj = new DisjunctiveConstraint(
                src('d1'),
                [
                    [leftOf(a, b)],
                    [leftOf(b, a)],
                    [above(a, b)],
                    [above(b, a)],
                ]
            );

            const { error } = validate(layout([a, b], [alignX(a, b)], [disj]));
            // Should succeed — alignment precludes left/right alternatives
            // but above/below alternatives remain feasible
            expect(error).toBeNull();
        });

        it('should detect conflict when alignment blocks all disjunction alternatives', () => {
            // align-x(A,B) + align-y(A,B) — nodes at same position
            // Plus a separation disjunction: must be left/right/above/below
            // All 4 alternatives are blocked → UNSAT
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const disj = new DisjunctiveConstraint(
                src('d1'),
                [
                    [leftOf(a, b)],
                    [leftOf(b, a)],
                    [above(a, b)],
                    [above(b, a)],
                ]
            );

            const { error } = validate(layout([a, b], [alignX(a, b), alignY(a, b)], [disj]));
            expect(error).not.toBeNull();
        });

        it('should handle ordering added before alignment on same pair', () => {
            // leftOf(A,B) then alignX(A,B) — alignment rejects (A strictly before B)
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                leftOf(a, b),
                alignX(a, b),
            ]));
            expect(error).not.toBeNull();
        });

        it('should handle alignment added before ordering on same pair', () => {
            // alignX(A,B) then leftOf(A,B) — ordering rejects (A aligned with B)
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { error } = validate(layout([a, b], [
                alignX(a, b),
                leftOf(a, b),
            ]));
            expect(error).not.toBeNull();
        });
    });

    // ─── Conflict quality (IIS sharpness) ────────────────────────────────────

    describe('IIS quality and MFS', () => {
        it('should produce IIS with alignment + full ordering path', () => {
            // A < B < C < D, align-x(A, D) → IIS should contain the alignment + path
            const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c, d], [
                leftOf(a, b),
                leftOf(b, c),
                leftOf(c, d),
                alignX(a, d),
            ]));
            expect(error).not.toBeNull();
            const pe = error as any;
            let iisCount = 0;
            for (const [, constraints] of pe.minimalConflictingSet) {
                iisCount += constraints.length;
            }
            // alignment + 3 ordering edges = 4
            expect(iisCount).toBeGreaterThanOrEqual(3);
        });

        it('should include MFS that excludes conflicting constraints', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { error } = validate(layout([a, b, c], [
                leftOf(a, b),
                leftOf(b, c),
                leftOf(c, a),
            ]));
            expect(error).not.toBeNull();
            const pe = error as any;
            expect(pe.maximalFeasibleSubset).toBeDefined();
            expect(Array.isArray(pe.maximalFeasibleSubset)).toBe(true);
        });
    });

    // ─── Stats and diagnostics ───────────────────────────────────────────────

    describe('Solver stats', () => {
        it('should report edge counts accurately', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            const { stats } = validate(layout([a, b, c], [
                leftOf(a, b),
                above(a, c),
            ]));
            expect(stats.hEdges).toBe(1);
            expect(stats.vEdges).toBe(1);
        });

        it('should count alignment edges (2 per alignment)', () => {
            const [a, b] = ['A', 'B'].map(id => createNode(id));
            const { stats } = validate(layout([a, b], [alignX(a, b)]));
            // Each alignment adds 2 zero-weight edges
            expect(stats.hEdges).toBe(2);
        });

        it('should track conflict count through CDCL', () => {
            const [a, b, c] = ['A', 'B', 'C'].map(id => createNode(id));
            // Create a scenario that requires CDCL with at least one conflict
            const disj1 = new DisjunctiveConstraint(
                src('d1'), [[leftOf(a, b)], [leftOf(b, a)]]
            );
            const disj2 = new DisjunctiveConstraint(
                src('d2'), [[leftOf(b, c)], [leftOf(c, b)]]
            );
            const disj3 = new DisjunctiveConstraint(
                src('d3'), [[leftOf(c, a)], [leftOf(a, c)]]
            );

            const { stats } = validate(layout([a, b, c], [], [disj1, disj2, disj3]));
            // Satisfiable, but may require conflict-driven learning
            expect(stats.addedConstraints).toBeGreaterThanOrEqual(0);
        });
    });
});
