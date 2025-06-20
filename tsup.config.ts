import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Main entry point
    index: 'src/index.ts',
    // Sub-module entry points
    'alloy-graph': 'src/alloy-graph/index.ts',
    'alloy-instance': 'src/alloy-instance/index.ts',
    'layout': 'src/layout/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2020',
  outDir: 'dist',
  external: [],
  bundle: true,
  treeshake: true,
})
