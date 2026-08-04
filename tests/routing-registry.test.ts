import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRoutingMode,
  listRoutingModes,
  registerRoutingMode,
  TautRouter,
  type EdgeRouter,
  type RouterHost,
} from '../src/translators/webcola/routing';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const REGISTRY_KEY = Symbol.for('spytial-core.routing-modes');
const store = (): Map<string, unknown> => (globalThis as any)[REGISTRY_KEY];

/** Ids registered by a test, removed again afterEach so tests stay isolated. */
const testModeIds: string[] = [];
function registerTestMode(id: string, def: Partial<Parameters<typeof registerRoutingMode>[0]> = {}) {
  testModeIds.push(id);
  registerRoutingMode({ id, label: id, pipeline: 'standard', ...def });
}

afterEach(() => {
  for (const id of testModeIds.splice(0)) store().delete(id);
  vi.restoreAllMocks();
});

describe('routing mode registry', () => {
  it('registers the built-ins on import', () => {
    expect(getRoutingMode('taut')?.pipeline).toBe('standard');
    expect(getRoutingMode('grid')?.pipeline).toBe('grid');
  });

  it('backs the registry with a globalThis store so bundle copies share it', () => {
    expect(store()).toBeInstanceOf(Map);
    // The exported functions read the same Map: a direct store write is
    // visible through the API, as it would be from another bundle copy.
    expect(store().get('taut')).toBe(getRoutingMode('taut'));
  });

  it('lists modes in registration order and keeps order on replace', () => {
    registerTestMode('zz-a');
    registerTestMode('zz-b');
    const before = listRoutingModes().map(m => m.id);
    expect(before.slice(-2)).toEqual(['zz-a', 'zz-b']);

    // Replace-in-place: same slot, new definition.
    registerRoutingMode({ id: 'zz-a', label: 'upgraded', pipeline: 'standard' });
    const after = listRoutingModes().map(m => m.id);
    expect(after).toEqual(before);
    expect(getRoutingMode('zz-a')?.label).toBe('upgraded');
  });
});

describe('routingMode fallback (component)', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function makeElement(layoutFormat: string | null) {
    const el: any = Object.create(proto);
    el.getAttribute = (name: string) => (name === 'layoutFormat' ? layoutFormat : null);
    el.warnedRoutingModeFallbacks = new Set<string>();
    return el;
  }

  it('resolves unset and "default" to taut without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(makeElement(null).routingMode).toBe('taut');
    expect(makeElement('default').routingMode).toBe('taut');
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves a registered mode to itself', () => {
    registerTestMode('test-registered');
    expect(makeElement('test-registered').routingMode).toBe('test-registered');
  });

  it('warns once per format: legacy gets the removal message, unknown the fallback message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeElement('legacy');
    expect(el.routingMode).toBe('taut');
    expect(el.routingMode).toBe('taut');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('has been removed');

    // A DIFFERENT bad format on the same element still warns (per-format guard).
    el.getAttribute = () => 'no-such-mode';
    expect(el.routingMode).toBe('taut');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain('no such routing mode');
  });
});

describe('edgeRouter upgrade-in-place (component)', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function makeElement(layoutFormat: string) {
    const el: any = Object.create(proto);
    el.getAttribute = (name: string) => (name === 'layoutFormat' ? layoutFormat : null);
    el.warnedRoutingModeFallbacks = new Set<string>();
    el.activeRouter = null;
    el.activeRouterDef = null;
    return el;
  }

  it('serves the replacing router after a mode is re-registered', () => {
    const routerA = { routeEdge: () => [] } as EdgeRouter;
    const routerB = { routeEdge: () => [] } as EdgeRouter;
    registerTestMode('test-upgrade', { createRouter: () => routerA });

    const el = makeElement('test-upgrade');
    expect(el.edgeRouter).toBe(routerA);
    // Unchanged definition: the instance is cached, not rebuilt.
    expect(el.edgeRouter).toBe(routerA);

    registerRoutingMode({
      id: 'test-upgrade', label: 'v2', pipeline: 'standard', createRouter: () => routerB,
    });
    expect(el.edgeRouter).toBe(routerB);
  });

  it('falls back to a TautRouter when the mode has no factory', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = makeElement('unregistered-mode');
    expect(el.edgeRouter).toBeInstanceOf(TautRouter);
  });
});

describe('isRouterEdge (component)', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function classify(edge: any): boolean {
    const fakeThis = {
      isAlignmentEdge: proto.isAlignmentEdge,
      edgeRoutingCache: { alignmentEdges: new Set<string>() },
    };
    return proto.isRouterEdge.call(fakeThis, edge);
  }

  it('owns plain node-to-node edges and nothing else', () => {
    expect(classify({ id: 'e1', source: { id: 'a' }, target: { id: 'b' } })).toBe(true);
    // The component's special cases: alignment, self-loop, group-attached.
    expect(classify({ id: '_alignment_1', source: { id: 'a' }, target: { id: 'b' } })).toBe(false);
    expect(classify({ id: 'loop', source: { id: 'a' }, target: { id: 'a' } })).toBe(false);
    expect(classify({ id: '_g_conn', source: { id: 'a' }, target: { id: 'b' } })).toBe(false);
    expect(classify({ id: 'e2', source: { id: 'a' }, target: { id: 'b' }, sourceGroupId: 'g1' })).toBe(false);
    expect(classify({ id: 'e3', source: { id: 'a' }, target: { id: 'b' }, targetGroupId: 'g1' })).toBe(false);
  });
});

describe('routing dropdown (component)', () => {
  const proto = WebColaCnDGraph.prototype as any;

  function makeElement(layoutFormat: string) {
    const root = document.createElement('div');
    root.innerHTML = '<select id="routing-mode"></select>';
    const el: any = Object.create(proto);
    Object.defineProperty(el, 'root', { value: root });   // real component: a ShadowRoot getter
    el.getAttribute = (name: string) => (name === 'layoutFormat' ? layoutFormat : null);
    el.warnedRoutingModeFallbacks = new Set<string>();
    return { el, select: root.querySelector('select') as HTMLSelectElement };
  }

  it('renders ids and labels as data, never as markup', () => {
    // registerRoutingMode is public API: a consumer picks these strings.
    registerTestMode('zz-evil"><img src=x>', { label: '<img src=x onerror="boom">' });
    const { el, select } = makeElement('taut');
    el.updateRoutingModeDropdown();

    const injected = select.querySelector('img');
    expect(injected).toBeNull();
    const option = [...select.options].find(o => o.textContent!.includes('<img'))!;
    expect(option.value).toBe('zz-evil"><img src=x>');
    expect(option.textContent).toBe('<img src=x onerror="boom">');
    expect(select.value).toBe('taut');
  });

  it('picks up a mode registered after the dropdown was built', () => {
    const { el, select } = makeElement('taut');
    el.updateRoutingModeDropdown();
    const before = select.options.length;

    registerTestMode('zz-late', { label: 'Late Router' });
    el.updateRoutingModeDropdown();
    expect(select.options.length).toBe(before + 1);
    expect([...select.options].at(-1)!.textContent).toBe('Late Router');
  });

  it('refreshes the label of a replaced mode', () => {
    // What the libavoid entry does to 'grid' when it takes it over.
    const builtinGrid = getRoutingMode('grid')!;
    try {
      const { el, select } = makeElement('taut');
      el.updateRoutingModeDropdown();
      registerRoutingMode({ id: 'grid', label: 'Grid (libavoid)', pipeline: 'standard' });
      el.updateRoutingModeDropdown();
      expect([...select.options].find(o => o.value === 'grid')!.textContent).toBe('Grid (libavoid)');
    } finally {
      registerRoutingMode(builtinGrid);
    }
  });
});

describe('route pass lifecycle (component)', () => {
  const proto = WebColaCnDGraph.prototype as any;

  it('hands beginPass an empty route set, not the previous pass"s routes', () => {
    let seenDuringBeginPass: Map<string, unknown> | null = null;
    const el: any = Object.create(proto);
    Object.defineProperty(el, 'edgeRouter', {
      value: { beginPass: (host: RouterHost) => { seenDuringBeginPass = new Map(host.routes); } },
    });
    // A stale route left over from the pass before.
    el.computedRoutes = new Map([['old-edge', [{ x: 0, y: 0 }]]]);
    el.currentLayout = { links: [] };
    el.routerObstacleCache = null;
    const failures: string[] = [];
    el.showError = (m: string) => failures.push(m);
    for (const stub of [
      'ensureNodeBounds', 'buildRouterObstacleCache', 'buildEdgeRoutingCaches',
      'sortEdgePortsByAngle', 'computeAllRoutes', 'applyRoutesToSVG',
      'updateLinkLabelsAfterRouting', 'fitViewportToContent',
    ]) el[stub] = () => {};

    proto.routeEdges.call(el);

    expect(failures).toEqual([]);
    expect(seenDuringBeginPass).not.toBeNull();
    expect(seenDuringBeginPass!.size).toBe(0);
  });
});

describe('corridor separation direction (TautRouter.finalize)', () => {
  function makeHost(routes: Map<string, Array<{ x: number; y: number }>>): RouterHost {
    const edges = [...routes.keys()].map((id, i) => ({
      id, source: { id: `s${i}` }, target: { id: `t${i}` },
    }));
    return {
      portAttachment: () => ({ point: { x: 0, y: 0 }, normal: { x: 1, y: 0 } }),
      obstaclesFor: () => [],
      obstacles: () => [],
      fanParallel: (_e, r) => r,
      routerEdges: () => edges,
      routes,
    };
  }

  it('bows an anti-parallel neighbor AWAY from the other route', () => {
    // A runs left-to-right at y=0 (longer), B runs right-to-left at y=8
    // (shorter, so it is bowed first). B must move to y>8, not toward A.
    const routes = new Map([
      ['a', [{ x: -50, y: 0 }, { x: 250, y: 0 }]],
      ['b', [{ x: 200, y: 8 }, { x: 0, y: 8 }]],
    ]);
    new TautRouter().finalize!(makeHost(routes));
    const bowedB = routes.get('b')!;
    expect(Math.min(...bowedB.map(p => p.y))).toBeGreaterThanOrEqual(8);
    expect(Math.max(...bowedB.map(p => p.y))).toBeGreaterThan(8);
  });

  it('separates exactly collinear routes (shared visibility corridor)', () => {
    // Both routes run the same corridor at y=8 — lateral distance 0, the case
    // findParallelOverlap used to skip. One of them must move off the line.
    const routes = new Map([
      ['a', [{ x: -50, y: 8 }, { x: 250, y: 8 }]],
      ['b', [{ x: 0, y: 8 }, { x: 200, y: 8 }]],
    ]);
    new TautRouter().finalize!(makeHost(routes));
    const ys = [...routes.values()].flat().map(p => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(4);
  });

  it('bows a parallel neighbor away too (control)', () => {
    const routes = new Map([
      ['a', [{ x: -50, y: 0 }, { x: 250, y: 0 }]],
      ['b', [{ x: 0, y: 8 }, { x: 200, y: 8 }]],
    ]);
    new TautRouter().finalize!(makeHost(routes));
    const bowedB = routes.get('b')!;
    expect(Math.min(...bowedB.map(p => p.y))).toBeGreaterThanOrEqual(8);
    expect(Math.max(...bowedB.map(p => p.y))).toBeGreaterThan(8);
  });
});
