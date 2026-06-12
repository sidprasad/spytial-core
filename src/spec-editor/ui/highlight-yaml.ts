/**
 * Lightweight YAML highlighter for the spec editor's Code view.
 *
 * Not a YAML parser — a lossless line tokenizer tuned for CnD layout specs:
 * comments, quoted strings, numbers, booleans, mapping keys, flow/indicator
 * punctuation, and — the part a generic YAML highlighter can't do — the spec's
 * own vocabulary: `constraints:`/`directives:` section keys and the registry's
 * known constraint/directive YAML keys (`orientation`, `flag`, `atomColor`, …)
 * are classed as keywords.
 *
 * Lossless invariant (same as `highlight.ts`): concatenating the token texts
 * of a line reproduces the line exactly, so the mirror overlay keeps identical
 * metrics with the textarea.
 */

import { isKnownYamlKey } from '../core/registry';

export type YamlTokenKind =
  | 'comment'
  | 'string'
  | 'number'
  | 'bool'
  /** a known section key (`constraints`/`directives`) or registry YAML key */
  | 'typekey'
  | 'key'
  | 'punct'
  | 'text';

export interface YamlToken {
  kind: YamlTokenKind;
  text: string;
}

const SECTION_KEYS = new Set(['constraints', 'directives']);
const BOOL_RE = /^(?:true|false|null|yes|no|on|off)\b/i;
const NUMBER_RE = /^-?\d+(?:\.\d+)?\b/;
/** identifier that may be a mapping key (lookahead for `:` handled by caller) */
const IDENT_RE = /^[A-Za-z_][\w/-]*/;
const PUNCT = new Set(['{', '}', '[', ']', ',', ':', '-', '&', '*', '?', '|', '>']);

/** True when `#` at this position starts a comment (line start or after space
 *  or an opening flow bracket — close enough to YAML's rule for highlighting). */
function isCommentStart(line: string, pos: number): boolean {
  if (line[pos] !== '#') return false;
  if (pos === 0) return true;
  const prev = line[pos - 1];
  return prev === ' ' || prev === '\t' || prev === '{' || prev === '[';
}

/** Tokenizes a single line of spec YAML. Lossless. */
export function tokenizeYamlLine(line: string): YamlToken[] {
  const tokens: YamlToken[] = [];
  let pos = 0;
  // accumulate plain text runs so output stays compact
  let textStart = -1;

  const flushText = (end: number): void => {
    if (textStart >= 0 && end > textStart) {
      tokens.push({ kind: 'text', text: line.slice(textStart, end) });
    }
    textStart = -1;
  };

  while (pos < line.length) {
    const ch = line[pos];

    if (isCommentStart(line, pos)) {
      flushText(pos);
      tokens.push({ kind: 'comment', text: line.slice(pos) });
      return tokens;
    }

    if (ch === "'" || ch === '"') {
      // Quoted scalar: scan to the closing quote (or end of line), honoring
      // YAML escapes — `\"` inside double quotes, doubled `''` inside single
      // quotes — so an escaped quote doesn't end the token early.
      let end = pos + 1;
      while (end < line.length) {
        if (ch === '"' && line[end] === '\\') {
          end += 2; // skip the escaped character
          continue;
        }
        if (line[end] === ch) {
          if (ch === "'" && line[end + 1] === "'") {
            end += 2; // '' is an escaped single quote, not a terminator
            continue;
          }
          break;
        }
        end += 1;
      }
      end = Math.min(end + 1, line.length);
      flushText(pos);
      tokens.push({ kind: 'string', text: line.slice(pos, end) });
      pos = end;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      // whitespace joins the surrounding text run
      if (textStart < 0) textStart = pos;
      pos += 1;
      continue;
    }

    const rest = line.slice(pos);

    const num = NUMBER_RE.exec(rest);
    if (num && (pos === 0 || !/[\w/-]/.test(line[pos - 1]))) {
      flushText(pos);
      tokens.push({ kind: 'number', text: num[0] });
      pos += num[0].length;
      continue;
    }

    const ident = IDENT_RE.exec(rest);
    if (ident) {
      const word = ident[0];
      const after = line.slice(pos + word.length);
      flushText(pos);
      if (/^\s*:/.test(after)) {
        // it's a mapping key
        const known = SECTION_KEYS.has(word) || isKnownYamlKey(word);
        tokens.push({ kind: known ? 'typekey' : 'key', text: word });
      } else if (BOOL_RE.test(word) && BOOL_RE.exec(word)![0] === word) {
        tokens.push({ kind: 'bool', text: word });
      } else {
        tokens.push({ kind: 'text', text: word });
      }
      pos += word.length;
      continue;
    }

    if (PUNCT.has(ch)) {
      flushText(pos);
      tokens.push({ kind: 'punct', text: ch });
      pos += 1;
      continue;
    }

    if (textStart < 0) textStart = pos;
    pos += 1;
  }

  flushText(line.length);
  return tokens;
}

/** Tokenizes a whole document, one token array per line. */
export function tokenizeYaml(text: string): YamlToken[][] {
  return text.split('\n').map(tokenizeYamlLine);
}

/** CSS class for a token kind ('' for plain text). Reuses the selector
 *  highlighter's `--spytial-ed-syn-*`-driven classes so theming applies. */
export function yamlTokenClassName(kind: YamlTokenKind): string {
  switch (kind) {
    case 'comment':
      return 'spytial-ed-syn-comment';
    case 'string':
      return 'spytial-ed-syn-string';
    case 'number':
      return 'spytial-ed-syn-number';
    case 'bool':
    case 'typekey':
      return 'spytial-ed-syn-keyword';
    case 'key':
      return 'spytial-ed-syn-relation';
    case 'punct':
      return 'spytial-ed-syn-operator';
    default:
      return '';
  }
}
