/**
 * Parser for the spatial query string syntax.
 *
 * Accepts expressions of the form:
 *   must leftOf(Node0)
 *   must { x | ^leftOf(x, Node0) }
 *   can above(Node0)
 *   cannot xAligned(Node0)
 *   must rightOf(Node0, transitive=false)
 *
 * The parser is intentionally lenient — it accepts both the compact form
 * `must leftOf(Node0)` and the set-comprehension form
 * `must { x | leftOf(x, Node0) }`. Both produce the same SpatialQuery.
 *
 * Grammar (informal):
 *   query     ::= modality predicate
 *   modality  ::= 'must' | 'can' | 'cannot'
 *   predicate ::= ['^'] relation '(' nodeId [',' options] ')'
 *               | '{' var '|' ['^'] relation '(' var ',' nodeId ')' '}'
 *   relation  ::= 'leftOf' | 'rightOf' | 'above' | 'below'
 *               | 'xAligned' | 'yAligned' | 'grouped' | 'contains'
 */

import type { SpatialQuery, SpatialRelation } from '../../evaluators/interfaces';

export type Modality = 'must' | 'can' | 'cannot';

export interface ParsedDiagramQuery {
    modality: Modality;
    query: SpatialQuery;
}

export interface ParseError {
    message: string;
    hint?: string;
}

export type ParseResult = { ok: true; value: ParsedDiagramQuery } | { ok: false; error: ParseError };

const VALID_RELATIONS: Set<string> = new Set([
    'leftOf', 'rightOf', 'above', 'below',
    'xAligned', 'yAligned', 'grouped', 'contains',
]);

const VALID_MODALITIES: Set<string> = new Set(['must', 'can', 'cannot']);

/**
 * Parse a spatial query string into a structured query.
 *
 * Examples:
 *   "must leftOf(Node0)"         → { modality: 'must', query: { relation: 'leftOf', nodeId: 'Node0' } }
 *   "can ^above(Node0)"          → { modality: 'can', query: { relation: 'above', nodeId: 'Node0', transitive: true } }
 *   "must { x | leftOf(x, N0) }" → { modality: 'must', query: { relation: 'leftOf', nodeId: 'N0' } }
 *   "cannot grouped(Node0)"      → { modality: 'cannot', query: { relation: 'grouped', nodeId: 'Node0' } }
 */
export function parseSpatialQuery(input: string): ParseResult {
    const trimmed = input.trim();
    if (!trimmed) {
        return { ok: false, error: { message: 'Empty query', hint: 'Try: must leftOf(Node0)' } };
    }

    // Split into modality + rest
    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace === -1) {
        return {
            ok: false,
            error: {
                message: `Expected modality followed by predicate, got: "${trimmed}"`,
                hint: 'Try: must leftOf(Node0)',
            },
        };
    }

    const modalityStr = trimmed.substring(0, firstSpace).toLowerCase();
    const rest = trimmed.substring(firstSpace + 1).trim();

    if (!VALID_MODALITIES.has(modalityStr)) {
        return {
            ok: false,
            error: {
                message: `Unknown modality: "${modalityStr}"`,
                hint: `Valid modalities: must, can, cannot`,
            },
        };
    }
    const modality = modalityStr as Modality;

    // Try set-comprehension form: { x | ^?relation(x, nodeId) }
    const setCompResult = parseSetComprehension(rest);
    if (setCompResult) return { ok: true, value: { modality, query: setCompResult } };

    // Try compact form: ^?relation(nodeId)
    const compactResult = parseCompactPredicate(rest);
    if (compactResult.ok) return { ok: true, value: { modality, query: compactResult.value } };

    return compactResult;
}

/**
 * Parse the set-comprehension form: { x | ^?relation(x, nodeId) }
 * Returns null if the input doesn't match this form.
 */
function parseSetComprehension(input: string): SpatialQuery | null {
    // Match: { <var> | <optional ^><relation>(<var>, <nodeId>) }
    const match = input.match(
        /^\{\s*(\w+)\s*\|\s*(\^?)\s*(\w+)\s*\(\s*\w+\s*,\s*(\S+?)\s*\)\s*\}$/
    );
    if (!match) return null;

    const [, , caret, relation, nodeId] = match;

    if (!VALID_RELATIONS.has(relation)) return null;

    return {
        relation: relation as SpatialRelation,
        nodeId,
        transitive: caret === '^' ? true : undefined,
    };
}

/**
 * Parse the compact predicate form: ^?relation(nodeId)
 */
function parseCompactPredicate(input: string): { ok: true; value: SpatialQuery } | { ok: false; error: ParseError } {
    // Match: <optional ^><relation>(<nodeId>)
    const match = input.match(/^(\^?)\s*(\w+)\s*\(\s*(\S+?)\s*\)$/);
    if (!match) {
        return {
            ok: false,
            error: {
                message: `Cannot parse predicate: "${input}"`,
                hint: 'Expected: relation(nodeId) — e.g., leftOf(Node0) or ^above(Node0)',
            },
        };
    }

    const [, caret, relation, nodeId] = match;

    if (!VALID_RELATIONS.has(relation)) {
        return {
            ok: false,
            error: {
                message: `Unknown relation: "${relation}"`,
                hint: `Valid relations: ${Array.from(VALID_RELATIONS).join(', ')}`,
            },
        };
    }

    return {
        ok: true,
        value: {
            relation: relation as SpatialRelation,
            nodeId,
            transitive: caret === '^' ? true : undefined,
        },
    };
}

/**
 * Format a parsed query back to string form (for display in REPL output).
 */
export function formatParsedQuery(parsed: ParsedDiagramQuery): string {
    const { modality, query } = parsed;
    const caret = query.transitive ? '^' : '';
    return `${modality} { x | ${caret}${query.relation}(x, ${query.nodeId}) }`;
}
