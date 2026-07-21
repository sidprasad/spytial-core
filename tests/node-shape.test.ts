/**
 * The atomStyle `shape` contract (node-shape.ts):
 *   - parseNodeShape accepts exactly the published names;
 *   - estimateShapedLabelBox sizes the node box so the *text block* fits
 *     inside the inscribed shape (verified analytically per shape), floors at
 *     the rectangle minimum, and leaves rectangles exactly as the plain
 *     estimator sizes them;
 *   - svgTagForShape / shapePolygonPoints give the renderer its element kind
 *     and polygon geometry.
 * All pure — no DOM.
 */
import { describe, it, expect } from 'vitest';
import {
    NODE_SHAPES,
    parseNodeShape,
    estimateShapedLabelBox,
    svgTagForShape,
    shapePolygonPoints,
} from '../src/layout/style/node-shape';
import type { NodeShape } from '../src/layout/style/node-shape';
import { estimateLabelBox, LABEL_BOX_DEFAULTS } from '../src/layout/text-extent';

describe('parseNodeShape', () => {
    it('accepts every published shape name, case-insensitively', () => {
        for (const shape of NODE_SHAPES) {
            expect(parseNodeShape(shape)).toBe(shape);
            expect(parseNodeShape(shape.toUpperCase())).toBe(shape);
        }
        expect(parseNodeShape('  ellipse  ')).toBe('ellipse');
    });

    it('drops unknown and non-string values', () => {
        expect(parseNodeShape('blob')).toBeUndefined();
        expect(parseNodeShape('')).toBeUndefined();
        expect(parseNodeShape(3)).toBeUndefined();
        expect(parseNodeShape(undefined)).toBeUndefined();
    });
});

describe('estimateShapedLabelBox', () => {
    // The same text extent the sizer uses internally: the raw block the shape
    // must contain (unclamped here — the labels below stay under the cap).
    const textExtent = (label: string) =>
        estimateLabelBox(label, [], { paddingX: 0, paddingY: 0, min: { w: 0, h: 0 } });

    const LONG = 'A Fairly Long Node Label';

    it('rectangle (and absent shape) match the plain estimator exactly', () => {
        const rect = estimateLabelBox(LONG, []);
        expect(estimateShapedLabelBox('rectangle', LONG, [])).toEqual(rect);
        expect(estimateShapedLabelBox(undefined, LONG, [])).toEqual(rect);
    });

    it('floors every shape at the estimator minimum (short labels keep a familiar footprint)', () => {
        const { min } = LABEL_BOX_DEFAULTS;
        for (const shape of ['ellipse', 'hexagon', 'pill'] as NodeShape[]) {
            const box = estimateShapedLabelBox(shape, 'ok', []);
            expect(box.width).toBe(min.w);
            expect(box.height).toBe(min.h);
        }
    });

    it('circle is square, floored at the height minimum (no 100-wide legacy footprint)', () => {
        const small = estimateShapedLabelBox('circle', 'ok', []);
        expect(small.width).toBe(small.height);
        expect(small.height).toBe(LABEL_BOX_DEFAULTS.min.h);

        const big = estimateShapedLabelBox('circle', LONG, []);
        expect(big.width).toBe(big.height);
        expect(big.width).toBeGreaterThan(LABEL_BOX_DEFAULTS.min.h);
    });

    // Containment: the text block, centered in the box, must sit inside the
    // inscribed shape. Each check is the shape's analytic condition for the
    // block corner (tw/2, th/2).
    it('sizes each shape so the text block fits inside the inscribed outline', () => {
        const { width: tw, height: th } = textExtent(LONG);

        const ellipse = estimateShapedLabelBox('ellipse', LONG, []);
        expect((tw / ellipse.width) ** 2 + (th / ellipse.height) ** 2).toBeLessThanOrEqual(1);

        const circle = estimateShapedLabelBox('circle', LONG, []);
        expect(Math.hypot(tw, th)).toBeLessThanOrEqual(circle.width);

        const diamond = estimateShapedLabelBox('diamond', LONG, []);
        expect(tw / diamond.width + th / diamond.height).toBeLessThanOrEqual(1);

        // Hexagon: slanted edge runs x = W/2 - inset·(2|y|/H); at y = th/2 it
        // must still clear the block's half-width.
        const hex = estimateShapedLabelBox('hexagon', LONG, []);
        const inset = Math.min(hex.height / 4, hex.width / 3);
        expect(hex.width / 2 - inset * (th / hex.height)).toBeGreaterThanOrEqual(tw / 2);

        // Pill: the straight section between the end caps must span the block.
        const pill = estimateShapedLabelBox('pill', LONG, []);
        expect(pill.width - pill.height).toBeGreaterThanOrEqual(tw);
        expect(th).toBeLessThanOrEqual(pill.height);
    });

    it('caps runaway labels like the rectangle estimate does (max minus padding)', () => {
        const giant = 'An Extremely Long Label That Would Otherwise Dominate The Whole Layout Forever';
        const { max, paddingX } = LABEL_BOX_DEFAULTS;
        const ellipse = estimateShapedLabelBox('ellipse', giant, []);
        // √2 · (capped text + slack): stays near the scaled cap instead of growing unboundedly.
        expect(ellipse.width).toBeLessThanOrEqual(Math.SQRT2 * (max.w - paddingX + paddingX / 2) + 1);
    });
});

describe('svgTagForShape', () => {
    it('maps shapes onto their SVG elements', () => {
        expect(svgTagForShape(undefined)).toBe('rect');
        expect(svgTagForShape('rectangle')).toBe('rect');
        expect(svgTagForShape('pill')).toBe('rect');
        expect(svgTagForShape('ellipse')).toBe('ellipse');
        expect(svgTagForShape('circle')).toBe('ellipse');
        expect(svgTagForShape('diamond')).toBe('polygon');
        expect(svgTagForShape('hexagon')).toBe('polygon');
    });
});

describe('shapePolygonPoints', () => {
    const parse = (points: string) => points.split(' ').map((p) => p.split(',').map(Number));

    it('diamond vertices sit at the box-side midpoints', () => {
        expect(parse(shapePolygonPoints('diamond', 10, 20, 100, 60))).toEqual([
            [10, -10],
            [60, 20],
            [10, 50],
            [-40, 20],
        ]);
    });

    it('hexagon is flat-topped with side vertices at mid-height, inset h/4', () => {
        const pts = parse(shapePolygonPoints('hexagon', 0, 0, 100, 60));
        expect(pts).toEqual([
            [-35, -30],
            [35, -30],
            [50, 0],
            [35, 30],
            [-35, 30],
            [-50, 0],
        ]);
    });

    it('caps the hexagon inset at w/3 so narrow boxes keep a flat top', () => {
        const pts = parse(shapePolygonPoints('hexagon', 0, 0, 30, 60));
        // inset = min(60/4, 30/3) = 10 → top edge spans -5..5, not inverted.
        expect(pts[0]).toEqual([-5, -30]);
        expect(pts[1]).toEqual([5, -30]);
    });
});
