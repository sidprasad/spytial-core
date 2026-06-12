/**
 * Domain validation for the Spytial spec editor (WP2).
 *
 * Given a `SpecDocumentState` and a `DomainSchema`, this layers domain-aware
 * diagnostics on top of the structural ones from `core/diagnostics.ts`:
 *
 *  - `relationName` fields whose value is not a known relation → warning.
 *  - `typeName` fields whose value is not a known type → warning.
 *  - `selector` fields: identifiers in the expression that match no domain
 *    type, relation, or atom → warning (per identifier).
 *
 * ALL domain diagnostics are WARNINGS: a spec may legitimately reference names
 * absent from the *current* instance (the same spec is reused across instances),
 * so a domain miss must never block editing.
 *
 * Identifier extraction (the conservative heuristic):
 *  The CnD selector language is the Forge/Alloy relational-expression sublanguage
 *  (see `completions.ts`). A full parse would require the `simple-graph-query`
 *  ANTLR parser *and* a live instance; that is overkill for a lint and unsuitable
 *  here (validation runs without an evaluator). Instead we tokenize defensively:
 *    1. Strip quoted strings and `//`/`--`/`#` comments.
 *    2. Pull identifier tokens (`[A-Za-z_][A-Za-z0-9_/]*`).
 *    3. Drop: language keywords, built-in values (univ/iden/none/Int/…),
 *       pure-numeric tokens, and quantifier/let-bound variables.
 *    4. Flag the survivors that match NO domain name.
 *  This errs toward NOT flagging (false negatives over false positives): anything
 *  the tokenizer is unsure about is left alone. Known limitations are documented
 *  on `extractSelectorIdentifiers`.
 *
 * This module is framework-agnostic — no React.
 */

import { getDefinition } from '../core/registry';
import type {
  Diagnostic,
  SpecDocumentState,
  SpecItem,
  FieldSpec,
} from '../core/types';
import type { DomainSchema } from './domain-schema';

// ---- selector lexical tables (mirror completions.ts / the Forge lexer) ----

/**
 * Reserved words of the selector language that are never domain identifiers.
 * Superset of the expression-level Forge keywords plus the built-in values, so
 * the extractor never flags a keyword as an unknown name. Erring large here is
 * safe: an over-broad reserved set only causes false negatives (under-flagging).
 */
const SELECTOR_RESERVED: ReadonlySet<string> = new Set([
  // built-in values / constants
  'univ',
  'iden',
  'none',
  'Int',
  'seq/Int',
  'String',
  'this',
  'true',
  'false',
  // quantifiers / multiplicities
  'all',
  'some',
  'no',
  'one',
  'lone',
  'set',
  'sum',
  'let',
  'disj',
  'two',
  // word-form logical / comparison operators
  'in',
  'and',
  'or',
  'not',
  'implies',
  'iff',
  'else',
  'ni',
]);

/**
 * Keywords that introduce bound variables: `all x, y : S | ...`, `some v : ...`,
 * `let a = expr | ...`. Variable names declared by these must not be flagged.
 */
const BINDER_KEYWORDS: ReadonlySet<string> = new Set([
  'all',
  'some',
  'no',
  'one',
  'lone',
  'set',
  'sum',
  'let',
  'disj',
]);

const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_/]*/g;
const PURE_NUMBER_RE = /^-?\d+$/;

/**
 * Strip string literals and line comments so their contents never produce
 * identifier tokens. Replaces removed spans with spaces to preserve offsets
 * loosely (offsets are not surfaced for selector diagnostics, but keeping the
 * shape avoids accidental token-merging across a removed span).
 */
function stripStringsAndComments(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];

    // line comments: // ... , -- ...
    // (NOTE: `#` is the cardinality operator in the selector language, NOT a
    // comment, so it must not start a comment here.)
    if (
      (ch === '/' && input[i + 1] === '/') ||
      (ch === '-' && input[i + 1] === '-')
    ) {
      while (i < n && input[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }

    // quoted strings: '...' or "..." (no escape handling needed for a lint)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ' ';
      i += 1;
      while (i < n && input[i] !== quote) {
        out += ' ';
        i += 1;
      }
      if (i < n) {
        out += ' '; // closing quote
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Collect identifier names bound by quantifiers / `let`. Conservative: for each
 * binder keyword we capture identifiers appearing before the next `:`, `|`, or
 * `=` delimiter (the variable list of a quantifier decl, or the LHS of a `let`).
 * Names that happen to be domain types used as a quantifier *domain* (after the
 * `:`) are intentionally left out of the bound set — they SHOULD validate.
 */
function collectBoundVariables(tokens: ReadonlyArray<Token>): Set<string> {
  const bound = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.kind !== 'word' || !BINDER_KEYWORDS.has(t.value)) {
      continue;
    }
    // Walk forward collecting identifier words until a decl delimiter.
    for (let j = i + 1; j < tokens.length; j += 1) {
      const u = tokens[j];
      if (u.kind === 'delim' && (u.value === ':' || u.value === '|' || u.value === '=')) {
        break;
      }
      if (u.kind === 'word' && !SELECTOR_RESERVED.has(u.value)) {
        bound.add(u.value);
      }
    }
  }
  return bound;
}

interface Token {
  kind: 'word' | 'delim' | 'other';
  value: string;
}

/**
 * Tokenize into words (identifiers/keywords) and the decl delimiters we care
 * about (`:`, `|`, `=`). Everything else is collapsed to `other`.
 */
function tokenize(input: string): Token[] {
  const cleaned = stripStringsAndComments(input);
  const tokens: Token[] = [];
  let i = 0;
  const n = cleaned.length;
  while (i < n) {
    const ch = cleaned[i];
    if (/[A-Za-z_]/.test(ch)) {
      IDENTIFIER_RE.lastIndex = i;
      const m = IDENTIFIER_RE.exec(cleaned);
      if (m && m.index === i) {
        tokens.push({ kind: 'word', value: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if (ch === ':' || ch === '|' || ch === '=') {
      tokens.push({ kind: 'delim', value: ch });
      i += 1;
      continue;
    }
    tokens.push({ kind: 'other', value: ch });
    i += 1;
  }
  return tokens;
}

/**
 * Extract candidate domain identifiers from a selector expression: the
 * identifier tokens that are NOT reserved words, NOT pure numbers, and NOT
 * quantifier/let-bound variables.
 *
 * Returned in first-occurrence order, de-duplicated.
 *
 * Known limitations (intentional, biased toward NOT flagging):
 *  - No scoping: a bound variable shadowing a real name suppresses flagging of
 *    that name for the whole expression. Acceptable for a soft lint.
 *  - `let` RHS / quantifier domains are still validated (they reference real
 *    names), but a binder whose decl omits a `:`/`|`/`=` (malformed) may
 *    over-collect names as "bound" — again only causing under-flagging.
 *  - Qualified names like `seq/Int` are treated as single tokens; only the
 *    fully-qualified form is checked against the domain.
 */
export function extractSelectorIdentifiers(selector: string): string[] {
  if (typeof selector !== 'string' || selector.trim().length === 0) {
    return [];
  }
  const tokens = tokenize(selector);
  const bound = collectBoundVariables(tokens);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (t.kind !== 'word') {
      continue;
    }
    const name = t.value;
    if (SELECTOR_RESERVED.has(name)) {
      continue;
    }
    if (PURE_NUMBER_RE.test(name)) {
      continue;
    }
    if (bound.has(name)) {
      continue;
    }
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

// ---- domain name index ---------------------------------------------------

interface DomainIndex {
  types: ReadonlySet<string>;
  relations: ReadonlySet<string>;
  atoms: ReadonlySet<string>;
}

function buildIndex(domain: DomainSchema): DomainIndex {
  const types = new Set<string>();
  const relations = new Set<string>();
  const atoms = new Set<string>();
  for (const type of domain.types) {
    types.add(type.name);
    for (const atom of type.atoms) {
      atoms.add(atom);
    }
  }
  for (const rel of domain.relations) {
    relations.add(rel.name);
  }
  return { types, relations, atoms };
}

function isKnownName(index: DomainIndex, name: string): boolean {
  return (
    index.types.has(name) ||
    index.relations.has(name) ||
    index.atoms.has(name)
  );
}

function warn(
  message: string,
  itemId: string,
  fieldKey?: string,
): Diagnostic {
  const d: Diagnostic = {
    severity: 'warning',
    message,
    itemId,
    source: 'domain',
  };
  if (fieldKey !== undefined) {
    d.fieldKey = fieldKey;
  }
  return d;
}

// ---- per-item / per-field validation -------------------------------------

function fieldStringValue(item: SpecItem, field: FieldSpec): string | undefined {
  const raw = item.params[field.key];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function validateItemAgainstDomain(
  item: SpecItem,
  index: DomainIndex,
): Diagnostic[] {
  // Unknown/raw items have no editable fields to check.
  const def = getDefinition(item.type);
  if (!def) {
    return [];
  }

  const out: Diagnostic[] = [];
  for (const field of def.fields) {
    if (field.kind === 'relationName') {
      const value = fieldStringValue(item, field);
      if (value !== undefined && !index.relations.has(value)) {
        out.push(
          warn(
            `Relation "${value}" is not in this instance.`,
            item.id,
            field.key,
          ),
        );
      }
    } else if (field.kind === 'typeName') {
      const value = fieldStringValue(item, field);
      if (value !== undefined && !index.types.has(value)) {
        out.push(
          warn(
            `Type "${value}" is not in this instance.`,
            item.id,
            field.key,
          ),
        );
      }
    } else if (field.kind === 'selector') {
      const value = fieldStringValue(item, field);
      if (value !== undefined) {
        for (const ident of extractSelectorIdentifiers(value)) {
          if (!isKnownName(index, ident)) {
            out.push(
              warn(
                `"${ident}" is not a type, relation, or atom in this instance.`,
                item.id,
                field.key,
              ),
            );
          }
        }
      }
    }
  }
  return out;
}

/**
 * Validate a whole document against a domain schema. Returns only the
 * domain-source warnings; structural diagnostics are produced separately by
 * `core/diagnostics.validateState`. Both lists are concatenated by
 * `SpecDocument.validate(domain)`.
 */
export function validateAgainstDomain(
  state: SpecDocumentState,
  domain: DomainSchema,
): Diagnostic[] {
  const index = buildIndex(domain);
  const out: Diagnostic[] = [];
  for (const item of state.constraints) {
    out.push(...validateItemAgainstDomain(item, index));
  }
  for (const item of state.directives) {
    out.push(...validateItemAgainstDomain(item, index));
  }
  return out;
}
