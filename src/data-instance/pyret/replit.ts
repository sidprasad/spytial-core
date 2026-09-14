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
 *   - plain objects:  {field: value}
 *   - data variants:  type(field0, field1, ...)   (fields in reconstructed order)
 *
 * Field ORDER here comes from the reconstructed object's dict order, which reify
 * takes from serialized field IDs for v6 constructor data. Only legacy data
 * falls back to the constructor cache / alphabetical field order.
 *
 * LIMITATION: a flat torepr-style string cannot express sharing or cycles. DAGs
 * are re-printed (matching `torepr`); cycles emit a `<cyclic>` marker instead of
 * looping forever. The cyclic bind-and-backpatch source form (block:/var) is
 * future work and is documented in the fidelity design notes.
 */

import { readValueInfo } from './values';
import { numberPayload, numberSource } from './numbers';
import { IDataInstance } from '../interfaces';
import { PyretObject } from './pyret-data-instance';
import { reifyToValue, ReifiedValue } from './reify';

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
const COLON_WORDS = new Set(['block', 'doc', 'otherwise', 'row', 'sharing', 'source', 'table', 'then', 'where', 'with']);

function objectKey(key: string): string {
  if (RESERVED_WORDS.has(key) || !/^[A-Za-z_][A-Za-z0-9_]*(?:-+[A-Za-z0-9_]+)*$/.test(key)) {
    throw new Error(`Pyret object field has no literal spelling: ${JSON.stringify(key)}`);
  }
  // e.g. `row:` is a keyword token, whereas `row :` is a field name.
  return COLON_WORDS.has(key) ? key + ' ' : key;
}

function render(v: ReifiedValue, onPath: Set<object>): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return pyretStringLiteral(v);

  const numeric = numberPayload(v);
  if (numeric) return numberSource(numeric);

  const shape = '$pyretValue' in v ? readValueInfo({ pyretValue: v.$pyretValue }) : undefined;
  if (shape?.kind === 'nothing') return 'nothing';
  if ('vals' in v && Array.isArray(v.vals)) {
    if (onPath.has(v)) throw new Error('Cyclic Pyret containers are not supported');
    if (!v.vals.length) throw new Error('Pyret has no empty tuple literal');
    onPath.add(v);
    const out = `{${v.vals.map(e => render(e as ReifiedValue, onPath)).join('; ')}${v.vals.length === 1 ? ';' : ''}}`;
    onPath.delete(v);
    return out;
  }

  if (Array.isArray(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const out = `[raw-array: ${v.map((e) => render(e, onPath)).join(', ')}]`;
    onPath.delete(v);
    return out;
  }

  if (isPyretObject(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const type = (v.$name as string) || 'object';
    const dict = (v.dict as Record<string, unknown>) || {};
    const keys = shape?.kind === 'object' ? shape.fields : Object.keys(dict);
    const out = shape?.kind === 'object'
      ? `{${keys.map(k => `${objectKey(k)}: ${render(dict[k] as ReifiedValue, onPath)}`).join(', ')}}`
      : keys.length || v.$arity === 0
      ? `${type}(${keys.map((k) => render(dict[k] as ReifiedValue, onPath)).join(', ')})`
      : type;
    onPath.delete(v);
    return out;
  }

  return String(v);
}

/** Reconstruct the value from the data instance and render it as a Pyret string. */
export function replit(di: IDataInstance, rootId?: string): string {
  return render(reifyToValue(di, rootId), new Set());
}
