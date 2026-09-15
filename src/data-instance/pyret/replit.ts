/**
 * replit — the REPL-equivalent string form of a reified value.
 *
 * The Pyret analog of Python's `repr(reify(...))` / Rust's
 * `format!("{:?}", from_datum(...))`: reconstruct the value (./reify.ts), then
 * render it to the source/REPL string a programmer would read.
 *
 * Rendering rules:
 *   - primitives:     5     "hi"    true     nothing
 *   - raw arrays:     [raw-array: a, b, c]
 *   - tuples:         {a; b}
 *   - built-in sets:  public collection syntax (list-set adds preserve order)
 *   - dictionaries:  public collection syntax (include string-dict at evaluation)
 *   - plain objects:  {field: value}
 *   - data variants:  type(field0, field1, ...)   (fields in reconstructed order)
 *
 * Field ORDER here comes from the reconstructed object's dict order, which reify
 * takes from serialized field IDs for v6 constructor data. Only legacy data
 * falls back to the constructor cache / alphabetical field order.
 *
 * References and shared mutable dictionaries use bindings and updates to
 * preserve sharing/cycles (see reference-source.ts for the construction subset).
 * The legacy ref-free renderer repeats DAGs and emits a `<cyclic>` marker for
 * synthetic object cycles, which are not claimed as evaluable Pyret source.
 */

import { readValueInfo } from './values';
import { numberPayload, numberSource } from './numbers';
import { IDataInstance } from '../interfaces';
import { PyretObject } from './pyret-data-instance';
import { reifyToValue, ReifiedValue } from './reify';
import { referenceSource } from './reference-source';
import { setContents, setSource } from './set-source';
import { dictionarySource, type DictionaryEntry } from './string-dict';

function isPyretObject(v: unknown): v is PyretObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'dict' in v;
}

function pyretStringLiteral(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      // Pyret normalizes literal source Unicode before processing escapes.
      // Emit code-unit escapes to preserve e.g. U+FAAA (otherwise U+7740),
      // combining sequences, control characters, and unpaired surrogates.
      .replace(/[^\x20-\x7E]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) +
    '"'
  );
}

// Pyret's key grammar accepts NAME only. Quoting a key is not an escape.
const RESERVED_WORDS = new Set(`and as ascending ask by cases check data descending do does-not-raise
else end examples extend extract false for from fun hiding if import include is is-not is-roughly
is-not-roughly because lam lazy let letrec load-table method module newtype of or provide provide-types
raises raises-other-than raises-satisfies raises-violates reactor rec ref sanitize satisfies select
shadow sieve spy order transform true type type-let using use var violates when`.split(/\s+/));
// The compiler's well-formedness pass rejects these NAME tokens as field names
// too (src/arr/compiler/well-formed.arr), even though the parser accepts them.
const RESERVED_NAMES = new Set(`function break return do yield throw continue while class interface
type generator alias extends implements module package namespace public private protected static const
enum super export new try finally debug spy switch this match case with __proto__`.split(/\s+/));
const COLON_WORDS = new Set(['block', 'doc', 'otherwise', 'row', 'sharing', 'source', 'table', 'then', 'where', 'with']);

function objectKey(key: string): string {
  if (RESERVED_WORDS.has(key) || RESERVED_NAMES.has(key)
      || !/^[A-Za-z_][A-Za-z0-9_]*(?:-+[A-Za-z0-9_]+)*$/.test(key)) {
    throw new Error(`Pyret object field has no literal spelling: ${JSON.stringify(key)}`);
  }
  // e.g. `row:` is a keyword token, whereas `row :` is a field name.
  return COLON_WORDS.has(key) ? key + ' ' : key;
}

function render(v: ReifiedValue, onPath: Set<object>, child = (value: ReifiedValue): string => render(value, onPath)): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return pyretStringLiteral(v);

  const numeric = numberPayload(v);
  if (numeric) return numberSource(numeric);

  const shape = '$pyretValue' in v ? readValueInfo({ pyretValue: v.$pyretValue }) : undefined;
  if (shape?.kind === 'nothing') return 'nothing';
  if (shape?.kind === 'string-dict') {
    if (onPath.has(v)) throw new Error('Cyclic immutable Pyret dictionary construction is not supported');
    onPath.add(v);
    const out = dictionarySource(shape, (v as PyretObject).entries as DictionaryEntry[], child);
    onPath.delete(v);
    return out;
  }
  if ('vals' in v && Array.isArray(v.vals)) {
    if (onPath.has(v)) throw new Error('Cyclic Pyret containers are not supported');
    if (!v.vals.length) throw new Error('Pyret has no empty tuple literal');
    onPath.add(v);
    const out = `{${v.vals.map(e => child(e as ReifiedValue)).join('; ')}${v.vals.length === 1 ? ';' : ''}}`;
    onPath.delete(v);
    return out;
  }

  if (Array.isArray(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const out = `[raw-array: ${v.map(child).join(', ')}]`;
    onPath.delete(v);
    return out;
  }

  if (isPyretObject(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const set = setContents(v);
    if (set) {
      const out = setSource(set, child);
      onPath.delete(v);
      return out;
    }
    const type = (v.$name as string) || 'object';
    const dict = (v.dict as Record<string, unknown>) || {};
    const keys = shape?.kind === 'object' ? shape.fields : Object.keys(dict);
    const out = shape?.kind === 'object'
      ? `{${keys.map(k => `${objectKey(k)}: ${child(dict[k] as ReifiedValue)}`).join(', ')}}`
      : keys.length || v.$arity === 0
      ? `${type}(${keys.map((k) => child(dict[k] as ReifiedValue)).join(', ')})`
      : type;
    onPath.delete(v);
    return out;
  }

  return String(v);
}

/** Reconstruct the value from the data instance and render it as a Pyret string. */
export function replit(di: IDataInstance, rootId?: string): string {
  const value = reifyToValue(di, rootId);
  return referenceSource(value, (v, child) => render(v, new Set(), child), objectKey)
    ?? render(value, new Set());
}
