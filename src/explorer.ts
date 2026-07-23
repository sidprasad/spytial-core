/**
 * SpytialExplorer entry — the accessibility explorer element, split out of the
 * default entries in 4.0.0 while it matures as a proof of concept (it carries
 * the data-navigator dependency and the spatial/datum REPL overlay).
 *
 *  - npm: `import { SpytialExplorer } from 'spytial-core/explorer'` — importing
 *    the module registers <spytial-explorer> when a DOM is present (same
 *    behavior the core barrel had before 4.0.0). data-navigator is an optional
 *    peer dependency.
 *  - CDN: dist/browser/spytial-core-explorer.global.js — load AFTER the main
 *    bundle (the element extends WebColaCnDGraph and shares its d3/cola page
 *    globals); it registers the element and merges SpytialExplorer onto
 *    window.spytialcore and its legacy aliases:
 *
 *      <script src=".../spytial-core-complete.global.js"></script>
 *      <script src=".../spytial-core-explorer.global.js"></script>
 */
import { SpytialExplorer } from './components/spytial-explorer';

export { SpytialExplorer };

/** Register <spytial-explorer> (idempotent; no-op without a DOM). */
export function registerSpytialExplorer(): void {
  if (typeof customElements !== 'undefined' && !customElements.get('spytial-explorer')) {
    customElements.define('spytial-explorer', SpytialExplorer as unknown as CustomElementConstructor);
  }
}

if (typeof window !== 'undefined') {
  registerSpytialExplorer();
  const globalWindow = window as any;
  // The three names usually alias one object, but merge into each defensively.
  for (const core of [globalWindow.spytialcore, globalWindow.CndCore, globalWindow.CnDCore]) {
    if (core && typeof core === 'object') {
      core.SpytialExplorer = SpytialExplorer;
    }
  }
  // Also reachable standalone (page loaded only this bundle).
  globalWindow.spytialExplorer = { SpytialExplorer, registerSpytialExplorer };
}
