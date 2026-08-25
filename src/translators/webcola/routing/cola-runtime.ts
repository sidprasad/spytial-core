/**
 * Access to the vendored WebCola runtime.
 *
 * This used to read `window.cola` at CALL time, because the runtime arrived as
 * a page global that index.ts installed asynchronously and could land after
 * this module was evaluated. That is the same race #574 fixed for d3, so the
 * runtime is imported here instead and the accessors are plain lookups.
 *
 * Reading the global would now be actively wrong: index.ts no longer overwrites
 * a host page's `window.cola`, so a host that has its own WebCola would
 * otherwise have it picked up in place of the build this code is written
 * against.
 *
 * Bundlers disagree on what a UMD file becomes — esbuild hands back a namespace
 * carrying the named exports and NO `default`, while a plain CJS interop puts
 * everything under `default`. Take whichever arrived.
 */
import * as colaVendorModule from '../../../vendor/cola.js';
import type * as WebCola from 'webcola';

type ColaRuntime = typeof WebCola;

const colaVendor = ((colaVendorModule as { default?: unknown }).default
  ?? colaVendorModule) as unknown as ColaRuntime;

/** The WebCola runtime. */
export function getCola(): ColaRuntime | undefined {
  return colaVendor;
}

/**
 * The WebCola runtime, asserted present.
 *
 * It always is, now that the module imports it. Kept as the single place that
 * states the invariant, instead of a null check per use site.
 */
export function requireCola(): ColaRuntime {
  const cola = getCola();
  if (!cola) {
    throw new Error('WebCola library not available. Please ensure vendor/cola.js is loaded.');
  }
  return cola;
}
