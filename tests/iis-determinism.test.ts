import { describe, it, expect } from 'vitest';
import { QualitativeConstraintValidator, isPositionalConstraintError, type PositionalConstraintError } from '../src/layout/qualitative-constraint-validator';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import {
    InstanceLayout,
    LayoutNode,
    LeftConstraint,
    TopConstraint,
    AlignmentConstraint,
    DisjunctiveConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, AlignConstraint } from '../src/layout/layoutspec';

/**
 * Tests that IIS extraction is deterministic: the same (input, spec) pair
 * always produces the same IIS, regardless of how many times we run.
 */
describe('IIS Determinism', () => {

    function createNode(id: string): LayoutNode {
        return {
            id,
            label: id,
            color: 'black',
            groups: [],
            attributes: {},
            width: 100,
            height: 60,
            mostSpecificType: 'Node',
            types: ['Node'],
            showLabels: true,
        };
    }

    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source: any): LeftConstraint {
        return { left, right, minDistance: 15, sourceConstraint: source };
    }

    function createTopConstraint(top: LayoutNode, bottom: LayoutNode, source: any): TopConstraint {
        return { top, bottom, minDistance: 15, sourceConstraint: source };
    }

    function createAlignmentConstraint(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y', source: any): AlignmentConstraint {
        return { node1, node2, axis, sourceConstraint: source };
    }

    /** Extract a stable string representation of the IIS from an error. */
    function extractIIS(error: PositionalConstraintError): string[] {
        const parts: string[] = [];
        for (const [source, constraints] of error.minimalConflictingSet.entries()) {
            for (const c of constraints) {
                if ('left' in c && 'right' in c) {
                    const lc = c as LeftConstraint;
                    parts.push(`left(${lc.left.id},${lc.right.id})`);
                } else if ('top' in c && 'bottom' in c) {
                    const tc = c as TopConstraint;
                    parts.push(`top(${tc.top.id},${tc.bottom.id})`);
                } else if ('node1' in c && 'node2' in c) {
                    const ac = c as AlignmentConstraint;
                    parts.push(`align-${ac.axis}(${ac.node1.id},${ac.node2.id})`);
                }
            }
        }
        // Sort so comparison is order-independent within the IIS
        return parts.sort();
    }

    function runNTimes(
        buildLayout: () => InstanceLayout,
        n: number,
        Validator: typeof QualitativeConstraintValidator | typeof ConstraintValidator,
    ): string[][] {
        const results: string[][] = [];
        for (let i = 0; i < n; i++) {
            const layout = buildLayout();
            const validator = new Validator(layout);
            const error = validator.validateConstraints();
            expect(error).not.toBeNull();
            expect(isPositionalConstraintError(error)).toBe(true);
            results.push(extractIIS(error as PositionalConstraintError));
        }
        return results;
    }

    const RUNS = 10;

    describe('Qualitative Validator', () => {

        it('should produce the same IIS for a simple ordering cycle across repeated runs', () => {
            const buildLayout = () => {
                const nodes = ['A', 'B', 'C', 'D'].map(createNode);
                const [A, B, C, D] = nodes;
                const s1 = new RelativeOrientationConstraint(['left'], 'A->B');
                const s2 = new RelativeOrientationConstraint(['left'], 'B->C');
                const s3 = new RelativeOrientationConstraint(['left'], 'C->D');
                const s4 = new RelativeOrientationConstraint(['left'], 'D->A');
                return {
                    nodes,
                    edges: [],
                    constraints: [
                        createLeftConstraint(A, B, s1),
                        createLeftConstraint(B, C, s2),
                        createLeftConstraint(C, D, s3),
                        createLeftConstraint(D, A, s4),
                    ],
                    groups: [],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, QualitativeConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });

        it('should produce the same IIS for a cycle with redundant edges across repeated runs', () => {
            const buildLayout = () => {
                const nodes = ['A', 'B', 'C', 'D', 'E'].map(createNode);
                const [A, B, C, D, E] = nodes;
                const src = (label: string) => new RelativeOrientationConstraint(['left'], label);
                return {
                    nodes,
                    edges: [],
                    constraints: [
                        createLeftConstraint(A, B, src('A->B')),
                        createLeftConstraint(B, C, src('B->C')),
                        createLeftConstraint(C, D, src('C->D')),
                        createLeftConstraint(D, E, src('D->E')),
                        createLeftConstraint(A, C, src('A->C')),  // redundant
                        createLeftConstraint(A, D, src('A->D')),  // redundant
                        createLeftConstraint(B, D, src('B->D')),  // redundant
                        createLeftConstraint(E, A, src('E->A')),  // creates cycle
                    ],
                    groups: [],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, QualitativeConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });

        it('should produce the same IIS for alignment-ordering within-class conflicts', () => {
            const buildLayout = () => {
                const nodes = ['A', 'B', 'C'].map(createNode);
                const [A, B, C] = nodes;
                const alignSrc = new AlignConstraint('x', 'align-A-B');
                const orderSrc = new RelativeOrientationConstraint(['left'], 'A->B');
                return {
                    nodes,
                    edges: [],
                    constraints: [
                        createAlignmentConstraint(A, B, 'x', alignSrc),
                        createLeftConstraint(A, B, orderSrc),  // conflicts with x-alignment
                    ],
                    groups: [],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, QualitativeConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });

        it('should produce the same IIS for cross-class alignment cycle conflicts', () => {
            const buildLayout = () => {
                const nodes = ['N1', 'N2', 'N3', 'N4'].map(createNode);
                const [N1, N2, N3, N4] = nodes;
                const alignSrc1 = new AlignConstraint('y', 'align-N1-N4');
                const alignSrc2 = new AlignConstraint('y', 'align-N2-N3');
                const orderSrc1 = new RelativeOrientationConstraint(['above'], 'N2->N1');
                const orderSrc2 = new RelativeOrientationConstraint(['above'], 'N4->N3');
                return {
                    nodes,
                    edges: [],
                    constraints: [
                        createAlignmentConstraint(N1, N4, 'y', alignSrc1),
                        createAlignmentConstraint(N2, N3, 'y', alignSrc2),
                        createTopConstraint(N2, N1, orderSrc1),
                        createTopConstraint(N4, N3, orderSrc2),
                    ],
                    groups: [],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, QualitativeConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });

        it('should produce the same IIS for disjunctive UNSAT (CDCL) across repeated runs', () => {
            const buildLayout = () => {
                const nodes = ['A', 'B', 'C'].map(createNode);
                const [A, B, C] = nodes;
                const src1 = new RelativeOrientationConstraint(['left'], 'A->B');
                const src2 = new RelativeOrientationConstraint(['left'], 'B->C');
                const src3 = new RelativeOrientationConstraint(['left'], 'C->A');

                // Conjunctive: A < B, B < C
                const conjunctive = [
                    createLeftConstraint(A, B, src1),
                    createLeftConstraint(B, C, src2),
                ];

                // Disjunctive: only option is C < A, which creates a cycle
                const disj = new DisjunctiveConstraint(src3, [
                    [createLeftConstraint(C, A, src3)],
                ]);

                return {
                    nodes,
                    edges: [],
                    constraints: conjunctive,
                    groups: [],
                    disjunctiveConstraints: [disj],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, QualitativeConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });
    });

    describe('Kiwi Validator', () => {

        it('should produce the same IIS for a simple ordering cycle across repeated runs', () => {
            const buildLayout = () => {
                const nodes = ['A', 'B', 'C', 'D'].map(createNode);
                const [A, B, C, D] = nodes;
                const s1 = new RelativeOrientationConstraint(['left'], 'A->B');
                const s2 = new RelativeOrientationConstraint(['left'], 'B->C');
                const s3 = new RelativeOrientationConstraint(['left'], 'C->D');
                const s4 = new RelativeOrientationConstraint(['left'], 'D->A');
                return {
                    nodes,
                    edges: [],
                    constraints: [
                        createLeftConstraint(A, B, s1),
                        createLeftConstraint(B, C, s2),
                        createLeftConstraint(C, D, s3),
                        createLeftConstraint(D, A, s4),
                    ],
                    groups: [],
                } as InstanceLayout;
            };

            const results = runNTimes(buildLayout, RUNS, ConstraintValidator);
            const first = JSON.stringify(results[0]);
            for (let i = 1; i < results.length; i++) {
                expect(JSON.stringify(results[i])).toBe(first);
            }
        });
    });
});
