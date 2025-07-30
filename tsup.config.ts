import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Main entry point - includes all sub-modules via re-exports
    index: 'src/index.ts',
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
