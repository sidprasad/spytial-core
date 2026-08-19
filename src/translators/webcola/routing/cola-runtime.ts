/**
 * Access to the vendored WebCola runtime.
 *
 * WebCola arrives as a global from `vendor/cola.js`, which may load AFTER this
 * module is evaluated. Both accessors therefore read `window.cola` at CALL
 * time — a module-level snapshot taken at import would pin `undefined` forever
 * for anyone who loads the script late.
 */

type ColaRuntime = NonNullable<typeof window.cola>;

/** The WebCola runtime, or undefined if the script has not loaded yet. */
export function getCola(): ColaRuntime | undefined {
  return typeof window !== 'undefined' ? window.cola : undefined;
}

/**
 * The WebCola runtime, asserted present.
 *
 * Code that only runs inside a live render (routing, bounds) necessarily has
 * the library loaded — `renderLayout` throws long before those paths are
 * reached otherwise. This keeps that invariant in one place instead of a null
 * check per use.
 */
export function requireCola(): ColaRuntime {
  const cola = getCola();
  if (!cola) {
    throw new Error('WebCola library not available. Please ensure vendor/cola.js is loaded.');
  }
  return cola;
}
