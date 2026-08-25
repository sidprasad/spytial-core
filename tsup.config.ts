import { defineConfig } from 'tsup'

import { readFileSync } from 'node:fs'

// The single source of truth for the shipped `spytialcore.version`: stamped in
// below so a release only ever has to move package.json.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

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
  minify: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['react', 'react-dom'],
  bundle: true,
  treeshake: true,
    // Ensure DOM types are available
  define: {
    __SPYTIAL_CORE_VERSION__: JSON.stringify(version),
  },
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
