import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceLayout, LayoutNode } from '../src/layout/interfaces';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { requireCola } from '../src/translators/webcola/routing/cola-runtime';
import * as scheduling from '../src/translators/webcola/cooperative-layout';

// Only DOM geometry is stubbed; translation, solving, scheduling and end handlers
// are real. Force an iteration per task so lifecycle interleavings are reliable.
const originalRun = scheduling.runLayoutSteps;
const measurements: [object, string, PropertyDescriptor][] = [
  [SVGElement.prototype, 'getBBox', { value: function(this: SVGElement) {
    return { x: 0, y: 0, width: (this.textContent?.length ?? 0) * 9, height: 12 };
  } }],
  [SVGElement.prototype, 'getTotalLength', { value: () => 100 }],
  [SVGElement.prototype, 'getPointAtLength', { value: (x: number) => ({ x, y: 0 }) }],
  [SVGSVGElement.prototype, 'width', { get: () => ({ baseVal: { value: 800 } }) }],
  [SVGSVGElement.prototype, 'height', { get: () => ({ baseVal: { value: 600 } }) }],
];
const originals = measurements.map(([object, key]) => Object.getOwnPropertyDescriptor(object, key));
const graphs: WebColaCnDGraph[] = [];

beforeAll(() => measurements.forEach(([object, key, descriptor]) =>
  Object.defineProperty(object, key, { ...descriptor, configurable: true })));
beforeEach(() => {
  vi.stubGlobal('MessageChannel', undefined);
  vi.spyOn(scheduling, 'runLayoutSteps').mockImplementation((steps, signal) =>
    originalRun(steps, signal, { budgetMs: 0 }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (text: string) => ({ width: text.length * 9 }),
  }) as any);
});
afterEach(async () => {
  for (const graph of graphs.splice(0)) { graph.dispose(); graph.remove(); }
  await Promise.resolve(); // disconnect cleanup must finish before DOM mocks reset
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => measurements.forEach(([object, key], i) => {
  if (originals[i]) Object.defineProperty(object, key, originals[i]!);
  else Reflect.deleteProperty(object, key);
}));

function graph(): WebColaCnDGraph {
  const element = new WebColaCnDGraph();
  document.body.appendChild(element);
  graphs.push(element);
  return element;
}
function scene(prefix: string): InstanceLayout {
  const nodes: LayoutNode[] = [0, 1].map(i => ({
    id: `${prefix}${i}`, label: `${prefix}${i}`, color: '#000', mostSpecificType: 'Node',
    showLabels: true, width: 80, height: 50,
  }));
  return { nodes, groups: [],
    edges: [{ id: `${prefix}-next`, source: nodes[0], target: nodes[1], label: 'next', relationName: 'next', color: '#000' }],
    constraints: [{ sourceConstraint: {} as any, left: nodes[0], right: nodes[1], minDistance: 40 }],
  };
}

/** Resolve a host task scheduled by the first actual solver iteration. */
function afterFirstIteration(): Promise<void> {
  const prototype = requireCola().Descent.prototype;
  const run = prototype.rungeKutta;
  let notified = false;
  return new Promise(resolve => {
    vi.spyOn(prototype, 'rungeKutta').mockImplementation(function(this: typeof prototype) {
      const result = run.call(this);
      if (!notified) { notified = true; setTimeout(resolve, 0); }
      return result;
    });
  });
}

describe('cooperative initial rendering', () => {
  it('processes host work during a hidden solve and completes with constraints enforced', async () => {
    const element = graph();
    element.style.display = 'none';
    const completed = vi.fn(), errors = vi.fn();
    element.addEventListener('layout-complete', completed);
    element.addEventListener('layout-error', errors);
    const hostTask = afterFirstIteration();
    const pending = element.renderLayout(scene('a'), { transitionMode: 'replace' });
    await hostTask;
    expect(completed).not.toHaveBeenCalled();
    expect(element.shadowRoot!.querySelector('#graph-shell')!.getAttribute('aria-busy')).toBe('true');
    expect(element.shadowRoot!.querySelector('#svg-container')!.hasAttribute('inert')).toBe(true);
    await pending;
    expect(completed).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
    const [left, right] = element.getNodePositions();
    expect(right.x - left.x).toBeGreaterThanOrEqual(80 + 40);
    expect(element.shadowRoot!.querySelector('#svg-container')!.hasAttribute('inert')).toBe(false);
  });

  it('lets a newer render cancel an active solve without stale completion or UI cleanup', async () => {
    const element = graph();
    const completed = vi.fn(), errors = vi.fn();
    element.addEventListener('layout-complete', completed);
    element.addEventListener('layout-error', errors);
    const hostTask = afterFirstIteration();
    const old = element.renderLayout(scene('old'), { transitionMode: 'replace' });
    await hostTask;
    const current = element.renderLayout(scene('new'), { transitionMode: 'replace' });
    await old;
    expect(completed).not.toHaveBeenCalled();
    expect(element.shadowRoot!.querySelector('#graph-shell')!.getAttribute('aria-busy')).toBe('true');
    await current;
    expect(completed).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
    expect(element.getNodePositions().map(n => n.id)).toEqual(['new0', 'new1']);
    expect(element.shadowRoot!.querySelector('#graph-shell')!.hasAttribute('aria-busy')).toBe(false);
  });

  it.each(['clear', 'dispose'] as const)('%s cancels solver work without a later paint', async action => {
    const element = graph();
    const completed = vi.fn();
    element.addEventListener('layout-complete', completed);
    const hostTask = afterFirstIteration();
    const pending = element.renderLayout(scene('old'), { transitionMode: 'replace' });
    await hostTask;
    element[action]();
    await pending;
    expect(completed).not.toHaveBeenCalled();
    expect(element.getNodePositions()).toEqual([]);
    expect(element.shadowRoot!.querySelectorAll('.node')).toHaveLength(0);
    expect(element.shadowRoot!.querySelector('#graph-shell')!.hasAttribute('aria-busy')).toBe(false);
  });

  it('applies a host routing change after the pending solve has final bounds', async () => {
    const element = graph();
    const route = vi.spyOn(element as any, 'gridify').mockImplementation(() => {});
    const hostTask = afterFirstIteration();
    const pending = element.renderLayout(scene('a'), { transitionMode: 'replace' });
    await hostTask;
    element.setRoutingMode('grid');
    expect(route).not.toHaveBeenCalled();
    await pending;
    expect(route).toHaveBeenCalledOnce();
    expect(element.getAttribute('layoutFormat')).toBe('grid');
  });

  it('restores interaction and reports a genuine asynchronous solver failure', async () => {
    const element = graph();
    const errors = vi.fn();
    element.addEventListener('layout-error', errors);
    vi.spyOn(requireCola().Layout.prototype as any, 'startSteps').mockImplementation(function*() {
      yield;
      throw new Error('solver failed');
    });
    await element.renderLayout(scene('bad'), { transitionMode: 'replace' });
    expect(errors).toHaveBeenCalledOnce();
    expect(element.shadowRoot!.querySelector('#graph-shell')!.hasAttribute('aria-busy')).toBe(false);
    expect(element.shadowRoot!.querySelector('#svg-container')!.hasAttribute('inert')).toBe(false);
  });
});
