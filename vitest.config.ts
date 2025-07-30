import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,ts,tsx,tsx}', 
      'tests/**/*.{test,spec}.{js,ts,tsx,tsx}'
    ],
    css: true,  // Enable CSS support for tests
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        'tests/setup.ts',
        '**/*.test.*',
        '**/*.spec.*',
      ],
    },
  },
})
