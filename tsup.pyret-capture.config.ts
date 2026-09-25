import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'pyret-capture': 'src/pyret-capture.ts' },
  format: ['cjs', 'esm', 'iife'], globalName: 'SpytialPyretCapture',
  dts: true, splitting: false, sourcemap: false, minify: true, clean: false,
  target: 'es2021', outDir: 'dist', platform: 'neutral',
  noExternal: ['graphlib', 'lodash'], bundle: true,
});
