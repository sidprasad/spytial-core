// Type declarations for the vendored WebCola runtime (cola.js).
// Loose by design: index.ts only does `import('./vendor/cola.js')` to stash the
// module on `window.cola` for WebCola's d3adaptor. Must be a real ES module
// (not a nested `declare module`) so `import('./vendor/cola.js')` type-resolves.
declare const cola: any;
export default cola;
