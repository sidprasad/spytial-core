import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeRenderedEdgeLabels } from '../src/translators/webcola/edge-label-observer';
import { labelOverlap } from '../src/translators/webcola/routing/edge-label-placement';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const ns = 'http://www.w3.org/2000/svg';
const fontDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let observers: Array<{ callback: ResizeObserverCallback; targets: Element[]; disconnect: ReturnType<typeof vi.fn> }>;
let fonts: EventTarget & { status: string; ready: Promise<void> };
let fontReady: () => void;

beforeEach(() => {
  frames = new Map(); nextFrame = 0; observers = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  vi.stubGlobal('ResizeObserver', class {
    targets: Element[] = [];
    disconnect = vi.fn();
    constructor(public callback: ResizeObserverCallback) { observers.push(this); }
    observe(element: Element) { this.targets.push(element); }
  });
  fonts = Object.assign(new EventTarget(), { status: 'loading', ready: new Promise<void>(resolve => { fontReady = resolve; }) });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
});

afterEach(() => {
  document.body.replaceChildren();
  if (fontDescriptor) Object.defineProperty(document, 'fonts', fontDescriptor);
  else Reflect.deleteProperty(document, 'fonts');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function flushFrame() {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(0));
}

function fixture(attached = true) {
  const svg = document.createElementNS(ns, 'svg');
  const container = document.createElementNS(ns, 'g');
  svg.append(container);
  if (attached) document.body.append(svg);
  let visible = true, width = 20, measurable = true;
  svg.getClientRects = () => (visible ? [{ width: 800, height: 600 }] : []) as unknown as DOMRectList;
  container.innerHTML = '<g class="link-group"><path data-link-id="e"/><text class="linklabel" x="50" y="0">label</text></g><rect class="node"/>';
  const path = container.querySelector('path')!;
  path.getTotalLength = () => 100;
  path.getPointAtLength = distance => ({ x: distance, y: 0 }) as DOMPoint;
  const text = container.querySelector('text')!;
  text.getBBox = () => ({ x: Number(text.getAttribute('x')) - width / 2,
    y: Number(text.getAttribute('y')) - 6, width: measurable ? width : 0, height: 12 }) as DOMRect;
  const node = container.querySelector('rect')!;
  const obstacle = { x: 70, y: -10, width: 30, height: 20 };
  node.getBBox = () => obstacle as DOMRect;
  const notifyResize = () => observers[observers.length - 1].callback([], {} as ResizeObserver);
  return { svg, container, text, node, obstacle, notifyResize,
    hide: () => { visible = false; }, show: () => { visible = true; },
    widerFont: () => { width = 80; },
    measurable: (value: boolean) => { measurable = value; } };
}

describe('late edge-label geometry', () => {
  it('remeasures when a pending font settles, without moving nodes or routes', async () => {
    const f = fixture();
    const onPlacement = vi.fn();
    const stop = observeRenderedEdgeLabels(f.container, onPlacement);
    expect(Number(f.text.getAttribute('x'))).toBe(50);
    const pathBefore = f.container.querySelector('path')!.outerHTML;
    const nodeBefore = f.node.outerHTML;
    f.widerFont();
    expect(labelOverlap(f.text.getBBox(), f.obstacle)).toBeGreaterThan(0);
    fontReady(); await Promise.resolve(); flushFrame();
    expect(labelOverlap(f.text.getBBox(), f.obstacle)).toBe(0);
    expect(f.container.querySelector('path')!.outerHTML).toBe(pathBefore);
    expect(f.node.outerHTML).toBe(nodeBefore);
    expect(onPlacement).toHaveBeenCalledOnce();
    stop();
  });

  it('handles fonts discovered after ready and coalesces size/font events', () => {
    fonts.status = 'loaded';
    const f = fixture();
    const onPlacement = vi.fn();
    const stop = observeRenderedEdgeLabels(f.container, onPlacement);
    f.widerFont();
    fonts.dispatchEvent(new Event('loadingdone'));
    fonts.dispatchEvent(new Event('loadingerror'));
    f.notifyResize();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(labelOverlap(f.text.getBBox(), f.obstacle)).toBe(0);
    expect(onPlacement).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    stop();
  });

  it.each(['hidden', 'detached', 'no text geometry'] as const)('recovers from %s without polling', state => {
    const f = fixture(state !== 'detached');
    f.widerFont();
    if (state === 'hidden') f.hide();
    if (state === 'no text geometry') f.measurable(false);
    const stop = observeRenderedEdgeLabels(f.container, vi.fn());
    expect(f.text.getAttribute('x')).toBe('50');
    expect(f.text.getAttribute('y')).toBe('0');
    f.notifyResize(); flushFrame();
    expect(frames.size).toBe(0);
    document.body.append(f.svg); f.show(); f.measurable(true);
    f.notifyResize(); flushFrame();
    expect(labelOverlap(f.text.getBBox(), f.obstacle)).toBe(0);
    expect(observers[0].targets).toContain(f.text);
    expect(observers[0].targets).toContain(f.svg);
    stop();
  });

  it('cancels queued refreshes, font promises, and subscriptions on cleanup', async () => {
    const f = fixture();
    const onPlacement = vi.fn();
    const stop = observeRenderedEdgeLabels(f.container, onPlacement);
    f.widerFont(); f.notifyResize();
    stop();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    fontReady(); await Promise.resolve();
    fonts.dispatchEvent(new Event('loadingdone'));
    f.notifyResize(); flushFrame(); // an already-delivered observer callback is harmless too
    expect(onPlacement).not.toHaveBeenCalled();
    expect(f.text.getAttribute('x')).toBe('50');
  });

  it('handles visibility:hidden becoming visible even when no size changes', async () => {
    const f = fixture();
    f.widerFont();
    f.svg.style.visibility = 'hidden';
    const stop = observeRenderedEdgeLabels(f.container, vi.fn());
    expect(f.text.getAttribute('x')).toBe('50');
    f.svg.style.visibility = 'visible';
    await Promise.resolve(); flushFrame();
    expect(labelOverlap(f.text.getBBox(), f.obstacle)).toBe(0);
    stop();
  });

  it('disconnects old observers when a renderer reroutes, clears, or disposes', () => {
    const graph = new WebColaCnDGraph() as any;
    document.body.append(graph);
    const f = fixture();
    // Use real component methods with a rendered test container.
    graph.container = graph.container.select(function () { return f.container; });
    graph.updateLinkLabelsAfterRouting();
    graph.updateLinkLabelsAfterRouting();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    graph.clear();
    expect(observers[1].disconnect).toHaveBeenCalledOnce();
    // A fresh rendered graph can install a new watcher after clear.
    f.container.innerHTML = '<g class="link-group"><text class="linklabel">new</text></g>';
    graph.updateLinkLabelsAfterRouting();
    graph.dispose();
    expect(observers[2].disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });
});
