import { defineConfig } from 'tsup'
import { copyFile, mkdir } from 'fs/promises'

// Opt-in libavoid routing entry, following the sql-evaluator split pattern:
//
//  1. npm `spytial-core/routers/libavoid` — ESM with libavoid-js EXTERNAL:
//     libavoid-js is an optional peer dependency (LGPL-2.1-or-later; keeping
//     it external keeps LGPL code out of this entry), and the consumer's
//     bundler resolves the WASM from their own node_modules. NOTE: the CDN
//     artifacts below DO contain libavoid-js and currently ship in the npm
//     tarball via package.json `files` ("dist/browser") — open decision, see
//     the license note in routing/libavoid-router.ts.
//  2. CDN dist/browser/spytial-core-router-libavoid.global.js — IIFE with the
//     libavoid-js JS glue INLINED; libavoid.wasm is copied next to it and
//     fetched relative to the script URL at runtime. Loaded after the main
//     bundle, it registers 'libavoid' and takes over 'grid' through the
//     shared routing registry (globalThis-backed — see routing/registry.ts).
export default defineConfig([
  {
    entry: { 'routers/libavoid': 'src/routers/libavoid.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    external: ['libavoid-js'],
    bundle: true,
    treeshake: true,
    platform: 'browser',
  },
  {
    entry: { 'spytial-core-router-libavoid': 'src/routers/libavoid-global.ts' },
    format: ['iife'],
    globalName: 'spytialLibavoidBundle',
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
    noExternal: ['libavoid-js'],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    onSuccess: async () => {
      await mkdir('dist/browser', { recursive: true })
      await copyFile(
        'node_modules/libavoid-js/dist/libavoid.wasm',
        'dist/browser/libavoid.wasm'
      )
      console.log('✅ libavoid router bundles built; libavoid.wasm copied to dist/browser')
    },
  },
])
