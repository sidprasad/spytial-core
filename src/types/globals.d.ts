// Ambient globals for the vendored browser runtimes.
//
// `index.ts` dynamically imports `vendor/cola.js` and `vendor/d3.v4.min.js` and
// stashes each on `window`; `webcola-cnd-graph.ts` reads them back off `window`.
// Neither vendored bundle ships types, so declare the globals here.
//
// cola.js is the same WebCola build as the `webcola` npm package, so it is typed
// as that package. That keeps `window.cola.Rectangle` and the
// `import type { Layout } from 'webcola'` annotations resolving to ONE set of
// declarations. The `@types/webcola` package was removed for exactly this
// reason: it declared a rival global `cola` namespace typed for webcola 3.1.1
// (this repo is on 3.4.0), so the two disagreed on Layout, GridRouter and Node.

import type * as WebCola from 'webcola';

declare global {
  interface Window {
    /** Vendored WebCola runtime, same build as the `webcola` package. */
    cola?: typeof WebCola;
    /** Vendored D3 v4 (`vendor/d3.v4.min.js`) — untyped, as the bundle is. */
    d3v4?: any;
  }
}

export {};
