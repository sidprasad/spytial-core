import { describe, expect, it, vi } from 'vitest';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import type { IInputDataInstance, IRelation } from '../src/data-instance/interfaces';

const relation = (id: string, name = 'foo', pairs = [['a', 'b']]): IRelation => ({
  id, name, types: ['Node', 'Node'], tuples: pairs.map(atoms => ({ atoms, types: ['Node', 'Node'] })),
});
const atoms = ['a', 'b', 'c'].map(id => ({ id, type: 'Node', label: id }));
const json = (relations: IRelation[]) => new JSONDataInstance({ atoms, relations });

// Exercise the real parent emitters AND structured-input listeners. Only rendering
// and solver setup are stubbed; event details are produced by the shipping code.
function editor(dataInstance: IInputDataInstance) {
  const target = document.createElement('div');
  const graph = Object.create(StructuredInputGraph.prototype) as any;
  const nodes = dataInstance.getAtoms().map((a, index) => ({ ...a, index, mostSpecificType: a.type }));
  Object.defineProperties(graph, {
    shadowRoot: { value: target.attachShadow({ mode: 'open' }) },
    dispatchEvent: { value: target.dispatchEvent.bind(target) },
    addEventListener: { value: target.addEventListener.bind(target) },
  });
  Object.assign(graph, {
    dataInstance, currentLayout: { nodes, links: [], groups: [] },
    isInputModeActive: true, selectedNodeId: null,
    enforceConstraintsAndRegenerate: vi.fn().mockResolvedValue(undefined),
    rerenderGraph: vi.fn(), setupPopoverDismiss: vi.fn(),
    positionPopover: (popover: HTMLElement) => graph.shadowRoot.appendChild(popover),
  });
  for (const [event, handler] of [
    ['edge-creation-requested', 'handleEdgeCreationRequest'],
    ['edge-modification-requested', 'handleEdgeModificationRequest'],
    ['edge-reconnection-requested', 'handleEdgeReconnectionRequest'],
  ]) graph.addEventListener(event, graph[handler].bind(graph));
  const errors: Error[] = [];
  graph.addEventListener('relation-edit-error', (event: CustomEvent) => errors.push(event.detail.error));
  const edge = (name = 'foo') => {
    const e = { id: 'edge', source: nodes[0], target: nodes[1], relName: name, label: name };
    graph.currentLayout.links.push(e);
    return e;
  };
  return { graph, nodes, errors, edge };
}

describe('interactive editing resolves names to stored relation IDs', () => {
  const fixtures = {
    JSON: () => json([relation('A<:foo')]),
    Alloy: () => new AlloyDataInstance({ types: {
      Node: { id: 'Node', types: ['Node'], atoms: atoms.map(a => ({ ...a, _: 'atom' })), _: 'type' },
    }, skolems: {}, relations: { 'A<:foo': { ...relation('A<:foo'), _: 'relation' } } } as any),
    Pyret: () => {
      const instance = new PyretDataInstance();
      atoms.forEach(a => instance.addAtom(a));
      instance.addRelationTuple('pyret:field:v1:["duo",0,"foo"]', { atoms: ['a', 'b'], types: ['Node', 'Node'] });
      return instance;
    },
  };
  for (const [kind, fixture] of Object.entries(fixtures)) {
    it(`${kind}: drag-create, reconnect, relabel, and delete use the existing ID`, async () => {
      const data = fixture();
      const originalId = data.getRelations()[0].id;
      const { graph, nodes, edge, errors } = editor(data);
      await graph.createNewEdge(nodes[0], nodes[2], 'foo');
      expect(data.getRelations().map(r => r.id)).toEqual([originalId]);
      expect(data.getRelations()[0].tuples.map(t => t.atoms)).toContainEqual(['a', 'c']);
      const e = edge();
      await graph.reconnectEdge(e, 'source', nodes[2]);
      expect(data.getRelations()[0].tuples.map(t => t.atoms)).toEqual([['a', 'c'], ['c', 'b']]);
      graph.showEdgeEditDialog = vi.fn().mockResolvedValue('bar');
      await graph.editEdgeLabel(e);
      expect(data.getRelations().find(r => r.id === originalId)!.tuples.map(t => t.atoms)).toEqual([['a', 'c']]);
      expect(data.getRelations().find(r => r.name === 'bar')!.tuples.map(t => t.atoms)).toEqual([['c', 'b']]);
      await graph.deleteEdge(e);
      expect(data.getRelations().find(r => r.name === 'bar')!.tuples).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  it('relabels into another qualified relation instead of fabricating a name ID', async () => {
    const data = json([relation('A<:foo'), relation('B<:bar', 'bar', [])]);
    const { graph, edge } = editor(data);
    graph.showEdgeEditDialog = vi.fn().mockResolvedValue('bar');
    await graph.editEdgeLabel(edge());
    expect(data.getRelations().map(r => r.id)).toEqual(['A<:foo', 'B<:bar']);
    expect(data.getRelations()[0].tuples).toEqual([]);
    expect(data.getRelations()[1].tuples[0].atoms).toEqual(['a', 'b']);
  });

  it.each(['create', 'reconnect', 'relabel', 'delete', 'form'])('rejects ambiguous %s without changing data or the visual edge', async action => {
    const data = json([relation('A<:foo'), relation('B<:foo')]);
    const { graph, nodes, errors, edge } = editor(data);
    const e = edge();
    const before = JSON.stringify(data.reify());
    if (action === 'create') await graph.createNewEdge(nodes[0], nodes[2], 'foo');
    if (action === 'reconnect') await graph.reconnectEdge(e, 'target', nodes[2]);
    if (action === 'relabel') {
      graph.showEdgeEditDialog = vi.fn().mockResolvedValue('bar');
      await graph.editEdgeLabel(e);
    }
    if (action === 'delete') await graph.deleteEdge(e);
    if (action === 'form') {
      graph.relationAtomPositions = ['a', 'c'];
      await graph.addRelationFromForm('foo');
    }
    expect(JSON.stringify(data.reify())).toBe(before);
    expect(graph.currentLayout.links).toEqual([e]);
    expect(e.target).toBe(nodes[1]);
    expect(e.relName).toBe('foo');
    expect(errors[0].message).toMatch(/Ambiguous relation name/);
  });

  it('resolves an ambiguous relabel destination before removing the original tuple', async () => {
    const data = json([relation('A<:foo'), relation('B<:bar', 'bar', []), relation('C<:bar', 'bar', [])]);
    const { graph, errors, edge } = editor(data);
    const before = JSON.stringify(data.reify());
    graph.showEdgeEditDialog = vi.fn().mockResolvedValue('bar');
    const e = edge();
    await graph.editEdgeLabel(e);
    expect(JSON.stringify(data.reify())).toBe(before);
    expect(e.relName).toBe('foo');
    expect(errors[0].message).toMatch(/Ambiguous relation name/);
  });

  it('distinguishes entered names from IDs even when they collide', async () => {
    const data = json([relation('A<:foo'), relation('foo', 'bar', [])]);
    const { graph, nodes, errors } = editor(data);
    await graph.createNewEdge(nodes[0], nodes[2], 'foo');
    expect(data.getRelations()[0].tuples).toHaveLength(2);
    expect(data.getRelations()[1].tuples).toHaveLength(0);
    // ID-only requests stay exact, rather than using the name-resolution path.
    graph.dispatchEvent(new CustomEvent('edge-creation-requested', { detail: {
      relationId: 'foo', tuple: { atoms: ['b', 'c'], types: [] },
    } }));
    expect(data.getRelations()[1].tuples).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('rejects a new name that collides with an existing ID for a different name', async () => {
    const data = json([relation('foo', 'bar')]);
    const { graph, nodes, errors } = editor(data);
    await graph.createNewEdge(nodes[0], nodes[2], 'foo');
    expect(data.getRelations()[0].tuples).toHaveLength(1);
    expect(graph.currentLayout.links).toEqual([]);
    expect(errors[0].message).toMatch(/ID belongs to another name/);
  });

  it('toolbar creation resolves a qualified relation name', async () => {
    const data = json([relation('A<:foo')]);
    const { graph } = editor(data);
    graph.relationAtomPositions = ['a', 'c'];
    await graph.addRelationFromForm('foo');
    expect(data.getRelations().map(r => r.id)).toEqual(['A<:foo']);
    expect(data.getRelations()[0].tuples).toHaveLength(2);
  });

  it('delete dropdown preserves quoted and delimiter-containing IDs and targets the selected record', async () => {
    const id = 'pyret:field:v1:["duo::special",0,"foo"]';
    const data = json([relation('other', 'foo'), relation(id)]);
    const { graph } = editor(data);
    graph.controlsContainer = document.createElement('div');
    graph.controlsContainer.innerHTML = '<button data-action="delete"></button>';
    graph.handleDeleteAction();
    const select = graph.shadowRoot.querySelector('.si-del-rel') as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    expect(select.options[2].textContent).toContain(id);
    select.selectedIndex = 2;
    select.dispatchEvent(new Event('change'));
    (graph.shadowRoot.querySelector('.si-btn-danger') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(data.getRelations()[0].tuples).toHaveLength(1);
    expect(data.getRelations()[1].tuples).toEqual([]);
  });
});
