import { readFileSync } from 'node:fs'

import { defineConfig } from 'tsup'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

// The conformance harness ships as two artifacts, for the two ways it gets used.
//
//  1. npm `spytial-core/conformance` — cjs+esm+d.ts with deps EXTERNAL, so a
//     JavaScript integration (or spytial-core's own tests) resolves and dedupes
//     them from its own node_modules like any other import.
//  2. `dist/cli/spytial-check.js` — the bin, with deps INLINED. Most Spytial
//     integrations are not JavaScript; they test by running a subprocess. A
//     single self-contained file can be vendored next to a Python or Rust
//     package and run by any Node, with no sibling node_modules to install.
//     Same reasoning as the ./evaluator entry.
export default defineConfig([
  {
    entry: { conformance: 'src/conformance/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    external: ['react', 'react-dom', 'alasql', 'forge-expr-evaluator'],
    bundle: true,
    treeshake: true,
    platform: 'node',
  },
  {
    entry: { 'spytial-check': 'src/cli/spytial-check.ts' },
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    target: 'es2020',
    outDir: 'dist/cli',
    external: ['react', 'react-dom', 'alasql', 'forge-expr-evaluator'],
    noExternal: [/.*/],
    bundle: true,
    treeshake: true,
    platform: 'node',
    // Minified: this file is vendored into every non-JavaScript integration's
    // repo, so its size is paid per-checkout, per-release. Unminified it is
    // 3.3MB, most of it simple-graph-query's dependency bundle — frames nobody
    // reads anyway. Failures are diagnosed from the RunResult diagnostics, not
    // from stack traces into this bundle.
    minify: true,
    // No `banner` shebang here: esbuild carries the one in the source file
    // through, and adding a second makes the output unparseable.
    //
    // Stamp the version into the bundle. Vendored as a lone file there is no
    // spytial-core package.json anywhere near it, so the runtime lookup finds
    // nothing and every RunResult would claim version "unknown" — losing the
    // one field that says which release checked the cases.
    define: {
      __SPYTIAL_CORE_VERSION__: JSON.stringify(version),
    },
  },
])
