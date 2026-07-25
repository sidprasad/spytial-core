import { describe, expect, it, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import type { LayoutWarning } from '../src/layout/error-state';

/**
 * Rendering tests for the warning badge, exercised through the prototype with a
 * fake `this` (the same shape `webcola-teardown.test.ts` uses) so no d3/WebCola
 * is needed.
 *
 * The badge now carries two kinds of warning: per-item selector diagnostics, and
 * deprecation notices raised while parsing the spec. A deprecation has no
 * selector — it is raised before anything is evaluated — which is the case these
 * tests are here for: the detail row that prints `context: <selector>` must be
 * skipped rather than rendering an empty `<code>`, and the dedup/dismissal
 * signature must fall back to something that still tells two of them apart.
 *
 * The fixture is hand-built rather than taken from `initializeDOM` (which needs
 * d3), but it cannot silently drift: it carries the ids the implementation
 * queries, so renaming one makes `renderLayoutWarnings` bail early and these
 * assertions fail.
 */

const proto = WebColaCnDGraph.prototype as any;

/** The warning-badge subtree of the element's shadow DOM. */
function fixture() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div id="layout-warnings" hidden>
      <div id="layout-warnings-bar">
        <button id="layout-warnings-badge" type="button" aria-expanded="false" aria-controls="layout-warnings-panel">
          <span id="layout-warnings-count"></span>
        </button>
        <button id="layout-warnings-dismiss" type="button"></button>
      </div>
      <div id="layout-warnings-panel" hidden></div>
    </div>`;
  const fakeThis: any = {
    root,
    dismissedWarningSignature: null,
    currentWarningSignature: null,
    dispatchEvent: vi.fn(),
  };
  return { root, fakeThis };
}

const deprecation: LayoutWarning = {
  severity: 'warning',
  code: 'deprecated',
  message: "'atomColor' is deprecated; use 'atomStyle' with a 'borderStyle' block.",
  context: 'spec',
  specType: 'atomColor',
  label: 'atomColor',
};

const unresolved: LayoutWarning = {
  severity: 'warning',
  code: 'unresolved-name',
  message: "'nxt' did not match any type, relation, or atom.",
  selector: 'nxt',
  context: 'orientation selector',
  specType: 'orientation',
  specIndex: 0,
  label: 'OrientationConstraint · nxt',
  name: 'nxt',
};

const render = (fakeThis: any, warnings: LayoutWarning[]) =>
  proto.renderLayoutWarnings.call(fakeThis, warnings);

const items = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.layout-warning-item')) as HTMLElement[];

describe('renderLayoutWarnings', () => {
  it('renders a deprecation without a selector row', () => {
    const { root, fakeThis } = fixture();

    render(fakeThis, [deprecation]);

    const [item] = items(root);
    expect(item.querySelector('.layout-warning-label')!.textContent).toBe('atomColor');
    expect(item.textContent).toContain('atomStyle');
    // No selector to point at, so no `context: <selector>` row — and in
    // particular no empty <code> element.
    expect(item.querySelectorAll('code')).toHaveLength(0);
    expect(item.textContent).not.toContain('spec:');
  });

  it('still renders the selector row for a selector warning', () => {
    const { root, fakeThis } = fixture();

    render(fakeThis, [unresolved]);

    const [item] = items(root);
    expect(item.querySelector('code')!.textContent).toBe('nxt');
    expect(item.textContent).toContain('orientation selector');
  });

  it('counts both kinds together, and says "spec" rather than "selector"', () => {
    const { root, fakeThis } = fixture();

    render(fakeThis, [deprecation, unresolved]);

    expect(root.querySelector('#layout-warnings-count')!.textContent).toBe('2 spec warnings');
    expect(items(root)).toHaveLength(2);
    expect((root.querySelector('#layout-warnings') as HTMLElement).hidden).toBe(false);
  });

  it('singularizes the count', () => {
    const { root, fakeThis } = fixture();
    render(fakeThis, [deprecation]);
    expect(root.querySelector('#layout-warnings-count')!.textContent).toBe('1 spec warning');
  });

  it('hides the badge when there is nothing to report', () => {
    const { root, fakeThis } = fixture();

    render(fakeThis, [deprecation]);
    render(fakeThis, []);

    expect((root.querySelector('#layout-warnings') as HTMLElement).hidden).toBe(true);
    expect(items(root)).toHaveLength(0);
  });

  it('emits layout-warnings so a host with richer UI can route them', () => {
    const { fakeThis } = fixture();

    render(fakeThis, [deprecation]);

    expect(fakeThis.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = fakeThis.dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('layout-warnings');
    expect(event.detail.warnings).toEqual([deprecation]);
  });

  describe('dismissal', () => {
    it('keeps an identical set hidden across re-renders', () => {
      const { root, fakeThis } = fixture();
      render(fakeThis, [deprecation]);

      fakeThis.dismissedWarningSignature = fakeThis.currentWarningSignature;
      render(fakeThis, [deprecation]);

      expect((root.querySelector('#layout-warnings') as HTMLElement).hidden).toBe(true);
    });

    it('holds when the same warnings arrive in a different order', () => {
      // The key is the set, not the arrival order: warnings are collected as the
      // render walks the instance, and two frames carrying the same warnings can
      // collect them in a different order. That must not read as a change and
      // undo the dismissal.
      const { root, fakeThis } = fixture();
      render(fakeThis, [deprecation, unresolved]);
      fakeThis.dismissedWarningSignature = fakeThis.currentWarningSignature;

      render(fakeThis, [unresolved, deprecation]);

      expect((root.querySelector('#layout-warnings') as HTMLElement).hidden).toBe(true);
    });

    it('tells two selectorless warnings apart, so a new one still shows', () => {
      // Both are deprecations of the same form with no selector and no name —
      // the fields the signature normally keys on. Only the message separates
      // them, so a signature that ignored it would leave the second warning
      // suppressed by the first one's dismissal.
      const { root, fakeThis } = fixture();
      render(fakeThis, [deprecation]);
      fakeThis.dismissedWarningSignature = fakeThis.currentWarningSignature;

      render(fakeThis, [{ ...deprecation, message: "'edgeColor' is deprecated." }]);

      expect((root.querySelector('#layout-warnings') as HTMLElement).hidden).toBe(false);
    });
  });
});
