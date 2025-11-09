import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Complete browser bundle with everything
    'spytial-core-complete': 'src/index.ts'
  },
  format: ['iife'], // Immediately Invoked Function Expression for browser
  globalName: 'SpytialCore', // Global variable name for the complete library
  dts: false, // No TypeScript definitions for browser bundle
  splitting: false,
  sourcemap: true,
  clean: false, // Don't clean dist folder (preserve other builds)
  minify: false, // Keep readable for debugging
  target: 'es2020',
  outDir: 'dist/browser',
  external: ['react', 'react-dom'], // Bundle everything, except React
  bundle: true,
  treeshake: true,
  // Bundle ALL dependencies for browser use
  noExternal: [
    'graphlib',
    'kiwi.js', 
    'chroma-js',
    'js-yaml',
    'lodash',
    '@xmldom/xmldom',
    'forge-expr-evaluator',
    'd3',
    'webcola',
    'dagre',
    'simple-graph-query'
  ],
  // Define global variables for browser environment
  define: {
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis'
  },
  // Ensure DOM types are available
  platform: 'browser',
})
