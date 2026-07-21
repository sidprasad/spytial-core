/**
 * Structural validation for the Spytial spec editor.
 *
 * `Diagnostic` itself is declared in `types.ts` (it is part of the pinned
 * contract). This module provides the structural validators that run over a
 * `SpecDocumentState`:
 *  - missing required fields → error
 *  - unknown enum values → error
 *  - per-definition `validate()` results
 *  - unknown item types → warning (preserved verbatim via `SpecItem.raw`)
 *
 * Domain validation (e.g. "type Foo is not in this instance") is layered on by
 * WP2's `validateAgainstDomain`; when a `DomainSchema` is supplied here, those
 * warnings are appended to the structural diagnostics. With no domain, only
 * structural diagnostics are produced (identical to before WP2).
 *
 * This module is framework-agnostic — no React.
 */

import { getDefinition } from './registry';
import type { Diagnostic, ItemDefinition, SpecDocumentState, SpecItem } from './types';
import type { DomainSchema } from '../domain/domain-schema';
import { validateAgainstDomain } from '../domain/domain-validation';

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---- unknown-key detection ----------------------------------------------
//
// The registry (`def.fields`, with nested `children`) is the source of truth
// for which keys a type accepts. A key in `item.params` that no field backs is
// almost always a typo (`showLabel` for `showLabels`, `colour` for `color`) or
// stray junk — the engine parser silently ignores it, so without this the
// mistake renders as a quiet no-op. We surface it as a *warning* (the diagram
// still renders) with a "did you mean" when a real field is a near-miss.

/**
 * Keys the engine accepts on a *constraint* that are deliberately not builder
 * fields, so they must not be flagged: `hold: never` negates any constraint
 * (read by `parseConstraints`), but exposing it as a field would clutter every
 * constraint form.
 */
const CONSTRAINT_STRUCTURAL_KEYS: readonly string[] = ['hold'];

/**
 * Per-type keys the engine accepts but the registry does not expose as builder
 * fields, so the unknown-key check must not report them as typos:
 *  - `inferredEdge` still parses the deprecated flat `color`/`style`/`weight`/
 *    `highlight` (its own deprecation warning covers them).
 *  - `edgeColor` is the deprecated flat form; `edgeColorToEdgeStyleRule` reads
 *    these extras beyond the fields the registry lists.
 *
 * NOTE: this mirrors the engine parser (`layoutspec.ts` + the style-spec
 * parsers). If a directive gains an inner key there, add it here (or as a real
 * registry field) or valid specs will draw a spurious warning.
 */
const EXTRA_ACCEPTED_KEYS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  inferredEdge: ['color', 'style', 'weight', 'highlight'],
  edgeColor: ['highlight', 'showLabel', 'hidden', 'filter'],
};

/** Levenshtein edit distance (case-insensitive at the call site). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * The known key closest to `key`, or undefined when nothing is a near-miss.
 * "Near" is an edit distance of at most 2 that is also strictly less than the
 * typo's length, so short foreign keys don't get an absurd suggestion.
 */
function closestKey(key: string, known: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  const lower = key.toLowerCase();
  for (const candidate of known) {
    const d = editDistance(lower, candidate.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best !== undefined && bestDist <= 2 && bestDist < key.length ? best : undefined;
}

/**
 * Build the "unknown field" diagnostic for `key`, appending a `did you mean`
 * when a field is a near-miss, else the list of valid keys.
 * `suggestable` is the set of builder-field keys (what we advertise); it may be
 * narrower than the set that suppresses the warning (which also allows `hold`
 * and deprecated inline keys).
 */
function unknownKeyDiagnostic(
  key: string,
  suggestable: readonly string[],
  context: string,
  itemId: string,
  fieldKey: string = key,
): Diagnostic {
  const suggestion = closestKey(key, suggestable);
  const hint = suggestion
    ? ` Did you mean "${suggestion}"?`
    : suggestable.length > 0
      ? ` Known fields: ${suggestable.join(', ')}.`
      : '';
  return {
    severity: 'warning',
    code: 'unknown-key',
    message: `Unknown field "${key}" in ${context}.${hint}`,
    itemId,
    fieldKey,
    source: 'structure',
  };
}

/**
 * Flag params keys not backed by a field on `def` — at the top level and one
 * level down inside each declared `group` block (lineStyle / textStyle / …).
 * Only `group` fields are recursed into; other block-shaped values (e.g. a
 * group's `addEdge` written in its block form) are left alone by design.
 */
function checkUnknownKeys(item: SpecItem, def: ItemDefinition): Diagnostic[] {
  const out: Diagnostic[] = [];

  const fieldKeys = def.fields.map((f) => f.key);
  const allowed = new Set<string>(fieldKeys);
  if (item.kind === 'constraint') {
    for (const k of CONSTRAINT_STRUCTURAL_KEYS) allowed.add(k);
  }
  for (const k of EXTRA_ACCEPTED_KEYS_BY_TYPE[item.type] ?? []) allowed.add(k);

  // Prefer the raw parsed body when present: a custom `fromYamlNode` (group /
  // flag) copies only recognized keys into `params`, so a typo like `naem` would
  // otherwise be dropped before it reaches this check. `sourceBody` preserves the
  // original keys for exactly this; it falls back to `params` for builder-built
  // items (which only ever hold known fields).
  const topLevel = isRecord(item.sourceBody) ? item.sourceBody : item.params;
  for (const key of Object.keys(topLevel)) {
    if (allowed.has(key)) continue;
    out.push(unknownKeyDiagnostic(key, fieldKeys, def.label, item.id));
  }

  for (const field of def.fields) {
    if (field.kind !== 'group' || !field.children) continue;
    const block = item.params[field.key];
    if (!isRecord(block)) continue;
    const childKeys = field.children.map((c) => c.key);
    const allowedChildren = new Set(childKeys);
    for (const key of Object.keys(block)) {
      if (allowedChildren.has(key)) continue;
      // Route with a parent-qualified key (`fillStyle.width`) so the diagnostic
      // can't collide with a same-named field in a sibling block (e.g.
      // `borderStyle.width`) — the renderer filters nested diagnostics by an
      // exact `fieldKey`. The message still names the child key and its block.
      out.push(
        unknownKeyDiagnostic(key, childKeys, field.label, item.id, `${field.key}.${key}`),
      );
    }
  }

  return out;
}

/** Validate a single item structurally against its registry definition. */
export function validateItem(item: SpecItem): Diagnostic[] {
  const out: Diagnostic[] = [];

  // Unknown type (preserved as raw): a non-blocking warning.
  if (item.raw !== undefined && getDefinition(item.type) === undefined) {
    out.push({
      severity: 'warning',
      code: 'unknown-type',
      message: `Unknown ${item.kind} type "${item.type}". It is preserved as-is but the builder cannot edit it.`,
      itemId: item.id,
      source: 'structure',
    });
    return out;
  }

  const def = getDefinition(item.type);
  if (!def) {
    out.push({
      severity: 'warning',
      code: 'unknown-type',
      message: `Unknown ${item.kind} type "${item.type}".`,
      itemId: item.id,
      source: 'structure',
    });
    return out;
  }

  // Deprecated type: still parses and renders, but nudge toward its replacement.
  // A distinct `code` so consumers can treat it apart from typo-style warnings.
  if (def.deprecated) {
    const replacement = def.deprecatedInFavorOf
      ? ` Use "${def.deprecatedInFavorOf}" instead.`
      : '';
    out.push({
      severity: 'warning',
      code: 'deprecated',
      message: `"${def.label}" is deprecated.${replacement}`,
      itemId: item.id,
      source: 'structure',
    });
  }

  for (const field of def.fields) {
    const value = item.params[field.key];

    if (field.required && isEmpty(value)) {
      out.push({
        severity: 'error',
        code: 'missing-required',
        message: `Missing required field "${field.label}".`,
        itemId: item.id,
        fieldKey: field.key,
        source: 'structure',
      });
      continue;
    }

    if (field.kind === 'enum' && field.options && !isEmpty(value)) {
      const allowed = new Set(field.options);
      const values = field.multiple
        ? Array.isArray(value)
          ? value.map((v) => String(v))
          : [String(value)]
        : [String(value)];
      for (const v of values) {
        if (!allowed.has(v)) {
          out.push({
            severity: 'error',
            code: 'invalid-value',
            message: `Invalid value "${v}" for "${field.label}". Allowed: ${field.options.join(', ')}.`,
            itemId: item.id,
            fieldKey: field.key,
            source: 'structure',
          });
        }
      }
    }
  }

  out.push(...checkUnknownKeys(item, def));

  if (def.validate) {
    for (const d of def.validate(item.params)) {
      // Attach the item id if the definition didn't already (definitions only
      // know about field keys, not item ids).
      out.push(d.itemId ? d : { ...d, itemId: item.id });
    }
  }

  return out;
}

/**
 * Cross-item check mirroring `parseLayoutSpec`'s parse-time rejection: two
 * cyclic constraints over the same selector with different directions make
 * the engine THROW ("Inconsistent cyclic constraint…"). Surfacing it here
 * turns that hard failure into an editable diagnostic on the offending rows.
 */
function validateCyclicConsistency(
  constraints: SpecDocumentState['constraints'],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const bySelector = new Map<string, { direction: string; itemId: string }>();
  for (const item of constraints) {
    if (item.type !== 'cyclic') continue;
    const selector = String(item.params.selector ?? '');
    const direction = String(item.params.direction ?? '');
    if (!selector || !direction) continue; // missing-field checks cover these
    const seen = bySelector.get(selector);
    if (seen && seen.direction !== direction) {
      out.push({
        severity: 'error',
        message: `Inconsistent cyclic directions for selector "${selector}" (${seen.direction} vs ${direction}) — the layout engine rejects this spec.`,
        itemId: item.id,
        fieldKey: 'direction',
        source: 'structure',
      });
    } else if (!seen) {
      bySelector.set(selector, { direction, itemId: item.id });
    }
  }
  return out;
}

/**
 * Run structural validation across a whole document. When a `domain` is
 * supplied, WP2's domain warnings are appended after the structural
 * diagnostics.
 */
export function validateState(
  state: SpecDocumentState,
  domain?: DomainSchema,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const item of state.constraints) {
    out.push(...validateItem(item));
  }
  for (const item of state.directives) {
    out.push(...validateItem(item));
  }
  out.push(...validateCyclicConsistency(state.constraints));
  if (domain) {
    out.push(...validateAgainstDomain(state, domain));
  }
  return out;
}
