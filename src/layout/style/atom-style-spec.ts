/**
 * The `atomStyle` directive's sparse payload and its resolution.
 *
 * An atom is a composite: a fill ({@link FillStyle}), a border
 * ({@link BorderStyle}), and its label (the shared {@link TextStyle}). Per the
 * border-preserving mapping, legacy `atomColor.value` desugars to
 * `borderStyle.color` (nodes stay outlined by default, matching today's Tufte
 * rendering); `fillStyle` is an opt-in real fill.
 *
 * Resolution is per-atom: gather every atomStyle rule whose selector matches the
 * atom and fold through the shared {@link resolveStyle}. Because a supertype
 * selector already returns subtype atoms, type-ancestry inheritance and the
 * no-override collision fall out of that fold — no explicit ancestry walk.
 */
import { parseTextStyle } from './text-style';
import type { TextStyle } from './text-style';
import { resolveStyle } from './style-resolver';
import type { StyleContribution } from './style-resolver';

/** Sparse fill styling of an atom's rectangle. `type`, so it stays assignable to SparseStyle. */
export type FillStyle = {
    color?: string;
};

/** Sparse border styling of an atom's rectangle. `type`, so it stays assignable to SparseStyle. */
export type BorderStyle = {
    color?: string;
    width?: number;
};

/** The full sparse payload of an `atomStyle` directive. `type`, so it stays assignable to SparseStyle. */
export type AtomStyleSpec = {
    fillStyle?: FillStyle;
    borderStyle?: BorderStyle;
    textStyle?: TextStyle;
};

/** A parsed `atomStyle` directive: how it matches atoms, plus its style. */
export interface AtomStyleRule {
    /** Optional unary selector narrowing which atoms match (absent = all). */
    selector?: string;
    /** The sparse style to apply. */
    style: AtomStyleSpec;
}

function parseFillStyle(raw: unknown): FillStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const fillStyle: FillStyle = {};
    if (typeof r.color === 'string') fillStyle.color = r.color;
    return Object.keys(fillStyle).length > 0 ? fillStyle : undefined;
}

function parseBorderStyle(raw: unknown): BorderStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const borderStyle: BorderStyle = {};
    if (typeof r.color === 'string') borderStyle.color = r.color;
    // Positive widths only (mirrors the edge weight rule); invalid is dropped.
    if (typeof r.width === 'number' && Number.isFinite(r.width) && r.width > 0) borderStyle.width = r.width;
    return Object.keys(borderStyle).length > 0 ? borderStyle : undefined;
}

/**
 * Build a sparse {@link AtomStyleSpec} from a raw `atomStyle` directive object,
 * keeping only present, valid leaves. Matching keys (selector) are ignored here.
 */
export function parseAtomStyleSpec(raw: unknown): AtomStyleSpec {
    const spec: AtomStyleSpec = {};
    if (!raw || typeof raw !== 'object') return spec;
    const r = raw as Record<string, unknown>;

    const fillStyle = parseFillStyle(r.fillStyle);
    if (fillStyle) spec.fillStyle = fillStyle;

    const borderStyle = parseBorderStyle(r.borderStyle);
    if (borderStyle) spec.borderStyle = borderStyle;

    const textStyle = parseTextStyle(r.textStyle);
    if (textStyle) spec.textStyle = textStyle;

    return spec;
}

/**
 * Desugar a legacy `atomColor` directive into an {@link AtomStyleRule}. Per the
 * border-preserving mapping, `value` → `borderStyle.color` (the node's outline —
 * what atomColor drives today), so existing diagrams are unchanged.
 *
 * `atomColor`'s selector is REQUIRED: a missing/blank one was always an
 * error/no-op, never a global recolor. The atomStyle model treats an absent
 * selector as "every atom", so a selectorless atomColor must NOT desugar into a
 * rule that would repaint the whole graph — return `null` and let the caller
 * drop it (matching the legacy no-op).
 */
export function atomColorToAtomStyleRule(raw: unknown): AtomStyleRule | null {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const selector = typeof r.selector === 'string' ? r.selector : '';
    if (selector.trim().length === 0) return null;

    const style: AtomStyleSpec = {};
    if (typeof r.value === 'string') style.borderStyle = { color: r.value };
    return { selector, style };
}

function atomRuleSource(rule: AtomStyleRule): string {
    return rule.selector ? `atomStyle(${rule.selector})` : 'atomStyle';
}

/**
 * Resolve the concrete style for one atom from the rules that match it. The
 * caller selects which rules match (by selector); this folds them through the
 * shared resolver, so overlapping rules compose and disagreements throw
 * {@link StyleCollisionError}.
 */
export function resolveAtomStyle(rules: AtomStyleRule[], context?: string): AtomStyleSpec {
    const contributions: StyleContribution[] = rules.map((rule) => ({
        source: atomRuleSource(rule),
        style: rule.style,
    }));
    return resolveStyle(contributions, { context }) as AtomStyleSpec;
}
