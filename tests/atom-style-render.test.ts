/**
 * Renderer-level coverage for atom styling: proves a node datum's atomStyle
 * fields carry through webcola-cnd-graph into the SVG presentation attributes —
 * the interior fill (`fillColor`), the border width (`borderWidth`, via
 * `.style()` so it beats CSS class rules), and the main-label color
 * (`textStyle.color`). This is the durable form of the manual browser check: the
 * datum fields here are exactly what the webcola translator produces from a
 * resolved `atomStyle`.
 *
 * Uses prototype injection (the codebase's idiom for renderer internals — see
 * edge-style-render.test.ts) rather than a full jsdom mount.
 */
import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { WebColaLayout } from '../src/translators/webcola/webcolatranslator';

const proto = WebColaCnDGraph.prototype as any;

describe('webcola-cnd-graph — node fill color', () => {
    // A themed default canvas; nodeFillColor falls back to it when no fill is set.
    const base = { isHiddenNode: () => false, getCanvasBackground: () => '#fafafa' };
    const fill = (thisArg: any, d: any) => proto.nodeFillColor.call(thisArg, d);

    it('uses an explicit atomStyle fill color', () => {
        expect(fill(base, { fillColor: '#eef', showLabels: true })).toBe('#eef');
    });

    it('falls back to the canvas background (Tufte) when no fill is set', () => {
        expect(fill(base, { showLabels: true })).toBe('#fafafa');
    });

    it('stays transparent for a hidden node even if a fill is set', () => {
        const hidden = { ...base, isHiddenNode: () => true };
        expect(fill(hidden, { fillColor: '#eef', showLabels: true })).toBe('transparent');
    });

    it('stays transparent for an icon-only node (icon, labels hidden)', () => {
        expect(fill(base, { fillColor: '#eef', icon: 'x', showLabels: false })).toBe('transparent');
    });
});

describe('webcola-cnd-graph — node border width', () => {
    const width = (d: unknown) => proto.nodeStrokeWidth.call({}, d);

    it('maps an atomStyle border width to a px string', () => {
        expect(width({ borderWidth: 3 })).toBe('3px');
    });

    it('returns null when no border width is set (→ the default stroke width applies)', () => {
        expect(width({})).toBeNull();
        expect(width({ borderWidth: undefined })).toBeNull();
    });
});

describe('webcola-cnd-graph — node label color', () => {
    const color = (d: unknown) => proto.nodeLabelColor.call({}, d);

    it('passes an atomStyle textStyle color to the label fill', () => {
        expect(color({ textStyle: { color: '#003' } })).toBe('#003');
    });

    it('returns null when no label color is set (→ inherit the default black)', () => {
        expect(color({ textStyle: {} })).toBeNull();
        expect(color({})).toBeNull();
    });
});

describe('webcola translator — LayoutNode atomStyle reaches the render datum', () => {
    // toColaNode only needs positioning state; the style fields pass straight
    // through to the NodeWithMetadata the renderer reads.
    const stubThis = {
        DEFAULT_X: 0,
        DEFAULT_Y: 0,
        priorPositionMap: new Map(),
        lockUnconstrainedNodes: false,
        dagre_graph: null,
    };
    const toColaNode = (node: any) => (WebColaLayout.prototype as any).toColaNode.call(stubThis, node);

    it('carries color (border), shape, fillColor, borderWidth, and textStyle onto the datum', () => {
        const datum = toColaNode({
            id: 'n1',
            label: 'n1',
            color: '#33c',
            shape: 'hexagon',
            fillColor: '#eef',
            borderWidth: 3,
            textStyle: { color: '#003' },
            width: 100,
            height: 60,
            mostSpecificType: 'Node',
            showLabels: true,
        });
        expect(datum).toMatchObject({
            color: '#33c',
            shape: 'hexagon',
            fillColor: '#eef',
            borderWidth: 3,
            textStyle: { color: '#003' },
        });
    });

    it('leaves the style fields undefined when the node has no atomStyle', () => {
        const datum = toColaNode({
            id: 'n2',
            label: 'n2',
            color: 'black',
            width: 100,
            height: 60,
            mostSpecificType: 'Node',
            showLabels: true,
        });
        expect(datum.shape).toBeUndefined();
        expect(datum.fillColor).toBeUndefined();
        expect(datum.borderWidth).toBeUndefined();
        expect(datum.textStyle).toBeUndefined();
    });
});
