import { defineConfig } from 'tsup'

// Builds ONLY the alloy-instance parser as an importable cjs/esm module (+ d.ts) for external
// consumers (e.g. Cope and Drag, which uses spytial-core as the canonical Alloy XML parser).
//
// Scoped to this subtree on purpose: the full `tsup.config.ts` runs dts over `index`, which pulls
// in unrelated modules whose type errors break the dts build. `clean: false` so this coexists with
// the browser (dist/browser) and components (dist/components) bundles in `dist`.
export default defineConfig({
  entry: { 'alloy-instance': 'src/data-instance/alloy/alloy-instance/index.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  minify: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['react', 'react-dom'],
  bundle: true,
  treeshake: true,
  platform: 'browser',
  noExternal: [
    'graphlib',
    'kiwi.js',
    'chroma-js',
    'js-yaml',
    'lodash',
    '@xmldom/xmldom',
    'forge-expr-evaluator'
  ],
})
