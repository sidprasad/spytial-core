import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * registerLibavoidRouting's load/registration bookkeeping, with libavoid-js
 * mocked (no WASM in tests). Each test re-imports the module fresh so the
 * module-scoped loadPromise starts clean; the registry store lives on
 * globalThis, so 'libavoid'/'grid' entries are restored afterEach.
 */

const REGISTRY_KEY = Symbol.for('spytial-core.routing-modes');
const store = (): Map<string, any> | undefined => (globalThis as any)[REGISTRY_KEY];

let loadMock: ReturnType<typeof vi.fn>;

async function freshRouterModule() {
  vi.resetModules();
  loadMock = vi.fn(async (_wasmUrl?: string) => {});
  vi.doMock('libavoid-js', () => ({
    AvoidLib: { load: loadMock, getInstance: vi.fn() },
  }));
  return import('../src/translators/webcola/routing/libavoid-router');
}

let savedGrid: any;
beforeEach(() => {
  savedGrid = store()?.get('grid');
});
afterEach(() => {
  vi.doUnmock('libavoid-js');
  vi.restoreAllMocks();
  const s = store();
  if (s) {
    s.delete('libavoid');
    if (savedGrid !== undefined) s.set('grid', savedGrid);
    else s.delete('grid');
  }
});

describe('registerLibavoidRouting', () => {
  it('passes wasmUrl to the loader and registers the mode only after load resolves', async () => {
    const mod = await freshRouterModule();
    const p = mod.registerLibavoidRouting({ wasmUrl: 'custom.wasm', takeOverGrid: false });
    expect(store()?.get('libavoid')).toBeUndefined();
    await p;
    expect(loadMock).toHaveBeenCalledExactlyOnceWith('custom.wasm');
    expect(store()?.get('libavoid')?.label).toBe('Orthogonal (libavoid)');
    // takeOverGrid: false left 'grid' untouched.
    expect(store()?.get('grid')).toBe(savedGrid);
  });

  it('takes over grid by default', async () => {
    const mod = await freshRouterModule();
    await mod.registerLibavoidRouting();
    expect(store()?.get('grid')?.label).toBe('Grid (libavoid)');
    expect(store()?.get('grid')?.pipeline).toBe('standard');
  });

  it('dedupes later calls onto the first load and warns when their options are ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await freshRouterModule();
    const p1 = mod.registerLibavoidRouting({ takeOverGrid: false });
    const p2 = mod.registerLibavoidRouting({ wasmUrl: 'too-late.wasm' });
    const p3 = mod.registerLibavoidRouting();
    expect(p2).toBe(p1);
    expect(p3).toBe(p1);
    await p1;
    expect(loadMock).toHaveBeenCalledTimes(1);
    // Only the options-carrying late call warns; the bare one is silent.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('options are ignored');
  });

  it('does not cache a failed load: a later call retries with its own options', async () => {
    const mod = await freshRouterModule();
    loadMock.mockRejectedValueOnce(new Error('404 on libavoid.wasm'));
    await expect(mod.registerLibavoidRouting()).rejects.toThrow('404');
    expect(store()?.get('libavoid')).toBeUndefined();

    await mod.registerLibavoidRouting({ wasmUrl: 'served-elsewhere.wasm', takeOverGrid: false });
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(loadMock).toHaveBeenLastCalledWith('served-elsewhere.wasm');
    expect(store()?.get('libavoid')).toBeDefined();
  });
});

describe('spytial-core/routers/libavoid entry', () => {
  it('defers auto-init so a synchronous options call after import wins', async () => {
    vi.resetModules();
    loadMock = vi.fn(async (_wasmUrl?: string) => {});
    vi.doMock('libavoid-js', () => ({
      AvoidLib: { load: loadMock, getInstance: vi.fn() },
    }));
    const entry = await import('../src/routers/libavoid');
    // Synchronous call right after import — must beat the deferred auto-init.
    entry.registerLibavoidRouting({ wasmUrl: 'bundler-asset.wasm', takeOverGrid: false });
    await entry.libavoidReady;
    expect(loadMock).toHaveBeenCalledExactlyOnceWith('bundler-asset.wasm');
  });

  it('auto-inits with defaults when nothing else calls first', async () => {
    vi.resetModules();
    loadMock = vi.fn(async (_wasmUrl?: string) => {});
    vi.doMock('libavoid-js', () => ({
      AvoidLib: { load: loadMock, getInstance: vi.fn() },
    }));
    const entry = await import('../src/routers/libavoid');
    await entry.libavoidReady;
    expect(loadMock).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(store()?.get('libavoid')).toBeDefined();
  });
});
