import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['./webcola-demo/integrated-demo-components.tsx', './webcola-demo/react-component-integration.tsx'],
  format: ['iife'], // Immediately Invoked Function Expression for HTML
  globalName: 'IntegratedDemo',
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
    console.log('✅ Integrated demo components built successfully for HTML integration');
  },
});
