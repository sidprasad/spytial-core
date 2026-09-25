import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { data: 'src/data.ts' },
  format: ['cjs', 'esm'], dts: true, splitting: false,
  sourcemap: false, minify: true, clean: false,
  target: 'es2021', outDir: 'dist', platform: 'neutral',
  noExternal: ['graphlib', 'lodash'], bundle: true,
});
