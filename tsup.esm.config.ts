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
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  outDir: 'dist/esm',
  // tsup's dts hard-fails on the pre-existing baseline type errors (e.g. the
  // translators/index.ts ParsedCnDSpec re-export). Types come from the
  // best-effort tsc emit instead (build:types → dist/types/index.d.ts).
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
