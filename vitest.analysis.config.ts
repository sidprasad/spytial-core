import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the analysis-harness subtree.
 *
 * Runs *only* `analysis/tests/**`, kept separate from the main suite
 * because the smoke tests drive the full layout pipeline through every
 * policy on every fixture and are therefore slow. `npm run analysis:test`
 * uses this config; the default `npm run test:run` does not, so day-to-day
 * iteration on src/ does not pay the cost.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['analysis/tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'analysis/results/**'],
  },
});
