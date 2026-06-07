/**
 * replit — the REPL-equivalent string form of a reified value.
 *
 * The Pyret analog of Python's `repr(reify(...))` / Rust's
 * `format!("{:?}", from_datum(...))`: reconstruct the value (./reify.ts), then
 * render it to the source/REPL string a programmer would read.
 *
 * Rendering rules:
 *   - primitives:     5     "hi"    true     nothing
 *   - arrays:         [list: a, b, c]
 *   - data variants:  type(field0, field1, ...)   (fields in reconstructed order)
 *
 * Field ORDER here comes from the reconstructed object's dict order, which reify
 * takes from the constructor cache (declared order) — so positional rendering is
 * faithful when the cache is populated.
 *
 * LIMITATION: a flat torepr-style string cannot express sharing or cycles. DAGs
 * are re-printed (matching `torepr`); cycles emit a `<cyclic>` marker instead of
 * looping forever. The cyclic bind-and-backpatch source form (block:/var) is
 * future work and is documented in the fidelity design notes.
 */

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
      .replace(/\t/g, '\\t') +
    '"'
  );
}

function render(v: ReifiedValue, onPath: Set<object>): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return pyretStringLiteral(v);

  if (Array.isArray(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const out = `[list: ${v.map((e) => render(e, onPath)).join(', ')}]`;
    onPath.delete(v);
    return out;
  }

  if (isPyretObject(v)) {
    if (onPath.has(v)) return '<cyclic>';
    onPath.add(v);
    const type = (v.$name as string) || 'object';
    const dict = (v.dict as Record<string, unknown>) || {};
    const keys = Object.keys(dict);
    const out = keys.length
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
