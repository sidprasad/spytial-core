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
import { resolveIconPath } from '../icon-registry';

/** Sparse fill styling of an atom's rectangle. `type`, so it stays assignable to SparseStyle. */
export type FillStyle = {
    color?: string;
};

/** Sparse border styling of an atom's rectangle. `type`, so it stays assignable to SparseStyle. */
export type BorderStyle = {
    color?: string;
    width?: number;
};

/**
 * Where an atom's icon draws relative to its box:
 *  - `full`  — the icon occupies the whole box (the box itself stays transparent
 *              unless a `fillStyle.color` was asked for). With the label hidden
 *              this is the glyph idiom; with the label shown and a low
 *              {@link IconStyle.opacity} it is the watermark idiom.
 *  - `badge` — a small marker in the top-right corner, secondary to the label.
 */
export const ICON_PLACEMENTS = ['full', 'badge'] as const;
export type IconPlacement = typeof ICON_PLACEMENTS[number];

function isIconPlacement(v: unknown): v is IconPlacement {
    return typeof v === 'string' && (ICON_PLACEMENTS as readonly string[]).includes(v);
}

/**
 * Sparse icon styling of an atom. `type`, so it stays assignable to SparseStyle.
 *
 * `path` is stored already resolved (bundled name / pack reference / URL →
 * concrete URL or data URI) so the style resolver compares canonical values:
 * two rules naming the same icon different ways compose instead of colliding.
 *
 * Every leaf is optional — including `path` — so a supertype rule can supply the
 * icon and a subtype rule tune only its `opacity`, which is the gap-fill
 * inheritance the shared resolver provides. An `iconStyle` that resolves without
 * a `path` draws nothing.
 */
export type IconStyle = {
    path?: string;
    placement?: IconPlacement;
    /** Alpha in [0,1]. Absent = fully opaque. */
    opacity?: number;
};

/** The full sparse payload of an `atomStyle` directive. `type`, so it stays assignable to SparseStyle. */
export type AtomStyleSpec = {
    fillStyle?: FillStyle;
    borderStyle?: BorderStyle;
    textStyle?: TextStyle;
    iconStyle?: IconStyle;
    /**
     * Whether the atom's label is drawn (behavior, not appearance — the same
     * split `edgeStyle` makes with its own `showLabel`). Defaults to `true` at
     * consumption; the deprecated `icon` directive desugars an explicit `false`
     * to preserve its icon-only default.
     */
    showLabel?: boolean;
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

function parseIconStyle(raw: unknown): IconStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const iconStyle: IconStyle = {};
    // Resolved here so the resolver's equality check sees canonical paths.
    if (typeof r.path === 'string' && r.path.length > 0) iconStyle.path = resolveIconPath(r.path);
    if (isIconPlacement(r.placement)) iconStyle.placement = r.placement;
    // Alpha only; out-of-range is dropped rather than clamped (mirrors border width).
    if (typeof r.opacity === 'number' && Number.isFinite(r.opacity) && r.opacity >= 0 && r.opacity <= 1) {
        iconStyle.opacity = r.opacity;
    }
    return Object.keys(iconStyle).length > 0 ? iconStyle : undefined;
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

    const iconStyle = parseIconStyle(r.iconStyle);
    if (iconStyle) spec.iconStyle = iconStyle;

    if (typeof r.showLabel === 'boolean') spec.showLabel = r.showLabel;

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

/**
 * Desugar a legacy `icon` directive into an {@link AtomStyleRule}.
 *
 * The flat directive's single `showLabels` boolean drove four separate things:
 * label visibility, icon size, icon position, and whether the box went
 * transparent. The atomStyle model splits those into two orthogonal knobs, and
 * the mapping is total — every legacy spec lands on an exact equivalent:
 *
 * | legacy                        | becomes                                          |
 * |-------------------------------|--------------------------------------------------|
 * | `showLabels: false` (default) | `showLabel: false` + `iconStyle.placement: full`  |
 * | `showLabels: true`            | `showLabel: true`  + `iconStyle.placement: badge` |
 *
 * Writing `showLabel` explicitly (rather than leaning on a default) is what lets
 * the new surface default `showLabel` to `true` like any other atom, without
 * changing what an existing `icon` directive draws.
 *
 * Returns `null` — caller drops the rule — when the directive could never have
 * drawn anything: `selector` was required (a blank one already failed selector
 * evaluation, and must not become a graph-wide icon now that an absent selector
 * means "every atom"), and so was `path`.
 */
export function iconToAtomStyleRule(raw: unknown): AtomStyleRule | null {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const selector = typeof r.selector === 'string' ? r.selector : '';
    if (selector.trim().length === 0) return null;

    const path = typeof r.path === 'string' ? r.path : '';
    if (path.length === 0) return null;

    const showLabels = r.showLabels === true;
    return {
        selector,
        style: {
            showLabel: showLabels,
            iconStyle: {
                path: resolveIconPath(path),
                placement: showLabels ? 'badge' : 'full',
            },
        },
    };
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
