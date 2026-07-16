/**
 * Renderer-level coverage for edge styling: proves an edge datum's style
 * carries through webcola-cnd-graph into the SVG presentation attributes
 * (stroke-dasharray from the line pattern, stroke from the color). This is the
 * durable form of the manual browser check — the datum fields here are exactly
 * what the webcola translator produces from a resolved `edgeStyle` (LayoutEdge
 * .style/.color → datum .style/.color).
 *
 * Uses prototype injection (the codebase's idiom for renderer internals — see
 * edge-routing-taut.test.ts) rather than a full jsdom mount.
 */
import { describe, it, expect } from 'vitest';
import { WebColaCnDGraph } from '../src/translators/webcola/webcola-cnd-graph';
import { WebColaLayout } from '../src/translators/webcola/webcolatranslator';

const proto = WebColaCnDGraph.prototype as any;

describe('webcola-cnd-graph — line pattern → stroke-dasharray', () => {
    const dash = (pattern?: string) => proto.getEdgeDasharray.call({}, pattern);

    it('maps dashed → "6,4"', () => expect(dash('dashed')).toBe('6,4'));
    it('maps dotted → "1,4"', () => expect(dash('dotted')).toBe('1,4'));
    it('maps solid → null (no dashes)', () => expect(dash('solid')).toBeNull());
    it('maps a missing pattern → null', () => expect(dash(undefined)).toBeNull());
    it('is case-insensitive', () => expect(dash('Dashed')).toBe('6,4'));
});

describe('webcola-cnd-graph — edge color → stroke', () => {
    // A theme-less `this`: no slots defined, so themedDataColor returns the
    // chosen color verbatim (its theming branch only fires for the implicit
    // black default under an active theme slot).
    const themeless = {
        isAlignmentEdge: () => false,
        themedDataColor: proto.themedDataColor,
        themeOverrides: {},
        activeSlots: () => ({}),
    };

    it('passes a chosen edge color straight through to the stroke', () => {
        expect(proto.edgeStrokeColor.call(themeless, { color: '#e63946' })).toBe('#e63946');
    });

    it('renders no stroke for an alignment edge', () => {
        const alignmentThis = { ...themeless, isAlignmentEdge: () => true };
        expect(proto.edgeStrokeColor.call(alignmentThis, { color: '#e63946' })).toBe('none');
    });
});

describe('webcola translator — LayoutEdge style reaches the render datum', () => {
    // toColaEdge only needs getNodeIndex; the rest of the fields pass straight
    // through to the EdgeWithMetadata the renderer reads.
    const toColaEdge = (edge: any) =>
        (WebColaLayout.prototype as any).toColaEdge.call({ getNodeIndex: (_id: string) => 0 }, edge);

    it('carries color, pattern (style), weight, highlight, showLabel, textStyle onto the datum', () => {
        const datum = toColaEdge({
            source: { id: 'A' },
            target: { id: 'B' },
            relationName: 'knows',
            id: 'e1',
            label: 'knows',
            color: '#e63946',
            style: 'dashed',
            weight: 4,
            highlight: '#fc0',
            showLabel: true,
            textStyle: { size: 'large', color: '#a00' },
        });
        expect(datum).toMatchObject({
            color: '#e63946',
            style: 'dashed',
            weight: 4,
            highlight: '#fc0',
            showLabel: true,
            textStyle: { size: 'large', color: '#a00' },
        });
    });
});

describe('webcola-cnd-graph — edge label textStyle → font-size / fill', () => {
    const fontSize = (d: unknown) => proto.edgeLabelFontSize.call({}, d);
    const fill = (d: unknown) => proto.edgeLabelFill.call({}, d);

    it('maps a textStyle size tier to a px font size', () => {
        expect(fontSize({ textStyle: { size: 'small' } })).toBe('9px');
        expect(fontSize({ textStyle: { size: 'normal' } })).toBe('11px');
        expect(fontSize({ textStyle: { size: 'large' } })).toBe('20px');
    });

    it('returns null font-size when no size tier is set (→ CSS default)', () => {
        expect(fontSize({ textStyle: {} })).toBeNull();
        expect(fontSize({})).toBeNull();
    });

    it('passes a textStyle color to the label fill, else null', () => {
        expect(fill({ textStyle: { color: '#a00' } })).toBe('#a00');
        expect(fill({ textStyle: {} })).toBeNull();
        expect(fill({})).toBeNull();
    });
});
