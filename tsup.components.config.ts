import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./webcola-demo/react-component-integration.tsx'],
  format: ['iife'], // Immediately Invoked Function Expression for HTML
  globalName: 'CndComponents',
  outDir: 'dist/components',
  clean: true,
  minify: false, // Set to true for production
  sourcemap: true,
  // external: ['react', 'react-dom'], // Remove this line to bundle React
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  dts: true,
  onSuccess: async () => {
    console.log('✅ React components built successfully for HTML integration');
  },
});
