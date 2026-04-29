/**
 * Pure, browser-free utilities for sizing node boxes to fit their rendered
 * text at the project's fixed font sizes.
 *
 * Architecture: layout owns box sizing, the renderer owns drawing. Both
 * import the font-size constants below so the box and the rendered text
 * agree on dimensions without a runtime negotiation.
 *
 *   - LayoutInstance.getNodeSizeMap calls `estimateLabelBox` to size each
 *     unconstrained node so its label and any secondary lines fit at
 *     {MAIN_LABEL_FONT_SIZE, SECONDARY_FONT_SIZE} with visual breathing
 *     room.
 *   - webcola-cnd-graph renders at those exact font sizes — no per-node
 *     resizing, no wrapping. If the user pins a too-small `size` directive,
 *     text overflows the rect (their explicit choice; sat_size still holds).
 *
 * Stays canvas/document-free so this module is node-runnable for tests.
 * The estimator's per-glyph width table is calibrated to slightly
 * over-estimate canvas-measured widths, so the heuristic is a safe upper
 * bound on what the renderer will actually draw.
 */

/** Main node label, rendered bold. */
export const MAIN_LABEL_FONT_SIZE = 14;
/** Secondary lines (attribute key:value, Skolem labels), rendered smaller. */
export const SECONDARY_FONT_SIZE = 11;
/** Line height as a multiple of font size — used by both estimator and renderer. */
export const LABEL_LINE_HEIGHT_RATIO = 1.35;

export interface EstimateLabelBoxOptions {
    /** Average glyph-width / font-size ratio for sans-serif text. */
    avgGlyphRatio?: number;
    /** Total horizontal padding (split evenly left/right). */
    paddingX?: number;
    /** Total vertical padding (split evenly top/bottom). */
    paddingY?: number;
    /** Floor — boxes never shrink below this. */
    min?: { w: number; h: number };
    /** Ceiling — caps how much one giant label can dominate the layout. */
    max?: { w: number; h: number };
}

const DEFAULT_OPTIONS: Required<EstimateLabelBoxOptions> = {
    // Slightly above measured canvas-width to cushion heuristic-vs-canvas drift.
    avgGlyphRatio: 0.65,
    // Padding gives the rendered text visible breathing room from the rect stroke,
    // which sits at the box edge with only the renderer's TEXT_PADDING (8px) of slack.
    paddingX: 32,
    paddingY: 26,
    min: { w: 100, h: 60 },
    max: { w: 280, h: 140 },
};

/** Per-glyph width multiplier (relative to the average). */
function glyphWidthUnits(code: number): number {
    // Narrow: i, l, I, j, t, f, r, ., ,, :, ;, ', ", `, |, !, (, ), [, ], {, }
    if (
        code === 0x69 || code === 0x6c || code === 0x49 || code === 0x6a ||
        code === 0x74 || code === 0x66 || code === 0x72 ||
        code === 0x2e || code === 0x2c || code === 0x3a || code === 0x3b ||
        code === 0x27 || code === 0x22 || code === 0x60 || code === 0x7c ||
        code === 0x21 || code === 0x28 || code === 0x29 ||
        code === 0x5b || code === 0x5d || code === 0x7b || code === 0x7d
    ) {
        return 0.5;
    }
    // Extra-wide: W, M, m, w, @
    if (code === 0x57 || code === 0x4d || code === 0x6d || code === 0x77 || code === 0x40) {
        return 1.4;
    }
    // Capitals (A-Z) excluding W/M.
    if (code >= 0x41 && code <= 0x5a) {
        return 1.1;
    }
    return 1.0;
}

/** Approximate the rendered width of a single line at the given font size. */
export function estimateTextWidth(text: string, fontSize: number, avgGlyphRatio: number): number {
    if (!text) return 0;
    let units = 0;
    for (let i = 0; i < text.length; i++) {
        units += glyphWidthUnits(text.charCodeAt(i));
    }
    return units * fontSize * avgGlyphRatio;
}

/**
 * Pick a node-box size that fits the main label (at MAIN_LABEL_FONT_SIZE)
 * plus any secondary lines (at SECONDARY_FONT_SIZE), with padding.
 *
 * Width = max line width across both font tiers, plus paddingX. Height =
 * one main-label line + N secondary lines (each scaled by line-height
 * ratio), plus paddingY. Result is clamped to [min, max], with `min`
 * acting as a floor (the historical 100×60 default) so short-label nodes
 * keep their familiar footprint.
 */
export function estimateLabelBox(
    mainLabel: string,
    secondaryLines: string[] = [],
    options: EstimateLabelBoxOptions = {}
): { width: number; height: number } {
    const opts: Required<EstimateLabelBoxOptions> = { ...DEFAULT_OPTIONS, ...options };

    const cleanedSecondary = secondaryLines.filter((s) => s && s.length > 0);

    const mainWidth = estimateTextWidth(mainLabel || '', MAIN_LABEL_FONT_SIZE, opts.avgGlyphRatio);
    let maxSecondaryWidth = 0;
    for (const line of cleanedSecondary) {
        const w = estimateTextWidth(line, SECONDARY_FONT_SIZE, opts.avgGlyphRatio);
        if (w > maxSecondaryWidth) maxSecondaryWidth = w;
    }

    const maxLineWidth = Math.max(mainWidth, maxSecondaryWidth);
    const rawWidth = maxLineWidth + opts.paddingX;

    const mainLineHeight = MAIN_LABEL_FONT_SIZE * LABEL_LINE_HEIGHT_RATIO;
    const secondaryLineHeight = SECONDARY_FONT_SIZE * LABEL_LINE_HEIGHT_RATIO;
    const rawHeight = mainLineHeight + cleanedSecondary.length * secondaryLineHeight + opts.paddingY;

    return {
        width: Math.round(clamp(rawWidth, opts.min.w, opts.max.w)),
        height: Math.round(clamp(rawHeight, opts.min.h, opts.max.h)),
    };
}

function clamp(v: number, lo: number, hi: number): number {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}
