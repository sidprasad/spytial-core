import { describe, expect, it } from 'vitest';

/**
 * Regression for #574.
 *
 * The element module used to read d3 off `window` when its body evaluated, and
 * register itself at module scope in the same pass. `customElements.define`
 * upgrades matching elements already in the document synchronously, so the
 * constructor ran right then — but index.ts installed `window.d3` only after an
 * async import chain, strictly later. A page holding the element before the
 * bundle evaluated lost that race and died on `d3.select`.
 *
 * NOTHING is installed on `window` here, deliberately: the module has to bring
 * its own d3. Every other test in this repo assigns `window.d3` before
 * importing, which is exactly how the bug stayed hidden.
 */
delete (window as unknown as { d3?: unknown }).d3;
delete (window as unknown as { d3v4?: unknown }).d3v4;

const { WebColaCnDGraph } = await import('../src/translators/webcola/webcola-cnd-graph');

describe('element owns its d3 (no page global)', () => {
  it('constructs with no window.d3 on the page', () => {
    expect(() => new WebColaCnDGraph()).not.toThrow();
  });

  it('upgrades an element that was already in the document', () => {
    document.body.innerHTML = '<webcola-cnd-graph id="pre"></webcola-cnd-graph>';
    const el = document.getElementById('pre') as HTMLElement;
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.querySelector('#svg')).not.toBeNull();
  });

  it('leaves window.d3 alone — the module never had to install it', () => {
    expect((window as unknown as { d3?: unknown }).d3).toBeUndefined();
  });
});
