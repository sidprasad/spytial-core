/**
 * Opt-in libavoid routing entry: `import 'spytial-core/routers/libavoid'`.
 *
 * Importing this module (in a browser) loads the libavoid WASM and registers
 * the 'libavoid' routing mode — and, by default, takes over 'grid' so
 * layoutFormat="grid" diagrams get libavoid orthogonal routing in place of
 * WebCola's GridRouter. Core bundles never pay for the WASM; only importers
 * of this entry do.
 *
 * libavoid-js is an optional peer dependency (and LGPL-2.1-or-later — see the
 * note in libavoid-router.ts): consumers install it themselves.
 *
 * For deterministic startup (elements build their Routing dropdown at
 * construction), await the exported promise before rendering:
 *
 *   import { libavoidReady } from 'spytial-core/routers/libavoid';
 *   await libavoidReady;
 *
 * To customize (e.g. a bundler that serves libavoid.wasm from its own asset
 * URL, or takeOverGrid: false), call registerLibavoidRouting with options
 * right after import and await its returned promise. The auto-init below is
 * deferred one macrotask exactly so that such a call — whether after a
 * static import (same task) or `await import()` (next microtask) — starts
 * the load first and wins the dedupe; libavoidReady then settles with that
 * load.
 *
 *   import { registerLibavoidRouting } from 'spytial-core/routers/libavoid';
 *   await registerLibavoidRouting({ wasmUrl: myWasmUrl });
 */
export {
  LibavoidRouter,
  registerLibavoidRouting,
  type LibavoidRoutingOptions,
} from '../translators/webcola/routing/libavoid-router';

import { registerLibavoidRouting } from '../translators/webcola/routing/libavoid-router';

/**
 * Resolves when the WASM is loaded and the routing modes are registered.
 * Never rejects — a failed load logs a console error, and the load can be
 * retried by calling registerLibavoidRouting again (failures are not cached).
 * In non-browser environments (SSR, tests) this module is loadable but does
 * not auto-initialize — call registerLibavoidRouting() yourself if needed.
 */
export const libavoidReady: Promise<void> =
  typeof window === 'undefined'
    ? Promise.resolve()
    : new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        .then(() => registerLibavoidRouting())
        .catch((e) => {
          console.error('[spytial] libavoid routing failed to initialize:', e);
        });
