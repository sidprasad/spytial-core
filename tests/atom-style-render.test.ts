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
    // `isBadgeIcon` is the real predicate — the fill rule keys off icon placement,
    // so stubbing it would test the stub rather than the precedence.
    const base = {
        isHiddenNode: () => false,
        getCanvasBackground: () => '#fafafa',
        isBadgeIcon: proto.isBadgeIcon,
    };
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

    it('stays transparent under a full-bleed icon, so a group hull shows through', () => {
        expect(fill(base, { icon: 'x', iconPlacement: 'full', showLabels: false })).toBe('transparent');
    });

    it('treats a missing placement as full (the engine default)', () => {
        expect(fill(base, { icon: 'x', showLabels: false })).toBe('transparent');
    });

    it('keeps a normal fill under a badge icon — only the box-filling placement goes transparent', () => {
        expect(fill(base, { icon: 'x', iconPlacement: 'badge', showLabels: true })).toBe('#fafafa');
        expect(fill(base, { fillColor: '#eef', icon: 'x', iconPlacement: 'badge', showLabels: true })).toBe('#eef');
    });

    it('lets an explicit fill win over a full-bleed icon', () => {
        // Deliberate precedence change from the icon → atomStyle move: asking for a
        // fill and a full-bleed icon together is now a coherent request (an icon on
        // a tinted card) rather than a silently-discarded fill. Transparency is the
        // *default* for that placement, not an override of an explicit choice.
        expect(fill(base, { fillColor: '#eef', icon: 'x', iconPlacement: 'full', showLabels: false })).toBe('#eef');
    });

    it('stays transparent for a hidden node whatever its icon or fill', () => {
        const hidden = { ...base, isHiddenNode: () => true };
        expect(fill(hidden, { fillColor: '#eef', icon: 'x', iconPlacement: 'full' })).toBe('transparent');
    });
});

describe('webcola-cnd-graph — icon geometry', () => {
    // A 100×60 node centred at (200, 100); SMALL_IMG_SCALE_FACTOR is 0.3.
    const d = (extra: Record<string, unknown> = {}) => ({
        x: 200, y: 100, visualWidth: 100, visualHeight: 60, icon: 'x', ...extra,
    });
    const call = (fn: string, node: unknown, ...rest: unknown[]) =>
        proto[fn].call(proto, node, ...rest);

    it('sizes a full icon to the whole box and a badge to a fraction of it', () => {
        expect(call('iconWidth', d({ iconPlacement: 'full' }))).toBe(100);
        expect(call('iconHeight', d({ iconPlacement: 'full' }))).toBe(60);
        expect(call('iconWidth', d({ iconPlacement: 'badge' }))).toBeCloseTo(30);
        expect(call('iconHeight', d({ iconPlacement: 'badge' }))).toBeCloseTo(18);
    });

    it('anchors a full icon to the box origin and a badge to the top-right corner', () => {
        expect(call('iconX', d({ iconPlacement: 'full' }))).toBe(150); // 200 - 100/2
        expect(call('iconY', d({ iconPlacement: 'full' }))).toBe(70);  // 100 - 60/2
        expect(call('iconX', d({ iconPlacement: 'badge' }))).toBeCloseTo(220); // 200 + 50 - 30
        expect(call('iconY', d({ iconPlacement: 'badge' }))).toBe(70);  // both hug the top edge
    });

    it('honours a caller-supplied origin for a full icon but not for a badge', () => {
        // The WebCola tick path passes bounds (which include layout padding) so the
        // icon stays registered with the rect drawn from those same bounds.
        expect(call('iconX', d({ iconPlacement: 'full' }), 111)).toBe(111);
        expect(call('iconY', d({ iconPlacement: 'full' }), 222)).toBe(222);
        expect(call('iconX', d({ iconPlacement: 'badge' }), 111)).toBeCloseTo(220);
        expect(call('iconY', d({ iconPlacement: 'badge' }), 222)).toBe(70);
    });

    it('falls back to width/height when no visual size was recorded', () => {
        const noVisual = { x: 0, y: 0, width: 80, height: 40, icon: 'x', iconPlacement: 'full' };
        expect(call('iconWidth', noVisual)).toBe(80);
        expect(call('iconHeight', noVisual)).toBe(40);
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

    it('carries color (border), fillColor, borderWidth, and textStyle onto the datum', () => {
        const datum = toColaNode({
            id: 'n1',
            label: 'n1',
            color: '#33c',
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
        expect(datum.fillColor).toBeUndefined();
        expect(datum.borderWidth).toBeUndefined();
        expect(datum.textStyle).toBeUndefined();
    });
});
