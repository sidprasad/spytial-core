import { defineConfig } from 'tsup'

// Opt-in libavoid routing entry: npm `spytial-core/routers/libavoid`, ESM
// with libavoid-js EXTERNAL. libavoid-js is an optional peer dependency
// (LGPL-2.1-or-later): consumers install it themselves and their bundler
// resolves the WASM from their own node_modules. spytial-core redistributes
// no LGPL code — there is deliberately NO self-contained CDN bundle (an
// earlier IIFE + bundled wasm was dropped for exactly that reason).
// Script-tag consumers use an ESM CDN that resolves dependencies (see
// site/pipeline.md).
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
])
