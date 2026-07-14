/**
 * The `edgeStyle` directive's sparse payload and its resolution.
 *
 * An edge is a composite: a drawn line ({@link LineStyle}: color / pattern /
 * weight / highlight), a label (the shared {@link TextStyle}), and behavior
 * flags (showLabel / hidden). Authors write only what they mean;
 * {@link parseEdgeStyleSpec} keeps the result sparse, and {@link resolveEdgeStyle}
 * folds every rule matching an edge through the shared {@link resolveStyle} — so
 * overlapping edge rules compose, and a genuine disagreement is a hard error
 * rather than a silent override.
 *
 * The `lineStyle` / `textStyle` block vocabulary is shared: `inferredEdge` and a
 * group's `addEdge` connector reuse the same blocks, and `edgeColor` desugars
 * onto `edgeStyle` behind a deprecation warning.
 */
import type { EdgeStyle } from '../edge-style';
import { isTextSize } from './text-style';
import type { TextStyle } from './text-style';
import { resolveStyle } from './style-resolver';
import type { StyleContribution } from './style-resolver';

/** Line dash patterns (the `EdgeStyle` union: solid | dashed | dotted). */
const LINE_PATTERNS: readonly EdgeStyle[] = ['solid', 'dashed', 'dotted'];

function isLinePattern(v: unknown): v is EdgeStyle {
    return typeof v === 'string' && (LINE_PATTERNS as readonly string[]).includes(v);
}

/** Sparse styling of an edge's drawn line. `type`, so it stays assignable to SparseStyle. */
export type LineStyle = {
    color?: string;
    /** Dash pattern: solid | dashed | dotted. */
    pattern?: EdgeStyle;
    weight?: number;
    highlight?: string;
};

/** The full sparse payload of an `edgeStyle` directive. `type`, so it stays assignable to SparseStyle. */
export type EdgeStyleSpec = {
    lineStyle?: LineStyle;
    textStyle?: TextStyle;
    /** Whether the edge label is shown (behavior, not appearance). */
    showLabel?: boolean;
    /** Whether the edge is hidden entirely (behavior, not appearance). */
    hidden?: boolean;
};

/** A parsed `edgeStyle` directive: how it matches edges, plus its style. */
export interface EdgeStyleRule {
    /** Relation / field whose edges this styles. */
    field: string;
    /** Optional unary selector narrowing which source atoms' edges match. */
    selector?: string;
    /** Optional tuple filter. */
    filter?: string;
    /** The sparse style to apply. */
    style: EdgeStyleSpec;
}

function parseLineStyle(raw: unknown): LineStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const lineStyle: LineStyle = {};
    if (typeof r.color === 'string') lineStyle.color = r.color;
    if (isLinePattern(r.pattern)) lineStyle.pattern = r.pattern;
    // Only positive weights, matching layoutinstance's normalizeEdgeWeight: an
    // invalid weight is dropped (stays sparse) so it falls back.
    if (typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight > 0) lineStyle.weight = r.weight;
    if (typeof r.highlight === 'string') lineStyle.highlight = r.highlight;
    return Object.keys(lineStyle).length > 0 ? lineStyle : undefined;
}

function parseTextStyle(raw: unknown): TextStyle | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;
    const textStyle: TextStyle = {};
    if (isTextSize(r.size)) textStyle.size = r.size;
    if (typeof r.color === 'string') textStyle.color = r.color;
    return Object.keys(textStyle).length > 0 ? textStyle : undefined;
}

/**
 * Build a sparse {@link EdgeStyleSpec} from a raw `edgeStyle` directive object,
 * keeping only present, valid leaves. Matching keys (field / selector / filter)
 * are ignored here — they live on {@link EdgeStyleRule}, not in the payload.
 */
export function parseEdgeStyleSpec(raw: unknown): EdgeStyleSpec {
    const spec: EdgeStyleSpec = {};
    if (!raw || typeof raw !== 'object') return spec;
    const r = raw as Record<string, unknown>;

    const lineStyle = parseLineStyle(r.lineStyle);
    if (lineStyle) spec.lineStyle = lineStyle;

    const textStyle = parseTextStyle(r.textStyle);
    if (textStyle) spec.textStyle = textStyle;

    if (typeof r.showLabel === 'boolean') spec.showLabel = r.showLabel;
    if (typeof r.hidden === 'boolean') spec.hidden = r.hidden;

    return spec;
}

/**
 * Desugar a legacy flat `edgeColor` directive into an {@link EdgeStyleRule}, so
 * both forms resolve through one path. `value`→`lineStyle.color`,
 * `style`→`lineStyle.pattern`, `weight`→`lineStyle.weight`,
 * `highlight`→`lineStyle.highlight`; `showLabel`/`hidden`/`field`/`selector`/
 * `filter` carry over unchanged. (Legacy `edgeColor` had no label styling.)
 */
export function edgeColorToEdgeStyleRule(raw: unknown): EdgeStyleRule {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    const lineStyle: LineStyle = {};
    if (typeof r.value === 'string') lineStyle.color = r.value;
    if (isLinePattern(r.style)) lineStyle.pattern = r.style;
    if (typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight > 0) lineStyle.weight = r.weight;
    if (typeof r.highlight === 'string') lineStyle.highlight = r.highlight;

    const style: EdgeStyleSpec = {};
    if (Object.keys(lineStyle).length > 0) style.lineStyle = lineStyle;
    if (typeof r.showLabel === 'boolean') style.showLabel = r.showLabel;
    if (typeof r.hidden === 'boolean') style.hidden = r.hidden;

    return {
        field: typeof r.field === 'string' ? r.field : '',
        selector: typeof r.selector === 'string' ? r.selector : undefined,
        filter: typeof r.filter === 'string' ? r.filter : undefined,
        style,
    };
}

function edgeRuleSource(rule: EdgeStyleRule): string {
    return rule.selector
        ? `edgeStyle(${rule.field} · ${rule.selector})`
        : `edgeStyle(${rule.field})`;
}

/**
 * Resolve the concrete style for one edge from the rules that match it. The
 * caller selects which rules match (by field, then selector / filter); this
 * folds them through the shared resolver, so overlaps compose and disagreements
 * throw {@link StyleCollisionError}.
 */
export function resolveEdgeStyle(rules: EdgeStyleRule[], context?: string): EdgeStyleSpec {
    const contributions: StyleContribution[] = rules.map((rule) => ({
        source: edgeRuleSource(rule),
        style: rule.style,
    }));
    // The resolved leaves are a subset of what EdgeStyleSpecs contributed, so
    // the merged result is itself a (concrete) EdgeStyleSpec.
    return resolveStyle(contributions, { context }) as EdgeStyleSpec;
}
