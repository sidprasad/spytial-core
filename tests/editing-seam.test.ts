/**
 * Editing belongs to the editing subclass (#571).
 *
 * WebColaCnDGraph used to hold all of the interactive editing code — input
 * mode, edge creation, edge deletion, the draggable endpoint handles — behind
 * an `isInputAllowed` constructor flag that only StructuredInputGraph ever set.
 * Every read-only graph therefore carried the state and the document-level key
 * listeners for a feature it could not use.
 *
 * The code now lives on StructuredInputGraph and reaches the render pipeline
 * through five no-op hooks on the base class. This file pins that split: the
 * base has the hooks and none of the editing, the subclass has the editing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { StructuredInputGraph } from '../src/translators/webcola/structured-input-graph';

const base = WebColaCnDGraph.prototype as any;
const editing = StructuredInputGraph.prototype as any;

/** Every method that moved down. */
const EDITING_METHODS = [
  'attachInputModeListeners',
  'detachInputModeListeners',
  'activateInputMode',
  'deactivateInputMode',
  'disableNodeDragging',
  'enableNodeDragging',
  'disableZoom',
  'enableZoom',
  'cleanupEdgeCreation',
  'startEdgeCreation',
  'finishEdgeCreation',
  'showEdgeLabelInput',
  'createNewEdge',
  'editEdgeLabel',
  'deleteEdge',
  'reconnectEdge',
  'removeEdgeFromLayout',
  'findNodeAtPosition',
  'getNodeFromEdge',
  'setupEdgeEndpointMarkers',
  'startEdgeEndpointDrag',
  'dragEdgeEndpoint',
  'endEdgeEndpointDrag',
  'updateEdgeEndpointMarkers',
  'getEdgePathPoint',
];

/** The hooks the base calls and the subclass fills in. */
const HOOKS = [
  'onNodesRendered',
  'onLinkPathsRendered',
  'onLinksRendered',
  'onPositionsUpdated',
  'onDispose',
];

afterEach(() => vi.restoreAllMocks());

describe('the editing seam', () => {
  it('keeps every editing method off the base graph', () => {
    const stillOnBase = EDITING_METHODS.filter(name => name in base);
    expect(stillOnBase).toEqual([]);
  });

  it('puts every editing method on the editing subclass', () => {
    const missing = EDITING_METHODS.filter(name => typeof editing[name] !== 'function');
    expect(missing).toEqual([]);
  });

  it('gives the base a hook for each thing editing needs to join', () => {
    for (const hook of HOOKS) expect(typeof base[hook]).toBe('function');
  });

  it('leaves the base hooks doing nothing', () => {
    // Called with no collaborators at all: a read-only graph must survive the
    // full render pipeline without any editing state to read.
    for (const hook of HOOKS) expect(() => base[hook].call({}, undefined)).not.toThrow();
  });

  it('overrides every hook on the editing subclass', () => {
    for (const hook of HOOKS) expect(editing[hook]).not.toBe(base[hook]);
  });
});

describe('input-mode listeners', () => {
  it('are attached and detached by the editing subclass, once', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const host: any = {
      handleInputModeKeydown: () => {},
      handleInputModeKeyup: () => {},
      handleInputModeBlur: () => {},
      inputModeListenersAttached: false,
    };

    editing.attachInputModeListeners.call(host);
    editing.attachInputModeListeners.call(host);   // second call is a no-op
    expect(add.mock.calls.map(c => c[0])).toEqual(['keydown', 'keyup']);
    expect(windowAdd.mock.calls.map(c => c[0])).toEqual(['blur']);

    editing.detachInputModeListeners.call(host);
    editing.detachInputModeListeners.call(host);
    expect(remove.mock.calls.map(c => c[0])).toEqual(['keydown', 'keyup']);
    expect(host.inputModeListenersAttached).toBe(false);
  });
});
