import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Main entry point
    index: 'src/index.ts',
    // Sub-module entry points
    'alloy-graph': 'src/data-instance/alloy/alloy-graph/index.ts',
    'alloy-instance': 'src/data-instance/alloy/alloy-instance/index.ts',
    'layout': 'src/layout/index.ts',
    'translators': 'src/translators/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,  // Enable sourcemaps for debugging
  clean: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  external: ['react', 'react-dom'],
  bundle: true,
  treeshake: true,
    // Ensure DOM types are available
  platform: 'browser',
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
