/**
 * Structural reify for PyretDataInstance.
 *
 * This is the *inverse of relationalization*: given a data instance (atoms +
 * relations only — NO live Pyret value, NO runtime), reconstruct a value.
 *
 * The key design choice (see the fidelity design notes): reify reconstructs a
 * **synthetic `PyretObject`** — the exact `{ dict, brands/$name }` shape that
 * `PyretDataInstance.parseObjectIteratively` already consumes. That makes the
 * round-trip self-contained: we can feed the reified value straight back into
 * `new PyretDataInstance(...)` and compare, with no Pyret runtime in the loop.
 *
 * Sharing and cycles are carried by **real JS object identity** in the
 * reconstructed graph (a memo keyed by atom id), so a shared atom becomes one
 * shared JS object and a cyclic atom becomes a real JS back-reference — exactly
 * mirroring how the relationalizer's `WeakMap` captured them in the first place.
 *
 * NOTE: this is a *structural* reify (the analog of Python's live-object
 * `reify`). The string form (the analog of Python's `repl`/`repr(reify(...))`)
 * is `replit` in ./replit.ts.
 */

import { IDataInstance, IAtom } from '../interfaces';
import { PyretObject, PyretDataInstance } from './pyret-data-instance';

/** A value reconstructed from a data instance. Either a synthetic Pyret object,
 * a JS array (for multi-target fields = Pyret arrays/list-likes), or a primitive. */
export type ReifiedValue = PyretObject | ReifiedValue[] | number | string | boolean | null;

const PRIMITIVE_TYPES = new Set(['Number', 'String', 'Boolean']);

interface RelIndex {
  /** source atom id -> field name (relation id) -> ordered target atom ids */
  fields: Map<string, Map<string, string[]>>;
  /** atom ids that appear at index >= 1 in some tuple (i.e. are pointed-to) */
  targets: Set<string>;
}

/** Build a source-keyed view of the relations. Field name = relation `id`
 * (the dict key the relationalizer stored), which for binary object fields is
 * exactly the Pyret field name. */
function buildIndex(di: IDataInstance): RelIndex {
  const fields = new Map<string, Map<string, string[]>>();
  const targets = new Set<string>();

  for (const rel of di.getRelations()) {
    for (const tup of rel.tuples) {
      if (tup.atoms.length < 2) continue;
      const src = tup.atoms[0];
      for (let i = 1; i < tup.atoms.length; i++) targets.add(tup.atoms[i]);

      let byField = fields.get(src);
      if (!byField) {
        byField = new Map();
        fields.set(src, byField);
      }
      const arr = byField.get(rel.id) ?? [];
      // binary fields contribute one target; n-ary (e.g. nested array intermediates)
      // contribute their non-source atoms in order.
      for (let i = 1; i < tup.atoms.length; i++) arr.push(tup.atoms[i]);
      byField.set(rel.id, arr);
    }
  }
  return { fields, targets };
}

/** Parse a primitive atom's label back into a JS primitive. */
function reifyPrimitiveAtom(atom: IAtom): ReifiedValue {
  switch (atom.type) {
    case 'Number': {
      const n = Number(atom.label);
      return Number.isNaN(n) ? atom.label : n;
    }
    case 'Boolean':
      return atom.label === 'true';
    case 'String':
      return atom.label;
    default:
      return atom.label;
  }
}

/** Numeric-aware comparison so "2" sorts before "10". */
function numericAwareCompare(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return parseInt(a, 10) - parseInt(b, 10);
  return a.localeCompare(b);
}

/**
 * Determine constructor field order for a type.
 *
 * Field order is NOT part of the relational form — it lives in the static
 * `globalConstructorCache` (populated at relationalization time from the live
 * object's dict key order). We consult it here. This only affects *positional*
 * rendering (replit); structural fidelity does not depend on it because each
 * field is a distinctly-named relation.
 */
function fieldOrderFor(type: string, present: string[]): string[] {
  const cache = PyretDataInstance.getGlobalConstructorCache();
  const cached = cache.get(type);
  if (cached && cached.length) {
    const inCache = cached.filter((f) => present.includes(f));
    const extras = present.filter((f) => !cached.includes(f));
    return [...inCache, ...extras.sort(numericAwareCompare)];
  }
  return [...present].sort(numericAwareCompare);
}

/** True if all field names look like array indices (0,1,2,...). */
function isListLike(fieldNames: string[]): boolean {
  return fieldNames.length > 0 && fieldNames.every((k) => /^\d+$/.test(k));
}

/**
 * Reconstruct a value from a data instance.
 *
 * @param di      the data instance (atoms + relations)
 * @param rootId  optional explicit root atom id; otherwise inferred
 * @returns a synthetic, re-relationalizable value (PyretObject / array / primitive)
 */
export function reifyToValue(di: IDataInstance, rootId?: string): ReifiedValue {
  const atomsById = new Map(di.getAtoms().map((a) => [a.id, a] as const));
  const { fields, targets } = buildIndex(di);
  const memo = new Map<string, ReifiedValue>();

  const reifyAtom = (id: string): ReifiedValue => {
    if (memo.has(id)) return memo.get(id)!;

    const atom = atomsById.get(id);
    if (!atom) return null;

    if (PRIMITIVE_TYPES.has(atom.type)) {
      const v = reifyPrimitiveAtom(atom);
      memo.set(id, v);
      return v;
    }

    const byField = fields.get(id) ?? new Map<string, string[]>();
    const present = Array.from(byField.keys());

    // Pure list-like object (numeric field names) -> JS array.
    if (isListLike(present)) {
      const arr: ReifiedValue[] = [];
      memo.set(id, arr);
      const ordered = present.slice().sort(numericAwareCompare);
      for (const k of ordered) {
        const tgts = byField.get(k) ?? [];
        // One target at index k -> scalar element; multiple targets -> the
        // element at index k was itself an array (the relationalizer emits one
        // tuple per inner element under the SAME numeric field), so nest it.
        arr.push(tgts.length === 1 ? reifyAtom(tgts[0]) : tgts.map((t) => reifyAtom(t)));
      }
      return arr;
    }

    // Object/data-variant: create the shell and memoize BEFORE recursing so
    // shared/cyclic references resolve to this exact JS object.
    const obj: PyretObject = { dict: {}, $name: atom.type };
    memo.set(id, obj);

    const order = fieldOrderFor(atom.type, present);
    for (const f of order) {
      const tgts = byField.get(f) ?? [];
      if (tgts.length === 1) {
        // single target -> scalar field value (one binary tuple round-trips identically)
        obj.dict![f] = reifyAtom(tgts[0]) as unknown;
      } else {
        // multiple targets under one field -> a Pyret array (the relationalizer's
        // array path emits one tuple per element, which is exactly this shape).
        obj.dict![f] = tgts.map((t) => reifyAtom(t)) as unknown;
      }
    }
    return obj;
  };

  // Root resolution: prefer explicit; else the unique in-degree-0 atom; else
  // (cycles / multiple roots) fall back deterministically.
  const allIds = di.getAtoms().map((a) => a.id);
  if (allIds.length === 0) return null;

  if (rootId && atomsById.has(rootId)) return reifyAtom(rootId);

  const roots = allIds.filter((id) => !targets.has(id));
  if (roots.length === 1) return reifyAtom(roots[0]);
  if (roots.length === 0) {
    // fully cyclic: no in-degree-0 atom. Use the last atom as an entry point.
    return reifyAtom(allIds[allIds.length - 1]);
  }

  // Multiple roots -> wrap them in a synthetic list (mirrors reify()'s [list-set:]).
  // (Structural round-trip of multi-root instances is intentionally not claimed.)
  const arr: ReifiedValue[] = roots.map((r) => reifyAtom(r));
  return arr;
}
