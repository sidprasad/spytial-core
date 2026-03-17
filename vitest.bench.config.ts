import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['benchmarks/**/*.bench.ts'],
    testTimeout: 60_000,  // 60s per benchmark (some group scenarios run long)
  },
})
