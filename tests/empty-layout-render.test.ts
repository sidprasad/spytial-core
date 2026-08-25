/**
 * An instance with nothing in it must draw an empty canvas.
 *
 * Reported by an integrator embedding the CDN bundle: a datum that failed to
 * parse in the host reached `renderLayout` as a layout with zero nodes, and the
 * element answered with three console messages ending in
 * "Layout rendering failed: can't access property "attr", this.svgGroups is
 * undefined".
 *
 * The cascade: `renderGroups` returned early on an empty node set and left
 * `svgGroups` undefined; WebCola's `Layout.start` threw reading
 * `this._nodes[0].width` for its grid-snap phase; the fallback `start(0,0,0,0)`
 * converged and fired `end`; and the paint that followed dereferenced
 * `svgGroups`. None of those messages named the empty instance behind them.
 *
 * These pin the two invariants that broke, in the codebase's prototype-injection
 * idiom (see webcola-teardown.test.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';

const proto = WebColaCnDGraph.prototype as any;

/** Chainable d3-selection stub that records what was asked of it. */
function containerStub() {
    const calls: string[] = [];
    const sel: any = {
        selectAll(selector: string) { calls.push(`selectAll(${selector})`); return sel; },
        remove() { calls.push('remove'); return sel; },
        attr(name: string, value: any) { calls.push(`attr(${name},${value})`); return sel; },
    };
    return { sel, calls };
}

/** A `this` for renderEmptyLayout: real shadow DOM, real show/hideEmptyState. */
function emptyRenderHarness() {
    const root = document.createElement('div');
    proto.initializeDOM.call({ root, getCSS: () => '' });

    const container = containerStub();
    const events: CustomEvent[] = [];
    const fakeThis: any = {
        root,
        container: container.sel,
        // Populated as a prior non-empty render would have left them.
        currentLayout: { nodes: [{ id: 'a' }] },
        colaLayout: { stop: () => { } },
        svgNodes: {}, svgLinkGroups: {}, svgGroups: {}, svgGroupLabels: {}, svgGroupLabelBgs: {},
        morphOldPositions: new Map(),
        showEmptyState: proto.showEmptyState,
        hideEmptyState: proto.hideEmptyState,
        hideLoading: vi.fn(),
        dispatchRelationsAvailableEvent: vi.fn(),
        updateRoutingModeDropdown: vi.fn(),
        dispatchEvent: (e: CustomEvent) => { events.push(e); return true; },
    };

    return { fakeThis, root, container, events };
}

const emptyLayout = (extra: Record<string, unknown> = {}) =>
    ({ nodes: [], edges: [], constraints: [], groups: [], ...extra }) as any;

describe('rendering a layout with no nodes', () => {
    it('says the instance is empty instead of failing', () => {
        const { fakeThis, root } = emptyRenderHarness();

        proto.renderEmptyLayout.call(fakeThis, emptyLayout(), emptyLayout());

        const note = root.querySelector('#empty-state') as HTMLElement;
        expect(note.hidden).toBe(false);
        expect(note.textContent).toBe('Nothing to draw: this instance has no atoms.');
        // The red error box is for failures. An empty instance is not one.
        expect((root.querySelector('#error') as HTMLElement).style.display).not.toBe('block');
    });

    it('distinguishes an empty instance from one whose atoms are all hidden', () => {
        const { fakeThis, root } = emptyRenderHarness();

        proto.renderEmptyLayout.call(fakeThis, emptyLayout({ hiddenAtoms: ['Book$0'] }), emptyLayout());

        expect((root.querySelector('#empty-state') as HTMLElement).textContent)
            .toBe('Nothing to draw: every atom in this instance is hidden.');
    });

    it('clears the canvas and the selections the previous render left', () => {
        const { fakeThis, container } = emptyRenderHarness();

        proto.renderEmptyLayout.call(fakeThis, emptyLayout(), emptyLayout());

        expect(container.calls).toContain('remove');
        // A superseded morph can leave the container hidden; nothing else on
        // this path would ever unhide it.
        expect(container.calls).toContain('attr(opacity,1)');
        expect(fakeThis.svgNodes).toBeNull();
        expect(fakeThis.svgGroups).toBeNull();
        expect(fakeThis.svgLinkGroups).toBeNull();
        // No solver is created, so WebCola never reads _nodes[0].
        expect(fakeThis.colaLayout).toBeNull();
    });

    it('still reports the render as complete', () => {
        const { fakeThis, events } = emptyRenderHarness();

        proto.renderEmptyLayout.call(fakeThis, emptyLayout(), emptyLayout());

        expect(fakeThis.dispatchRelationsAvailableEvent).toHaveBeenCalled();
        const complete = events.find(e => e.type === 'layout-complete');
        expect(complete).toBeTruthy();
        expect((complete as any).detail.nodePositions).toEqual([]);
    });

    it('drops the note once something is drawn again', () => {
        const { fakeThis, root } = emptyRenderHarness();
        proto.renderEmptyLayout.call(fakeThis, emptyLayout(), emptyLayout());

        proto.hideEmptyState.call(fakeThis);

        const note = root.querySelector('#empty-state') as HTMLElement;
        expect(note.hidden).toBe(true);
        expect(note.textContent).toBe('');
    });
});

describe('renderGroups on an empty node set', () => {
    it('binds an empty group set rather than leaving svgGroups undefined', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            const marker = { boundGroups: null as any };
            const fakeThis: any = {
                currentLayout: { nodes: [] },
                setupGroups: (groups: any[]) => { marker.boundGroups = groups; return marker; },
            };

            proto.renderGroups.call(fakeThis, [{ name: 'g1' }], {});

            // Every later paint reads this. Undefined here is what surfaced as
            // "can't access property attr, this.svgGroups is undefined".
            expect(fakeThis.svgGroups).toBe(marker);
            // A group draws around member nodes, so a group with none is dropped.
            expect(marker.boundGroups).toEqual([]);
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('stays quiet when there is simply nothing to group', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            const fakeThis: any = {
                currentLayout: { nodes: [] },
                setupGroups: () => 'selection',
            };

            proto.renderGroups.call(fakeThis, [], {});

            expect(fakeThis.svgGroups).toBe('selection');
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('surfacing a render failure to the host', () => {
    /** A `this` with the real shadow DOM and the real error methods. */
    function errorHarness() {
        const root = document.createElement('div');
        proto.initializeDOM.call({ root, getCSS: () => '' });

        const events: CustomEvent[] = [];
        const fakeThis: any = {
            root,
            showError: proto.showError,
            hideError: proto.hideError,
            emitLayoutError: proto.emitLayoutError,
            hideLoading: vi.fn(),
            dispatchEvent: (e: CustomEvent) => { events.push(e); return true; },
        };
        return { fakeThis, root, events };
    }

    it('fires layout-error alongside the on-screen box', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const { fakeThis, root, events } = errorHarness();
            const cause = new TypeError('boom');

            proto.showError.call(fakeThis, 'Layout rendering failed: boom', { phase: 'render', cause });

            // The box only reaches someone looking at the diagram...
            const box = root.querySelector('#error') as HTMLElement;
            expect(box.style.display).toBe('block');
            expect(box.textContent).toBe('Layout rendering failed: boom');
            // ...so the host gets an event it can actually wire up.
            const emitted = events.find(e => e.type === 'layout-error');
            expect(emitted).toBeTruthy();
            expect((emitted as any).detail).toMatchObject({
                message: 'Layout rendering failed: boom',
                phase: 'render',
                fatal: true,
                cause,
            });
            expect((emitted as any).bubbles).toBe(true);
            // One named line, not the several unattributed ones a failing
            // render used to scatter.
            expect(error).toHaveBeenCalledTimes(1);
            expect(error.mock.calls[0][0]).toContain('[spytial]');
        } finally {
            error.mockRestore();
        }
    });

    it('reports a degraded render as non-fatal', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const { fakeThis, events } = errorHarness();

            proto.emitLayoutError.call(fakeThis, {
                message: 'The layout solver could not start.',
                phase: 'solver',
                fatal: false,
            });

            // The diagram is on screen, so no error box — but the host still
            // hears that the positions it is showing are not solved.
            expect((events[0] as any).detail.fatal).toBe(false);
            expect((events[0] as any).detail.phase).toBe('solver');
        } finally {
            error.mockRestore();
        }
    });

    it('clears a stale error box when the next render starts', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const { fakeThis, root } = errorHarness();
            proto.showError.call(fakeThis, 'Layout rendering failed: boom');
            const box = root.querySelector('#error') as HTMLElement;
            expect(box.style.display).toBe('block');

            proto.hideError.call(fakeThis);

            // A morph render never calls showLoading, which was the only thing
            // that used to clear this — so the box outlived the failure and sat
            // on top of the diagram that replaced it.
            expect(box.style.display).toBe('none');
            expect(box.textContent).toBe('');
        } finally {
            error.mockRestore();
        }
    });
});
