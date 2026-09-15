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
import { readValueInfo } from './values';
import { readNumberMetadata, reifyNumber, type ReifiedNumber } from './numbers';
import { readConstructorMetadata, readMutableFields, readFieldId } from './identity';

/** A reconstructed value: a synthetic Pyret object/tuple/nothing, a JS raw array,
 * or a primitive. Legacy multi-target fields also reconstruct as JS arrays. */
export type ReifiedValue = ReifiedNumber | PyretObject | ReifiedValue[] | number | string | boolean | null;

const PRIMITIVE_TYPES = new Set(['Number', 'String', 'Boolean']);

interface RelIndex {
  /** source atom id -> field name (relation id) -> ordered target atom ids */
  fields: Map<string, Map<string, string[]>>;
  /** atom ids that appear at index >= 1 in some tuple (i.e. are pointed-to) */
  targets: Set<string>;
  positions: Map<string, Map<string, number>>;
  elements: Map<string, Map<number, string>>;
  references: Map<string, string>;
}

/** Decode v6 field identities into names and positions; legacy IDs are names. */
function buildIndex(di: IDataInstance): RelIndex {
  const fields = new Map<string, Map<string, string[]>>();
  const elements = new Map<string, Map<number, string>>();
  const targets = new Set<string>();
  const positions = new Map<string, Map<string, number>>();
  const references = new Map<string, string>();
  const atoms = new Map(di.getAtoms().map(a => [a.id, a]));

  for (const rel of di.getRelations()) {

    for (const tup of rel.tuples) {
      if (tup.atoms.length < 2) continue;
      const src = tup.atoms[0];
      const shape = readValueInfo(atoms.get(src)?.metadata);
      for (let i = 1; i < tup.atoms.length; i++) targets.add(tup.atoms[i]);

      if (shape?.kind === 'reference') {
        if (rel.name !== 'target' || tup.atoms.length !== 2 || !atoms.has(tup.atoms[1])) {
          throw new Error('Malformed Pyret reference target');
        }
        if (references.has(src) && references.get(src) !== tup.atoms[1]) {
          throw new Error('Conflicting Pyret reference targets');
        }
        references.set(src, tup.atoms[1]);
        continue;
      }

      if (shape?.kind === 'tuple' || shape?.kind === 'raw-array') {
        const indexAtom = atoms.get(tup.atoms[1]);
        const index = indexAtom?.metadata?.pyretIndex;
        if (rel.name !== 'element' || tup.atoms.length !== 3 || indexAtom?.type !== 'Index'
            || typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index >= shape.length
            || !atoms.has(tup.atoms[2])) throw new Error('Malformed Pyret indexed element');
        const indexed = elements.get(src) ?? new Map<number, string>();
        if (indexed.has(index) && indexed.get(index) !== tup.atoms[2]) throw new Error('Conflicting Pyret element positions');
        indexed.set(index, tup.atoms[2]);
        elements.set(src, indexed);
        continue;
      }
      if (shape?.kind === 'nothing') throw new Error('Pyret nothing cannot have fields');
      if (shape?.kind === 'object' && (tup.atoms.length !== 2 || !atoms.has(tup.atoms[1]))) {
        throw new Error('Pyret object field must have one value');
      }
      // Only constructor/legacy data decodes relation IDs. New value kinds use
      // relation names and explicit index columns; their IDs are opaque.
      const identity = shape ? undefined : readFieldId(rel.id);
      let byField = fields.get(src);
      if (!byField) {
        byField = new Map();
        fields.set(src, byField);
      }
      const field = shape?.kind === 'object' ? rel.name : identity?.field ?? rel.id;
      if (identity) {
        if (rel.name !== field || atoms.get(src)?.type !== identity.name) {
          throw new Error('Pyret field ID disagrees with its name or source constructor');
        }
        const order = positions.get(src) ?? new Map<string, number>();
        if ((order.has(field) && order.get(field) !== identity.position)
            || [...order].some(([f, p]) => f !== field && p === identity.position)) {
          throw new Error('Conflicting Pyret constructor field positions');
        }
        order.set(field, identity.position);
        positions.set(src, order);
      }
      const arr = byField.get(field) ?? [];
      // binary fields contribute one target; n-ary (e.g. nested array intermediates)
      // contribute their non-source atoms in order.
      for (let i = 1; i < tup.atoms.length; i++) arr.push(tup.atoms[i]);
      byField.set(field, arr);
    }
  }
  return { fields, targets, positions, elements, references };
}

/** Parse a primitive atom's label back into a JS primitive. */
function reifyPrimitiveAtom(atom: IAtom): ReifiedValue {
  switch (atom.type) {
    case 'Number': {
      const numeric = readNumberMetadata(atom.metadata);
      if (numeric) return reifyNumber(numeric);
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
 * Legacy fallback only. New real-Pyret data carries position in relation IDs.
 * For pre-v6 / synthetic values, order lives in the static
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
  const { fields, targets, positions, elements, references } = buildIndex(di);
  // Crossing a reference breaks a construction dependency. Array cycles that
  // never cross a reference retain their existing unsupported status.
  const pending = new Map<string, number>();
  let referenceDepth = 0;
  const activeSequences = new Set<string>();
  const memo = new Map<string, ReifiedValue>();

  const reifyAtom = (id: string): ReifiedValue => {
    if (memo.has(id)) {
      if (pending.get(id) === referenceDepth && activeSequences.size) throw new Error('Cyclic Pyret containers are not supported');
      return memo.get(id)!;
    }

    const atom = atomsById.get(id);
    if (!atom) return null;

    if (PRIMITIVE_TYPES.has(atom.type)) {
      const v = reifyPrimitiveAtom(atom);
      memo.set(id, v);
      return v;
    }

    const shape = readValueInfo(atom.metadata);
    if (shape?.kind === 'nothing') {
      const nothing = { $pyretValue: shape };
      memo.set(id, nothing);
      return nothing;
    }
    pending.set(id, referenceDepth);
    if (shape?.kind === 'reference') {
      const target = references.get(id);
      if (target === undefined) throw new Error('Incomplete Pyret reference target');
      const ref: PyretObject = { $pyretValue: shape };
      memo.set(id, ref);
      referenceDepth++;
      ref.value = reifyAtom(target);
      referenceDepth--;
      pending.delete(id);
      return ref;
    }
    if (shape?.kind === 'raw-array' || shape?.kind === 'tuple') {
      const indexed = elements.get(id) ?? new Map<number, string>();
      if (indexed.size !== shape.length) throw new Error('Incomplete Pyret container elements');
      const values: ReifiedValue[] = [];
      const result: ReifiedValue = shape.kind === 'raw-array' ? values : { vals: values };
      memo.set(id, result);
      activeSequences.add(id);
      for (let i = 0; i < shape.length; i++) values.push(reifyAtom(indexed.get(i)!));
      activeSequences.delete(id);
      pending.delete(id);
      return result;
    }

    const byField = fields.get(id) ?? new Map<string, string[]>();
    const present = Array.from(byField.keys());
    const arity = readConstructorMetadata(atom.metadata);

    // Pure list-like object (numeric field names) -> JS array.
    if (!shape && arity === undefined && isListLike(present)) {
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
      pending.delete(id);
      return arr;
    }

    // Object/data-variant: create the shell and memoize BEFORE recursing so
    // shared/cyclic references resolve to this exact JS object.
    const obj: PyretObject = { dict: Object.create(null),
      ...(shape?.kind === 'object' ? { $pyretValue: shape } : { $name: atom.type }) };
    memo.set(id, obj);

    let order: string[];
    if (shape?.kind === 'object') {
      if (shape.fields.length !== present.length || shape.fields.some(f => !byField.has(f))) {
        throw new Error('Incomplete Pyret object fields');
      }
      order = shape.fields;
    } else if (arity !== undefined) {
      const declared = positions.get(id) ?? new Map<string, number>();
      const count = Math.max(0, arity);
      if (present.length !== count || declared.size !== count
          || [...declared.values()].some(p => p >= count)) {
        throw new Error('Incomplete Pyret constructor fields');
      }
      order = [...declared].sort((a, b) => a[1] - b[1]).map(([f]) => f);
      obj.$arity = arity;
      obj.$constructor = { $fieldNames: order };
      const mutable = readMutableFields(atom.metadata);
      if (mutable.length) obj.$mut_fields_mask = order.map((_, i) => mutable.includes(i));
    } else {
      order = fieldOrderFor(atom.type, present);
    }
    for (const f of order) {
      const tgts = byField.get(f) ?? [];
      if ((shape?.kind === 'object' || arity !== undefined) && tgts.length !== 1) throw new Error('Pyret constructor field must have one value');
      if (tgts.length === 1) {
        // single target -> scalar field value (one binary tuple round-trips identically)
        obj.dict![f] = reifyAtom(tgts[0]) as unknown;
      } else {
        // multiple targets under one field -> a Pyret array (the relationalizer's
        // array path emits one tuple per element, which is exactly this shape).
        obj.dict![f] = tgts.map((t) => reifyAtom(t)) as unknown;
      }
    }
    for (const i of readMutableFields(atom.metadata)) {
      const value = obj.dict![order[i]] as PyretObject;
      if (!value || typeof value !== 'object'
          || readValueInfo({ pyretValue: value.$pyretValue })?.kind !== 'reference') {
        throw new Error('Pyret mutable field must contain a reference');
      }
    }
    pending.delete(id);
    return obj;
  };

  // Reference snapshots carry their observation point in atom metadata. Legacy
  // data without references keeps its in-degree/atom-order fallback.
  const allIds = di.getAtoms().map((a) => a.id);
  if (allIds.length === 0) return null;

  if (rootId && atomsById.has(rootId)) return reifyAtom(rootId);

  const marked = di.getAtoms().filter(a => a.metadata && Object.prototype.hasOwnProperty.call(a.metadata, 'pyretRoot'));
  if (marked.some(a => (a.metadata!.pyretRoot as { version?: number } | null)?.version !== 1)) {
    throw new Error('Malformed Pyret root metadata');
  }
  if (marked.length > 1) throw new Error('Ambiguous Pyret roots');
  if (marked.length === 1) return reifyAtom(marked[0].id);
  if (di.getAtoms().some(a => readValueInfo(a.metadata)?.kind === 'reference')) {
    throw new Error('Pyret reference graphs require an explicit root');
  }

  const roots = allIds.filter((id) => !targets.has(id));
  if (roots.length === 1) return reifyAtom(roots[0]);
  if (roots.length === 0) {
    // Fully cyclic: every atom is pointed at, so there is no in-degree-0 root.
    // Enter at the first atom that HAS fields — a leaf entry point (a primitive
    // like a name string) would reify to just that leaf and drop the rest of
    // the graph. Atom order starts at the value the instance was built from, so
    // the first structured atom is the original root.
    const entry = allIds.find((id) => (fields.get(id)?.size ?? elements.get(id)?.size ?? 0) > 0) ?? allIds[0];
    return reifyAtom(entry);
  }

  // Multiple roots -> wrap them in a JS array, so `replit` renders them as
  // [raw-array: r1, r2]. (Structural round-trip of multi-root instances is
  // intentionally not claimed.) Atoms in a cyclic component that no root reaches
  // are not part of that list.
  const arr: ReifiedValue[] = roots.map((r) => reifyAtom(r));
  return arr;
}
