import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite configuration for building React components with CSS Modules support
 * This handles the React components while tsup handles the main library
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/demo-integration.tsx'),
      name: 'CndComponents',
      fileName: (format) => `demo-integration.${format}.js`,
      formats: ['iife'], // For direct HTML usage
    },
    outDir: 'dist/components',
    emptyOutDir: true,
    sourcemap: true,
    minify: false, // Set to true for production
    rollupOptions: {
      // Don't externalize React - bundle it
      external: [],
      output: {
        globals: {},
      },
    },
    target: 'es2020',
  },
  css: {
    modules: {
      // CSS Modules configuration
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    // Browser-compatible definitions
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    'process.env': '{}',
    'global': 'globalThis',
    '__DEV__': mode !== 'production'
  }
}));