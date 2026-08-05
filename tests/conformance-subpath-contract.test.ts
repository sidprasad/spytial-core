import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCase, runCases, checkDatum, CONFORMANCE_FORMAT_VERSION } from '../src/conformance';

// Integrations depend on this packaging: JavaScript hosts import
// `spytial-core/conformance`, everyone else runs the `spytial-check` bin. Both
// are contracts, so breaking either should fail here rather than downstream.

const packageJson = () =>
    JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

describe('conformance packaging contract', () => {
    it('exports a usable API from the module entry point', () => {
        expect(typeof runCase).toBe('function');
        expect(typeof runCases).toBe('function');
        expect(typeof checkDatum).toBe('function');
        expect(CONFORMANCE_FORMAT_VERSION).toBe(1);
    });

    it('publishes ./conformance in package exports and files', () => {
        const pkg = packageJson();

        expect(pkg.exports['./conformance'].import.default).toBe('./dist/conformance.mjs');
        expect(pkg.exports['./conformance'].import.types).toBe('./dist/conformance.d.mts');
        expect(pkg.exports['./conformance'].require.default).toBe('./dist/conformance.js');
        expect(pkg.exports['./conformance'].require.types).toBe('./dist/conformance.d.ts');

        for (const file of [
            'dist/conformance.js',
            'dist/conformance.mjs',
            'dist/conformance.d.ts',
            'dist/conformance.d.mts',
        ]) {
            expect(pkg.files).toContain(file);
        }
    });

    it('publishes the spytial-check bin', () => {
        const pkg = packageJson();

        expect(pkg.bin['spytial-check']).toBe('./dist/cli/spytial-check.js');
        expect(pkg.files).toContain('dist/cli');
    });

    it('builds conformance as part of build:all', () => {
        const pkg = packageJson();

        expect(pkg.scripts['build:conformance']).toBe('tsup --config tsup.conformance.config.ts');
        expect(pkg.scripts['build:all']).toContain('build:conformance');
    });

    it('keeps the bin self-contained so it can be vendored beside a non-JS package', () => {
        // Most integrations are not JavaScript. They test by running this bin as
        // a subprocess, often vendored next to a Python or Rust package with no
        // node_modules alongside it, so its deps must be inlined.
        const config = readFileSync(join(process.cwd(), 'tsup.conformance.config.ts'), 'utf8');

        expect(config).toContain("entry: { 'spytial-check': 'src/cli/spytial-check.ts' }");
        expect(config).toContain('noExternal: [/.*/]');
        expect(config).toContain("platform: 'node'");
    });

    it('leaves the module entry point resolving its deps normally', () => {
        // The opposite choice from the bin: a JavaScript consumer should dedupe
        // these against its own tree rather than get a second copy.
        const config = readFileSync(join(process.cwd(), 'tsup.conformance.config.ts'), 'utf8');
        const moduleEntry = config.slice(0, config.indexOf("'spytial-check'"));

        expect(moduleEntry).toContain("entry: { conformance: 'src/conformance/index.ts' }");
        expect(moduleEntry).not.toContain('noExternal');
    });
});
