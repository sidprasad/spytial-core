import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

import {
    checkDatum,
    extractCases,
    runCase,
    runCases,
    validateAssertion,
    CONFORMANCE_FORMAT_VERSION,
} from '../src/conformance';
import type { ConformanceCase, Diagnostic } from '../src/conformance';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A three-cell linked list. */
function listDatum() {
    return {
        atoms: [
            { id: 'a', type: 'Node', label: 'a' },
            { id: 'b', type: 'Node', label: 'b' },
            { id: 'c', type: 'Node', label: 'c' },
        ],
        relations: [{
            id: 'next', name: 'next', types: ['Node', 'Node'],
            tuples: [
                { atoms: ['a', 'b'], types: ['Node', 'Node'] },
                { atoms: ['b', 'c'], types: ['Node', 'Node'] },
            ],
        }],
    };
}

const LIST_SPEC = `
constraints:
  - orientation:
      selector: "{x, y : Node | y in x.next}"
      directions: [right]
`;

const codes = (diagnostics: Diagnostic[]) => diagnostics.map(d => d.code);

// ─── Datum checks ────────────────────────────────────────────────────────────

describe('checkDatum', () => {
    it('accepts a well-formed datum', () => {
        expect(checkDatum(listDatum())).toEqual([]);
    });

    it.each([
        ['a string', 'not a datum'],
        ['an array', []],
        ['null', null],
    ])('rejects %s', (_label, value) => {
        expect(codes(checkDatum(value))).toEqual(['datum/not-an-object']);
    });

    it('rejects a non-array atoms field', () => {
        expect(codes(checkDatum({ atoms: {}, relations: [] }))).toContain('datum/atoms-not-an-array');
    });

    it('requires a relations field, since the data instance rejects a datum without one', () => {
        const datum = { atoms: [{ id: 'a', type: 'Node', label: 'a' }] };
        const diagnostics = checkDatum(datum);
        expect(codes(diagnostics)).toEqual(['datum/relations-not-an-array']);
        expect(diagnostics[0].message).toContain('empty array');
    });

    it('accepts an explicitly empty relations list', () => {
        expect(checkDatum({ atoms: [{ id: 'a', type: 'Node', label: 'a' }], relations: [] })).toEqual([]);
    });

    it('flags an empty datum, which means the walker found nothing', () => {
        expect(codes(checkDatum({ atoms: [], relations: [] }))).toContain('datum/no-atoms');
    });

    it('catches duplicate atom ids, which the normalizer would silently drop', () => {
        const datum = {
            atoms: [
                { id: 'a', type: 'Node', label: 'first' },
                { id: 'a', type: 'Node', label: 'second' },
            ],
            relations: [],
        };
        const diagnostics = checkDatum(datum);
        expect(codes(diagnostics)).toContain('datum/duplicate-atom-id');
        expect(diagnostics[0].where).toBe('atoms[1]');
    });

    it('reports a repeated id once, however many times it repeats', () => {
        const datum = {
            atoms: ['a', 'a', 'a', 'a'].map(id => ({ id, type: 'Node', label: id })),
            relations: [],
        };
        expect(codes(checkDatum(datum)).filter(c => c === 'datum/duplicate-atom-id')).toHaveLength(1);
    });

    it('catches a tuple pointing at an atom that does not exist', () => {
        const datum = {
            atoms: [{ id: 'a', type: 'Node', label: 'a' }],
            relations: [{
                id: 'next', name: 'next', types: ['Node', 'Node'],
                tuples: [{ atoms: ['a', 'ghost'], types: ['Node', 'Node'] }],
            }],
        };
        const diagnostics = checkDatum(datum);
        expect(codes(diagnostics)).toContain('datum/dangling-tuple-atom');
        expect(diagnostics[0].where).toBe('relations[0].tuples[0].atoms[1]');
        expect(diagnostics[0].message).toContain('ghost');
    });

    it('requires an id and a type on every atom', () => {
        const datum = { atoms: [{ label: 'nameless' }], relations: [] };
        expect(codes(checkDatum(datum))).toEqual(
            expect.arrayContaining(['datum/atom-missing-id', 'datum/atom-missing-type']),
        );
    });

    it('treats a missing label as a warning, not an error', () => {
        const datum = { atoms: [{ id: 'a', type: 'Node' }], relations: [] };
        const diagnostics = checkDatum(datum);
        expect(codes(diagnostics)).toEqual(['datum/atom-missing-label']);
        expect(diagnostics[0].severity).toBe('warning');
    });

    it('warns about an empty relation, which makes selectors match nothing', () => {
        const datum = {
            atoms: [{ id: 'a', type: 'Node', label: 'a' }],
            relations: [{ id: 'r', name: 'r', types: ['Node', 'Node'], tuples: [] }],
        };
        const diagnostics = checkDatum(datum);
        expect(codes(diagnostics)).toEqual(['datum/empty-relation']);
        expect(diagnostics[0].severity).toBe('warning');
    });

    it('says nothing about a relation whose tuples have different arities', () => {
        // Ragged relations are legal — one name may hold tuples of different
        // width. Two Python classes with a `foo` field of different shape land
        // here, and drawing, selectors and constraints all cope tuple by tuple.
        const datum = {
            atoms: [
                { id: 'a', type: 'Node', label: 'a' },
                { id: 'b', type: 'Node', label: 'b' },
            ],
            relations: [{
                id: 'r', name: 'r', types: [],
                tuples: [{ atoms: ['a'] }, { atoms: ['a', 'b'] }],
            }],
        };
        expect(codes(checkDatum(datum))).toEqual([]);
    });

    it('does not compare tuple arity against the relation types list', () => {
        // IRelation.types is positional and gets appended to as columns settle,
        // so a longer types list is normal and must not be reported.
        const datum = {
            atoms: [
                { id: 'a', type: 'Node', label: 'a' },
                { id: 'b', type: 'Node', label: 'b' },
            ],
            relations: [{
                id: 'r', name: 'r', types: ['Node', 'Node', 'Node', 'Node'],
                tuples: [{ atoms: ['a', 'b'], types: ['Node', 'Node'] }],
            }],
        };
        expect(checkDatum(datum)).toEqual([]);
    });

    it('reports every problem in one pass rather than stopping at the first', () => {
        const datum = {
            atoms: [
                { id: 'a', type: 'Node', label: 'a' },
                { id: 'a', type: 'Node', label: 'dup' },
                { id: 'b', label: 'no type' },
            ],
            relations: [{
                id: 'r', name: 'r', types: [],
                tuples: [{ atoms: ['ghost1'] }, { atoms: ['ghost2'] }],
            }],
        };
        const found = codes(checkDatum(datum));
        expect(found).toContain('datum/duplicate-atom-id');
        expect(found).toContain('datum/atom-missing-type');
        expect(found.filter(c => c === 'datum/dangling-tuple-atom')).toHaveLength(2);
    });
});

// ─── Assertion validation ────────────────────────────────────────────────────

describe('validateAssertion', () => {
    it('accepts a well-formed assertion', () => {
        expect(validateAssertion({ query: 'nodes()', equals: ['a'] }, 'assertions[0]')).toEqual([]);
    });

    it('rejects an assertion with no check, which would silently pass', () => {
        const problems = validateAssertion({ query: 'nodes()' }, 'assertions[0]');
        expect(codes(problems)).toEqual(['case/bad-assertion']);
        expect(problems[0].message).toContain('no check');
    });

    it('rejects a missing query', () => {
        expect(validateAssertion({ equals: ['a'] }, 'assertions[0]')).toHaveLength(1);
    });

    it('rejects a set check that is not an array of strings', () => {
        expect(validateAssertion({ query: 'nodes()', equals: 'a' }, 'x')).toHaveLength(1);
        expect(validateAssertion({ query: 'nodes()', contains: [1] }, 'x')).toHaveLength(1);
    });

    it('rejects a count that is not a non-negative integer', () => {
        expect(validateAssertion({ query: 'nodes()', count: -1 }, 'x')).toHaveLength(1);
        expect(validateAssertion({ query: 'nodes()', count: 1.5 }, 'x')).toHaveLength(1);
    });

    it('rejects empty and nonEmpty when they contradict', () => {
        expect(validateAssertion({ query: 'nodes()', empty: true, nonEmpty: true }, 'x')).toHaveLength(1);
        expect(validateAssertion({ query: 'nodes()', empty: false, nonEmpty: false }, 'x')).toHaveLength(1);
    });

    it('accepts empty and nonEmpty when they agree', () => {
        expect(validateAssertion({ query: 'nodes()', empty: true, nonEmpty: false }, 'x')).toEqual([]);
        expect(validateAssertion({ query: 'nodes()', empty: false, nonEmpty: true }, 'x')).toEqual([]);
    });
});

// ─── Running cases ───────────────────────────────────────────────────────────

describe('runCase', () => {
    it('passes when the spec entails the asserted facts', () => {
        const result = runCase({
            name: 'list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [
                { query: 'must.rightOf(a)', equals: ['b', 'c'] },
                { query: 'must.leftOf(c)', contains: ['a'] },
                { query: 'must.above(a)', empty: true },
                { query: 'nodes()', count: 3 },
            ],
        });

        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.assertions.every(a => a.ok)).toBe(true);
    });

    it('fails an assertion and reports what it actually got', () => {
        const result = runCase({
            name: 'list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'must.rightOf(a)', equals: ['b'], because: 'deliberately wrong' }],
        });

        expect(result.ok).toBe(false);
        expect(result.assertions[0].actual).toEqual(['b', 'c']);
        expect(result.assertions[0].message).toContain('unexpected "c"');
        expect(result.assertions[0].because).toBe('deliberately wrong');
    });

    it('reports missing and unexpected members separately for equals', () => {
        const result = runCase({
            name: 'list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'must.rightOf(a)', equals: ['b', 'zzz'] }],
        });
        expect(result.assertions[0].message).toContain('missing "zzz"');
        expect(result.assertions[0].message).toContain('unexpected "c"');
    });

    it('honours empty and nonEmpty in both directions, so neither can silently pass', () => {
        // `empty: false` means "assert this is NOT empty". Checking only for
        // `true` would make such an assertion vacuous whatever the query returned
        // — the exact silent pass this harness exists to prevent.
        const vacuous = runCase({
            name: 'empty false',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'nodes()', empty: false }],
        });
        expect(vacuous.assertions[0].ok).toBe(true);   // genuinely non-empty

        const caught = runCase({
            name: 'empty false on an empty result',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'must.leftOf(a)', empty: false }],
        });
        expect(caught.assertions[0].ok).toBe(false);
        expect(caught.assertions[0].message).toContain('at least one');

        const inverse = runCase({
            name: 'nonEmpty false',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'nodes()', nonEmpty: false }],
        });
        expect(inverse.assertions[0].ok).toBe(false);
        expect(inverse.assertions[0].message).toContain('expected empty');
    });

    it('fails rather than passes when a query cannot be evaluated', () => {
        const result = runCase({
            name: 'list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'must.rightOf(nosuchnode)', empty: true }],
        });

        expect(result.ok).toBe(false);
        expect(result.assertions[0].message).toContain('Unknown node');
    });

    it('fails on a malformed query instead of throwing', () => {
        const result = runCase({
            name: 'list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'this is not a query', nonEmpty: true }],
        });
        expect(result.ok).toBe(false);
        expect(result.assertions[0].ok).toBe(false);
    });

    it('stops before layout when the datum is malformed', () => {
        const result = runCase({
            name: 'broken',
            datum: { atoms: [{ id: 'a', type: 'Node', label: 'a' }], relations: [{
                id: 'r', name: 'r', types: ['Node', 'Node'],
                tuples: [{ atoms: ['a', 'ghost'] }],
            }] },
            spec: '',
            assertions: [{ query: 'nodes()', nonEmpty: true }],
        });

        expect(result.ok).toBe(false);
        expect(codes(result.errors)).toContain('datum/dangling-tuple-atom');
        // Assertions are not run: they would describe a graph the integration
        // did not mean to produce.
        expect(result.assertions).toEqual([]);
    });

    it('honours skipDatumCheck', () => {
        const result = runCase({
            name: 'unchecked',
            datum: listDatum(),
            spec: LIST_SPEC,
            skipDatumCheck: true,
            assertions: [{ query: 'nodes()', count: 3 }],
        });

        expect(result.ok).toBe(true);
    });

    it('shows what the datum check buys: skipping it turns a precise report into an opaque crash', () => {
        const broken = {
            atoms: [{ id: 'a', type: 'Node', label: 'a' }],
            relations: [{
                id: 'r', name: 'r', types: ['Node', 'Node'],
                tuples: [{ atoms: ['a', 'ghost'] }],
            }],
        };

        const checked = runCase({ name: 'checked', datum: broken, spec: '' });
        expect(codes(checked.errors)).toEqual(['datum/dangling-tuple-atom']);
        expect(checked.errors[0].where).toBe('relations[0].tuples[0].atoms[1]');

        // Without the check the same datum still fails — but from deep inside
        // layout generation, with no pointer to the tuple that caused it.
        const unchecked = runCase({ name: 'unchecked', datum: broken, spec: '', skipDatumCheck: true });
        expect(codes(unchecked.errors)).toEqual(['layout/generation-failed']);
        expect(unchecked.errors[0].where).toBeUndefined();
    });

    it('accepts a spec given as an object as well as YAML text', () => {
        const asObject = runCase({
            name: 'object spec',
            datum: listDatum(),
            spec: {
                constraints: [
                    { orientation: { selector: '{x, y : Node | y in x.next}', directions: ['right'] } },
                ],
            },
            assertions: [{ query: 'must.rightOf(a)', equals: ['b', 'c'] }],
        });

        expect(asObject.ok).toBe(true);
    });

    it('reports a case document that is missing required fields', () => {
        const result = runCase({ spec: '' } as unknown as ConformanceCase);
        expect(result.ok).toBe(false);
        expect(codes(result.errors)).toEqual(
            expect.arrayContaining(['case/missing-name', 'case/missing-datum']),
        );
    });

    it('reports a bad assertion instead of ignoring it', () => {
        const result = runCase({
            name: 'typo',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [{ query: 'nodes()' } as never],
        });
        expect(result.ok).toBe(false);
        expect(codes(result.errors)).toContain('case/bad-assertion');
    });

    it('surfaces engine warnings without failing the case', () => {
        // A selector naming something that is not in the datum evaluates to the
        // empty relation rather than throwing, so the spec quietly does nothing.
        const result = runCase({
            name: 'unresolved name',
            datum: listDatum(),
            spec: `
constraints:
  - orientation:
      selector: "{x, y : NoSuchType | y in x.next}"
      directions: [right]
`,
            assertions: [{ query: 'nodes()', count: 3 }],
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.ok).toBe(true);
    });

    it('fails when the spec is unsatisfiable on the datum', () => {
        const result = runCase({
            name: 'contradiction',
            datum: listDatum(),
            spec: `
constraints:
  - orientation:
      selector: "{x, y : Node | y in x.next}"
      directions: [right]
  - orientation:
      selector: "{x, y : Node | y in x.next}"
      directions: [left]
`,
            assertions: [{ query: 'nodes()', count: 3 }],
        });

        expect(result.ok).toBe(false);
        expect(codes(result.errors)).toContain('layout/unsatisfiable');
    });

    it('never throws, whatever the case holds', () => {
        for (const bad of [undefined, null, 42, 'text', [], {}]) {
            expect(() => runCase(bad as unknown as ConformanceCase)).not.toThrow();
        }
    });
});

describe('runCases', () => {
    it('summarizes a mixed run', () => {
        const run = runCases([
            { name: 'good', datum: listDatum(), spec: LIST_SPEC, assertions: [{ query: 'nodes()', count: 3 }] },
            { name: 'bad', datum: listDatum(), spec: LIST_SPEC, assertions: [{ query: 'nodes()', count: 99 }] },
        ], { spytialCoreVersion: '9.9.9' });

        expect(run.ok).toBe(false);
        expect(run.passed).toBe(1);
        expect(run.failed).toBe(1);
        expect(run.formatVersion).toBe(CONFORMANCE_FORMAT_VERSION);
        expect(run.spytialCoreVersion).toBe('9.9.9');
    });

    it('keeps going after a case fails', () => {
        const run = runCases([
            { name: 'broken', datum: 'not a datum', spec: '' },
            { name: 'fine', datum: listDatum(), spec: LIST_SPEC, assertions: [{ query: 'nodes()', count: 3 }] },
        ]);
        expect(run.cases).toHaveLength(2);
        expect(run.cases[1].ok).toBe(true);
    });
});

describe('extractCases', () => {
    const one = { name: 'x', datum: {}, spec: '' };

    it('accepts a single case, a bare array, and a cases wrapper', () => {
        expect(extractCases(one)).toEqual([one]);
        expect(extractCases([one, one])).toHaveLength(2);
        expect(extractCases({ cases: [one] })).toEqual([one]);
    });

    it('returns nothing for a document that holds no cases', () => {
        expect(extractCases(null)).toEqual([]);
        expect(extractCases('text')).toEqual([]);
    });
});

// ─── Constraint vocabulary queries ───────────────────────────────────────────

describe('constraint vocabulary queries (hidden/sized/cyclic)', () => {
    /** A three-state ring with a note atom attached to one state. */
    function ringDatum() {
        return {
            atoms: [
                { id: 's1', type: 'State', label: 's1' },
                { id: 's2', type: 'State', label: 's2' },
                { id: 's3', type: 'State', label: 's3' },
                { id: 'note0', type: 'Note', label: 'note' },
            ],
            relations: [
                {
                    id: 'next', name: 'next', types: ['State', 'State'],
                    tuples: [
                        { atoms: ['s1', 's2'], types: ['State', 'State'] },
                        { atoms: ['s2', 's3'], types: ['State', 'State'] },
                        { atoms: ['s3', 's1'], types: ['State', 'State'] },
                    ],
                },
                {
                    id: 'about', name: 'about', types: ['Note', 'State'],
                    tuples: [{ atoms: ['note0', 's1'], types: ['Note', 'State'] }],
                },
            ],
        };
    }

    it('hidden() reports exactly what hideAtom hid', () => {
        const result = runCase({
            name: 'hide the note',
            datum: ringDatum(),
            spec: 'constraints:\n  - hideAtom:\n      selector: Note\n',
            assertions: [
                { query: 'hidden()', equals: ['note0'] },
                { query: 'nodes()', equals: ['s1', 's2', 's3'] },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('sized(W, H) reports the atoms a size constraint set', () => {
        const result = runCase({
            name: 'sized states',
            datum: ringDatum(),
            spec: 'constraints:\n  - size:\n      selector: State\n      width: 120\n      height: 80\n',
            assertions: [
                { query: 'sized(120, 80)', equals: ['s1', 's2', 's3'] },
                { query: 'sized(999, 999)', empty: true },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('cyclic(A) reports ring membership and nothing else', () => {
        const result = runCase({
            name: 'ring',
            datum: ringDatum(),
            spec: 'constraints:\n  - cyclic:\n      selector: "{x, y : State | y in x.next}"\n      direction: clockwise\n',
            assertions: [
                { query: 'cyclic(s1)', equals: ['s1', 's2', 's3'] },
                { query: 'cyclic(s1)', excludes: ['note0'] },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('cyclic(A) counts a two-atom fragment: membership is by selection', () => {
        // Two atoms need no disjunction to draw — any placement is a rotation —
        // but the selector still put them in a cycle, and membership is what
        // the query reports.
        const result = runCase({
            name: 'two-state ring',
            datum: {
                atoms: [
                    { id: 's1', type: 'State', label: 's1' },
                    { id: 's2', type: 'State', label: 's2' },
                ],
                relations: [{
                    id: 'next', name: 'next', types: ['State', 'State'],
                    tuples: [
                        { atoms: ['s1', 's2'], types: ['State', 'State'] },
                        { atoms: ['s2', 's1'], types: ['State', 'State'] },
                    ],
                }],
            },
            spec: 'constraints:\n  - cyclic:\n      selector: "{x, y : State | y in x.next}"\n      direction: clockwise\n',
            assertions: [
                { query: 'cyclic(s1)', equals: ['s1', 's2'] },
                { query: 'cyclic(s2)', equals: ['s1', 's2'] },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('cyclic(A) is empty under a negated cyclic constraint, which asserts no cycle', () => {
        const result = runCase({
            name: 'no ring allowed',
            datum: ringDatum(),
            spec: 'constraints:\n  - cyclic:\n      selector: "{x, y : State | y in x.next}"\n      direction: clockwise\n      hold: never\n',
            assertions: [
                { query: 'cyclic(s1)', empty: true },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('all three return empty, not errors, when the spec uses none of the constraints', () => {
        const result = runCase({
            name: 'plain list',
            datum: listDatum(),
            spec: LIST_SPEC,
            assertions: [
                { query: 'hidden()', empty: true },
                { query: 'sized(999, 999)', empty: true },
                { query: 'cyclic(a)', empty: true },
            ],
        });
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });
});

// ─── The seed suite ──────────────────────────────────────────────────────────

describe('seed suite', () => {
    const caseDir = join(__dirname, 'conformance', 'cases');
    const files = readdirSync(caseDir).filter(f => f.endsWith('.yaml')).sort();

    it('ships worked examples for integration authors to copy', () => {
        expect(files.length).toBeGreaterThanOrEqual(4);
    });

    it.each(files)('%s passes', file => {
        const cases = extractCases(yaml.load(readFileSync(join(caseDir, file), 'utf8')));
        expect(cases.length).toBeGreaterThan(0);

        const run = runCases(cases);
        for (const result of run.cases) {
            // Surface the reason in the failure message rather than just "false".
            const why = [
                ...result.errors.map(e => `${e.code}: ${e.message}`),
                ...result.assertions.filter(a => !a.ok).map(a => `${a.query} — ${a.message}`),
            ].join('\n');
            expect(why, `${file} → ${result.name}`).toBe('');
            expect(result.ok).toBe(true);
        }
    });
});
