/**
 * CDN/script-tag entry for libavoid routing. Load AFTER the main bundle:
 *
 *   <script src="spytial-core-complete.global.js"></script>
 *   <script src="spytial-core-router-libavoid.global.js"></script>
 *
 * libavoid.wasm must be served next to this script (the loader fetches it
 * relative to the script URL), or set window.SPYTIAL_LIBAVOID_WASM_URL first.
 *
 * This bundle carries its own copy of the routing modules, but the mode
 * registry lives on globalThis (see routing/registry.ts), so registering
 * through the bundled copy reaches the same registry the renderer reads.
 */
import { registerLibavoidRouting } from '../translators/webcola/routing/libavoid-router';

declare global {
  interface Window {
    SPYTIAL_LIBAVOID_WASM_URL?: string;
    spytialLibavoidReady?: Promise<void>;
  }
}

window.spytialLibavoidReady = registerLibavoidRouting({
  wasmUrl: window.SPYTIAL_LIBAVOID_WASM_URL,
}).catch((e) => {
  console.error('[spytial] libavoid routing failed to initialize:', e);
});
