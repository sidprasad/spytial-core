import { defineConfig } from 'tsup';

export default defineConfig({
  // Create minimal placeholder components build to prevent duplication
  // Real components are included in the main browser bundle
  entry: {
    'placeholder': './src/index.ts' // Use main index as placeholder
  },
  format: ['iife'],
  globalName: 'ComponentsPlaceholder',
  outDir: 'dist/components',
  clean: true,
  minify: false,
  sourcemap: false,
  external: [
    // Externalize everything to keep bundle tiny
    'react', 'react-dom', 'graphlib', 'kiwi.js', 'chroma-js', 'js-yaml', 
    'lodash', '@xmldom/xmldom', 'forge-expr-evaluator', 'd3', 'webcola', 
    'dagre', 'simple-graph-query'
  ],
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  dts: false,
  onSuccess: async () => {
    console.log('✅ Component builds disabled to prevent bundle duplication');
    console.log('Use the main browser bundle (cnd-core-complete.global.js) which includes all components');
  },
});
