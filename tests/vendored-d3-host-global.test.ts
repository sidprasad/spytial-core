import { describe, expect, it } from 'vitest';

/**
 * The other half of #574: a host page that already owns `window.d3`.
 *
 * The renderer uses the v4-only `d3.event` / `d3.mouse` API, so picking up a
 * host's d3 v7 would break it. The module must use its own vendored v4 and
 * ignore whatever the page put there.
 */
const hostD3 = { version: '7.9.0', __hostOwned: true };
(window as unknown as { d3?: unknown }).d3 = hostD3;

const { WebColaCnDGraph } = await import('../src/translators/webcola/webcola-cnd-graph');

describe('element owns its d3 (host global present)', () => {
  it('ignores a host d3 that cannot render', () => {
    // hostD3 has no `select`, so a constructor that reached for it would throw.
    expect(() => new WebColaCnDGraph()).not.toThrow();
  });

  it('does not replace the host global', () => {
    expect((window as unknown as { d3?: unknown }).d3).toBe(hostD3);
  });
});
