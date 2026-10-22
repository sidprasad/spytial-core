// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutDecaySteps, runLayoutSteps, type SteppableLayout } from '../src/translators/webcola/cooperative-layout';
import { requireCola } from '../src/translators/webcola/routing/cola-runtime';

afterEach(() => vi.unstubAllGlobals());

describe('cooperative layout scheduling', () => {
  it('lets a host task run between iterations, in order, without animation frames', async () => {
    const events: string[] = [];
    vi.stubGlobal('requestAnimationFrame', () => { throw new Error('animation frames suspended'); });
    function* steps() {
      for (let i = 0; i < 4; i++) { events.push(`step ${i}`); yield; }
    }
    await runLayoutSteps(steps(), new AbortController().signal, {
      budgetMs: 0,
      yieldToHost: async () => { events.push('host input'); },
    });
    expect(events).toEqual(['host input', 'step 0', 'host input', 'step 1', 'host input',
      'step 2', 'host input', 'step 3', 'host input']);
  });

  it('cancels a waiting host task, closes its ports, and releases the solver iterator', async () => {
    const close1 = vi.fn(), close2 = vi.fn(), posted = vi.fn(), released = vi.fn();
    const ports: { onmessage: null | (() => void) }[] = [];
    vi.stubGlobal('MessageChannel', class {
      port1 = { close: close1, onmessage: null };
      port2 = { close: close2, postMessage: posted };
      constructor() { ports.push(this.port1); }
    });
    const controller = new AbortController();
    function* steps() { try { yield; throw new Error('cancelled work resumed'); } finally { released(); } }
    const pending = runLayoutSteps(steps(), controller.signal, { budgetMs: 0 });
    expect(posted).toHaveBeenCalledOnce();
    ports[0].onmessage!();
    await Promise.resolve();
    expect(posted).toHaveBeenCalledTimes(2);
    controller.abort();
    expect(await pending).toBe(false);
    expect(close1).toHaveBeenCalledTimes(2);
    expect(close2).toHaveBeenCalledTimes(2);
    expect(released).toHaveBeenCalledOnce();
  });

  it('makes progress through the timer fallback when MessageChannel and rAF are unavailable', async () => {
    vi.stubGlobal('MessageChannel', undefined);
    vi.stubGlobal('requestAnimationFrame', undefined);
    const iteration = vi.fn();
    function* steps() { for (let i = 0; i < 3; i++) { iteration(); yield; } }
    expect(await runLayoutSteps(steps(), new AbortController().signal, { budgetMs: 0 })).toBe(true);
    expect(iteration).toHaveBeenCalledTimes(3);
  });

  it('does not force an end or run another decay tick after cancellation', async () => {
    const controller = new AbortController();
    const tick = vi.fn(() => false), stop = vi.fn();
    let yields = 0;
    const layout = { tick, stop } as unknown as SteppableLayout;
    expect(await runLayoutSteps(layoutDecaySteps(layout, 500), controller.signal, {
      budgetMs: 0, yieldToHost: async () => { if (++yields === 2) controller.abort(); },
    })).toBe(false);
    expect(tick).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });

  it('retains the existing cap and forced end tick on a nonconverging solve', async () => {
    let stopped = false;
    const tick = vi.fn(() => stopped), stop = vi.fn(() => { stopped = true; });
    const layout = { tick, stop } as unknown as SteppableLayout;
    expect(await runLayoutSteps(layoutDecaySteps(layout, 5), new AbortController().signal)).toBe(true);
    expect(tick).toHaveBeenCalledTimes(6);
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe('vendored start phases', () => {
  function makeLayout(grouped: boolean): SteppableLayout {
    const nodes = Array.from({ length: 6 }, (_, i) => ({
      x: 200 + i * 80, y: 200 + i % 2 * 90, width: 60 + i, height: 40,
    }));
    const layout = new (requireCola().Layout)().nodes(nodes)
      .links(nodes.slice(1).map((_, i) => ({ source: i, target: i + 1 })))
      .constraints([{ axis: 'x', left: 0, right: 5, gap: 120 }])
      .avoidOverlaps(true).size([800, 600]).linkDistance(100);
    if (grouped) layout.groups([
      { leaves: [0, 1], padding: 10 }, { leaves: [2, 3], padding: 10 },
      { groups: [0, 1], padding: 10 },
    ]);
    return layout as unknown as SteppableLayout;
  }

  it.each([false, true])('keeps synchronous and yielded geometry identical (groups: %s)', async grouped => {
    const synchronous = makeLayout(grouped), cooperative = makeLayout(grouped);
    synchronous.start(10, 20, 30, 0, false);
    let yields = 0;
    await runLayoutSteps(cooperative.startSteps(10, 20, 30, 0, false), new AbortController().signal, {
      budgetMs: 0, yieldToHost: async () => { yields++; },
    });
    expect(yields).toBeGreaterThan(10);
    expect(cooperative.nodes().map(n => [n.x, n.y])).toEqual(synchronous.nodes().map(n => [n.x, n.y]));
    expect(cooperative.groups().map(g => g.bounds)).toEqual(synchronous.groups().map(g => g.bounds));
    expect(cooperative.nodes()[5].x! - cooperative.nodes()[0].x!).toBeGreaterThanOrEqual(120 - 1e-5);
  });
});
