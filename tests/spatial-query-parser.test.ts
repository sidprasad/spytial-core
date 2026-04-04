import { describe, it, expect } from 'vitest';
import { parseSpatialQuery, formatParsedQuery } from '../src/components/DiagramRepl/spatial-query-parser';

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
});
