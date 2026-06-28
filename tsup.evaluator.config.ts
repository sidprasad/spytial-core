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
  external: ['react', 'react-dom', 'simple-graph-query', 'forge-expr-evaluator'],
  bundle: true,
  treeshake: true,
  platform: 'node',
})
