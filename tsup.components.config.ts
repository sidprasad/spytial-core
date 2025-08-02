import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    './webcola-demo/integrated-demo-components.tsx', 
    './webcola-demo/react-component-integration.tsx',
    './webcola-demo/pyret-repl-demo-components.tsx'
  ],
  format: ['iife'], // Immediately Invoked Function Expression for HTML
  globalName: 'IntegratedDemo',
  outDir: 'dist/components',
  clean: true,
  minify: false, // Set to true for production
  sourcemap: true,
  target: 'es2020',
  platform: 'browser',
  splitting: false,
  dts: true,
  // Bundle everything except React - this creates self-contained component bundles
  // The duplication will be prevented by ensuring only one bundle is loaded at a time
  external: ['react', 'react-dom'],
  onSuccess: async () => {
    console.log('✅ Demo components built successfully for HTML integration (integrated + pyret-repl)');
    console.log('📝 Note: To prevent duplication, ensure HTML loads EITHER the browser bundle OR component bundles, not both');
  },
});
