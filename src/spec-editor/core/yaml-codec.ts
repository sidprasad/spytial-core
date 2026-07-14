/**
 * YAML codec for the Spytial spec editor.
 *
 * Responsibilities:
 *  - Parse a CnD layout-spec YAML string into a `SpecDocumentState` (the model).
 *  - Serialize a `SpecDocumentState` back to deterministic YAML.
 *  - Preserve, across a round trip:
 *      * per-item comments (preceding `#` lines and/or an inline comment on the
 *        item's first line) → `SpecItem.comment`, re-emitted as a preceding
 *        comment line;
 *      * a header comment block before the first section → `headerComment`;
 *      * unknown constraint/directive types → `SpecItem.raw`, re-emitted from the
 *        parsed node (semantic, not byte-for-byte).
 *
 * Structural parsing/emission uses js-yaml (already a dependency). js-yaml drops
 * comments, so we layer a light line-scan over the raw text to recover them and
 * associate each with the item it precedes.
 *
 * This module is framework-agnostic — no React.
 */

import jsyaml from 'js-yaml';

import {
  getDefinition,
  getDefinitionsForYamlKey,
  isKnownYamlKey,
} from './registry';
import type { SpecDocumentState, SpecItem } from './types';
import { newId } from './id';

/** Thrown by `parseYamlToState` (and `SpecDocument.fromYaml`) on invalid YAML. */
export class SpecParseError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = 'SpecParseError';
    this.line = line;
    this.column = column;
    // Restore prototype chain for instanceof across transpilation targets.
    Object.setPrototypeOf(this, SpecParseError.prototype);
  }
}

// ---- helpers -------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalize a YAML section (array, or single-key map fallback) to an array. */
function normalizeSection(section: unknown): unknown[] {
  if (Array.isArray(section)) {
    return section;
  }
  if (isRecord(section)) {
    return Object.entries(section).map(([key, value]) => ({ [key]: value }));
  }
  return [];
}

/** Extract the `type` key of a single-entry node, e.g. `{ orientation: {...} }`. */
function nodeType(node: unknown): string | undefined {
  if (typeof node === 'string') {
    // bare scalar with no key — not a typed node
    return undefined;
  }
  if (!isRecord(node)) {
    return undefined;
  }
  const keys = Object.keys(node);
  return keys.length > 0 ? keys[0] : undefined;
}

// ---- comment scanning ----------------------------------------------------

/**
 * Scan the raw YAML for comments inside a section, associating each accumulated
 * comment block (and/or inline trailing comment) with the item it precedes.
 * Returns a map of zero-based item index within the section → comment text.
 *
 * An "item" starts at a line whose trimmed text begins with `- ` (a sequence
 * entry). Preceding `#` lines accumulate into that item's comment; an inline
 * `#` on the item's own first line is appended too.
 */
function scanSectionComments(yamlStr: string, sectionName: string): Map<number, string> {
  const perItem = new Map<number, string>();
  const lines = yamlStr.split('\n');
  let inSection = false;
  let pending = '';
  let itemIndex = -1;

  const flushInto = (idx: number): void => {
    if (pending) {
      perItem.set(idx, pending);
      pending = '';
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inSection) {
      if (trimmed === `${sectionName}:`) {
        inSection = true;
      }
      continue;
    }

    // Leaving the section on a new unindented top-level key (not a list item,
    // not a comment, not blank).
    if (
      trimmed.length > 0 &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('-') &&
      /^[A-Za-z_]/.test(line) && // unindented
      trimmed.endsWith(':')
    ) {
      break;
    }

    if (trimmed.startsWith('#')) {
      const text = trimmed.slice(1).trim();
      // Join consecutive comment lines with `\n` (not a space) so a multi-line
      // item comment re-emits as one `#` line per line — matching how
      // scanHeaderComment and the emitter treat multi-line comments. (Joining
      // with a space silently merged the lines on the round trip.)
      pending = pending ? `${pending}\n${text}` : text;
      continue;
    }

    if (trimmed.startsWith('-')) {
      itemIndex += 1;
      flushInto(itemIndex);
      // inline trailing comment on the item's first line
      const inline = extractInlineComment(line);
      if (inline) {
        const prev = perItem.get(itemIndex);
        // `\n` join keeps each source comment line a distinct `#` line on
        // re-emit, consistent with the preceding-comment join above.
        perItem.set(itemIndex, prev ? `${prev}\n${inline}` : inline);
      }
    }
  }

  return perItem;
}

/**
 * Best-effort extraction of an inline `# comment` from a line, ignoring `#`
 * that appears inside a quoted scalar. Returns the comment text without the
 * leading `#`, or undefined if none.
 *
 * YAML quoting is position-sensitive: a `'`/`"` only *opens* a quoted scalar at
 * a value-start position (line start, or after `:`, `,`, `[`, `{` and optional
 * whitespace). A bare `'`/`"` inside a *plain* scalar (e.g. `toTag: quote '
 * inside`) is just a character and must not toggle quote state — otherwise a
 * later `#` inside a genuinely quoted sibling value (`name: 'a: b # c'`) would
 * be mistaken for a comment. Single-quoted strings escape a quote as `''`;
 * double-quoted strings escape as `\"`.
 */
function extractInlineComment(line: string): string | undefined {
  let i = 0;
  // Tracks whether the next non-space char is in value-start position (so a
  // quote there opens a quoted scalar). True at line start and right after a
  // structural `:`, `,`, `[`, `{`.
  let valueStart = true;

  while (i < line.length) {
    const ch = line[i];

    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }

    if ((ch === "'" || ch === '"') && valueStart) {
      // Consume the quoted scalar so any `#` inside it is ignored.
      i = skipQuotedScalar(line, i, ch);
      valueStart = false;
      continue;
    }

    if (ch === '#') {
      // A comment must be preceded by whitespace (or be at line start). Inside a
      // plain scalar (valueStart === false and no preceding space) a `#` is a
      // literal character, not a comment.
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(i + 1).trim();
      }
      i += 1;
      continue;
    }

    // Structural characters reset to a value-start position; everything else is
    // part of a plain scalar (so embedded quotes don't open a string).
    valueStart = ch === ':' || ch === ',' || ch === '[' || ch === '{';
    i += 1;
  }
  return undefined;
}

/**
 * Given that `line[start]` is an opening quote `quote` (`'` or `"`), return the
 * index just past the closing quote (or end of line if unterminated). Honors
 * YAML escaping: `''` inside single quotes, `\"`/`\\` inside double quotes.
 */
function skipQuotedScalar(line: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") {
        if (line[i + 1] === "'") {
          i += 2; // escaped quote ''
          continue;
        }
        return i + 1; // closing quote
      }
    } else {
      if (ch === '\\') {
        i += 2; // skip escaped char
        continue;
      }
      if (ch === '"') {
        return i + 1; // closing quote
      }
    }
    i += 1;
  }
  return i; // unterminated; treat rest of line as the scalar
}

/**
 * Extract the header comment: leading `#`/blank lines before the first
 * top-level key (`constraints:` / `directives:` / any key). Returns the joined
 * comment text, or undefined.
 */
function scanHeaderComment(yamlStr: string): string | undefined {
  const lines = yamlStr.split('\n');
  const parts: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed.startsWith('#')) {
      parts.push(trimmed.slice(1).trim());
      continue;
    }
    // First non-comment, non-blank line ends the header.
    break;
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

// ---- ingestion -----------------------------------------------------------

/** Convert one parsed YAML node into a SpecItem of the given kind. */
function nodeToItem(node: unknown, kind: SpecItem['kind']): SpecItem | null {
  // `node` is a single-key mapping, e.g. `{ orientation: {...} }` or the scalar
  // form `{ flag: 'x' }`. `yamlKey` is that key (e.g. `group`), which may map to
  // multiple registry types (groupselector/groupfield).
  const yamlKey = nodeType(node);
  if (yamlKey === undefined) {
    return null;
  }

  if (!isKnownYamlKey(yamlKey)) {
    // Unknown key: preserve verbatim via `raw`, re-emitted as-is on serialize.
    return { id: newId(), kind, type: yamlKey, params: {}, raw: node };
  }

  const candidates = getDefinitionsForYamlKey(yamlKey);

  // Try each candidate's custom ingestion (fromYamlNode) in registry order; the
  // first that accepts wins. This disambiguates `group` into groupselector vs
  // groupfield.
  for (const def of candidates) {
    if (!def.fromYamlNode) {
      continue;
    }
    const params = def.fromYamlNode(node);
    if (params !== null) {
      return { id: newId(), kind, type: def.type, params };
    }
  }

  // No custom ingestion accepted. Fall back to default ingestion against the
  // first candidate that has no fromYamlNode (the common single-type case).
  const plain = candidates.find((d) => !d.fromYamlNode);
  if (plain) {
    const body = (node as Record<string, unknown>)[yamlKey];
    const params = isRecord(body) ? { ...body } : {};
    return { id: newId(), kind, type: plain.type, params };
  }

  // Every candidate had a fromYamlNode and all rejected the shape — keep the
  // node verbatim so nothing is lost. Tag it with the first candidate's type.
  const fallbackType = candidates[0]?.type ?? yamlKey;
  return { id: newId(), kind, type: fallbackType, params: {}, raw: node };
}

/** Parse a CnD layout-spec YAML string into a SpecDocumentState. */
export function parseYamlToState(yamlStr: string): SpecDocumentState {
  let parsed: unknown;
  try {
    parsed = yamlStr.trim() === '' ? {} : jsyaml.load(yamlStr);
  } catch (error) {
    if (error instanceof jsyaml.YAMLException) {
      const line = error.mark?.line !== undefined ? error.mark.line + 1 : undefined;
      const column = error.mark?.column !== undefined ? error.mark.column + 1 : undefined;
      throw new SpecParseError(error.reason || error.message, line, column);
    }
    throw new SpecParseError((error as Error).message);
  }

  const root = isRecord(parsed) ? parsed : {};
  const constraintNodes = normalizeSection(root.constraints);
  const directiveNodes = normalizeSection(root.directives);

  const constraintComments = scanSectionComments(yamlStr, 'constraints');
  const directiveComments = scanSectionComments(yamlStr, 'directives');

  const constraints: SpecItem[] = [];
  constraintNodes.forEach((node, index) => {
    const item = nodeToItem(node, 'constraint');
    if (!item) {
      return;
    }
    const comment = constraintComments.get(index);
    if (comment) {
      item.comment = comment;
    }
    constraints.push(item);
  });

  const directives: SpecItem[] = [];
  directiveNodes.forEach((node, index) => {
    const item = nodeToItem(node, 'directive');
    if (!item) {
      return;
    }
    const comment = directiveComments.get(index);
    if (comment) {
      item.comment = comment;
    }
    directives.push(item);
  });

  const state: SpecDocumentState = { constraints, directives };
  const headerComment = scanHeaderComment(yamlStr);
  if (headerComment) {
    state.headerComment = headerComment;
  }
  return state;
}

// ---- emission ------------------------------------------------------------

/** A plain object (a nested block) — not an array or primitive. */
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Sanitize params for emission: drop `undefined`, and recursively drop empty
 * nested blocks. Recursion keeps nested style blocks (lineStyle / textStyle / …)
 * sparse — an added-but-empty block, or one whose only leaves were cleared, is
 * omitted rather than emitted as `{}` or `key: null`.
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (isPlainRecord(value)) {
      const nested = sanitizeParams(value);
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Build the YAML node for a single item (used for both serialize and diffing). */
function itemToYamlNode(item: SpecItem): unknown {
  if (item.raw !== undefined) {
    return item.raw;
  }
  const def = getDefinition(item.type);
  if (def?.toYamlNode) {
    return def.toYamlNode(item.params);
  }
  return { [item.type]: sanitizeParams(item.params) };
}

/**
 * Characters allowed in a flag value emitted verbatim as `- flag: <value>`.
 * This keeps YAML-significant characters (`:`, `#`, newlines, quotes,
 * leading `- `, …) out of the bare path.
 */
const SAFE_PLAIN_FLAG = /^[A-Za-z0-9_.-]+$/;

/**
 * Whether a flag value can be emitted as a bare `- flag: value` scalar. Besides
 * containing no YAML-significant characters, the value must round-trip through
 * js-yaml as the *identical string* — this rejects values like `123`, `yes`,
 * `null`, or `.inf` that match the character pattern but would parse back as a
 * number/boolean/null (silently dropping the flag, since ingestion requires a
 * string). Anything that fails falls through to the generic, correctly-quoted
 * dump path.
 */
function isBarePlainFlag(value: string): boolean {
  if (!SAFE_PLAIN_FLAG.test(value)) {
    return false;
  }
  try {
    return jsyaml.load(value) === value;
  } catch {
    return false;
  }
}

/** Emit one item node as indented YAML lines (without leading comment). */
function emitItemLines(item: SpecItem): string[] {
  const node = itemToYamlNode(item);

  // Flag scalar special case: `- flag: value` rather than a flow map. Only take
  // the bare-scalar fast path for values that need no quoting AND that re-parse
  // as the same string; anything else falls through to the generic dump so the
  // value is escaped/quoted correctly.
  if (
    item.type === 'flag' &&
    isRecord(node) &&
    typeof node.flag === 'string' &&
    isBarePlainFlag(node.flag)
  ) {
    return [`  - flag: ${node.flag}`];
  }

  // Default: dump the single-element sequence in flow style and re-indent.
  const dumped = jsyaml
    .dump([node], { flowLevel: 2, lineWidth: -1, sortKeys: false })
    .trimEnd();
  return dumped.split('\n').map((line) => `  ${line}`);
}

/**
 * Emit a comment block (possibly multi-line) as indented `#` lines. Each line is
 * trimmed and blank lines dropped so emission is stable across a round trip
 * (the parser trims comment text on the way in).
 */
function emitCommentLines(comment: string): string[] {
  return comment
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `  # ${line}`);
}

/** Serialize a SpecDocumentState to deterministic, comment-preserving YAML. */
export function serializeStateToYaml(state: SpecDocumentState): string {
  const lines: string[] = [];

  if (state.headerComment) {
    const headerLines = state.headerComment
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of headerLines) {
      lines.push(`# ${line}`);
    }
    if (headerLines.length > 0) {
      lines.push('');
    }
  }

  if (state.constraints.length > 0) {
    lines.push('constraints:');
    for (const item of state.constraints) {
      if (item.comment) {
        lines.push(...emitCommentLines(item.comment));
      }
      lines.push(...emitItemLines(item));
    }
  }

  if (state.directives.length > 0) {
    if (state.constraints.length > 0) {
      lines.push(''); // blank line between sections
    }
    lines.push('directives:');
    for (const item of state.directives) {
      if (item.comment) {
        lines.push(...emitCommentLines(item.comment));
      }
      lines.push(...emitItemLines(item));
    }
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}
