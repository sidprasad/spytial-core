/**
 * Node shapes for the `atomStyle` directive.
 *
 * A shape never changes what layout and edge routing see: the node remains its
 * rectangular box (WebCola bounds, router obstacles, and edge ports all stay
 * box-based). The shape is drawn inscribed in that box, touching it at the
 * box-side midpoints — so axis-aligned edge arrivals land exactly on the shape
 * and only corner-adjacent arrivals stop at the (invisible) box.
 *
 * What a shape DOES influence is the box's auto-size. An inscribed ellipse,
 * diamond, or hexagon covers less of the box than the full rectangle, so the
 * box must grow for the label to sit inside the drawn outline.
 * {@link estimateShapedLabelBox} does that containment math from the same text
 * extent the rectangle estimator uses. Explicit `size` directives are never
 * inflated — sat_size promises exactly the requested dimensions, and the shape
 * simply inscribes in whatever box the author pinned (a too-small pinned box
 * overflows, the same documented choice as overflowing text today).
 *
 * Pure and DOM-free (polygon geometry returns an SVG `points` string, which is
 * just text) so the whole module is node-runnable for tests.
 */
import {
    estimateLabelBox,
    LABEL_BOX_DEFAULTS,
} from '../text-extent';
import type { EstimateLabelBoxOptions, SecondaryLine } from '../text-extent';

/** The shapes `atomStyle.shape` accepts. `rectangle` is the implicit default. */
export const NODE_SHAPES = ['rectangle', 'ellipse', 'circle', 'diamond', 'hexagon', 'pill'] as const;

export type NodeShape = (typeof NODE_SHAPES)[number];

/**
 * Parse a raw `shape` value: a known shape name (case-insensitive) or
 * `undefined`. Invalid values are dropped, mirroring the other atomStyle
 * leaf parsers (e.g. a non-positive border width).
 */
export function parseNodeShape(raw: unknown): NodeShape | undefined {
    if (typeof raw !== 'string') return undefined;
    const name = raw.trim().toLowerCase();
    return (NODE_SHAPES as readonly string[]).includes(name) ? (name as NodeShape) : undefined;
}

// Slack added around the measured text before the per-shape containment math,
// so text corners clear the outline instead of grazing it. Roughly half the
// rectangle estimator's padding: the shape factors already add axis room.
const SHAPE_SLACK_X = LABEL_BOX_DEFAULTS.paddingX / 2;
const SHAPE_SLACK_Y = LABEL_BOX_DEFAULTS.paddingY / 2;

/**
 * Size a node's box so the label fits inside the *inscribed shape*, not just
 * the box. `rectangle` (and absent shape) is exactly {@link estimateLabelBox}.
 *
 * For the other shapes, take the raw text extent (tw × th, capped like the
 * rectangle estimate, plus slack) and solve the containment bound of a
 * centered tw × th block, then floor at the estimator minimum:
 *   - ellipse:  inscribed ellipse contains the block iff (tw/W)² + (th/H)² ≤ 1
 *               → W = √2·tw, H = √2·th puts corners exactly on the curve.
 *   - circle:   smallest containing circle has diameter hypot(tw, th); the box
 *               goes square (floored at the height minimum — circles have no
 *               100-wide historical footprint to preserve).
 *   - diamond:  |x|/(W/2) + |y|/(H/2) ≤ 1 at the corner → W = 2·tw, H = 2·th.
 *   - hexagon:  flat-top with slant inset H/4 (see {@link shapePolygonPoints})
 *               needs W ≥ tw + th/2 beyond the flats → widen the rectangle
 *               estimate by th/2; height is unchanged.
 *   - pill:     the straight section must span the text: W ≥ tw + H (the two
 *               end caps together consume one height); height is unchanged.
 */
export function estimateShapedLabelBox(
    shape: NodeShape | undefined,
    mainLabel: string,
    secondaryLines: SecondaryLine[] = [],
    options: EstimateLabelBoxOptions = {},
): { width: number; height: number } {
    const rect = estimateLabelBox(mainLabel, secondaryLines, options);
    if (shape === undefined || shape === 'rectangle') return rect;

    const opts: Required<EstimateLabelBoxOptions> = { ...LABEL_BOX_DEFAULTS, ...options };
    // Raw text extent, capped at the same content size the rectangle clamp
    // allows (max minus padding) so an over-cap label overflows a shape exactly
    // as it overflows a rectangle today.
    const text = estimateLabelBox(mainLabel, secondaryLines, {
        ...options,
        paddingX: 0,
        paddingY: 0,
        min: { w: 0, h: 0 },
        max: { w: opts.max.w - opts.paddingX, h: opts.max.h - opts.paddingY },
    });
    const tw = text.width + SHAPE_SLACK_X;
    const th = text.height + SHAPE_SLACK_Y;

    const floor = (w: number, h: number) => ({
        width: Math.round(Math.max(w, opts.min.w)),
        height: Math.round(Math.max(h, opts.min.h)),
    });

    switch (shape) {
        case 'ellipse':
            return floor(Math.SQRT2 * tw, Math.SQRT2 * th);
        case 'circle': {
            const side = Math.max(Math.hypot(tw, th), opts.min.h);
            return { width: Math.round(side), height: Math.round(side) };
        }
        case 'diamond':
            return floor(2 * tw, 2 * th);
        case 'hexagon':
            return floor(Math.max(rect.width, tw + opts.paddingX / 2 + th / 2), rect.height);
        case 'pill':
            return floor(Math.max(rect.width, tw + rect.height), rect.height);
    }
}

/** The SVG element that draws a given shape. */
export function svgTagForShape(shape: NodeShape | undefined): 'rect' | 'ellipse' | 'polygon' {
    switch (shape) {
        case 'ellipse':
        case 'circle':
            return 'ellipse';
        case 'diamond':
        case 'hexagon':
            return 'polygon';
        default:
            return 'rect';
    }
}

/**
 * SVG `points` for a diamond or hexagon inscribed in the w × h box centered at
 * (cx, cy). The hexagon is flat-topped with its side vertices at mid-height;
 * the slant inset is h/4 (capped at w/3 so narrow boxes keep a flat top).
 */
export function shapePolygonPoints(
    shape: 'diamond' | 'hexagon',
    cx: number,
    cy: number,
    w: number,
    h: number,
): string {
    const halfW = w / 2;
    const halfH = h / 2;
    const pts: Array<[number, number]> =
        shape === 'diamond'
            ? [
                [cx, cy - halfH],
                [cx + halfW, cy],
                [cx, cy + halfH],
                [cx - halfW, cy],
            ]
            : (() => {
                const inset = Math.min(h / 4, w / 3);
                return [
                    [cx - halfW + inset, cy - halfH],
                    [cx + halfW - inset, cy - halfH],
                    [cx + halfW, cy],
                    [cx + halfW - inset, cy + halfH],
                    [cx - halfW + inset, cy + halfH],
                    [cx - halfW, cy],
                ] as Array<[number, number]>;
            })();
    return pts.map(([x, y]) => `${x},${y}`).join(' ');
}
