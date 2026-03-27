/**
 * PBT: Negation correctness properties.
 *
 * Verifies that negateAtomicConstraint, negateConjunction, and negateDisjunction
 * produce structurally correct results for randomly generated constraints.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    negateAtomicConstraint,
    negateConjunction,
    negateDisjunction,
    DisjunctiveConstraint,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    LayoutConstraint,
    LayoutNode,
    isLeftConstraint,
    isTopConstraint,
    isAlignmentConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

// ─── Helpers & Generators ────────────────────────────────────────────────────

const DEFAULT_SRC = new RelativeOrientationConstraint(['above'], 'pbt');

function makeNode(id: string): LayoutNode {
    return {
        id, label: id, color: 'black',
        groups: [], attributes: {},
        width: 100, height: 60,
        mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

/** Generate an array of N distinct LayoutNodes. */
function arbNodes(n: number): fc.Arbitrary<LayoutNode[]> {
    return fc.constant(
        Array.from({ length: n }, (_, i) => makeNode(String.fromCharCode(65 + i)))
    );
}

/** Pick two distinct nodes from the array and build a LeftConstraint. */
function arbLeftConstraint(nodes: LayoutNode[]): fc.Arbitrary<LeftConstraint> {
    return fc.tuple(
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.integer({ min: 0, max: 50 }),
    ).filter(([i, j]) => i !== j)
     .map(([i, j, d]) => ({
        left: nodes[i], right: nodes[j],
        minDistance: d, sourceConstraint: DEFAULT_SRC,
     }));
}

/** Pick two distinct nodes from the array and build a TopConstraint. */
function arbTopConstraint(nodes: LayoutNode[]): fc.Arbitrary<TopConstraint> {
    return fc.tuple(
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.integer({ min: 0, max: 50 }),
    ).filter(([i, j]) => i !== j)
     .map(([i, j, d]) => ({
        top: nodes[i], bottom: nodes[j],
        minDistance: d, sourceConstraint: DEFAULT_SRC,
     }));
}

/** Pick two distinct nodes and a random axis for an AlignmentConstraint. */
function arbAlignmentConstraint(nodes: LayoutNode[]): fc.Arbitrary<AlignmentConstraint> {
    return fc.tuple(
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.integer({ min: 0, max: nodes.length - 1 }),
        fc.constantFrom('x' as const, 'y' as const),
    ).filter(([i, j]) => i !== j)
     .map(([i, j, axis]) => ({
        axis, node1: nodes[i], node2: nodes[j],
        sourceConstraint: DEFAULT_SRC,
     }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const NUM_RUNS = 200;
const TIMEOUT = 30_000;

describe('Negation PBT', () => {

    // ─── Atomic negation properties ──────────────────────────────────────

    describe('negateAtomicConstraint', () => {

        it('LeftConstraint negation produces 2 alternatives: reversed + aligned', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbLeftConstraint(nodes)),
                (constraint) => {
                    const result = negateAtomicConstraint(constraint, DEFAULT_SRC);

                    // ¬(left < right) = (right < left) ∨ (left ≡ right on x)
                    expect(result).toHaveLength(2);
                    expect(result[0]).toHaveLength(1);
                    expect(result[1]).toHaveLength(1);

                    // Alt 1: reversed LeftConstraint
                    const reversed = result[0][0];
                    expect(isLeftConstraint(reversed)).toBe(true);
                    const rev = reversed as LeftConstraint;
                    expect(rev.left.id).toBe(constraint.right.id);
                    expect(rev.right.id).toBe(constraint.left.id);
                    expect(rev.minDistance).toBe(0);

                    // Alt 2: alignment on x
                    const aligned = result[1][0];
                    expect(isAlignmentConstraint(aligned)).toBe(true);
                    const alg = aligned as AlignmentConstraint;
                    expect(alg.axis).toBe('x');
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('TopConstraint negation produces 2 alternatives: reversed + aligned', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbTopConstraint(nodes)),
                (constraint) => {
                    const result = negateAtomicConstraint(constraint, DEFAULT_SRC);

                    // ¬(top < bottom) = (bottom < top) ∨ (top ≡ bottom on y)
                    expect(result).toHaveLength(2);
                    expect(result[0]).toHaveLength(1);
                    expect(result[1]).toHaveLength(1);

                    // Alt 1: reversed TopConstraint
                    const reversed = result[0][0];
                    expect(isTopConstraint(reversed)).toBe(true);
                    const rev = reversed as TopConstraint;
                    expect(rev.top.id).toBe(constraint.bottom.id);
                    expect(rev.bottom.id).toBe(constraint.top.id);
                    expect(rev.minDistance).toBe(0);

                    // Alt 2: alignment on y
                    const aligned = result[1][0];
                    expect(isAlignmentConstraint(aligned)).toBe(true);
                    const alg = aligned as AlignmentConstraint;
                    expect(alg.axis).toBe('y');
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('AlignmentConstraint negation produces exactly 2 alternatives', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbAlignmentConstraint(nodes)),
                (constraint) => {
                    const result = negateAtomicConstraint(constraint, DEFAULT_SRC);

                    // NOT(alignment) = two alternatives (one per direction)
                    expect(result).toHaveLength(2);
                    expect(result[0]).toHaveLength(1);
                    expect(result[1]).toHaveLength(1);

                    // Both alternatives should be ordering constraints (not alignment)
                    const alt1 = result[0][0];
                    const alt2 = result[1][0];
                    expect(isAlignmentConstraint(alt1)).toBe(false);
                    expect(isAlignmentConstraint(alt2)).toBe(false);

                    if (constraint.axis === 'y') {
                        // NOT(same-Y) → TopConstraints in opposite directions
                        expect(isTopConstraint(alt1)).toBe(true);
                        expect(isTopConstraint(alt2)).toBe(true);
                    } else {
                        // NOT(same-X) → LeftConstraints in opposite directions
                        expect(isLeftConstraint(alt1)).toBe(true);
                        expect(isLeftConstraint(alt2)).toBe(true);
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('AlignmentConstraint negation alternatives have minDistance=1', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbAlignmentConstraint(nodes)),
                (constraint) => {
                    const result = negateAtomicConstraint(constraint, DEFAULT_SRC);

                    for (const [alt] of result) {
                        if (isLeftConstraint(alt)) {
                            expect((alt as LeftConstraint).minDistance).toBe(1);
                        } else if (isTopConstraint(alt)) {
                            expect((alt as TopConstraint).minDistance).toBe(1);
                        }
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Double negation properties ──────────────────────────────────────

    describe('Double negation', () => {

        it('double-negating a LeftConstraint: reversed alt restores direction', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbLeftConstraint(nodes)),
                (constraint) => {
                    const once = negateAtomicConstraint(constraint, DEFAULT_SRC);
                    // First negation produces 2 alternatives: [reversed, aligned]
                    expect(once).toHaveLength(2);

                    // Double-negate the reversed LeftConstraint (alt 0)
                    const negatedOnce = once[0][0] as LeftConstraint;
                    const twice = negateAtomicConstraint(negatedOnce, DEFAULT_SRC);
                    // Second negation also produces 2 alternatives
                    expect(twice).toHaveLength(2);

                    // The reversed alt of the double negation restores original direction
                    const negatedTwice = twice[0][0] as LeftConstraint;
                    expect(negatedTwice.left.id).toBe(constraint.left.id);
                    expect(negatedTwice.right.id).toBe(constraint.right.id);
                    expect(negatedTwice.minDistance).toBe(0);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('double-negating a TopConstraint: reversed alt restores direction', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes => arbTopConstraint(nodes)),
                (constraint) => {
                    const once = negateAtomicConstraint(constraint, DEFAULT_SRC);
                    expect(once).toHaveLength(2);

                    const negatedOnce = once[0][0] as TopConstraint;
                    const twice = negateAtomicConstraint(negatedOnce, DEFAULT_SRC);
                    expect(twice).toHaveLength(2);

                    const negatedTwice = twice[0][0] as TopConstraint;
                    expect(negatedTwice.top.id).toBe(constraint.top.id);
                    expect(negatedTwice.bottom.id).toBe(constraint.bottom.id);
                    expect(negatedTwice.minDistance).toBe(0);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });

    // ─── Conjunction negation (De Morgan) ────────────────────────────────

    describe('negateConjunction', () => {

        it('alternatives count equals sum of per-constraint alternatives', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        arbLeftConstraint(nodes),
                        arbTopConstraint(nodes),
                    )
                ),
                ([c1, c2]) => {
                    const conjunction = [c1, c2] as LayoutConstraint[];
                    const result = negateConjunction(conjunction, DEFAULT_SRC);

                    // LeftConstraint negation → 2 alternatives (reversed + aligned)
                    // TopConstraint negation → 2 alternatives (reversed + aligned)
                    // Total: 2 + 2 = 4
                    expect(result).toHaveLength(4);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('conjunction with alignment produces more alternatives', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        arbLeftConstraint(nodes),
                        arbAlignmentConstraint(nodes),
                    )
                ),
                ([c1, c2]) => {
                    const conjunction = [c1, c2] as LayoutConstraint[];
                    const result = negateConjunction(conjunction, DEFAULT_SRC);

                    // LeftConstraint negation → 2 alternatives (reversed + aligned)
                    // AlignmentConstraint negation → 2 alternatives
                    // Total: 2 + 2 = 4
                    expect(result).toHaveLength(4);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('empty conjunction negation produces empty alternatives', () => {
            const result = negateConjunction([], DEFAULT_SRC);
            expect(result).toHaveLength(0);
        });
    });

    // ─── Disjunction negation (De Morgan) ────────────────────────────────

    describe('negateDisjunction', () => {

        it('produces N DisjunctiveConstraints for N alternatives', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        arbLeftConstraint(nodes),
                        arbTopConstraint(nodes),
                        arbLeftConstraint(nodes),
                    )
                ),
                ([c1, c2, c3]) => {
                    const alternatives: LayoutConstraint[][] = [[c1], [c2], [c3]];
                    const disj = new DisjunctiveConstraint(DEFAULT_SRC, alternatives);

                    const result = negateDisjunction(disj, DEFAULT_SRC);

                    // NOT(A1 ∨ A2 ∨ A3) = ¬A1 ∧ ¬A2 ∧ ¬A3 → 3 DisjunctiveConstraints
                    expect(result).toHaveLength(3);
                    for (const d of result) {
                        expect(d).toBeInstanceOf(DisjunctiveConstraint);
                        // Each negated single-constraint alternative produces 2 alternatives
                        expect(d.alternatives.length).toBeGreaterThanOrEqual(1);
                    }
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });

        it('negating a disjunction with alignment alternatives creates richer results', () => {
            fc.assert(fc.property(
                arbNodes(4).chain(nodes =>
                    fc.tuple(
                        arbLeftConstraint(nodes),
                        arbAlignmentConstraint(nodes),
                    )
                ),
                ([c1, c2]) => {
                    // Disjunction: ordering OR alignment
                    const disj = new DisjunctiveConstraint(DEFAULT_SRC, [[c1], [c2]]);

                    const result = negateDisjunction(disj, DEFAULT_SRC);

                    // NOT(ordering ∨ alignment) = NOT(ordering) ∧ NOT(alignment)
                    expect(result).toHaveLength(2);

                    // NOT(ordering) → 2 alternatives (reversed + aligned)
                    expect(result[0].alternatives).toHaveLength(2);
                    // NOT(alignment) → 2 alternatives
                    expect(result[1].alternatives).toHaveLength(2);
                }
            ), { numRuns: NUM_RUNS, timeout: TIMEOUT });
        });
    });
});
