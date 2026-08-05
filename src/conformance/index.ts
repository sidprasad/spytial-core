/**
 * Conformance harness for Spytial integrations.
 *
 * An integration's job is to recover structure from a host value and attach a
 * spec to it. This harness tests that job: given the datum a relationalizer
 * produced and the spec an integration emitted, does the datum describe a
 * well-formed graph, and does the spec entail the spatial facts its author
 * meant it to?
 *
 * Assertions are about what the spec *entails*, checked against the solved
 * constraint graph. Node positions do not exist at this stage — they come from
 * the force simulation at render time — so cases are deterministic and need no
 * browser.
 *
 * Integrations that are not JavaScript should use the `spytial-check` CLI,
 * which wraps this module in a JSON-in/JSON-out contract. See
 * site/testing-integrations.md.
 */

export { runCase, runCases, extractCases } from './run';
export type { RunOptions } from './run';
export { checkDatum } from './datum-check';
export { evaluateAssertion, validateAssertion } from './assertions';
export {
    CONFORMANCE_FORMAT_VERSION,
    ASSERTION_CHECKS,
} from './types';
export type {
    Assertion,
    AssertionCheck,
    AssertionResult,
    CaseResult,
    ConformanceCase,
    ConformanceCaseFile,
    Diagnostic,
    DiagnosticCode,
    DiagnosticSeverity,
    RunResult,
} from './types';
