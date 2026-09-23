import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { isAutoSizedNode } from '../src/layout/auto-sized-nodes';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

// jsdom lacks SVG/canvas measurements. Everything else is the real component,
// including its vendored D3, solver, DOM listeners, and data instance.
beforeAll(() => {
  customElements.define('structured-input-graph', StructuredInputGraph);
  Object.defineProperty(SVGElement.prototype, 'getTotalLength', { configurable: true, value: () => 100 });
  Object.defineProperty(SVGElement.prototype, 'getPointAtLength', { configurable: true, value: (length: number) => ({ x: length, y: 0 }) });
  Object.defineProperty(SVGSVGElement.prototype, 'width', { configurable: true, get: () => ({ baseVal: { value: 800 } }) });
  Object.defineProperty(SVGSVGElement.prototype, 'height', { configurable: true, get: () => ({ baseVal: { value: 600 } }) });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (text: string) => ({ width: text.length * 9 }),
  }) as any);
});
afterEach(() => {
  document.querySelectorAll('webcola-cnd-graph, structured-input-graph').forEach(graph => {
    (graph as WebColaCnDGraph).dispose();
    graph.remove();
  });
});
function mount<T extends WebColaCnDGraph>(graph: T): T {
  graph.addEventListener('layout-error', event => { throw new Error(JSON.stringify((event as CustomEvent).detail)); });
  document.body.appendChild(graph);
  return graph;
}
const element = (graph: WebColaCnDGraph, id: string) => graph.shadowRoot!.getElementById(id) as HTMLElement;
const visible = (graph: WebColaCnDGraph, id: string) => !element(graph, id).closest('[hidden]');
function mouse(type: string): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10 });
  // Vitest proxies Window; supply D3's event.view after jsdom's constructor check.
  Object.defineProperty(event, 'view', { value: window });
  return event;
}
const key = (target: EventTarget, name: string, modifiers = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...modifiers }));
function data() {
  return new JSONDataInstance({ atoms: [
    { id: 'a', type: 'Node', label: 'Alpha' }, { id: 'b', type: 'Node', label: 'Beta' },
  ], relations: [{ id: 'next', name: 'next', types: ['Node', 'Node'], tuples: [{ atoms: ['a', 'b'], types: ['Node', 'Node'] }] }] });
}
function layout(instance = data(), spec = '') {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return new LayoutInstance(parseLayoutSpec(spec), evaluator).generateLayout(instance).layout;
}

describe('instance-local graph view options', () => {
  it('preserves default controls and constructor editing ownership', async () => {
    const viewer = mount(new WebColaCnDGraph());
    const editor = mount(new StructuredInputGraph(data()));
    await new Promise(requestAnimationFrame);
    for (const id of ['zoom-in', 'zoom-out', 'zoom-fit', 'routing-mode', 'theme-mode', 'screenshot-btn']) {
      expect(visible(viewer, id)).toBe(true);
    }
    expect(editor.shadowRoot!.querySelector('[data-action=add-atom]')).toBeTruthy();
    expect(element(viewer, 'graph-toolbar').hasAttribute('data-presentation')).toBe(false);
    expect(element(editor, 'graph-toolbar').hasAttribute('data-presentation')).toBe(false);
    key(document, 'Control', { ctrlKey: true });
    expect(element(viewer, 'svg').classList.contains('input-mode')).toBe(false);
    expect(element(editor, 'svg').classList.contains('input-mode')).toBe(true);
    await viewer.setViewOptions({ interaction: { structuralEditing: true } });
    key(document, 'Control', { ctrlKey: true });
    expect(element(viewer, 'svg').classList.contains('input-mode')).toBe(false);
  });


  it('preserves the legacy editing viewport and endpoint gesture when no options are set', async () => {
    const graph = mount(new StructuredInputGraph(data()));
    await graph.renderLayout(layout(), { transitionMode: 'replace' });
    const before = graph.getCurrentTransform();
    key(document, 'Control', { ctrlKey: true });
    graph.shadowRoot!.querySelector('.target-marker')!.dispatchEvent(mouse('mousedown'));
    graph.zoomIn();
    await new Promise(resolve => setTimeout(resolve, 250));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
    expect(graph.getCurrentTransform()).toEqual(before);
    expect((graph as any).edgeDragState.isDragging).toBe(true);
    // Now explicitly revoke editing to cancel the pending drag before mouseup.
    await graph.setViewOptions({ interaction: { structuralEditing: false } });
    window.dispatchEvent(mouse('mouseup'));
  });

  it('changes solver locking only for font remeasurement, preserving existing render options', async () => {
    const graph = mount(new WebColaCnDGraph());
    const input = layout();
    const translate = vi.spyOn(WebColaTranslator.prototype, 'translate');
    try {
      await graph.renderLayout(input, { transitionMode: 'replace' });
      await graph.renderLayout(input, { priorPositions: graph.getLayoutState(), lockUnconstrainedNodes: false });
      expect(translate.mock.lastCall![3]!.lockUnconstrainedNodes).toBe(true);
      await graph.setViewOptions({ fontFamily: 'monospace' });
      expect(translate.mock.lastCall![3]!.lockUnconstrainedNodes).toBe(false);
    } finally {
      translate.mockRestore();
    }
  });

  it('supports full, compact, none and overrides without rebuilding or sharing controls', async () => {
    const graph = mount(new WebColaCnDGraph());
    const other = mount(new WebColaCnDGraph());
    const button = element(graph, 'zoom-in');
    const render = vi.spyOn(graph, 'renderLayout');
    await graph.setViewOptions({ toolbar: 'compact' });
    expect(visible(graph, 'zoom-in')).toBe(true);
    expect(visible(graph, 'zoom-fit')).toBe(true);
    expect(visible(graph, 'routing-mode')).toBe(false);
    expect(visible(graph, 'theme-mode')).toBe(false);
    expect(visible(graph, 'screenshot-btn')).toBe(false);
    expect(visible(other, 'routing-mode')).toBe(true);
    await graph.setViewOptions({ toolbar: 'none' });
    expect(element(graph, 'graph-toolbar').hidden).toBe(true);
    await graph.setViewOptions({ controls: { fit: true } });
    expect(element(graph, 'graph-toolbar').hidden).toBe(false);
    expect(visible(graph, 'zoom-fit')).toBe(true);
    expect(visible(graph, 'zoom-in')).toBe(false);
    await graph.setViewOptions({ toolbar: 'full' });
    expect(element(graph, 'zoom-in')).toBe(button);
    expect(render).not.toHaveBeenCalled();
    const snapshot = graph.getViewOptions();
    snapshot.interaction.nodeDrag = false;
    expect(graph.getViewOptions().interaction.nodeDrag).toBe(true);
  });

  it('keeps public actions and theme selection available without controls or gestures', async () => {
    const graph = mount(new WebColaCnDGraph());
    await graph.setViewOptions({ toolbar: 'none', interaction: { panZoom: false } });
    graph.setRoutingMode('grid');
    expect((element(graph, 'routing-mode') as HTMLSelectElement).value).toBe('grid');
    expect(() => graph.setRoutingMode('missing-router')).toThrow('Unknown routing mode');
    graph.setTheme('dark');
    expect((element(graph, 'theme-mode') as HTMLSelectElement).value).toBe('dark');
    const svg = element(graph, 'svg') as any;
    expect(svg.__on?.some((listener: any) => listener.name === 'zoom')).toBeFalsy();
    graph.zoomIn();
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(svg.__zoom.k).toBeCloseTo(1.5);
    graph.zoomOut();
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(svg.__zoom.k).toBeCloseTo(1);
    expect(typeof graph.resetViewToFitContent).toBe('function');
    expect(typeof graph.takeScreenshot).toBe('function');
  });

  it('keeps type badges, attributes, and tags visible in compact mode', async () => {
    const graph = mount(new WebColaCnDGraph());
    const input = layout(data(), 'constraints:\n  - orientation:\n      selector: next\n      directions: [right]\ndirectives:\n  - tag:\n      toTag: Node\n      name: successor\n      value: next');
    input.nodes[0].attributes = { ...input.nodes[0].attributes, description: ['An attribute that stays visible'], detail: ['More detail'], third: ['Third line'] };
    input.nodes[0].width = 260;
    input.nodes[0].height = 110;
    await graph.renderLayout(input, { transitionMode: 'replace' });
    expect(graph.shadowRoot!.querySelectorAll('.mostSpecificTypeLabel')).toHaveLength(2);
    expect(graph.shadowRoot!.textContent).toContain('An attribute that stays visible');
    graph.zoomIn();
    await new Promise(resolve => setTimeout(resolve, 250));
    const transform = graph.getLayoutState().transform;
    await graph.setViewOptions({ toolbar: 'compact' });
    expect(graph.shadowRoot!.querySelectorAll('.mostSpecificTypeLabel')).toHaveLength(2);
    const label = graph.shadowRoot!.querySelector('.label')!;
    expect(label.querySelector('.main-label-tspan')!.textContent).toBe('Alpha');
    expect(label.textContent).toContain('description: An attribute that stays visible');
    expect(label.textContent).toContain('successor:');
    expect(input.nodes[0].attributes.description).toEqual(['An attribute that stays visible']);
    expect(input.nodes[0].width).toBe(260);
    expect(graph.getLayoutState().transform).toEqual(transform);
    const node = (graph.shadowRoot!.querySelector('.node') as any).__data__;
    expect(node.visualWidth).toBe(260);
    expect(node.attributes.description).toEqual(input.nodes[0].attributes.description);
    expect((graph as any).currentLayout.colaConstraints.length).toBeGreaterThan(0);
    await graph.setViewOptions({ fontFamily: 'monospace' });
    expect(graph.shadowRoot!.querySelector('.label')!.getAttribute('font-family')).toBe('monospace');
    expect(graph.shadowRoot!.querySelectorAll('.mostSpecificTypeLabel')).toHaveLength(2);
  });

  it('keeps explicit and host-supplied sizes while remeasuring automatic boxes', async () => {
    const graph = mount(new WebColaCnDGraph());
    const input = layout(data(), 'constraints:\n  - size:\n      selector: a\n      width: 180\n      height: 90');
    expect(isAutoSizedNode(input.nodes.find(n => n.id === 'a')!)).toBe(false);
    expect(isAutoSizedNode(input.nodes.find(n => n.id === 'b')!)).toBe(true);
    expect(Object.keys(input.nodes[1])).not.toContain('autoSize');
    expect(JSON.stringify(input)).not.toContain('autoSize');
    await graph.setViewOptions({ fontFamily: 'monospace' });
    await graph.renderLayout(input, { transitionMode: 'replace' });
    const nodes = [...graph.shadowRoot!.querySelectorAll('.node')].map(n => (n as any).__data__);
    expect(nodes.find(n => n.id === 'a').visualWidth).toBe(180);
    expect(nodes.find(n => n.id === 'a').visualHeight).toBe(90);
  });

  it('enforces exploration across modifiers, delete, context menus, forms and edge requests', async () => {
    const instance = data();
    const graph = mount(new StructuredInputGraph(instance));
    await graph.renderLayout(layout(instance), { transitionMode: 'replace' });
    await new Promise(requestAnimationFrame);
    key(document, 'Control', { ctrlKey: true });
    await graph.setViewOptions({ toolbar: 'compact', interaction: { structuralEditing: false } });
    key(document, 'Control', { ctrlKey: true });
    expect(element(graph, 'svg').classList.contains('input-mode')).toBe(false);
    const node = graph.shadowRoot!.querySelector('.node') as any;
    expect(node.__on.some((listener: any) => listener.name === 'drag')).toBe(true);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    key(graph, 'Delete');
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    expect(graph.shadowRoot!.querySelector('.node-context-menu')).toBeNull();
    (graph.shadowRoot!.querySelector('[data-action=add-atom]') as HTMLButtonElement).click();
    expect(graph.shadowRoot!.querySelector('.si-popover')).toBeNull();
    for (const name of ['edge-creation-requested', 'edge-modification-requested', 'edge-reconnection-requested']) {
      expect(graph.dispatchEvent(new CustomEvent(name, { cancelable: true, detail: {} }))).toBe(false);
    }
    expect(await (graph as any).addAtomFromForm('Node', 'Gamma')).toBeNull();
    await (graph as any).deleteEdge((graph as any).currentLayout.links[0]);
    expect(instance.getAtoms()).toHaveLength(2);
    expect(instance.getRelations()[0].tuples).toHaveLength(1);
    await graph.setViewOptions({ interaction: { nodeDrag: false, panZoom: false } });
    expect(node.__on.some((listener: any) => listener.name === 'drag')).toBe(false);
    await graph.setViewOptions({ interaction: { structuralEditing: true } });
    key(document, 'Control', { ctrlKey: true });
    expect(element(graph, 'svg').classList.contains('input-mode')).toBe(true);
  });


  it('cancels an open edge dialog and an active endpoint gesture when editing is disabled', async () => {
    const graph = mount(new StructuredInputGraph(data()));
    await graph.renderLayout(layout(), { transitionMode: 'replace' });
    key(document, 'Control', { ctrlKey: true });
    const internal = graph as any;
    const edge = internal.currentLayout.links[0];
    graph.shadowRoot!.querySelector('.target-marker')!.dispatchEvent(mouse('mousedown'));
    expect(internal.edgeDragState.isDragging).toBe(true);
    const edit = internal.editEdgeLabel(edge);
    expect(graph.shadowRoot!.querySelector('.modal-overlay')).toBeTruthy();
    await graph.setViewOptions({ interaction: { structuralEditing: false } });
    await edit;
    expect(internal.edgeDragState.isDragging).toBe(false);
    expect(graph.shadowRoot!.querySelector('.modal-overlay')).toBeNull();
    window.dispatchEvent(mouse('mouseup'));
    await internal.endEdgeEndpointDrag(edge, 'target');
    expect(graph.getDataInstance()!.getRelations()[0].tuples).toHaveLength(1);
    expect(edge.label).toBe('next');
  });

  it('applies toolbar and gesture permissions before mounting and across later renders', async () => {
    const graph = new StructuredInputGraph(data());
    await graph.setViewOptions({ toolbar: 'none', interaction: { structuralEditing: false, nodeDrag: false, panZoom: false } });
    mount(graph);
    await new Promise(requestAnimationFrame);
    await graph.renderLayout(layout(), { transitionMode: 'replace' });
    expect(element(graph, 'graph-toolbar').hidden).toBe(true);
    const node = graph.shadowRoot!.querySelector('.node') as any;
    expect(node.__on.some((listener: any) => listener.name === 'drag')).toBe(false);
    expect((element(graph, 'svg') as any).__on?.some((listener: any) => listener.name === 'zoom')).toBeFalsy();
    await graph.setViewOptions({ interaction: { nodeDrag: true } });
    expect(node.__on.some((listener: any) => listener.name === 'drag')).toBe(true);
    const hostButton = document.createElement('button');
    hostButton.textContent = 'Host action';
    graph.addToolbarControl(hostButton);
    expect(element(graph, 'graph-toolbar').hidden).toBe(false);
    expect(visible(graph, 'zoom-in')).toBe(false);
  });

  it('keeps diagnostic events and warnings when the toolbar is removed', async () => {
    const graph = mount(new WebColaCnDGraph());
    await graph.setViewOptions({ toolbar: 'none' });
    const input = layout();
    input.warnings = [{ kind: 'empty-selector', selector: 'Missing', context: 'orientation', message: 'Nothing selected' } as any];
    const warnings = vi.fn();
    graph.addEventListener('layout-warnings', warnings);
    await graph.renderLayout(input, { transitionMode: 'replace' });
    expect(warnings).toHaveBeenCalled();
    expect(element(graph, 'layout-warnings').hidden).toBe(false);
    expect(element(graph, 'graph-toolbar').hidden).toBe(true);
  });
});
