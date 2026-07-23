import { defineConfig } from 'tsup'

export default defineConfig([{
  entry: {
    // CDN bundle: barrel exports + custom-element registration + the published
    // stylesheet (see src/global.ts). React components and SQLEvaluator moved
    // to their own bundles in 4.0.0 (react-component-integration.global.js and
    // spytial-core-sql.global.js respectively).
    'spytial-core-complete': 'src/global.ts'
  },
  format: ['iife'], // Immediately Invoked Function Expression for browser
  globalName: 'spytialcore', // Global variable name for the complete library
  dts: false, // No TypeScript definitions for browser bundle
  splitting: false,
  sourcemap: true,
  clean: false, // Don't clean dist folder (preserve other builds)
  minify: true,
  target: 'es2020',
  outDir: 'dist/browser',
  external: ['react', 'react-dom'], // Bundle everything, except React
  bundle: true,
  treeshake: true,
  // Create backward-compatible aliases for the global name
  footer: {
    js: 'if(typeof window!=="undefined"){const componentApi=window.spytialComponents||window.CnDComponents||window.CndComponents;if(componentApi&&typeof componentApi==="object"){Object.assign(window.spytialcore,componentApi);}window.CndCore=window.spytialcore;window.CnDCore=window.spytialcore;}',
  },
  // Bundle ALL dependencies for browser use
  noExternal: [
    'graphlib',
    'graphlib-dot',
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
},
{
  // Opt-in a11y explorer: registers <spytial-explorer> and merges
  // SpytialExplorer onto window.spytialcore. Load AFTER the main bundle
  // (shares its d3/cola page globals). Inlines data-navigator; kept out of
  // the main bundle while the explorer matures as a proof of concept.
  entry: { 'spytial-core-explorer': 'src/explorer.ts' },
  format: ['iife'],
  globalName: 'spytialExplorerBundle',
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
  noExternal: [
    'data-navigator',
    'graphlib',
    'kiwi.js',
    'chroma-js',
    'js-yaml',
    'lodash',
    '@xmldom/xmldom',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis',
  },
}])
