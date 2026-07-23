import { defineConfig } from 'tsup'

// npm `spytial-core/react` — the React component surface as a real ES module
// with react/react-dom EXTERNAL (they're optional peer dependencies; a host
// app supplies its own React, avoiding the duplicate-React trap). CodeMirror
// and the other UI deps stay external too — the consumer's bundler resolves
// them from this package's dependencies and tree-shakes what it can.
//
// The CDN equivalent is dist/components/react-component-integration.global.js
// (built by tsup.components.config.ts), which instead INLINES React and adds
// the window.mount* API.
export default defineConfig({
  entry: { react: 'src/components/index.ts' },
  format: ['esm'],
  // tsup's dts hard-fails on the pre-existing baseline type errors in the
  // component subtree. Types for this entry come from the best-effort tsc
  // emit instead (build:types → dist/types/components/index.d.ts), which the
  // package.json "./react" types condition points at.
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false,
  minify: false, // readable ESM; the consumer minifies
  target: 'es2020',
  outDir: 'dist',
  external: ['react', 'react-dom'],
  bundle: true,
  treeshake: true,
  platform: 'browser',
})
