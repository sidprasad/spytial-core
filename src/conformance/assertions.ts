/**
 * Evaluating assertions against a layout.
 *
 * Every check compares against the atoms a spatial query returned. Queries that
 * return records (`node(A)`) or edges (`edges(A)`) project to atoms too — the
 * record's values and the edges' endpoints respectively — so one vocabulary
 * covers the whole query language.
 */

import { LayoutEvaluator } from '../evaluators/layout/layout-evaluator';
import { Assertion, AssertionResult, ASSERTION_CHECKS, Diagnostic } from './types';

/** Render a set for a failure message: sorted, quoted, or `(empty)`. */
function show(values: readonly string[]): string {
    if (values.length === 0) return '(empty)';
    return [...values].sort().map(v => `"${v}"`).join(', ');
}

/**
 * Reject assertions that ask nothing or misuse a field, so a typo in a case
 * file surfaces as a reported problem instead of a silent pass.
 */
export function validateAssertion(assertion: unknown, where: string): Diagnostic[] {
    const problems: Diagnostic[] = [];
    const bad = (message: string): Diagnostic =>
        ({ code: 'case/bad-assertion', severity: 'error', message, where });

    if (typeof assertion !== 'object' || assertion === null || Array.isArray(assertion)) {
        return [bad(`Assertion must be an object, got ${Array.isArray(assertion) ? 'an array' : typeof assertion}.`)];
    }

    const a = assertion as Record<string, unknown>;

    if (typeof a.query !== 'string' || a.query.length === 0) {
        problems.push(bad('Assertion needs a non-empty string "query".'));
    }

    const present = ASSERTION_CHECKS.filter(check => a[check] !== undefined);
    if (present.length === 0) {
        problems.push(bad(
            `Assertion has no check. Add one of: ${ASSERTION_CHECKS.join(', ')}.`,
        ));
    }

    for (const check of ['equals', 'contains', 'excludes'] as const) {
        const value = a[check];
        if (value === undefined) continue;
        if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
            problems.push(bad(`"${check}" must be an array of atom ids.`));
        }
    }
    for (const check of ['empty', 'nonEmpty'] as const) {
        if (a[check] !== undefined && typeof a[check] !== 'boolean') {
            problems.push(bad(`"${check}" must be a boolean.`));
        }
    }
    if (a.count !== undefined && (typeof a.count !== 'number' || !Number.isInteger(a.count) || a.count < 0)) {
        problems.push(bad('"count" must be a non-negative integer.'));
    }
    // Both fields are honoured in both directions, so they disagree exactly
    // when they hold the same value: `empty: true` with `nonEmpty: true`, or
    // `empty: false` with `nonEmpty: false`.
    if (typeof a.empty === 'boolean' && a.empty === a.nonEmpty) {
        problems.push(bad(
            `"empty" and "nonEmpty" contradict each other here — both are ${a.empty}. Give one, or give them opposite values.`,
        ));
    }

    return problems;
}

/**
 * Run one assertion. A query that errors — an unknown node id, a syntax
 * mistake — fails the assertion and reports the engine's message, since an
 * assertion that cannot be evaluated has not been satisfied.
 */
export function evaluateAssertion(evaluator: LayoutEvaluator, assertion: Assertion): AssertionResult {
    const result = evaluator.evaluate(assertion.query);

    if (result.isError()) {
        return {
            query: assertion.query,
            ok: false,
            actual: [],
            message: `Query could not be evaluated: ${result.prettyPrint()}`,
            because: assertion.because,
        };
    }

    const actual = [...new Set(result.selectedAtoms())].sort();
    const actualSet = new Set(actual);
    const failures: string[] = [];

    if (assertion.equals !== undefined) {
        const expected = [...new Set(assertion.equals)].sort();
        const missing = expected.filter(v => !actualSet.has(v));
        const extra = actual.filter(v => !expected.includes(v));
        if (missing.length > 0 || extra.length > 0) {
            const parts: string[] = [];
            if (missing.length > 0) parts.push(`missing ${show(missing)}`);
            if (extra.length > 0) parts.push(`unexpected ${show(extra)}`);
            failures.push(`expected exactly ${show(expected)}, got ${show(actual)} (${parts.join('; ')})`);
        }
    }

    if (assertion.contains !== undefined) {
        const missing = assertion.contains.filter(v => !actualSet.has(v));
        if (missing.length > 0) {
            failures.push(`expected to contain ${show(missing)}, got ${show(actual)}`);
        }
    }

    if (assertion.excludes !== undefined) {
        const present = assertion.excludes.filter(v => actualSet.has(v));
        if (present.length > 0) {
            failures.push(`expected not to contain ${show(present)}, got ${show(actual)}`);
        }
    }

    // Both booleans are honoured in both directions. `empty: false` reads as
    // "assert this is not empty", and a host generating cases programmatically
    // will produce exactly that; treating only `true` as meaningful would let
    // such an assertion pass no matter what the query returned.
    const wantsEmpty = assertion.empty === true || assertion.nonEmpty === false;
    const wantsNonEmpty = assertion.nonEmpty === true || assertion.empty === false;

    if (wantsEmpty && actual.length > 0) {
        failures.push(`expected empty, got ${show(actual)}`);
    }

    if (wantsNonEmpty && actual.length === 0) {
        failures.push('expected at least one result, got none');
    }

    if (assertion.count !== undefined && actual.length !== assertion.count) {
        failures.push(`expected ${assertion.count} result(s), got ${actual.length}: ${show(actual)}`);
    }

    return {
        query: assertion.query,
        ok: failures.length === 0,
        actual,
        message: failures.length > 0 ? failures.join('; ') : undefined,
        because: assertion.because,
    };
}
