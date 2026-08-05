import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from '../src/cli/spytial-check';

// The CLI's contract with non-JavaScript integrations is: stdout is a parseable
// RunResult, stderr is everything else, and the exit code says pass or fail.
// These tests hold that contract, because a host that shells out has nothing
// else to go on.

let stdout: string[];
let stderr: string[];

beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        stderr.push(String(chunk));
        return true;
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const out = () => stdout.join('');
const err = () => stderr.join('');

function writeCase(contents: unknown, extension = '.json'): string {
    const dir = mkdtempSync(join(tmpdir(), 'spytial-check-'));
    const file = join(dir, `case${extension}`);
    writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
    return file;
}

const passingCase = {
    name: 'passes',
    datum: {
        atoms: [
            { id: 'a', type: 'Node', label: 'a' },
            { id: 'b', type: 'Node', label: 'b' },
        ],
        relations: [{
            id: 'next', name: 'next', types: ['Node', 'Node'],
            tuples: [{ atoms: ['a', 'b'], types: ['Node', 'Node'] }],
        }],
    },
    spec: 'constraints:\n  - orientation:\n      selector: "{x, y : Node | y in x.next}"\n      directions: [right]\n',
    assertions: [{ query: 'must.rightOf(a)', equals: ['b'] }],
};

const failingCase = { ...passingCase, name: 'fails', assertions: [{ query: 'nodes()', count: 99 }] };

describe('spytial-check', () => {
    it('exits 0 and writes a parseable RunResult when every case passes', () => {
        const code = main([writeCase(passingCase)]);

        expect(code).toBe(0);
        const result = JSON.parse(out());
        expect(result.ok).toBe(true);
        expect(result.passed).toBe(1);
        expect(result.formatVersion).toBe(1);
        expect(result.spytialCoreVersion).not.toBe('unknown');
    });

    it('exits 1 when a case fails, and still writes a parseable result', () => {
        const code = main([writeCase(failingCase)]);

        expect(code).toBe(1);
        const result = JSON.parse(out());
        expect(result.ok).toBe(false);
        expect(result.failed).toBe(1);
        expect(result.cases[0].assertions[0].ok).toBe(false);
    });

    it('keeps engine chatter off stdout, so the result stays parseable', () => {
        // The layout engine narrates on stdout ("Generated 2 orientation
        // constraints..."). One stray line would break every host that pipes us
        // into a JSON parser. The other half of this — that the chatter still
        // reaches stderr — can only be seen from a real process, because vitest
        // routes console.log through its own reporter rather than
        // process.stdout. See conformance-cli-process.test.ts.
        main([writeCase(passingCase)]);

        expect(() => JSON.parse(out())).not.toThrow();
        expect(out()).not.toContain('Generated');
    });

    it('restores stdout after the run, even across several invocations', () => {
        main([writeCase(passingCase)]);
        stdout = [];
        main([writeCase(passingCase)]);

        expect(() => JSON.parse(out())).not.toThrow();
    });

    it('reads YAML case files as well as JSON', () => {
        const yamlCase = [
            'name: yaml case',
            'datum:',
            '  atoms:',
            '    - { id: a, type: Node, label: a }',
            '  relations: []',
            'spec: ""',
            'assertions:',
            '  - query: nodes()',
            '    equals: [a]',
        ].join('\n');

        expect(main([writeCase(yamlCase, '.yaml')])).toBe(0);
    });

    // Reading stdin needs a real process; see conformance-cli-process.test.ts.

    it('accepts several case files at once', () => {
        const code = main([writeCase(passingCase), writeCase(failingCase)]);

        expect(code).toBe(1);
        const result = JSON.parse(out());
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
    });

    it('exits 2 on an unreadable path, with the usage text on stderr', () => {
        expect(main(['/definitely/not/here.json'])).toBe(2);
        expect(out()).toBe('');
        expect(err()).toContain('Cannot read');
        expect(err()).toContain('Usage:');
    });

    it('exits 2 when given no files', () => {
        expect(main([])).toBe(2);
    });

    it('exits 2 on an unknown option rather than treating it as a path', () => {
        expect(main(['--nope'])).toBe(2);
        expect(err()).toContain('--nope');
    });

    it('exits 2 on a file that is not valid JSON or YAML', () => {
        expect(main([writeCase('{ this is: [not valid', '.json')])).toBe(2);
    });

    it('exits 2 on a document holding no cases', () => {
        expect(main([writeCase({ cases: [] })])).toBe(2);
        expect(err()).toContain('no cases');
    });

    it('prints a human summary with --pretty instead of JSON', () => {
        const code = main(['--pretty', writeCase(failingCase)]);

        expect(code).toBe(1);
        expect(out()).toContain('FAIL  fails');
        expect(out()).toContain('0 passed, 1 failed');
        expect(() => JSON.parse(out())).toThrow();
    });

    it('shows only failures with --pretty --quiet', () => {
        main(['--pretty', '--quiet', writeCase(passingCase), writeCase(failingCase)]);

        expect(out()).toContain('FAIL  fails');
        expect(out()).not.toContain('PASS  passes');
    });

    it('explains a failed assertion in pretty mode, including its because', () => {
        const withReason = {
            ...passingCase,
            name: 'explained',
            assertions: [{ query: 'nodes()', count: 99, because: 'stated intent' }],
        };
        main(['--pretty', writeCase(withReason)]);

        expect(out()).toContain('nodes()');
        expect(out()).toContain('because: stated intent');
    });

    it('answers --help and --version without running anything', () => {
        expect(main(['--help'])).toBe(0);
        expect(out()).toContain('Usage:');

        stdout = [];
        expect(main(['--version'])).toBe(0);
        expect(out().trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
});
