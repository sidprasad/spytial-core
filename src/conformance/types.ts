/**
 * Conformance harness — the case and result contract.
 *
 * This file defines a JSON shape that integrations in other languages write
 * and read, so treat it as a published interface: adding optional fields is
 * fine, renaming or repurposing existing ones is not. {@link CONFORMANCE_FORMAT_VERSION}
 * moves when an incompatible change lands.
 *
 * What a case asserts is what the *spec entails*, not where pixels land. Node
 * positions do not exist on an InstanceLayout — they come from the force
 * simulation at render time — so a case is deterministic and needs no browser.
 * See site/testing-integrations.md.
 */

/**
 * Version of the case/result JSON contract. Hosts should refuse a result whose
 * `formatVersion` they do not recognize rather than guess at its shape.
 */
export const CONFORMANCE_FORMAT_VERSION = 1;

// ─── Cases ───────────────────────────────────────────────────────────

/**
 * One conformance case: a datum, the spec an integration emitted for it, and
 * the spatial facts that should follow.
 */
export interface ConformanceCase {
    /** Identifies the case in output. Should be unique within a run. */
    name: string;
    /**
     * The relationalizer's output, exactly as it was produced. Checked in this
     * raw form before it reaches JSONDataInstance, whose normalizer would
     * otherwise dedupe atoms and drop dangling references — repairing the very
     * bugs a case is trying to catch.
     */
    datum: unknown;
    /** The layout spec, as YAML source or an already-parsed LayoutSpec object. */
    spec: string | Record<string, unknown>;
    /** Spatial facts that should hold. A case with none only checks the datum. */
    assertions?: Assertion[];
    /** Skip datum well-formedness checking for this case. Off by default. */
    skipDatumCheck?: boolean;
    /** Free-form note echoed into the result — use it to explain intent. */
    note?: string;
}

/** A file handed to the runner may hold one case, a bare list, or this. */
export interface ConformanceCaseFile {
    cases: ConformanceCase[];
}

/**
 * One spatial fact. `query` is a spatial query (see the grammar in
 * src/evaluators/layout/layout-query.pegjs); the remaining fields are checks
 * against the atoms it returns. Every check present must hold, so
 * `{contains, excludes}` on one assertion means both.
 */
export interface Assertion {
    /** A spatial query, e.g. `must.rightOf(a)` or `inter(must.above(a), grouped(b))`. */
    query: string;
    /** The result is exactly this set. Order does not matter; duplicates are ignored. */
    equals?: string[];
    /** The result includes all of these. */
    contains?: string[];
    /** The result includes none of these. */
    excludes?: string[];
    /** `true` asserts the result is empty; `false` asserts it is not. */
    empty?: boolean;
    /** `true` asserts the result has at least one member; `false` asserts it is empty. */
    nonEmpty?: boolean;
    /** The result has exactly this many members. */
    count?: number;
    /** Why this should hold. Echoed into failures so a red test explains itself. */
    because?: string;
}

/** Every check an assertion can carry, for validation and docs. */
export const ASSERTION_CHECKS = [
    'equals', 'contains', 'excludes', 'empty', 'nonEmpty', 'count',
] as const;

export type AssertionCheck = (typeof ASSERTION_CHECKS)[number];

// ─── Results ─────────────────────────────────────────────────────────

/** Severity of a diagnostic. Only `error` fails a case. */
export type DiagnosticSeverity = 'error' | 'warning';

/**
 * A problem found while checking a case. `code` is stable across releases and
 * is what a host should branch on; `message` is for humans and may be reworded.
 */
export interface Diagnostic {
    code: DiagnosticCode;
    severity: DiagnosticSeverity;
    message: string;
    /** Where the problem is, when it can be located — e.g. `relations[0].tuples[2]`. */
    where?: string;
}

/**
 * Stable diagnostic codes.
 *
 * `datum/*` come from checking the raw relationalizer output, `spec/*` from
 * parsing the layout spec, `layout/*` from generating the layout, and
 * `case/*` from the case document itself.
 */
export type DiagnosticCode =
    // Case document problems
    | 'case/missing-name'
    | 'case/missing-datum'
    | 'case/missing-spec'
    | 'case/bad-assertion'
    // Raw datum problems
    | 'datum/not-an-object'
    | 'datum/atoms-not-an-array'
    | 'datum/relations-not-an-array'
    | 'datum/no-atoms'
    | 'datum/atom-not-an-object'
    | 'datum/atom-missing-id'
    | 'datum/atom-missing-type'
    | 'datum/atom-missing-label'
    | 'datum/duplicate-atom-id'
    | 'datum/relation-not-an-object'
    | 'datum/relation-missing-name'
    | 'datum/duplicate-relation-id'
    | 'datum/relation-missing-tuples'
    | 'datum/empty-relation'
    | 'datum/tuple-not-an-object'
    | 'datum/tuple-missing-atoms'
    | 'datum/tuple-empty'
    | 'datum/dangling-tuple-atom'
    | 'datum/tuple-type-arity-mismatch'
    | 'datum/ragged-relation'
    // Spec + layout problems
    | 'spec/parse-failed'
    | 'layout/generation-failed'
    | 'layout/unsatisfiable'
    | 'layout/no-validator'
    | 'layout/selector-error'
    | 'layout/warning';

/** Outcome of one assertion. */
export interface AssertionResult {
    query: string;
    ok: boolean;
    /** The atoms the query returned, sorted. */
    actual: string[];
    /** Why it failed. Absent when `ok`. */
    message?: string;
    /** The assertion's `because`, carried through. */
    because?: string;
}

/** Outcome of one case. */
export interface CaseResult {
    name: string;
    /** True when there are no error diagnostics and every assertion passed. */
    ok: boolean;
    /** Problems that failed the case. */
    errors: Diagnostic[];
    /** Problems worth reporting that did not fail the case. */
    warnings: Diagnostic[];
    assertions: AssertionResult[];
    note?: string;
}

/** Outcome of a run over one or more cases. */
export interface RunResult {
    formatVersion: number;
    /** The spytial-core release that produced this result. */
    spytialCoreVersion: string;
    /** True when every case passed. */
    ok: boolean;
    passed: number;
    failed: number;
    cases: CaseResult[];
}
