#!/usr/bin/env node
/** JSON-in/JSON-out bridge for Python's interactive suggest sessions. */
import { readFileSync } from 'node:fs';
import { comparePrograms } from '../layout/compare-programs';

// Library diagnostics must not corrupt the JSON protocol.
console.log = console.warn = console.info = (...args: unknown[]) => console.error(...args);
try {
    const { datum, a, b } = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(comparePrograms(datum, a, b)));
} catch (error) {
    process.stdout.write(JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
}
