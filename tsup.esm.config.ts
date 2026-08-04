import { defineConfig } from 'tsup'

// Real ES module for the npm `.` *import* condition.
//
// ADDITIVE + ZERO-RISK: this build does NOT touch the browser IIFE global
// (dist/browser/spytial-core-complete.global.js) or the component bundles
// (dist/components/*.global.js). Existing consumers resolve those by hard file
// path (copeanddrag's webpack copy + require.resolve, spytial-lean's rollup
// virtual module) or off the page `window` global (spytial-gdl), and none of
// them read the `.` `import` condition. This only gives *new* bundler/Node
// consumers a working, tree-shakeable module instead of the non-ESM IIFE that
// `import { X } from 'spytial-core'` resolves to today.
//
// Output is isolated in dist/esm/ and `clean: false`, so it can never wipe the
// artifacts the consumers above depend on.
//
// Deps are left EXTERNAL (tsup's default for package.json `dependencies`), so
// the consumer's bundler dedupes + tree-shakes d3/lodash/webcola/etc. rather
// than inlining a second copy — the opposite of the IIFE's `noExternal` list.
export default defineConfig({
  // explorer shares chunks with index (splitting: true), so importing both
  // 'spytial-core' and 'spytial-core/explorer' never duplicates the
  // WebColaCnDGraph class the explorer extends.
  entry: { index: 'src/index.ts', explorer: 'src/explorer.ts' },
  format: ['esm'],
  outDir: 'dist/esm',
  // Types come from build:types (tsc -p tsconfig.types.json →
  // dist/types/index.d.ts), which package.json's "types" conditions point at.
  // This was forced — tsup's dts hard-failed on a baseline of type errors — but
  // that baseline is now zero, so turning dts on here is a live option. It
  // stays off only to keep ONE declaration emitter: two would need their output
  // reconciled, and tsc's is the one the package already ships.
  dts: false,
  // index.ts's browser-only auto-registration uses guarded dynamic import();
  // splitting lets those become async chunks instead of being inlined eagerly.
  splitting: true,
  sourcemap: true,
  clean: false,
  minify: false, // ship readable ESM; the consumer minifies + tree-shakes
  treeshake: true,
  target: 'es2020',
  platform: 'browser',
})
