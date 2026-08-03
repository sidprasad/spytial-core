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
 */
export {
  LibavoidRouter,
  registerLibavoidRouting,
  type LibavoidRoutingOptions,
} from '../translators/webcola/routing/libavoid-router';

import { registerLibavoidRouting } from '../translators/webcola/routing/libavoid-router';

/**
 * Resolves when the WASM is loaded and the routing modes are registered.
 * In non-browser environments (SSR, tests) this module is loadable but does
 * not auto-initialize — call registerLibavoidRouting() yourself if needed.
 */
export const libavoidReady: Promise<void> =
  typeof window !== 'undefined'
    ? registerLibavoidRouting().catch((e) => {
        console.error('[spytial] libavoid routing failed to initialize:', e);
      })
    : Promise.resolve();
