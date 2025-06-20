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
  sourcemap: false,
  clean: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  external: [],
  bundle: true,
  treeshake: true,
  // Ensure all dependencies are bundled for client-side use
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
