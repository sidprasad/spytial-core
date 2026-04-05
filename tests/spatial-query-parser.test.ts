import { describe, it, expect } from 'vitest';
import { parseSpatialQuery, formatParsedQuery, evaluateCompoundQuery } from '../src/components/DiagramRepl/spatial-query-parser';
import type { QueryExpression } from '../src/components/DiagramRepl/spatial-query-parser';
import { LayoutEvaluator } from '../src/evaluators/layout-evaluator';
import type { InstanceLayout, LayoutNode, LeftConstraint, TopConstraint, AlignmentConstraint } from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';
import { QualitativeConstraintValidator } from '../src/layout/qualitative-constraint-validator';

describe('spatial-query-parser', () => {
    describe('compact form: modality relation(nodeId)', () => {
        it('parses must leftOf(Node0)', () => {
            const result = parseSpatialQuery('must leftOf(Node0)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('must');
            expect(result.value.query.relation).toBe('leftOf');
            expect(result.value.query.nodeId).toBe('Node0');
        });

        it('parses can above(Node3)', () => {
            const result = parseSpatialQuery('can above(Node3)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('can');
            expect(result.value.query.relation).toBe('above');
            expect(result.value.query.nodeId).toBe('Node3');
        });

        it('parses cannot xAligned(Root)', () => {
            const result = parseSpatialQuery('cannot xAligned(Root)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('cannot');
            expect(result.value.query.relation).toBe('xAligned');
            expect(result.value.query.nodeId).toBe('Root');
        });

        it('parses transitive closure with ^', () => {
            const result = parseSpatialQuery('must ^leftOf(Node0)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.query.transitive).toBe(true);
            expect(result.value.query.relation).toBe('leftOf');
        });

        it('parses all 8 relations', () => {
            const relations = ['leftOf', 'rightOf', 'above', 'below', 'xAligned', 'yAligned', 'grouped', 'contains'];
            for (const rel of relations) {
                const result = parseSpatialQuery(`must ${rel}(N)`);
                expect(result.ok).toBe(true);
                if (result.ok) expect(result.value.query.relation).toBe(rel);
            }
        });
    });

    describe('set-comprehension form: modality { x | relation(x, nodeId) }', () => {
        it('parses must { x | leftOf(x, Node0) }', () => {
            const result = parseSpatialQuery('must { x | leftOf(x, Node0) }');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('must');
            expect(result.value.query.relation).toBe('leftOf');
            expect(result.value.query.nodeId).toBe('Node0');
        });

        it('parses transitive closure in set-comprehension', () => {
            const result = parseSpatialQuery('can { y | ^above(y, Root) }');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('can');
            expect(result.value.query.relation).toBe('above');
            expect(result.value.query.nodeId).toBe('Root');
            expect(result.value.query.transitive).toBe(true);
        });

        it('handles spacing variations', () => {
            const result = parseSpatialQuery('must {x|leftOf(x,Node0)}');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.query.relation).toBe('leftOf');
            expect(result.value.query.nodeId).toBe('Node0');
        });
    });

    describe('error handling', () => {
        it('rejects empty input', () => {
            const result = parseSpatialQuery('');
            expect(result.ok).toBe(false);
        });

        it('rejects missing modality', () => {
            const result = parseSpatialQuery('leftOf(Node0)');
            expect(result.ok).toBe(false);
            // "leftOf(Node0)" has no space, so it's one token → "no predicate" error
            // "leftOf Node0" splits → leftOf is unknown modality
            if (!result.ok) expect(result.error.message).toBeDefined();
        });

        it('rejects invalid modality', () => {
            const result = parseSpatialQuery('maybe leftOf(Node0)');
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.hint).toContain('must');
        });

        it('rejects unknown relation', () => {
            const result = parseSpatialQuery('must overlaps(Node0)');
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.message).toContain('Unknown relation');
        });

        it('rejects malformed predicate', () => {
            const result = parseSpatialQuery('must leftOf Node0');
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.hint).toContain('relation(nodeId)');
        });
    });

    describe('formatParsedQuery', () => {
        it('formats a basic query', () => {
            const result = parseSpatialQuery('must leftOf(Node0)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const formatted = formatParsedQuery(result.value);
            expect(formatted).toContain('must');
            expect(formatted).toContain('leftOf');
            expect(formatted).toContain('Node0');
        });
    });

    // ─── Phase 3: Boolean combinators ──────────────────────────────────

    describe('Phase 3: boolean combinators (and/or/not)', () => {
        it('parses must leftOf(A) and above(B)', () => {
            const result = parseSpatialQuery('must leftOf(A) and above(B)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.modality).toBe('must');
            expect(result.value.expression.type).toBe('and');
            if (result.value.expression.type !== 'and') return;
            expect(result.value.expression.left).toEqual({ type: 'atomic', query: { relation: 'leftOf', nodeId: 'A', transitive: undefined } });
            expect(result.value.expression.right).toEqual({ type: 'atomic', query: { relation: 'above', nodeId: 'B', transitive: undefined } });
        });

        it('parses must leftOf(A) or rightOf(B)', () => {
            const result = parseSpatialQuery('must leftOf(A) or rightOf(B)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.expression.type).toBe('or');
        });

        it('parses must not leftOf(A)', () => {
            const result = parseSpatialQuery('must not leftOf(A)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.expression.type).toBe('not');
            if (result.value.expression.type !== 'not') return;
            expect(result.value.expression.operand.type).toBe('atomic');
        });

        it('and binds tighter than or: a or b and c = a or (b and c)', () => {
            const result = parseSpatialQuery('must leftOf(A) or above(B) and below(C)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            // Should be: or(leftOf(A), and(above(B), below(C)))
            expect(result.value.expression.type).toBe('or');
            if (result.value.expression.type !== 'or') return;
            expect(result.value.expression.right.type).toBe('and');
        });

        it('not binds tightest: not a and b = (not a) and b', () => {
            const result = parseSpatialQuery('must not leftOf(A) and above(B)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            // Should be: and(not(leftOf(A)), above(B))
            expect(result.value.expression.type).toBe('and');
            if (result.value.expression.type !== 'and') return;
            expect(result.value.expression.left.type).toBe('not');
        });

        it('parses chained and: a and b and c', () => {
            const result = parseSpatialQuery('must leftOf(A) and above(B) and below(C)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            // Left-associative: and(and(leftOf(A), above(B)), below(C))
            expect(result.value.expression.type).toBe('and');
        });

        it('parses transitive in compound: ^leftOf(A) and above(B)', () => {
            const result = parseSpatialQuery('must ^leftOf(A) and above(B)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.expression.type).toBe('and');
            if (result.value.expression.type !== 'and') return;
            const left = result.value.expression.left;
            expect(left.type).toBe('atomic');
            if (left.type !== 'atomic') return;
            expect(left.query.transitive).toBe(true);
            expect(left.query.relation).toBe('leftOf');
        });

        it('atomic queries still set expression field', () => {
            const result = parseSpatialQuery('must leftOf(Node0)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.value.expression).toEqual({ type: 'atomic', query: result.value.query });
        });

        it('formats compound expression', () => {
            const result = parseSpatialQuery('must leftOf(A) and above(B)');
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const formatted = formatParsedQuery(result.value);
            expect(formatted).toContain('and');
            expect(formatted).toContain('leftOf');
            expect(formatted).toContain('above');
        });
    });

    // ─── Phase 3: Compound query evaluation ────────────────────────────

    describe('Phase 3: compound query evaluation (set operations)', () => {
        // Fixture: A — B — C (left constraints), A above D
        const dummySource = new RelativeOrientationConstraint(['left'], 'Node', false);
        function makeNode(id: string): LayoutNode {
            return { id, label: id, color: '#000', width: 50, height: 50, mostSpecificType: 'Node', types: ['Node'], showLabels: true };
        }
        const nodeA = makeNode('A');
        const nodeB = makeNode('B');
        const nodeC = makeNode('C');
        const nodeD = makeNode('D');
        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB, nodeC, nodeD],
            edges: [],
            constraints: [
                { left: nodeA, right: nodeB, minDistance: 30, sourceConstraint: dummySource } as LeftConstraint,
                { left: nodeB, right: nodeC, minDistance: 30, sourceConstraint: dummySource } as LeftConstraint,
                { top: nodeA, bottom: nodeD, minDistance: 30, sourceConstraint: dummySource } as TopConstraint,
            ],
            groups: [],
        };
        const allNodeIds = new Set(['A', 'B', 'C', 'D']);

        function makeEv(): LayoutEvaluator {
            const cloned = { ...layout, constraints: [...layout.constraints] };
            const validator = new QualitativeConstraintValidator(cloned);
            validator.validateConstraints();
            const ev = new LayoutEvaluator();
            ev.initialize(cloned, validator);
            return ev;
        }

        function evalCompound(modality: 'must' | 'can' | 'cannot', expr: QueryExpression): string[] {
            const result = evaluateCompoundQuery(makeEv(), modality, expr, allNodeIds);
            return result.selectedAtoms();
        }

        it('and = intersection: must leftOf(C) ∩ must above(D) = {A}', () => {
            // must.leftOf(C) = {A, B}, must.above(D) = {A}
            const expr: QueryExpression = {
                type: 'and',
                left: { type: 'atomic', query: { relation: 'leftOf', nodeId: 'C' } },
                right: { type: 'atomic', query: { relation: 'above', nodeId: 'D' } },
            };
            expect(evalCompound('must', expr)).toEqual(['A']);
        });

        it('or = union: must rightOf(A) ∪ must below(A) = {B, C, D}', () => {
            // must.rightOf(A) = {B, C}, must.below(A) = {D}
            const expr: QueryExpression = {
                type: 'or',
                left: { type: 'atomic', query: { relation: 'rightOf', nodeId: 'A' } },
                right: { type: 'atomic', query: { relation: 'below', nodeId: 'A' } },
            };
            expect(evalCompound('must', expr)).toEqual(['B', 'C', 'D']);
        });

        it('not = complement: must not rightOf(A) = {A, D}', () => {
            // must.rightOf(A) = {B, C}, complement = {A, D}
            const expr: QueryExpression = {
                type: 'not',
                operand: { type: 'atomic', query: { relation: 'rightOf', nodeId: 'A' } },
            };
            expect(evalCompound('must', expr)).toEqual(['A', 'D']);
        });

        it('not and = complement ∩ set: not rightOf(A) and leftOf(C)', () => {
            // not(must.rightOf(A)) = {A, D}, must.leftOf(C) = {A, B}
            // intersection = {A}
            const expr: QueryExpression = {
                type: 'and',
                left: {
                    type: 'not',
                    operand: { type: 'atomic', query: { relation: 'rightOf', nodeId: 'A' } },
                },
                right: { type: 'atomic', query: { relation: 'leftOf', nodeId: 'C' } },
            };
            expect(evalCompound('must', expr)).toEqual(['A']);
        });

        it('works with cannot modality', () => {
            // cannot.leftOf(A) = {A, B, C} (A plus everything right of A)
            // cannot.above(D) = {D} (D plus everything below D = just D)
            // or = {A, B, C, D}
            const expr: QueryExpression = {
                type: 'or',
                left: { type: 'atomic', query: { relation: 'leftOf', nodeId: 'A' } },
                right: { type: 'atomic', query: { relation: 'above', nodeId: 'D' } },
            };
            expect(evalCompound('cannot', expr)).toEqual(['A', 'B', 'C', 'D']);
        });

        it('end-to-end: parse and evaluate compound query', () => {
            const parsed = parseSpatialQuery('must leftOf(C) and above(D)');
            expect(parsed.ok).toBe(true);
            if (!parsed.ok) return;
            const result = evaluateCompoundQuery(makeEv(), parsed.value.modality, parsed.value.expression, allNodeIds);
            expect(result.selectedAtoms()).toEqual(['A']);
        });
    });
});
