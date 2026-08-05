import { defineConfig } from 'tsup'

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
    // Not minified: when a case fails in someone else's CI, a readable stack
    // trace is worth more than the bytes.
    minify: false,
    target: 'es2020',
    outDir: 'dist/cli',
    external: ['react', 'react-dom', 'alasql', 'forge-expr-evaluator'],
    noExternal: [/.*/],
    bundle: true,
    treeshake: true,
    platform: 'node',
    // No `banner` shebang here: esbuild carries the one in the source file
    // through, and adding a second makes the output unparseable.
  },
])
