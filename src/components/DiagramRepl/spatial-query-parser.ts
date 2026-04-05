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
 * Phase 3 — boolean combinators:
 *   must leftOf(A) and above(B)        — intersection
 *   must leftOf(A) or above(B)         — union
 *   must not leftOf(A)                 — complement (all nodes \ result)
 *   must not leftOf(A) and above(B)    — not binds tighter than and/or
 *
 * The parser is intentionally lenient — it accepts both the compact form
 * `must leftOf(Node0)` and the set-comprehension form
 * `must { x | leftOf(x, Node0) }`. Both produce the same SpatialQuery.
 *
 * Grammar (informal):
 *   query       ::= modality expression
 *   expression  ::= term ('or' term)*
 *   term        ::= factor ('and' factor)*
 *   factor      ::= 'not' factor | predicate
 *   modality    ::= 'must' | 'can' | 'cannot'
 *   predicate   ::= ['^'] relation '(' nodeId [',' options] ')'
 *                  | '{' var '|' ['^'] relation '(' var ',' nodeId ')' '}'
 *   relation    ::= 'leftOf' | 'rightOf' | 'above' | 'below'
 *                 | 'xAligned' | 'yAligned' | 'grouped' | 'contains'
 */

import type { SpatialQuery, SpatialRelation, ILayoutEvaluator, IEvaluatorResult } from '../../evaluators/interfaces';
import { LayoutEvaluatorResult } from '../../evaluators/layout-evaluator';

export type Modality = 'must' | 'can' | 'cannot';

/**
 * Expression tree for compound spatial queries (Phase 3 boolean combinators).
 *
 * Atomic expressions wrap a single SpatialQuery.
 * Compound expressions combine sub-expressions with and/or/not (set operations).
 */
export type QueryExpression =
    | { type: 'atomic'; query: SpatialQuery }
    | { type: 'and'; left: QueryExpression; right: QueryExpression }
    | { type: 'or'; left: QueryExpression; right: QueryExpression }
    | { type: 'not'; operand: QueryExpression };

export interface ParsedDiagramQuery {
    modality: Modality;
    /** The atomic query — available for simple (non-compound) queries. */
    query: SpatialQuery;
    /** The full expression tree (supports boolean combinators). Always set. */
    expression: QueryExpression;
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
 *   "must leftOf(Node0)"                → atomic query
 *   "can ^above(Node0)"                 → atomic with transitive closure
 *   "must { x | leftOf(x, N0) }"        → set-comprehension form
 *   "cannot grouped(Node0)"             → atomic query
 *   "must leftOf(A) and above(B)"       → compound (intersection)
 *   "must leftOf(A) or above(B)"        → compound (union)
 *   "must not leftOf(A)"                → compound (complement)
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

    // Check for compound expression (contains 'and', 'or', or starts with 'not')
    if (isCompoundExpression(rest)) {
        const exprResult = parseExpression(rest);
        if (!exprResult.ok) return exprResult;
        const expression = exprResult.value;
        // For compound expressions, query points to the first atomic sub-expression (best effort)
        const firstAtomic = findFirstAtomic(expression);
        return {
            ok: true,
            value: {
                modality,
                query: firstAtomic ?? { relation: 'leftOf', nodeId: '' },
                expression,
            },
        };
    }

    // Try set-comprehension form: { x | ^?relation(x, nodeId) }
    const setCompResult = parseSetComprehension(rest);
    if (setCompResult) {
        return {
            ok: true,
            value: {
                modality,
                query: setCompResult,
                expression: { type: 'atomic', query: setCompResult },
            },
        };
    }

    // Try compact form: ^?relation(nodeId)
    const compactResult = parseCompactPredicate(rest);
    if (compactResult.ok) {
        return {
            ok: true,
            value: {
                modality,
                query: compactResult.value,
                expression: { type: 'atomic', query: compactResult.value },
            },
        };
    }

    return compactResult;
}

/**
 * Check if the predicate part contains boolean combinators.
 */
function isCompoundExpression(rest: string): boolean {
    // Tokenize and check for 'and', 'or', or leading 'not'
    // Must be careful not to match inside parentheses or braces
    const tokens = tokenizeExpression(rest);
    return tokens.some(t => t === 'and' || t === 'or') || tokens[0] === 'not';
}

/**
 * Tokenize a predicate expression into atomic predicate strings and operators.
 * Groups predicate(...) and { ... } as single tokens.
 */
function tokenizeExpression(input: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const s = input.trim();

    while (i < s.length) {
        // Skip whitespace
        while (i < s.length && s[i] === ' ') i++;
        if (i >= s.length) break;

        // Check for keywords
        for (const kw of ['and', 'or', 'not']) {
            if (s.substring(i, i + kw.length) === kw &&
                (i + kw.length >= s.length || s[i + kw.length] === ' ' || s[i + kw.length] === '(')) {
                // Make sure it's not a prefix of a relation name
                const after = s.substring(i, i + kw.length + 1);
                if (kw === 'not' && !VALID_RELATIONS.has(s.substring(i).split(/[\s(]/)[0])) {
                    tokens.push(kw);
                    i += kw.length;
                    continue;
                }
                if (kw !== 'not') {
                    tokens.push(kw);
                    i += kw.length;
                    continue;
                }
            }
        }

        // Check for set-comprehension form { ... }
        if (s[i] === '{') {
            let depth = 1;
            let j = i + 1;
            while (j < s.length && depth > 0) {
                if (s[j] === '{') depth++;
                if (s[j] === '}') depth--;
                j++;
            }
            tokens.push(s.substring(i, j));
            i = j;
            continue;
        }

        // Collect a predicate token (optional ^ + word + parenthesized args)
        if (s[i] === '^' || /\w/.test(s[i])) {
            let j = i;
            // Consume optional ^
            if (s[j] === '^') j++;
            // Consume word
            while (j < s.length && /\w/.test(s[j])) j++;
            // Check if this is a keyword we already handled
            const word = s.substring(i, j).replace(/^\^/, '');
            if ((word === 'and' || word === 'or' || word === 'not') && s[i] !== '^') {
                // Already handled above, but just in case
                tokens.push(word);
                i = j;
                continue;
            }
            // Consume parenthesized args if present
            while (j < s.length && s[j] === ' ') j++;
            if (j < s.length && s[j] === '(') {
                let depth = 1;
                j++;
                while (j < s.length && depth > 0) {
                    if (s[j] === '(') depth++;
                    if (s[j] === ')') depth--;
                    j++;
                }
            }
            tokens.push(s.substring(i, j).trim());
            i = j;
            continue;
        }

        // Skip any other character
        i++;
    }

    return tokens;
}

/**
 * Parse a compound expression: expression ::= term ('or' term)*
 */
function parseExpression(input: string): { ok: true; value: QueryExpression } | { ok: false; error: ParseError } {
    const tokens = tokenizeExpression(input);
    const result = parseExprFromTokens(tokens, 0);
    if (!result.ok) return result;
    return { ok: true, value: result.value.expr };
}

interface TokenParseResult {
    ok: true;
    value: { expr: QueryExpression; nextIndex: number };
}

type TokenParseOutcome = TokenParseResult | { ok: false; error: ParseError };

/**
 * Parse expression from token array: expression = term ('or' term)*
 */
function parseExprFromTokens(tokens: string[], index: number): TokenParseOutcome {
    const leftResult = parseTermFromTokens(tokens, index);
    if (!leftResult.ok) return leftResult;
    let { expr, nextIndex } = leftResult.value;

    while (nextIndex < tokens.length && tokens[nextIndex] === 'or') {
        const rightResult = parseTermFromTokens(tokens, nextIndex + 1);
        if (!rightResult.ok) return rightResult;
        expr = { type: 'or', left: expr, right: rightResult.value.expr };
        nextIndex = rightResult.value.nextIndex;
    }

    return { ok: true, value: { expr, nextIndex } };
}

/**
 * Parse term from token array: term = factor ('and' factor)*
 */
function parseTermFromTokens(tokens: string[], index: number): TokenParseOutcome {
    const leftResult = parseFactorFromTokens(tokens, index);
    if (!leftResult.ok) return leftResult;
    let { expr, nextIndex } = leftResult.value;

    while (nextIndex < tokens.length && tokens[nextIndex] === 'and') {
        const rightResult = parseFactorFromTokens(tokens, nextIndex + 1);
        if (!rightResult.ok) return rightResult;
        expr = { type: 'and', left: expr, right: rightResult.value.expr };
        nextIndex = rightResult.value.nextIndex;
    }

    return { ok: true, value: { expr, nextIndex } };
}

/**
 * Parse factor from token array: factor = 'not' factor | atomic
 */
function parseFactorFromTokens(tokens: string[], index: number): TokenParseOutcome {
    if (index >= tokens.length) {
        return { ok: false, error: { message: 'Unexpected end of expression', hint: 'Expected a predicate after boolean operator' } };
    }

    if (tokens[index] === 'not') {
        const innerResult = parseFactorFromTokens(tokens, index + 1);
        if (!innerResult.ok) return innerResult;
        return {
            ok: true,
            value: {
                expr: { type: 'not', operand: innerResult.value.expr },
                nextIndex: innerResult.value.nextIndex,
            },
        };
    }

    // Atomic predicate
    const token = tokens[index];
    // Try set-comprehension form
    const setComp = parseSetComprehension(token);
    if (setComp) {
        return { ok: true, value: { expr: { type: 'atomic', query: setComp }, nextIndex: index + 1 } };
    }
    // Try compact form
    const compact = parseCompactPredicate(token);
    if (compact.ok) {
        return { ok: true, value: { expr: { type: 'atomic', query: compact.value }, nextIndex: index + 1 } };
    }

    return { ok: false, error: compact.error };
}

/**
 * Find the first atomic query in an expression tree (for backward compat).
 */
function findFirstAtomic(expr: QueryExpression): SpatialQuery | null {
    if (expr.type === 'atomic') return expr.query;
    if (expr.type === 'not') return findFirstAtomic(expr.operand);
    return findFirstAtomic(expr.left);
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
    return `${parsed.modality} ${formatExpression(parsed.expression)}`;
}

/**
 * Format a query expression tree back to string form.
 */
export function formatExpression(expr: QueryExpression): string {
    switch (expr.type) {
        case 'atomic': {
            const q = expr.query;
            const caret = q.transitive ? '^' : '';
            return `${caret}${q.relation}(${q.nodeId})`;
        }
        case 'and':
            return `(${formatExpression(expr.left)} and ${formatExpression(expr.right)})`;
        case 'or':
            return `(${formatExpression(expr.left)} or ${formatExpression(expr.right)})`;
        case 'not':
            return `not ${formatExpression(expr.operand)}`;
    }
}

// ─── Compound query evaluation ──────────────────────────────────────────────

/**
 * Evaluate a compound query expression against a layout evaluator.
 *
 * Boolean combinators operate on result SETS:
 *   and → intersection
 *   or  → union
 *   not → complement (allNodeIds \ result)
 *
 * The modality (must/can/cannot) is applied to each atomic sub-expression.
 */
export function evaluateCompoundQuery(
    evaluator: ILayoutEvaluator,
    modality: Modality,
    expression: QueryExpression,
    allNodeIds: Set<string>,
): IEvaluatorResult {
    const result = evaluateExpressionSet(evaluator, modality, expression, allNodeIds);
    if ('error' in result) {
        return LayoutEvaluatorResult.error(
            `${modality} ${formatExpression(expression)}`,
            result.error,
        );
    }
    return LayoutEvaluatorResult.of(
        result.nodes,
        `${modality} ${formatExpression(expression)}`,
    );
}

type SetResult = { nodes: Set<string> } | { error: string };

function evaluateExpressionSet(
    evaluator: ILayoutEvaluator,
    modality: Modality,
    expression: QueryExpression,
    allNodeIds: Set<string>,
): SetResult {
    switch (expression.type) {
        case 'atomic': {
            const evalResult =
                modality === 'must' ? evaluator.must(expression.query) :
                modality === 'can' ? evaluator.can(expression.query) :
                evaluator.cannot(expression.query);

            if (evalResult.isError()) {
                return { error: evalResult.prettyPrint() };
            }
            return { nodes: new Set(evalResult.selectedAtoms()) };
        }

        case 'and': {
            const leftResult = evaluateExpressionSet(evaluator, modality, expression.left, allNodeIds);
            if ('error' in leftResult) return leftResult;
            const rightResult = evaluateExpressionSet(evaluator, modality, expression.right, allNodeIds);
            if ('error' in rightResult) return rightResult;
            // Intersection
            const intersection = new Set<string>();
            for (const n of leftResult.nodes) {
                if (rightResult.nodes.has(n)) intersection.add(n);
            }
            return { nodes: intersection };
        }

        case 'or': {
            const leftResult = evaluateExpressionSet(evaluator, modality, expression.left, allNodeIds);
            if ('error' in leftResult) return leftResult;
            const rightResult = evaluateExpressionSet(evaluator, modality, expression.right, allNodeIds);
            if ('error' in rightResult) return rightResult;
            // Union
            const union = new Set(leftResult.nodes);
            for (const n of rightResult.nodes) union.add(n);
            return { nodes: union };
        }

        case 'not': {
            const innerResult = evaluateExpressionSet(evaluator, modality, expression.operand, allNodeIds);
            if ('error' in innerResult) return innerResult;
            // Complement
            const complement = new Set<string>();
            for (const n of allNodeIds) {
                if (!innerResult.nodes.has(n)) complement.add(n);
            }
            return { nodes: complement };
        }
    }
}
