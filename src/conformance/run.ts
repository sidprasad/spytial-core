/**
 * Running conformance cases.
 *
 * One case is: relationalize a value (the integration already did that — its
 * output is the datum), attach a spec (the integration emitted that too), lay
 * it out, and check the spatial facts that should follow. Nothing here renders,
 * so the result is deterministic and runs anywhere Node runs.
 */

import yaml from 'js-yaml';

import { JSONDataInstance, IJsonDataInstance } from '../data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../evaluators/data/sgq-evaluator';
import { parseLayoutSpec } from '../layout/layoutspec';
import { LayoutInstance } from '../layout/layoutinstance';
import { LayoutEvaluator } from '../evaluators/layout/layout-evaluator';

import { checkDatum } from './datum-check';
import { evaluateAssertion, validateAssertion } from './assertions';
import {
    CONFORMANCE_FORMAT_VERSION,
    Assertion,
    AssertionResult,
    CaseResult,
    ConformanceCase,
    ConformanceCaseFile,
    Diagnostic,
    RunResult,
} from './types';

export interface RunOptions {
    /**
     * The spytial-core release to record on the result. Callers read it from
     * package.json, matching how the language manifest is stamped.
     */
    spytialCoreVersion?: string;
}

function error(code: Diagnostic['code'], message: string, where?: string): Diagnostic {
    return { code, severity: 'error', message, where };
}

function warning(code: Diagnostic['code'], message: string, where?: string): Diagnostic {
    return { code, severity: 'warning', message, where };
}

function failed(name: string, errors: Diagnostic[], note?: string): CaseResult {
    return { name, ok: false, errors, warnings: [], assertions: [], note };
}

/**
 * Turn a case's spec into YAML source. An object spec is dumped and parsed
 * rather than used directly: a LayoutSpec holds constraint *instances*, not
 * plain data, so the parser has to build it either way.
 */
function specToYaml(spec: ConformanceCase['spec']): string {
    return typeof spec === 'string' ? spec : yaml.dump(spec);
}

/**
 * Run one case. Never throws — every failure comes back as a diagnostic, since
 * a harness that dies on the first bad case is useless for finding the rest.
 */
export function runCase(testCase: ConformanceCase): CaseResult {
    const name = typeof testCase?.name === 'string' && testCase.name.length > 0
        ? testCase.name
        : '(unnamed case)';

    // ── The case document itself ─────────────────────────────────────
    const caseErrors: Diagnostic[] = [];
    if (typeof testCase?.name !== 'string' || testCase.name.length === 0) {
        caseErrors.push(error('case/missing-name', 'Case needs a non-empty "name".'));
    }
    if (testCase?.datum === undefined) {
        caseErrors.push(error('case/missing-datum', 'Case needs a "datum" — the relationalizer output to check.'));
    }
    if (testCase?.spec === undefined) {
        caseErrors.push(error('case/missing-spec', 'Case needs a "spec" — the layout spec the integration emitted. Use "" for no spec.'));
    }

    const rawAssertions: unknown[] = Array.isArray(testCase?.assertions) ? testCase.assertions : [];
    if (testCase?.assertions !== undefined && !Array.isArray(testCase.assertions)) {
        caseErrors.push(error('case/bad-assertion', '"assertions" must be an array.'));
    }
    rawAssertions.forEach((assertion, i) => {
        caseErrors.push(...validateAssertion(assertion, `assertions[${i}]`));
    });

    if (caseErrors.length > 0) return failed(name, caseErrors, testCase?.note);

    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];

    // ── The raw datum, before normalization repairs it ───────────────
    if (!testCase.skipDatumCheck) {
        for (const diagnostic of checkDatum(testCase.datum)) {
            (diagnostic.severity === 'error' ? errors : warnings).push(diagnostic);
        }
        if (errors.length > 0) {
            // Laying out a malformed datum would answer questions about a graph
            // the integration did not mean to describe.
            return { name, ok: false, errors, warnings, assertions: [], note: testCase.note };
        }
    }

    // ── Spec ─────────────────────────────────────────────────────────
    let layoutSpec;
    try {
        layoutSpec = parseLayoutSpec(specToYaml(testCase.spec));
    } catch (e: unknown) {
        return {
            name, ok: false, warnings, assertions: [], note: testCase.note,
            errors: [error('spec/parse-failed', `Spec could not be parsed: ${e instanceof Error ? e.message : String(e)}`)],
        };
    }

    // ── Layout ───────────────────────────────────────────────────────
    let result;
    try {
        const instance = new JSONDataInstance(testCase.datum as IJsonDataInstance);
        const evaluator = new SGraphQueryEvaluator();
        evaluator.initialize({ sourceData: instance });
        result = new LayoutInstance(layoutSpec, evaluator).generateLayout(instance);
    } catch (e: unknown) {
        return {
            name, ok: false, warnings, assertions: [], note: testCase.note,
            errors: [error('layout/generation-failed', `Layout generation threw: ${e instanceof Error ? e.message : String(e)}`)],
        };
    }

    // A conflict means the spec asks for something impossible on this datum.
    // The engine still returns a counterfactual diagram, but the constraints
    // it drew are not the ones the case asked about, so assertions are moot.
    if (result.error) {
        errors.push(error('layout/unsatisfiable', `Constraints are unsatisfiable on this datum: ${result.error.message}`));
    }

    for (const selectorError of result.selectorErrors ?? []) {
        errors.push(error(
            'layout/selector-error',
            `Selector "${selectorError.selector}" failed in ${selectorError.context}: ${selectorError.errorMessage}`,
        ));
    }

    // Engine warnings are advisory — an unresolved name, a deprecated form.
    // They do not fail a case, but they are exactly the signal that a spec
    // means less than its author thought, so they are always reported.
    for (const engineWarning of result.warnings ?? []) {
        warnings.push(warning(
            'layout/warning',
            `${engineWarning.message}${engineWarning.selector ? ` (selector: ${engineWarning.selector})` : ''}`,
            engineWarning.context,
        ));
    }

    if (errors.length > 0) {
        return { name, ok: false, errors, warnings, assertions: [], note: testCase.note };
    }

    if (!result.validator) {
        return {
            name, ok: false, warnings, assertions: [], note: testCase.note,
            errors: [error(
                'layout/no-validator',
                'No qualitative validator was produced, so spatial queries cannot be answered.',
            )],
        };
    }

    // ── Assertions ───────────────────────────────────────────────────
    const evaluator = new LayoutEvaluator(result.validator, result.layout);
    const assertions: AssertionResult[] = (rawAssertions as Assertion[])
        .map(assertion => evaluateAssertion(evaluator, assertion));

    return {
        name,
        ok: assertions.every(a => a.ok),
        errors,
        warnings,
        assertions,
        note: testCase.note,
    };
}

/** Run several cases and summarize. */
export function runCases(cases: ConformanceCase[], options: RunOptions = {}): RunResult {
    const results = cases.map(runCase);
    const passed = results.filter(r => r.ok).length;

    return {
        formatVersion: CONFORMANCE_FORMAT_VERSION,
        spytialCoreVersion: options.spytialCoreVersion ?? 'unknown',
        ok: results.every(r => r.ok),
        passed,
        failed: results.length - passed,
        cases: results,
    };
}

/**
 * Read cases out of a parsed case document, which may be a single case, a bare
 * array of cases, or `{ cases: [...] }`. Hosts generate these files from
 * whatever their test framework finds natural, so all three shapes are accepted.
 */
export function extractCases(document: unknown): ConformanceCase[] {
    if (Array.isArray(document)) return document as ConformanceCase[];
    if (typeof document === 'object' && document !== null) {
        const cases = (document as ConformanceCaseFile).cases;
        if (Array.isArray(cases)) return cases;
        return [document as ConformanceCase];
    }
    return [];
}
