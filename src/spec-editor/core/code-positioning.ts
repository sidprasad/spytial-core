/**
 * Position resolution for code-view diagnostics.
 *
 * Structural diagnostics ({@link Diagnostic}) are anchored to a `SpecItem`
 * (`itemId`) and optionally a field (`fieldKey`) — not to a text location. To
 * draw an editor squiggle under the offending token, the code view needs a
 * character range. This module re-parses the code-view YAML with a
 * position-aware parser (`yaml`, a.k.a. eemeli/yaml, whose nodes expose a source
 * `range`) and walks `(itemId → section+index, fieldKey)` to the matching key
 * node, recording its `[from, to]` offsets.
 *
 * The authoritative model still parses through `parseYamlToState` (js-yaml);
 * this is a *second*, read-only parse used only to locate tokens for the editor.
 * The two agree on structure/order for any YAML that parses, which is the only
 * case where structural diagnostics exist.
 *
 * Framework-agnostic — no React, no CodeMirror. The returned offsets are what a
 * CodeMirror lint source (or any editor) needs.
 */

import { parseDocument, isMap, isScalar, isSeq } from 'yaml';
import type { Diagnostic, SpecDocumentState } from './types';
import { parseYamlToState, SpecParseError } from './yaml-codec';
import { validateState } from './diagnostics';
import type { DomainSchema } from '../domain/domain-schema';

/**
 * A diagnostic annotated with a character range into the code-view text, when
 * one could be resolved. `from`/`to` are absent for diagnostics that couldn't be
 * located (an editor squiggles the ones with a range and may still list the
 * rest).
 */
export interface PositionedDiagnostic extends Diagnostic {
  /** inclusive start offset into the YAML text. */
  from?: number;
  /** exclusive end offset into the YAML text. */
  to?: number;
}

type Section = 'constraints' | 'directives';
type Loc = { section: Section; index: number };

/** offsets[i] = char offset at which (0-based) line i starts. */
function lineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

/** Convert a 1-based line/column (our `Diagnostic` convention) to an offset. */
function lineColToOffset(line: number, column: number, starts: number[], len: number): number {
  const li = Math.min(Math.max(line - 1, 0), starts.length - 1);
  return Math.min(starts[li] + Math.max(column - 1, 0), len);
}

/** Range of the first key of a single-entry item map, e.g. the `icon` in `{icon: …}`. */
function itemTypeKeyRange(itemNode: unknown): [number, number] | null {
  if (isMap(itemNode) && itemNode.items.length > 0) {
    const key = itemNode.items[0].key;
    if (isScalar(key) && key.range) return [key.range[0], key.range[1]];
  }
  return null;
}

/**
 * Find the range of the key `key` within `node`, preferring a direct child over
 * a nested one (so `color` resolves to the item's own `color` before any
 * `lineStyle.color`). Returns the key scalar's `[from, to]`.
 */
function findKeyRange(node: unknown, key: string): [number, number] | null {
  if (isMap(node)) {
    for (const pair of node.items) {
      if (isScalar(pair.key) && String(pair.key.value) === key && pair.key.range) {
        return [pair.key.range[0], pair.key.range[1]];
      }
    }
    for (const pair of node.items) {
      const nested = findKeyRange(pair.value, key);
      if (nested) return nested;
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      const nested = findKeyRange(item, key);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Find the range of a key reached by a dotted `path` (`['fillStyle', 'width']`),
 * descending into each segment's value. A single-segment path is an unqualified
 * key → {@link findKeyRange}'s recursive search. A parent-qualified path lets a
 * nested unknown key resolve to the exact token *in its own block*, not a
 * same-named key in a sibling block (e.g. `fillStyle.width` vs `borderStyle.width`).
 */
function findKeyByPath(node: unknown, path: string[]): [number, number] | null {
  if (path.length === 0) return null;
  if (path.length === 1) return findKeyRange(node, path[0]);
  const [head, ...rest] = path;
  if (isMap(node)) {
    for (const pair of node.items) {
      if (isScalar(pair.key) && String(pair.key.value) === head) {
        const found = findKeyByPath(pair.value, rest);
        if (found) return found;
      }
    }
    // `head` isn't at this level — an item wraps its body under a type key, so
    // descend one level with the full path.
    for (const pair of node.items) {
      const found = findKeyByPath(pair.value, path);
      if (found) return found;
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      const found = findKeyByPath(item, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolve a `[from, to]` range for one diagnostic, or null if it can't be
 * located. Order of preference: the specific field key, then the item's type
 * key, then a line/column already on the diagnostic.
 */
function resolveRange(
  d: Diagnostic,
  locById: Map<string, Loc>,
  doc: ReturnType<typeof parseDocument> | null,
  starts: number[],
  len: number,
): [number, number] | null {
  if (d.itemId && doc) {
    const loc = locById.get(d.itemId);
    if (loc) {
      const seq = doc.get(loc.section);
      if (isSeq(seq)) {
        const itemNode = seq.items[loc.index];
        if (itemNode !== undefined) {
          if (d.fieldKey) {
            const fieldRange = findKeyByPath(itemNode, d.fieldKey.split('.'));
            if (fieldRange) return fieldRange;
          }
          const typeRange = itemTypeKeyRange(itemNode);
          if (typeRange) return typeRange;
        }
      }
    }
  }

  if (d.line !== undefined) {
    const from = lineColToOffset(d.line, d.column ?? 1, starts, len);
    // A short, visible marker: to end of the token/line start region.
    return [from, Math.min(from + 1, len)];
  }

  return null;
}

/**
 * Annotate diagnostics with `[from, to]` character ranges against `yamlText`.
 * Every input diagnostic is returned in order; those that resolve to a token
 * gain `from`/`to`, the rest are passed through unchanged (an editor squiggles
 * the located ones and can still list the others).
 */
export function positionDiagnostics(
  yamlText: string,
  state: SpecDocumentState,
  diagnostics: readonly Diagnostic[],
): PositionedDiagnostic[] {
  const locById = new Map<string, Loc>();
  state.constraints.forEach((it, i) => locById.set(it.id, { section: 'constraints', index: i }));
  state.directives.forEach((it, i) => locById.set(it.id, { section: 'directives', index: i }));

  let doc: ReturnType<typeof parseDocument> | null = null;
  try {
    doc = parseDocument(yamlText);
  } catch {
    doc = null;
  }

  const starts = lineStartOffsets(yamlText);
  const len = yamlText.length;

  return diagnostics.map((d) => {
    const range = resolveRange(d, locById, doc, starts, len);
    if (!range) return { ...d };
    // Clamp defensively so an editor never gets an out-of-bounds range.
    const from = Math.max(0, Math.min(range[0], len));
    const to = Math.max(from, Math.min(range[1], len));
    return { ...d, from, to };
  });
}

/**
 * Lint a YAML string for the code editor: parse it, validate the result, and
 * resolve each diagnostic to a character range — all from the SAME text, so the
 * diagnostics' item ids always match the state used to position them.
 *
 * This is deliberately self-contained rather than reusing the editor's debounced
 * model: the code view must reflect the diagnostics of the text as typed, and
 * item ids are regenerated on every parse (so a diagnostic computed against one
 * parse can't be positioned against a later one). On a syntax error it returns a
 * single positioned error; otherwise the structural (+ domain) warnings/errors.
 */
export function lintYaml(yamlText: string, domain?: DomainSchema): PositionedDiagnostic[] {
  if (yamlText.trim() === '') return [];

  let state: SpecDocumentState;
  try {
    state = parseYamlToState(yamlText);
  } catch (error) {
    const err = error as SpecParseError;
    const diag: Diagnostic = {
      severity: 'error',
      code: 'yaml-syntax',
      source: 'yaml',
      message: `YAML syntax error: ${err.message}`,
      ...(err.line !== undefined ? { line: err.line } : {}),
      ...(err.column !== undefined ? { column: err.column } : {}),
    };
    return positionDiagnostics(yamlText, { constraints: [], directives: [] }, [diag]);
  }

  const diagnostics = validateState(state, domain).filter(
    (d) => d.severity === 'error' || d.severity === 'warning',
  );
  return positionDiagnostics(yamlText, state, diagnostics);
}
