/**
 * Regression tests for edge undo integrity in QualitativeConstraintValidator.
 *
 * Two former asymmetries between addQualitativeEdge and removeQualitativeEdge
 * could corrupt the ordering graphs during CDCL backtracking:
 *
 *  1. addEdge's redundant path (an equal-or-tighter edge already exists)
 *     inserted nothing, and its tightening path overwrote the weight — but
 *     removeEdge deleted unconditionally. Undoing an assignment whose
 *     constraint duplicated an existing pair therefore destroyed an edge a
 *     base constraint (or another assigned alternative) still required, after
 *     which contradictory alternatives became addable: the validator could
 *     answer SAT with a cyclic committed constraint set (see the minimal
 *     divergence specimen below; found via Z3 fuzzing, validator=SAT while
 *     Z3=UNSAT).
 *
 *  2. addQualitativeEdge(BoundingBox) added the node↔group edge AND the
 *     per-member Rule C edges, but removeQualitativeEdge removed only the
 *     group edge — member edges leaked after backtracking, leaving the graph
 *     over-constrained.
 *
 * The fix makes every successful addEdge register a claim (multiset of
 * weights per directed edge) and replaces blind removal with
 * removeEdgeClaim, which releases one matching claim, keeps the edge at the
 * strongest remaining claim, and deletes it only when the last claim goes.
 */

import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';
import {
    DisjunctiveConstraint,
    InstanceLayout,
    LayoutConstraint,
    LayoutGroup,
    LayoutNode,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

const SRC = new RelativeOrientationConstraint(['left'], 'undo-integrity');
const GBF = new GroupByField('type', 0, 1, 'type');

function node(id: string, width = 100, height = 60): LayoutNode {
    return {
        id, label: id, color: 'black', groups: [], attributes: {},
        width, height, mostSpecificType: 'Node', types: ['Node'], showLabels: true,
    };
}

function leftOf(a: LayoutNode, b: LayoutNode, minDistance: number): LayoutConstraint {
    return { left: a, right: b, minDistance, sourceConstraint: SRC };
}

/** Validator with private access for driving assign/undo paths directly. */
function rig(layout: InstanceLayout): any {
    return new QualitativeConstraintValidator(layout) as any;
}

describe('Edge undo integrity (claim-based add/remove)', () => {

    describe('duplicate-pair constraints', () => {

        it('undoing a redundant duplicate preserves the base edge and weight', () => {
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [leftOf(A, B, 15)], groups: [] });
            expect(v.validateConstraints()).toBeNull();
            const w = v.hGraph.getEdgeWeight('A', 'B'); // 15 + width(A) = 115

            const dup = leftOf(A, B, 10); // strictly looser → redundant add path
            expect(v.addQualitativeEdge(dup)).toBe(true);
            v.removeQualitativeEdge(dup);

            expect(v.hGraph.hasEdge('A', 'B')).toBe(true);
            expect(v.hGraph.getEdgeWeight('A', 'B')).toBe(w);
        });

        it('undoing a tightening duplicate restores the displaced weight', () => {
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [leftOf(A, B, 15)], groups: [] });
            expect(v.validateConstraints()).toBeNull();
            const w = v.hGraph.getEdgeWeight('A', 'B');

            const tighter = leftOf(A, B, 500);
            expect(v.addQualitativeEdge(tighter)).toBe(true);
            expect(v.hGraph.getEdgeWeight('A', 'B')).toBe(500 + A.width);
            v.removeQualitativeEdge(tighter);

            expect(v.hGraph.hasEdge('A', 'B')).toBe(true);
            expect(v.hGraph.getEdgeWeight('A', 'B')).toBe(w);
        });

        it('provenance follows the strongest remaining claim across a release', () => {
            // Conflict analysis maps path edges back to trail entries through
            // provenance, so provenance naming a released constraint finds no
            // trail entry — silently dropping a literal and yielding a learned
            // clause stronger than the conflict justifies.
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [], groups: [] });

            const weak = leftOf(A, B, 10);
            const strong = leftOf(A, B, 500);
            v.addQualitativeEdge(weak);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(weak);

            v.addQualitativeEdge(strong); // tightens; takes over provenance
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(strong);

            v.removeQualitativeEdge(strong); // weak still holds the edge
            expect(v.hGraph.hasEdge('A', 'B')).toBe(true);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(weak);

            v.removeQualitativeEdge(weak);
            expect(v.hGraph.hasEdge('A', 'B')).toBe(false);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBeUndefined();
        });

        it('releases the releasing constraint own claim when weights collide', () => {
            // Two DISTINCT constraints on the same pair with the same
            // minDistance produce claims of equal weight. Matching a release by
            // weight alone drops the first record, leaving the just-released
            // constraint's claim alive — so provenance names an off-trail
            // constraint while the still-active one goes unnamed, and conflict
            // analysis omits its literal.
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [], groups: [] });

            const first = leftOf(A, B, 15);
            const second = leftOf(A, B, 15); // distinct object, identical weight
            v.addQualitativeEdge(first);
            v.addQualitativeEdge(second);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(first); // ties keep earliest

            v.removeQualitativeEdge(second);
            expect(v.hGraph.hasEdge('A', 'B')).toBe(true);
            // Must name `first`, which still holds the edge — not `second`.
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(first);

            v.removeQualitativeEdge(first);
            expect(v.hGraph.hasEdge('A', 'B')).toBe(false);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBeUndefined();
        });

        it('releasing a constraint that never claimed the edge is a no-op', () => {
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [], groups: [] });

            const held = leftOf(A, B, 15);
            const neverAdded = leftOf(A, B, 15); // same weight, never registered
            v.addQualitativeEdge(held);

            v.removeQualitativeEdge(neverAdded);
            expect(v.hGraph.hasEdge('A', 'B')).toBe(true);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(held);
        });

        it('a redundant add does not steal provenance from the stronger claim', () => {
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [], groups: [] });

            const strong = leftOf(A, B, 500);
            const weak = leftOf(A, B, 10);
            v.addQualitativeEdge(strong);
            v.addQualitativeEdge(weak); // redundant — no graph change
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(strong);

            v.removeQualitativeEdge(weak);
            expect(v.hGraph.getEdgeProvenance('A', 'B')).toBe(strong);
        });

        it('non-LIFO release keeps the strongest remaining claim', () => {
            const A = node('A'), B = node('B');
            const v = rig({ nodes: [A, B], edges: [], constraints: [leftOf(A, B, 15)], groups: [] });
            expect(v.validateConstraints()).toBeNull();
            const base = v.hGraph.getEdgeWeight('A', 'B'); // 115

            const tighter = leftOf(A, B, 500);
            const looser = leftOf(A, B, 10);
            v.addQualitativeEdge(tighter); // weight → 600
            v.addQualitativeEdge(looser);  // redundant claim (110)
            v.removeQualitativeEdge(tighter); // release out of add order

            expect(v.hGraph.getEdgeWeight('A', 'B')).toBe(base); // max(115, 110)
            v.removeQualitativeEdge(looser);
            expect(v.hGraph.getEdgeWeight('A', 'B')).toBe(base);
        });
    });

    describe('BoundingBox alternatives', () => {

        const bboxLeft = (x: LayoutNode, group: LayoutGroup): LayoutConstraint =>
            ({ node: x, group, side: 'left', minDistance: 15, sourceConstraint: GBF } as any);

        it('undo releases the group edge AND the Rule C member edges', () => {
            const M1 = node('M1'), M2 = node('M2'), X = node('X');
            const group: LayoutGroup = { name: 'G', nodeIds: ['M1', 'M2'], keyNodeId: 'M1', showLabel: true, sourceConstraint: GBF };
            // No validateConstraints: its own solving would add claims of its own.
            const v = rig({ nodes: [M1, M2, X], edges: [], constraints: [], groups: [group] });

            const bbox = bboxLeft(X, group);
            expect(v.addQualitativeEdge(bbox)).toBe(true);
            expect(v.hGraph.hasEdge('X', '_group_G')).toBe(true);
            expect(v.hGraph.hasEdge('X', 'M1')).toBe(true);
            expect(v.hGraph.hasEdge('X', 'M2')).toBe(true);

            v.removeQualitativeEdge(bbox);
            expect(v.hGraph.hasEdge('X', '_group_G')).toBe(false);
            expect(v.hGraph.hasEdge('X', 'M1')).toBe(false);
            expect(v.hGraph.hasEdge('X', 'M2')).toBe(false);
        });

        it('undo leaves a member edge intact while another constraint claims it', () => {
            const M1 = node('M1'), M2 = node('M2'), X = node('X');
            const group: LayoutGroup = { name: 'G', nodeIds: ['M1', 'M2'], keyNodeId: 'M1', showLabel: true, sourceConstraint: GBF };
            const v = rig({ nodes: [M1, M2, X], edges: [], constraints: [], groups: [group] });

            const ordering = leftOf(X, M1, 15);
            const bbox = bboxLeft(X, group);
            expect(v.addQualitativeEdge(ordering)).toBe(true);
            expect(v.addQualitativeEdge(bbox)).toBe(true);

            v.removeQualitativeEdge(bbox);
            expect(v.hGraph.hasEdge('X', 'M1')).toBe(true); // ordering's claim survives
            expect(v.hGraph.hasEdge('X', 'M2')).toBe(false);

            v.removeQualitativeEdge(ordering);
            expect(v.hGraph.hasEdge('X', 'M1')).toBe(false);
        });
    });

    describe('end-to-end soundness', () => {

        it('minimal divergence specimen: duplicate + cycle-closer alternative is UNSAT and leaves the base edge intact', () => {
            // Base: N0 <x N3. Both alternatives contain N3 <x N0, so the
            // instance is UNSAT. Pre-fix trajectory: pickBranch tries a0 (same
            // length as a1); its duplicate add was redundant (no insert), its
            // closer failed on the base cycle, and undoAlternativeEdges then
            // deleted the BASE edge — letting a1's closer succeed and the
            // validator answer SAT with the cyclic committed set
            // {N0 <x N3, N3 <x N0}. Found by Z3 differential fuzzing.
            const N0 = node('N0', 52, 89), N3 = node('N3', 89, 85);
            const N1 = node('N1', 60, 40), N2 = node('N2', 60, 40);
            const layout: InstanceLayout = {
                nodes: [N0, N1, N2, N3], edges: [],
                constraints: [leftOf(N0, N3, 20)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(SRC, [
                        [leftOf(N0, N3, 13), leftOf(N3, N0, 5)],
                        [leftOf(N3, N0, 5), leftOf(N1, N2, 5)],
                    ]),
                ],
            };
            const v = rig(layout);
            const error = v.validateConstraints();
            expect(error).not.toBeNull();
            expect(v.hGraph.hasEdge('N0', 'N3')).toBe(true);
            // The committed set must not contain both directions of a pair.
            const committed = layout.constraints.filter((c: any) => c.left).map((c: any) => `${c.left.id}->${c.right.id}`);
            for (const dir of committed) {
                const [a, b] = dir.split('->');
                expect(committed).not.toContain(`${b}->${a}`);
            }
        });
    });

    describe('weight-dependent caches and implied alternatives', () => {
        // Zero-size nodes so an edge weight equals its minDistance exactly.
        const zn = (id: string): LayoutNode => node(id, 0, 0);
        const entailed = (v: any, a: string, b: string): number | undefined =>
            v.hGraph.maxWeightFrom(a).get(b);

        it('tightening a positive edge invalidates the longest-path memo', () => {
            // A positive→positive tightening deliberately does not bump the
            // reachability stamps (reachability and strict-orderedness are
            // unchanged), so the distance caches need their own weight stamp or
            // they stay stale while looking valid.
            const A = zn('A'), B = zn('B'), C = zn('C');
            const first = leftOf(A, B, 1);
            const constraints = [first, leftOf(B, C, 1)];
            const v = rig({ nodes: [A, B, C], edges: [], constraints, groups: [] });
            expect(v.validateConstraints()).toBeNull();
            expect(entailed(v, 'A', 'C')).toBe(2); // warms the memo

            (first as { minDistance: number }).minDistance = 10;
            expect(v.validateConstraints()).toBeNull();

            expect(entailed(v, 'A', 'C')).toBe(11);
        });

        it('an insert invalidates the longest-path memo despite the incremental closure', () => {
            // The incremental-closure path keeps the reachability memo warm
            // across an insert by syncing its stamp; distances are not patched,
            // so they must still be dropped.
            const A = zn('A'), B = zn('B'), C = zn('C');
            const constraints = [leftOf(A, B, 3)];
            const v = rig({ nodes: [A, B, C], edges: [], constraints, groups: [] });
            expect(v.validateConstraints()).toBeNull();
            expect(entailed(v, 'A', 'B')).toBe(3);
            expect(entailed(v, 'A', 'C')).toBeUndefined();

            constraints.push(leftOf(B, C, 4));
            expect(v.validateConstraints()).toBeNull();

            expect(entailed(v, 'A', 'C')).toBe(7);
        });

        it('an alternative demanding more separation than is entailed is not treated as implied', () => {
            // isOrdered proves only that SOME separation is forced; committing a
            // stronger constraint on that basis left the graph under-entailing
            // what the committed set requires.
            const A = zn('A'), B = zn('B'), C = zn('C');
            const layout: InstanceLayout = {
                nodes: [A, B, C], edges: [],
                constraints: [leftOf(A, B, 1)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(SRC, [
                        [leftOf(A, B, 50)],
                        [leftOf(A, C, 1)],
                    ]),
                ],
            };
            const v = rig(layout);
            expect(v.validateConstraints()).toBeNull();

            const committedAB = layout.constraints.some(
                (c: any) => c.left?.id === 'A' && c.right?.id === 'B' && c.minDistance === 50,
            );
            if (committedAB) {
                // If it was committed, the graph must actually force it.
                expect(entailed(v, 'A', 'B')).toBeGreaterThanOrEqual(50);
            }
        });

        it('an alternative already entailed at its own distance still counts as implied', () => {
            // The check must not over-tighten into rejecting genuine
            // implications: an identical existing edge qualifies.
            const A = zn('A'), B = zn('B'), C = zn('C');
            const layout: InstanceLayout = {
                nodes: [A, B, C], edges: [],
                constraints: [leftOf(A, B, 20)],
                groups: [],
                disjunctiveConstraints: [
                    new DisjunctiveConstraint(SRC, [
                        [leftOf(A, B, 20)],
                        [leftOf(B, A, 5)],
                    ]),
                ],
            };
            const v = rig(layout);
            expect(v.validateConstraints()).toBeNull();
            expect(entailed(v, 'A', 'B')).toBe(20);
            expect(v.hGraph.hasEdge('B', 'A')).toBe(false); // the reverse was not taken
        });
    });
});
