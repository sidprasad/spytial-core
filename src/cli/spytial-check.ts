#!/usr/bin/env node
/**
 * `spytial-check` — run conformance cases from the command line.
 *
 * This is how integrations that are not JavaScript test themselves. Python,
 * Racket, Pyret and Rust cannot import a TypeScript library, but every one of
 * them can run a subprocess and parse JSON, so the contract is deliberately
 * plain: case documents in, a RunResult out, an exit code that says pass/fail.
 *
 *   spytial-check cases/*.json          # run case files
 *   cat case.json | spytial-check -     # or read stdin
 *   spytial-check --pretty cases/       # human-readable summary
 *
 * Exit codes: 0 every case passed, 1 at least one failed, 2 bad usage or
 * unreadable input, 3 timed out. Hosts should branch on the exit code and read
 * stdout for detail; stdout is always valid JSON unless --pretty is given.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import yaml from 'js-yaml';

import { runCases, extractCases } from '../conformance';
import type { CaseResult, ConformanceCase, RunResult } from '../conformance';

const CASE_FILE_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

const USAGE = `spytial-check — run Spytial conformance cases

Usage:
  spytial-check [options] <file|directory>...
  spytial-check [options] -            read a case document from stdin

Options:
  --pretty        human-readable summary instead of JSON
  --quiet         with --pretty, show only failures
  --timeout <s>   give up after <s> seconds (default 300; 0 disables)
  --version       print the spytial-core version and exit
  -h, --help      show this help

A case document is JSON or YAML holding one case, an array of cases, or
{ "cases": [...] }. Directories are scanned for .json/.yaml/.yml files.

Exit codes: 0 all passed, 1 some failed, 2 bad usage or unreadable input,
3 timed out.

Docs: https://sidprasad.github.io/spytial-core/#/testing-integrations`;

interface Options {
    paths: string[];
    readStdin: boolean;
    pretty: boolean;
    quiet: boolean;
    /** Seconds before the run is abandoned. 0 disables it. */
    timeoutSeconds: number;
}

class UsageError extends Error {}

/**
 * Generous on purpose. A case normally resolves in well under a second, so this
 * only ever fires on something pathological — but it has to clear a large suite
 * on a slow runner without tripping.
 */
const DEFAULT_TIMEOUT_SECONDS = 300;

function parseArgs(argv: string[]): Options {
    const options: Options = {
        paths: [], readStdin: false, pretty: false, quiet: false,
        timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--pretty': options.pretty = true; break;
            case '--quiet': options.quiet = true; break;
            case '-': options.readStdin = true; break;
            case '--timeout': {
                const value = argv[++i];
                if (value === undefined) throw new UsageError('--timeout needs a value in seconds.');
                const seconds = Number(value);
                if (!Number.isFinite(seconds) || seconds < 0) {
                    throw new UsageError(`--timeout needs a non-negative number of seconds, got "${value}".`);
                }
                options.timeoutSeconds = seconds;
                break;
            }
            default:
                if (arg.startsWith('-')) throw new UsageError(`Unknown option "${arg}".`);
                options.paths.push(arg);
        }
    }

    if (options.paths.length === 0 && !options.readStdin) {
        throw new UsageError('No case files given.');
    }
    return options;
}

/**
 * The release that built this file, stamped in by tsup. Absent when running
 * from source (tests, tsx), where the lookup below takes over.
 */
declare const __SPYTIAL_CORE_VERSION__: string | undefined;

/**
 * Which spytial-core release this is.
 *
 * The build-time stamp comes first because of how the bin is meant to be
 * deployed: vendored as a lone file beside a Python or Rust package, with no
 * spytial-core `package.json` anywhere near it. The lookup below would find
 * nothing there and every RunResult would report "unknown", losing the field
 * that says which release checked the cases. `typeof` on an undeclared name is
 * safe, so this degrades cleanly when the stamp is absent.
 */
function readVersion(): string {
    if (typeof __SPYTIAL_CORE_VERSION__ === 'string' && __SPYTIAL_CORE_VERSION__.length > 0) {
        return __SPYTIAL_CORE_VERSION__;
    }

    const here = typeof __dirname === 'string' ? __dirname : undefined;
    const candidates = [
        ...(here ? [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')] : []),
        join(process.cwd(), 'package.json'),
    ];

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
            if (parsed.name === 'spytial-core' && parsed.version) return parsed.version;
        } catch {
            // Try the next candidate — layout differs between the built bin and source.
        }
    }
    return 'unknown';
}

/** Expand a path into case files. Directories are scanned one level deep. */
function collectFiles(path: string): string[] {
    let stats;
    try {
        stats = statSync(path);
    } catch {
        throw new UsageError(`Cannot read "${path}".`);
    }

    if (stats.isFile()) return [path];

    if (stats.isDirectory()) {
        const files = readdirSync(path)
            .filter(entry => CASE_FILE_EXTENSIONS.has(extname(entry).toLowerCase()))
            .map(entry => join(path, entry))
            .filter(entry => statSync(entry).isFile())
            .sort();
        if (files.length === 0) {
            throw new UsageError(`No .json/.yaml/.yml case files in "${path}".`);
        }
        return files;
    }

    throw new UsageError(`"${path}" is neither a file nor a directory.`);
}

function readStdin(): string {
    try {
        return readFileSync(0, 'utf8');
    } catch {
        throw new UsageError('Could not read stdin.');
    }
}

/**
 * Parse a case document. YAML is a superset of JSON, so one parser reads both
 * — which also lets case files be written in YAML, where an inline spec does
 * not have to be a string of escaped newlines.
 */
function parseCaseDocument(source: string, origin: string): ConformanceCase[] {
    let parsed: unknown;
    try {
        parsed = yaml.load(source);
    } catch (e: unknown) {
        throw new UsageError(`${origin} is not valid JSON or YAML: ${e instanceof Error ? e.message : String(e)}`);
    }

    const cases = extractCases(parsed);
    if (cases.length === 0) {
        throw new UsageError(`${origin} holds no cases.`);
    }
    return cases;
}

// ─── Pretty output ───────────────────────────────────────────────────

function formatCase(result: CaseResult): string {
    const lines: string[] = [`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}`];

    for (const diagnostic of result.errors) {
        lines.push(`        error  [${diagnostic.code}] ${diagnostic.message}`);
        if (diagnostic.where) lines.push(`               at ${diagnostic.where}`);
    }
    for (const diagnostic of result.warnings) {
        lines.push(`        warn   [${diagnostic.code}] ${diagnostic.message}`);
        if (diagnostic.where) lines.push(`               at ${diagnostic.where}`);
    }
    for (const assertion of result.assertions.filter(a => !a.ok)) {
        lines.push(`        failed  ${assertion.query}`);
        lines.push(`                ${assertion.message}`);
        if (assertion.because) lines.push(`                because: ${assertion.because}`);
    }
    return lines.join('\n');
}

function formatRun(run: RunResult, quiet: boolean): string {
    const shown = quiet ? run.cases.filter(c => !c.ok) : run.cases;
    const lines = shown.map(formatCase);
    lines.push('');
    lines.push(`${run.passed} passed, ${run.failed} failed  (spytial-core ${run.spytialCoreVersion})`);
    return lines.join('\n');
}

/**
 * Run `fn` with everything written to stdout diverted to stderr.
 *
 * The layout engine narrates its work on stdout ("Generated 2 orientation
 * constraints..."). That is fine in a browser console and fatal here: a host
 * parsing our stdout as JSON would choke on the first line. Patching
 * `process.stdout.write` rather than `console.log` catches direct writes too.
 * The chatter is kept, not dropped — it moves to stderr, where it stays useful
 * for debugging without corrupting the contract.
 */
function withStdoutDivertedToStderr<T>(fn: () => T): T {
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
        return (process.stderr.write as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof process.stdout.write;

    try {
        return fn();
    } finally {
        process.stdout.write = originalWrite;
    }
}

// ─── Timeout ─────────────────────────────────────────────────────────

/** Marks the re-executed child, so it runs the cases instead of watching. */
const CHILD_MARKER = 'SPYTIAL_CHECK_SUPERVISED';

/** Exit code when the run is abandoned for taking too long. */
const EXIT_TIMED_OUT = 3;

/**
 * Whether this process can supervise a run.
 *
 * The timeout has to be enforced from outside the work, not inside it: cases
 * run synchronously, so a pathological spec blocks the event loop and no timer
 * in this process would ever fire. Re-executing the bin under `spawnSync`'s own
 * timeout is what makes the limit real.
 *
 * Only the built CJS bin can do this. The version stamp is the signal: it is
 * injected at build time, so its presence means `__filename` points at a
 * bundle node can actually re-run. Running from source (tests, tsx) it is
 * absent, and re-executing the TypeScript entry would fail outright — so the
 * run proceeds unsupervised instead.
 */
function canSupervise(): boolean {
    return process.env[CHILD_MARKER] !== '1'
        && typeof __SPYTIAL_CORE_VERSION__ === 'string'
        && typeof __filename === 'string'
        && existsSync(__filename);
}

/**
 * Re-run this bin under a hard time limit, forwarding its output and status.
 *
 * `stdinData` is passed through because the supervisor has already consumed
 * fd 0; the child cannot read it a second time.
 */
function superviseRun(argv: string[], seconds: number, stdinData: string | undefined): number {
    const result = spawnSync(
        process.execPath,
        [__filename, ...argv, '--timeout', '0'],
        {
            input: stdinData ?? '',
            encoding: 'utf8',
            timeout: seconds * 1000,
            maxBuffer: 256 * 1024 * 1024,
            env: { ...process.env, [CHILD_MARKER]: '1' },
        },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    // spawnSync reports a timeout as a kill signal, and sets `error` too on
    // some platforms. Either is the same outcome.
    const timedOut = result.signal !== null
        || (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
    if (timedOut) {
        process.stderr.write(
            `spytial-check: gave up after ${seconds}s. A case is taking far longer than layout ` +
            `normally does — most likely a selector that does not terminate on this datum. ` +
            `Raise the limit with --timeout <seconds>, or disable it with --timeout 0.\n`,
        );
        return EXIT_TIMED_OUT;
    }

    if (result.error) {
        process.stderr.write(`spytial-check: ${result.error.message}\n`);
        return 2;
    }
    return result.status ?? 2;
}

// ─── Entry ───────────────────────────────────────────────────────────

export function main(argv: string[]): number {
    if (argv.includes('-h') || argv.includes('--help')) {
        process.stdout.write(`${USAGE}\n`);
        return 0;
    }
    if (argv.includes('--version')) {
        process.stdout.write(`${readVersion()}\n`);
        return 0;
    }

    let cases: ConformanceCase[];
    let options: Options;
    let stdinData: string | undefined;
    try {
        options = parseArgs(argv);

        // Read stdin before anything else that might branch: the supervisor
        // needs the bytes to hand on, and fd 0 can only be drained once.
        if (options.readStdin) stdinData = readStdin();

        if (options.timeoutSeconds > 0 && canSupervise()) {
            return superviseRun(argv, options.timeoutSeconds, stdinData);
        }

        cases = [];
        for (const path of options.paths) {
            for (const file of collectFiles(path)) {
                cases.push(...parseCaseDocument(readFileSync(file, 'utf8'), file));
            }
        }
        if (stdinData !== undefined) {
            cases.push(...parseCaseDocument(stdinData, 'stdin'));
        }
    } catch (e: unknown) {
        if (e instanceof UsageError) {
            process.stderr.write(`spytial-check: ${e.message}\n\n${USAGE}\n`);
            return 2;
        }
        process.stderr.write(`spytial-check: ${e instanceof Error ? e.message : String(e)}\n`);
        return 2;
    }

    const version = readVersion();
    const run = withStdoutDivertedToStderr(() => runCases(cases, { spytialCoreVersion: version }));

    process.stdout.write(options.pretty
        ? `${formatRun(run, options.quiet)}\n`
        : `${JSON.stringify(run, null, 2)}\n`);

    return run.ok ? 0 : 1;
}

// Run only when invoked as a program. The bin is built as CJS, so `require.main`
// is the right check there; the guard keeps the module importable from tests,
// which load this source as ESM where `require` does not exist.
if (typeof require !== 'undefined' && require.main === module) {
    process.exitCode = main(process.argv.slice(2));
}
