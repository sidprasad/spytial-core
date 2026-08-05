import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The parts of the CLI contract that only a real process can show: that stdout
// and stderr are genuinely separate streams, and that stdin works. In-process
// tests cannot check either — vitest routes console.log through its own
// reporter instead of process.stdout, and fd 0 is not a case document.
//
// This runs the built bin, so it is skipped when dist is absent (a fresh
// checkout that has not run build:conformance yet). CI builds before testing.

const BIN = join(process.cwd(), 'dist', 'cli', 'spytial-check.js');
const built = existsSync(BIN);

interface Run {
    status: number;
    stdout: string;
    stderr: string;
}

function runBin(args: string[], stdin?: string): Run {
    // spawnSync, not execFileSync: the latter returns stdout only, and keeping
    // the two streams apart is half of what these tests exist to check.
    const result = spawnSync(process.execPath, [BIN, ...args], {
        input: stdin ?? '',
        encoding: 'utf8',
    });

    if (result.error) throw result.error;
    return {
        status: result.status ?? -1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
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

describe.skipIf(!built)('spytial-check as a subprocess', () => {
    it('writes only the RunResult to stdout, and engine chatter to stderr', () => {
        const dir = mkdtempSync(join(tmpdir(), 'spytial-check-proc-'));
        const file = join(dir, 'case.json');
        writeFileSync(file, JSON.stringify(passingCase));

        const run = runBin([file]);

        expect(run.status).toBe(0);
        // The contract a non-JavaScript host depends on: pipe stdout straight
        // into a JSON parser and it works.
        expect(() => JSON.parse(run.stdout)).not.toThrow();
        expect(JSON.parse(run.stdout).passed).toBe(1);
        expect(run.stdout).not.toContain('Generated');
        // The chatter is diverted, not discarded — it stays useful for debugging.
        expect(run.stderr).toContain('Generated');
    });

    it('reads a case document from stdin', () => {
        const run = runBin(['-'], JSON.stringify(passingCase));

        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout).passed).toBe(1);
    });

    it('exits 1 with a parseable result when a case fails', () => {
        const failing = { ...passingCase, assertions: [{ query: 'nodes()', count: 99 }] };
        const run = runBin(['-'], JSON.stringify(failing));

        expect(run.status).toBe(1);
        expect(JSON.parse(run.stdout).ok).toBe(false);
    });

    it('exits 2 with nothing on stdout when the input is unusable', () => {
        const run = runBin(['-'], 'not a case document at all: [');

        expect(run.status).toBe(2);
        expect(run.stdout).toBe('');
        expect(run.stderr).toContain('Usage:');
    });

    it('runs the seed suite that ships with the repo', () => {
        const run = runBin([join(process.cwd(), 'tests', 'conformance', 'cases')]);

        expect(run.status).toBe(0);
        expect(JSON.parse(run.stdout).failed).toBe(0);
    });
});
