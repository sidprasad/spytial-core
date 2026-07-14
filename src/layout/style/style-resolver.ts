/**
 * Pure, instance-free style resolution for the SpyTial directive system.
 *
 * A style directive contributes a *sparse partial* — only the leaf
 * properties the author actually wrote. Many directives can target the same
 * node (a type and its supertypes, overlapping selectors), so resolving a
 * node's final style means folding every contribution that reaches it into
 * one record. The fold obeys three rules, in the spirit of "explicit or
 * reject" rather than CSS's silent cascade:
 *
 *   1. Composition — disjoint leaves merge (fill from one rule, border from
 *      another) all the way down to the leaf, so blocks combine instead of
 *      clobbering.
 *   2. Inheritance — a leaf set by exactly one contribution wins, whether it
 *      came from the node's own type or an ancestor (gap-filling).
 *   3. No override — a leaf set to *different* values by two contributions is
 *      a hard error ({@link StyleCollisionError}), whether those rules are
 *      comparable (type/supertype) or not. The same value twice is fine.
 *
 * Defaults are applied *once, at the end*, filling only leaves still unset —
 * never seeded up front, or every rule would look like it specified
 * everything and rules (2)/(3) would collapse into last-writer-wins.
 *
 * The core ({@link resolveStyle}) is target-agnostic: it folds an ordered
 * list of contributions. *How* contributions are gathered is the caller's
 * job — walk a type ancestry for atoms ({@link resolveTypedStyle}), match
 * field + selector for edges — so the same mechanism serves every style kind.
 *
 * Stays dependency-free (no DOM, no data-instance) so it is node-runnable
 * for tests and reusable across atom, edge, text, and group styling.
 */

/** A resolved leaf value. Style trees bottom out in primitives. */
export type StyleValue = string | number | boolean;

/** A nested partial style: branches are sub-objects, leaves are primitives. */
export interface SparseStyle {
    // Values may be `undefined`: a sparse partial only carries the leaves an
    // author actually wrote, so typed style blocks with optional fields are
    // assignable and absent/undefined leaves are simply skipped when folding.
    [key: string]: StyleValue | SparseStyle | undefined;
}

/** A fully-resolved style — the same nested shape, with defaults applied. */
export interface ResolvedStyle {
    [key: string]: StyleValue | ResolvedStyle;
}

/** One rule's contribution: its sparse partial plus a label for diagnostics. */
export interface StyleContribution {
    /** Human-facing identifier of the source rule, e.g. `atomStyle(selector="RedNode")`. */
    source: string;
    /** The sparse partial this rule contributes (only authored leaves present). */
    style: SparseStyle;
}

/** The rule and value that claimed a given leaf, for collision reporting. */
export interface StyleSource {
    source: string;
    value: StyleValue;
}

export interface ResolveOptions {
    /** Default leaves, applied last to anything still unset. */
    defaults?: SparseStyle;
    /** Optional description of the target, used only in collision messages. */
    context?: string;
}

/**
 * Thrown when two contributions set the same leaf to different values. This is
 * deliberate: styles never silently override, so an ambiguous property is
 * surfaced to the author rather than resolved by declaration order.
 */
export class StyleCollisionError extends Error {
    constructor(
        public readonly path: string,
        public readonly existing: StyleSource,
        public readonly incoming: StyleSource,
        public readonly context?: string,
    ) {
        const where = context ? ` for ${context}` : '';
        super(
            `Conflicting style for "${path}"${where}: ` +
                `${existing.source} sets it to ${JSON.stringify(existing.value)}, ` +
                `but ${incoming.source} sets it to ${JSON.stringify(incoming.value)}. ` +
                `Styles never silently override — set "${path}" in exactly one matching rule.`,
        );
        this.name = 'StyleCollisionError';
    }
}

function isPlainObject(v: unknown): v is { [key: string]: unknown } {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Flatten a nested sparse style into dotted leaf paths.
 * `{ border: { color: 'red' } }` → `{ 'border.color' => 'red' }`.
 * `undefined` / `null` leaves are treated as unspecified and dropped, so a
 * partial only ever carries what the author actually wrote.
 */
export function flattenLeaves(style: SparseStyle, prefix = ''): Map<string, StyleValue> {
    const out = new Map<string, StyleValue>();
    for (const key of Object.keys(style)) {
        const val = style[key];
        if (val === undefined || val === null) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(val)) {
            for (const [leafPath, leafVal] of flattenLeaves(val as SparseStyle, path)) {
                out.set(leafPath, leafVal);
            }
        } else {
            out.set(path, val);
        }
    }
    return out;
}

/** Rebuild a nested style from a resolved leaf map. */
function unflatten(cell: Map<string, StyleSource>): ResolvedStyle {
    const root: ResolvedStyle = {};
    for (const [path, { value }] of cell) {
        const parts = path.split('.');
        let node: ResolvedStyle = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            const next = node[key];
            if (isPlainObject(next)) {
                node = next as ResolvedStyle;
            } else {
                const created: ResolvedStyle = {};
                node[key] = created;
                node = created;
            }
        }
        node[parts[parts.length - 1]] = value;
    }
    return root;
}

/**
 * Fold an ordered list of contributions into one resolved style.
 *
 * Each leaf is a write-once cell: the first contribution to set it wins, a
 * later contribution setting it to the *same* value is a harmless duplicate,
 * and a later contribution setting it to a *different* value throws
 * {@link StyleCollisionError}. Composition (disjoint leaves) and inheritance
 * (a single specifier at any level) both fall out of that one pass; defaults
 * fill only whatever remains unset.
 */
export function resolveStyle(
    contributions: StyleContribution[],
    options: ResolveOptions = {},
): ResolvedStyle {
    const cell = new Map<string, StyleSource>();

    for (const { source, style } of contributions) {
        for (const [path, value] of flattenLeaves(style)) {
            const existing = cell.get(path);
            if (existing === undefined) {
                cell.set(path, { source, value });
            } else if (existing.value !== value) {
                throw new StyleCollisionError(path, existing, { source, value }, options.context);
            }
            // Same value from another rule: redundant but consistent — keep the first.
        }
    }

    if (options.defaults) {
        for (const [path, value] of flattenLeaves(options.defaults)) {
            if (!cell.has(path)) cell.set(path, { source: '(default)', value });
        }
    }

    return unflatten(cell);
}

/**
 * Resolve an atom's style by walking its type ancestry, most-specific first.
 *
 * `typeChain` is exactly what `IDataInstance.getAtomType(id).types` returns —
 * `[ownType, ...ancestors, 'univ']`. Every rule attached to a type in the
 * chain is folded through {@link resolveStyle}, so gap-fill inheritance and
 * the no-override collision rule both emerge from the shared mechanism. A type
 * may carry several rules (overlapping selectors); a disagreement among them,
 * or between a type and an ancestor, is a hard error.
 */
export function resolveTypedStyle(
    typeChain: string[],
    rulesByType: Map<string, StyleContribution[]>,
    options: ResolveOptions = {},
): ResolvedStyle {
    const contributions: StyleContribution[] = [];
    for (const typeId of typeChain) {
        const rules = rulesByType.get(typeId);
        if (rules) contributions.push(...rules);
    }
    const context =
        options.context ?? (typeChain.length > 0 ? `atoms of type ${typeChain[0]}` : undefined);
    return resolveStyle(contributions, { defaults: options.defaults, context });
}
