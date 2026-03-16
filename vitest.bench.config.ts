import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['benchmarks/**/*.bench.ts'],
    testTimeout: 120_000,
  },
})
