/**
 * CDN/script-tag entry for libavoid routing. Load AFTER the main bundle:
 *
 *   <script src="spytial-core-complete.global.js"></script>
 *   <script src="spytial-core-router-libavoid.global.js"></script>
 *
 * libavoid.wasm must be served next to this script (the loader fetches it
 * relative to the script URL), or set window.SPYTIAL_LIBAVOID_WASM_URL first.
 *
 * IMPORTANT: this bundle carries its own copy of the routing modules, so it
 * must register through the MAIN bundle's registry (window.spytialcore) —
 * registering into its own copy would be invisible to the components.
 */
import { AvoidLib } from 'libavoid-js';
import { LibavoidRouter } from '../translators/webcola/routing/libavoid-router';

declare global {
  interface Window {
    SPYTIAL_LIBAVOID_WASM_URL?: string;
    spytialcore?: any;
    spytialLibavoidReady?: Promise<void>;
  }
}

/** The main bundle sets window.spytialcore asynchronously — wait for it. */
async function waitForCore(timeoutMs = 10000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const core = window.spytialcore;
    if (core?.registerRoutingMode) return core;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    '[spytial] window.spytialcore.registerRoutingMode not found — load ' +
    'spytial-core-complete.global.js before the libavoid router bundle.'
  );
}

async function register(): Promise<void> {
  await AvoidLib.load(window.SPYTIAL_LIBAVOID_WASM_URL);
  const core = await waitForCore();
  core.registerRoutingMode({
    id: 'libavoid',
    label: 'Orthogonal (libavoid)',
    pipeline: 'standard',
    createRouter: () => new LibavoidRouter(),
  });
  core.registerRoutingMode({
    id: 'grid',
    label: 'Grid (libavoid)',
    pipeline: 'standard',
    createRouter: () => new LibavoidRouter(),
  });
}

window.spytialLibavoidReady = register().catch((e) => {
  console.error('[spytial] libavoid routing failed to initialize:', e);
});
