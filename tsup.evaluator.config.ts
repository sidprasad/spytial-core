import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { evaluator: 'src/evaluators/data/sgq-evaluator.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: false,
  minify: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['react', 'react-dom', 'forge-expr-evaluator'],
  // Inline the evaluator's runtime deps so the ./evaluator entry is a single
  // self-contained file. This lets downstream consumers (e.g. spytial-py's
  // headless suggest evaluator) vendor one .js/.mjs with no sibling node_modules.
  // simple-graph-query already ships a self-contained bundle; graphlib pulls
  // lodash, so lodash must be bundled too (it's a direct dep, otherwise external).
  noExternal: ['graphlib', 'simple-graph-query', 'lodash'],
  bundle: true,
  treeshake: true,
  platform: 'node',
})
