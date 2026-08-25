import { defineConfig } from 'tsup'

import { readFileSync } from 'node:fs'

// The single source of truth for the shipped `spytialcore.version`: stamped in
// below so a release only ever has to move package.json.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

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
    __SPYTIAL_CORE_VERSION__: JSON.stringify(version),
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis'
  },
  // Ensure DOM types are available
  platform: 'browser',
},
{
  // Opt-in a11y explorer: registers <spytial-explorer> and merges
  // SpytialExplorer onto window.spytialcore, so load it after the main bundle
  // for that merge to find the namespace. It carries its own copy of the
  // vendored d3/cola rather than borrowing page globals (#574), which is why
  // it is larger than it used to be. Inlines data-navigator; kept out of the
  // main bundle while the explorer matures as a proof of concept.
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
    __SPYTIAL_CORE_VERSION__: JSON.stringify(version),
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis',
  },
}])
