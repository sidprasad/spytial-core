/**
 * Shared `text:` style block for the style system. A `text:` block styles any
 * label — the main node label, attribute/tag lines, edge labels, group labels
 * — so every directive that renders text reuses this one shape. Add a field
 * here (e.g. `weight`) and it lights up everywhere at once.
 *
 * Sparse: every field is optional. Size tiers reuse {@link AttrTextSize}
 * (small / normal / large, relative to the node label); see text-extent.ts.
 */
import type { AttrTextSize } from '../text-extent';

export type { AttrTextSize };

/** The three text-size tiers, as a runtime list for validation/enumeration. */
export const TEXT_SIZES = ['small', 'normal', 'large'] as const;

/** Narrow an unknown YAML value to a valid {@link AttrTextSize}. */
export function isTextSize(v: unknown): v is AttrTextSize {
    return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);
}

/**
 * Build a sparse {@link TextStyle} from a raw `textStyle` block, keeping only
 * present, valid leaves. Shared by every directive that carries a label
 * (edgeStyle, inferredEdge, atomStyle, group, …).
 */
export function parseTextStyle(raw: unknown): TextStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const textStyle: TextStyle = {};
    if (isTextSize(r.size)) textStyle.size = r.size;
    if (typeof r.color === 'string') textStyle.color = r.color;
    return Object.keys(textStyle).length > 0 ? textStyle : undefined;
}

/**
 * A sparse text style: only the leaves the author set are present. Declared as
 * a `type` (not `interface`) so it carries an implicit index signature and is
 * assignable to the resolver's {@link SparseStyle}.
 */
export type TextStyle = {
    /** Font-size tier relative to the node label. */
    size?: AttrTextSize;
    /** Text color (any CSS color string). */
    color?: string;
}
