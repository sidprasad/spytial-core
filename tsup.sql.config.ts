import { defineConfig } from 'tsup'

// SQL selector support, split out of the default entries in 4.0.0 so the
// alasql SQL engine (~500 KB min / ~108 KB gz) is only paid for by consumers
// who opt in. Two artifacts:
//
//  1. npm `spytial-core/sql-evaluator` — cjs+esm+d.ts with alasql EXTERNAL:
//     the consumer's bundler resolves alasql from their own node_modules
//     (alasql is an optional peer dependency), so it can be deduped, chunked,
//     or lazily loaded on their side.
//  2. CDN dist/browser/spytial-core-sql.global.js — IIFE with alasql INLINED
//     (a <script> must be self-contained). Loaded after the main bundle it
//     merges SQLEvaluator back onto window.spytialcore, restoring the pre-4.0
//     `new CndCore.SQLEvaluator()` access pattern for pages that add the tag.
export default defineConfig([
  {
    entry: { 'sql-evaluator': 'src/evaluators/data/sql-evaluator.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    external: ['alasql'],
    bundle: true,
    treeshake: true,
    platform: 'browser',
  },
  {
    entry: { 'spytial-core-sql': 'src/sql-global.ts' },
    format: ['iife'],
    globalName: 'spytialSqlBundle',
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist/browser',
    bundle: true,
    treeshake: true,
    platform: 'browser',
    noExternal: ['alasql'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'global': 'globalThis',
    },
  },
])
