/**
 * Tokenizer for CnD selector expressions, used by {@link SelectorField}'s
 * highlight overlay.
 *
 * CnD selectors are Alloy/Forge-relational expressions evaluated by
 * `simple-graph-query` (joins, set ops, quantifiers, the `univ`/`none`/`iden`
 * constants, etc.). The token classes mirror the old highlighter at
 * `src/components/NoCodeView/Selectors/SelectorInput.tsx` (`highlightSelector`)
 * and the keyword/operator set accepted by the Forge grammar bundled with
 * `simple-graph-query`.
 *
 * Tokens carry source offsets so the overlay can rebuild the exact text. The
 * tokenizer never drops characters: concatenating `tokens[i].text` reproduces
 * the input verbatim, which is what keeps the mirror overlay aligned with the
 * textarea. Rendering maps each {@link TokenKind} to a span class colored by a
 * `--spytial-ed-syn-*` variable; the overlay builds those spans via React, so
 * user text is never interpolated into `innerHTML`.
 */

export type TokenKind =
  | 'keyword'
  | 'operator'
  | 'string'
  | 'number'
  | 'identifier'
  | 'comment'
  | 'whitespace'
  | 'punctuation';

export interface Token {
  kind: TokenKind;
  text: string;
  /** inclusive start offset into the source string */
  start: number;
  /** exclusive end offset into the source string */
  end: number;
}

/**
 * Selector-language keywords (quantifiers, logical ops, relational constants).
 * Derived from the Forge grammar accepted by `simple-graph-query` plus the
 * wildcard/constant set the old highlighter recognised (`univ`/`none`/`iden`).
 */
const KEYWORDS = new Set<string>([
  // relational constants / wildcards
  'univ',
  'none',
  'iden',
  // quantifiers + multiplicities
  'all',
  'some',
  'no',
  'one',
  'lone',
  'set',
  'sum',
  'let',
  'disj',
  'count',
  // logical connectives
  'and',
  'or',
  'not',
  'implies',
  'else',
  'in',
]);

/**
 * Multi-character operators, longest first so the matcher is greedy
 * (e.g. `->` before `-`, `<:`/`:>` before `<`/`>`/`:`).
 */
const MULTI_CHAR_OPERATORS = ['->', '<:', ':>', '<=', '>=', '=<', '=>', '!='];

/** Single-character relational / set operators. */
const SINGLE_CHAR_OPERATORS = new Set<string>([
  '+',
  '-',
  '&',
  '~',
  '*',
  '^',
  '.',
  '<',
  '>',
  '=',
  '!',
  '#',
]);

/** Grouping punctuation, kept distinct so it can be styled neutrally. */
const PUNCTUATION = new Set<string>(['(', ')', '[', ']', '{', '}', ',', ':', ';']);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_CONTINUE = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

/**
 * Tokenizes a CnD selector expression into a flat, gap-free token list.
 *
 * Guarantees:
 * - Concatenating `tokens[i].text` reproduces `input` exactly.
 * - Offsets are monotonic and non-overlapping (`tokens[i].end === tokens[i+1].start`).
 * - Never throws; unrecognised characters become single-char `punctuation`
 *   tokens rather than being dropped.
 */
export function tokenizeSelector(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  const push = (kind: TokenKind, start: number, end: number): void => {
    tokens.push({ kind, text: input.slice(start, end), start, end });
  };

  while (i < n) {
    const ch = input[i];

    // Whitespace run.
    if (WHITESPACE.test(ch)) {
      const start = i;
      while (i < n && WHITESPACE.test(input[i])) i++;
      push('whitespace', start, i);
      continue;
    }

    // Line comment: `--` (Alloy) or `//`, to end of line.
    if (
      (ch === '-' && input[i + 1] === '-') ||
      (ch === '/' && input[i + 1] === '/')
    ) {
      const start = i;
      i += 2;
      while (i < n && input[i] !== '\n') i++;
      push('comment', start, i);
      continue;
    }

    // String literal (single or double quoted). Honors backslash escapes;
    // an unterminated string runs to end-of-line so the rest of the line is
    // not mis-highlighted.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < n && input[i] !== quote && input[i] !== '\n') {
        if (input[i] === '\\' && i + 1 < n) i += 2;
        else i++;
      }
      if (i < n && input[i] === quote) i++; // closing quote
      push('string', start, i);
      continue;
    }

    // Number (integer or decimal).
    if (DIGIT.test(ch)) {
      const start = i;
      while (i < n && DIGIT.test(input[i])) i++;
      if (i < n && input[i] === '.' && i + 1 < n && DIGIT.test(input[i + 1])) {
        i++; // dot
        while (i < n && DIGIT.test(input[i])) i++;
      }
      push('number', start, i);
      continue;
    }

    // Identifier or keyword.
    if (IDENT_START.test(ch)) {
      const start = i;
      i++;
      while (i < n && IDENT_CONTINUE.test(input[i])) i++;
      const word = input.slice(start, i);
      push(KEYWORDS.has(word) ? 'keyword' : 'identifier', start, i);
      continue;
    }

    // Multi-character operators (greedy, longest first).
    const two = input.slice(i, i + 2);
    if (MULTI_CHAR_OPERATORS.includes(two)) {
      push('operator', i, i + 2);
      i += 2;
      continue;
    }

    // Single-character operators.
    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      push('operator', i, i + 1);
      i++;
      continue;
    }

    // Grouping punctuation and anything else: one char, never dropped.
    push('punctuation', i, i + 1);
    i++;
  }

  return tokens;
}

/**
 * Maps a token kind to the `spytial-ed-syn-*` span class used by the overlay.
 * Whitespace and neutral punctuation get no class (rendered as plain text).
 */
export function tokenClassName(kind: TokenKind): string | undefined {
  switch (kind) {
    case 'keyword':
      return 'spytial-ed-syn-keyword';
    case 'operator':
      return 'spytial-ed-syn-operator';
    case 'string':
      return 'spytial-ed-syn-string';
    case 'number':
      return 'spytial-ed-syn-number';
    case 'identifier':
      return 'spytial-ed-syn-identifier';
    case 'comment':
      return 'spytial-ed-syn-comment';
    case 'whitespace':
    case 'punctuation':
    default:
      return undefined;
  }
}

// Re-export the punctuation set as a predicate so callers (and tests) can
// reason about which characters are treated as grouping symbols without
// re-deriving the table.
/** True if `ch` is treated as grouping punctuation by the tokenizer. */
export function isPunctuation(ch: string): boolean {
  return PUNCTUATION.has(ch);
}
