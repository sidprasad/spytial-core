import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export default defineConfig({
  entry: {
    // Main entry point
    index: 'src/index.ts',
    // Sub-module entry points
    'alloy-graph': 'src/alloy-graph/index.ts',
    'alloy-instance': 'src/alloy-instance/index.ts',
    'layout': 'src/layout/index.ts',
    'translators': 'src/translators/index.ts',
    // WebCola custom element
    'webcola-cnd-graph': 'src/translators/webcola/webcola-cnd-graph.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,  // Enable sourcemaps for debugging
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
    'forge-expr-evaluator',
    'webcola',
    'd3'
  ],
  onSuccess: async () => {
    // Copy webcolasiderenderer.js to dist/webcola/
    try {
      mkdirSync('dist/webcola', { recursive: true });
      copyFileSync('src/translators/webcola/webcolasiderenderer.js', 'dist/webcola/webcolasiderenderer.js');
      console.log('✓ Copied webcolasiderenderer.js to dist/webcola/');
    } catch (error) {
      console.warn('Warning: Could not copy webcolasiderenderer.js:', error);
    }
  },
})
