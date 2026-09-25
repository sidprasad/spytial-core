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
import { reifiedValueInfo, type PyretValueInfo } from './values';
import { parseNumberLabel, reifyNumber, type ReifiedNumber } from './numbers';
import { readFieldId } from './identity';

/** A reconstructed value, independent of a live Pyret runtime. */
export type ReifiedValue = ReifiedNumber | PyretObject | ReifiedValue[] | number | string | boolean | null;

const PRIMITIVE_TYPES = new Set(['Number', 'String', 'Boolean']);
const VALUE_TYPES = new Set([...PRIMITIVE_TYPES, 'Index', 'Nothing', 'Object', 'Tuple', 'RawArray',
  'Reference', 'StringDict', 'MutableStringDict', 'Table']);

interface RelIndex {
  fields: Map<string, Map<string, string[]>>;
  targets: Set<string>;
  /** Constructor schema comes from field relation declarations, including empty ones. */
  constructors: Map<string, Map<string, number>>;
  objectPositions: Map<string, Map<string, number>>;
  elements: Map<string, Map<number, string>>;
  columns: Map<string, Map<number, string>>;
  rows: Map<string, Map<number, string[]>>;
  references: Map<string, string>;
  entries: Map<string, Map<number, { key: string; value: string }>>;
  mutableFields: Map<string, Set<number>>;
  sealed: Set<string>;
  unrestricted: Set<string>;
  nullary: Set<string>;
}

function indexValue(atom: IAtom | undefined): number {
  if (atom?.type !== 'Index' || !/^(0|[1-9][0-9]*)$/.test(atom.label)
      || !Number.isSafeInteger(Number(atom.label))) throw new Error('Malformed Pyret position label');
  return Number(atom.label);
}

function setPosition(positions: Map<string, number>, name: string, position: number): void {
  if ((positions.has(name) && positions.get(name) !== position)
      || [...positions].some(([field, index]) => field !== name && index === position)) {
    throw new Error('Conflicting Pyret field positions');
  }
  positions.set(name, position);
}

/** Positions are dense; length is derived, never stored in a second channel. */
function ordered<T>(indexed: Map<number, T>, context: string): T[] {
  const result: T[] = [];
  for (let i = 0; i < indexed.size; i++) {
    if (!indexed.has(i)) throw new Error(`Incomplete Pyret ${context}: positions must be contiguous from zero`);
    result.push(indexed.get(i)!);
  }
  return result;
}

function buildIndex(di: IDataInstance): RelIndex {
  const idx: RelIndex = {
    fields: new Map(), targets: new Set(), constructors: new Map(), objectPositions: new Map(),
    elements: new Map(), columns: new Map(), rows: new Map(), references: new Map(), entries: new Map(), mutableFields: new Map(),
    sealed: new Set(), unrestricted: new Set(), nullary: new Set(),
  };
  const atoms = new Map(di.getAtoms().map(a => [a.id, a]));
  for (const rel of di.getRelations()) {
    const identity = readFieldId(rel.id);
    if (identity) {
      if (rel.name !== identity.field) throw new Error('Pyret field ID disagrees with its name');
      const schema = idx.constructors.get(identity.name) ?? new Map<string, number>();
      setPosition(schema, identity.field, identity.position);
      idx.constructors.set(identity.name, schema);
    }
    for (const tup of rel.tuples) {
      if (!tup.atoms.length || tup.atoms.some(id => !atoms.has(id))) throw new Error('Malformed Pyret relation tuple');
      const [src, second, third, fourth] = tup.atoms;
      const type = atoms.get(src)!.type;
      const size = tup.atoms.length;
      for (const target of tup.atoms.slice(1)) idx.targets.add(target);

      // These facts have ordinary opaque IDs. Constructor fields with the same
      // name retain their distinct v6 field identities; object fields are ternary.
      if (!identity && type !== 'Object') {
        if (rel.name === 'sealed' && type === 'MutableStringDict') {
          if (size !== 1) throw new Error('Malformed Pyret sealed fact');
          idx.sealed.add(src); continue;
        }
        if (rel.name === 'unrestricted' && type === 'Reference') {
          if (size !== 1) throw new Error('Malformed Pyret unrestricted fact');
          idx.unrestricted.add(src); continue;
        }
        if (rel.name === 'nullary-constructor' && !VALUE_TYPES.has(type)) {
          if (size !== 1) throw new Error('Malformed Pyret nullary constructor fact');
          idx.nullary.add(src); continue;
        }
        if (rel.name === 'mutable-field' && !VALUE_TYPES.has(type)) {
          if (size !== 2) throw new Error('Malformed Pyret mutable field positions');
          const positions = idx.mutableFields.get(src) ?? new Set<number>();
          positions.add(indexValue(atoms.get(second)));
          idx.mutableFields.set(src, positions); continue;
        }
      }
      if (size < 2) throw new Error('Malformed Pyret unary relation');
      if (type === 'Table') {
        if (identity) throw new Error('Pyret table relations must have opaque IDs');
        const index = indexValue(atoms.get(second));
        if (rel.name === 'column' && size === 3 && atoms.get(third)?.type === 'String') {
          const columns = idx.columns.get(src) ?? new Map<number, string>();
          if (columns.has(index) && columns.get(index) !== third) throw new Error('Conflicting Pyret table column positions');
          columns.set(index, third);
          idx.columns.set(src, columns);
        } else if (rel.name === 'row') {
          const rows = idx.rows.get(src) ?? new Map<number, string[]>();
          const cells = tup.atoms.slice(2);
          if (rows.has(index) && JSON.stringify(rows.get(index)) !== JSON.stringify(cells)) {
            throw new Error('Conflicting Pyret table row positions');
          }
          if (cells.some(id => atoms.get(id)?.type === 'Index')) throw new Error('Pyret table cells cannot be positions');
          rows.set(index, cells);
          idx.rows.set(src, rows);
        } else throw new Error('Malformed Pyret table relation');
        continue;
      }
      if (type === 'StringDict' || type === 'MutableStringDict') {
        if (rel.name !== 'entry' || size !== 4 || atoms.get(third)?.type !== 'String') {
          throw new Error('Malformed Pyret dictionary entry');
        }
        const index = indexValue(atoms.get(second));
        const entries = idx.entries.get(src) ?? new Map();
        const previous = entries.get(index);
        if (previous && (previous.key !== third || previous.value !== fourth)) throw new Error('Conflicting Pyret dictionary entry positions');
        entries.set(index, { key: third, value: fourth });
        idx.entries.set(src, entries); continue;
      }
      if (type === 'Reference') {
        if (rel.name !== 'target' || size !== 2) throw new Error('Malformed Pyret reference target');
        if (idx.references.has(src) && idx.references.get(src) !== second) throw new Error('Conflicting Pyret reference targets');
        idx.references.set(src, second); continue;
      }
      if (type === 'Tuple' || type === 'RawArray') {
        if (rel.name !== 'element' || size !== 3) throw new Error('Malformed Pyret indexed element');
        const index = indexValue(atoms.get(second));
        const elements = idx.elements.get(src) ?? new Map<number, string>();
        if (elements.has(index) && elements.get(index) !== third) throw new Error('Conflicting Pyret element positions');
        elements.set(index, third);
        idx.elements.set(src, elements); continue;
      }
      if (VALUE_TYPES.has(type) && type !== 'Object') throw new Error('Pyret primitive cannot have fields');
      if (identity && (type !== identity.name || size !== 2)) throw new Error('Pyret field ID disagrees with its source constructor');
      if (type === 'Object') {
        if (size !== 3 || identity) throw new Error('Pyret object field must have a position and one value');
        const positions = idx.objectPositions.get(src) ?? new Map<string, number>();
        setPosition(positions, rel.name, indexValue(atoms.get(second)));
        idx.objectPositions.set(src, positions);
      }
      const byField = idx.fields.get(src) ?? new Map<string, string[]>();
      const field = identity?.field ?? rel.name;
      const values = byField.get(field) ?? [];
      for (const target of (type === 'Object' ? [third] : tup.atoms.slice(1))) {
        if (!values.includes(target)) values.push(target);
      }
      byField.set(field, values);
      idx.fields.set(src, byField);
    }
  }
  return idx;
}

function shapeOf(atom: IAtom, idx: RelIndex): PyretValueInfo | undefined {
  switch (atom.type) {
    case 'Nothing': return { kind: 'nothing' };
    case 'Object': return { kind: 'object' };
    case 'Tuple': return { kind: 'tuple' };
    case 'RawArray': return { kind: 'raw-array' };
    case 'Table': return { kind: 'table' };
    case 'Reference': return { kind: 'reference', unrestricted: idx.unrestricted.has(atom.id) };
    case 'StringDict': case 'MutableStringDict':
      return { kind: 'string-dict', mutable: atom.type === 'MutableStringDict', sealed: idx.sealed.has(atom.id) };
    default: return undefined;
  }
}

function reifyPrimitiveAtom(atom: IAtom): ReifiedValue {
  switch (atom.type) {
    case 'Number': return reifyNumber(parseNumberLabel(atom.label));
    case 'Boolean':
      if (atom.label !== 'true' && atom.label !== 'false') throw new Error('Malformed Pyret boolean label');
      return atom.label === 'true';
    default: return atom.label;
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
 * @param rootId  atom to reconstruct; otherwise requires exactly one atom with
 *                no incoming tuples. Cycles and multiple roots require this argument.
 * @returns a synthetic, re-relationalizable value (PyretObject / array / primitive)
 */
export function reifyToValue(di: IDataInstance, rootId?: string, options: { allowContainerCycles?: boolean } = {}): ReifiedValue {
  const values = reifyToValues(di, rootId === undefined ? undefined : [rootId], options);
  return values.length ? values[0] : null;
}

/** Reconstruct roots with a common identity memo, including cross-root aliases. */
export function reifyToValues(di: IDataInstance, rootIds?: readonly string[], options: { allowContainerCycles?: boolean } = {}): ReifiedValue[] {
  const atomsById = new Map(di.getAtoms().map((a) => [a.id, a] as const));
  const idx = buildIndex(di);
  const { fields, targets, elements, references, entries } = idx;
  // Crossing a reference breaks a construction dependency. Array cycles that
  // never cross a reference retain their existing unsupported status.
  const pending = new Map<string, number>();
  let referenceDepth = 0;
  const activeSequences = new Set<string>();
  const memo = new Map<string, ReifiedValue>();

  const reifyAtom = (id: string): ReifiedValue => {
    if (memo.has(id)) {
      if (!options.allowContainerCycles && pending.get(id) === referenceDepth && activeSequences.size) throw new Error('Cyclic Pyret containers are not supported');
      return memo.get(id)!;
    }

    const atom = atomsById.get(id);
    if (!atom) throw new Error('Unknown Pyret atom ID: ' + id);

    if (PRIMITIVE_TYPES.has(atom.type)) {
      const v = reifyPrimitiveAtom(atom);
      memo.set(id, v);
      return v;
    }

    const shape = shapeOf(atom, idx);
    if (shape?.kind === 'nothing') {
      const nothing = { $pyretValue: shape };
      memo.set(id, nothing);
      return nothing;
    }
    pending.set(id, referenceDepth);
    if (shape?.kind === 'table') {
      const headers = ordered(idx.columns.get(id) ?? new Map<number, string>(), 'table columns')
        .map(header => atomsById.get(header)!.label);
      if (new Set(headers).size !== headers.length) throw new Error('Duplicate Pyret table column name');
      const rows = ordered(idx.rows.get(id) ?? new Map<number, string[]>(), 'table rows');
      if (rows.some(row => row.length !== headers.length)) throw new Error('Pyret table row width must match its columns');
      const values: ReifiedValue[][] = [];
      const table: PyretObject = { $pyretValue: shape,
        dict: { '_header-raw-array': headers, '_rows-raw-array': values } };
      memo.set(id, table);
      activeSequences.add(id);
      for (const row of rows) values.push(row.map(reifyAtom));
      activeSequences.delete(id);
      pending.delete(id);
      return table;
    }
    if (shape?.kind === 'string-dict') {
      const indexed = entries.get(id) ?? new Map();
      const orderedEntries = ordered(indexed, 'dictionary entries');
      const result: PyretObject = { $pyretValue: shape, entries: [] };
      memo.set(id, result);
      const keys = new Set<string>();
      // Mutable dictionaries can be allocated before their contents, just as
      // unrestricted reference cells can break a construction cycle.
      if (shape.mutable) referenceDepth++;
      for (const entry of orderedEntries) {
        const key = atomsById.get(entry.key)!.label;
        if (keys.has(key)) throw new Error('Duplicate Pyret dictionary key');
        keys.add(key);
        (result.entries as unknown[][]).push([key, reifyAtom(entry.value)]);
      }
      if (shape.mutable) referenceDepth--;
      pending.delete(id);
      return result;
    }
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
      const orderedElements = ordered(indexed, 'container elements');
      const values: ReifiedValue[] = [];
      const result: ReifiedValue = shape.kind === 'raw-array' ? values : { vals: values };
      memo.set(id, result);
      activeSequences.add(id);
      for (const target of orderedElements) values.push(reifyAtom(target));
      activeSequences.delete(id);
      pending.delete(id);
      return result;
    }

    const byField = fields.get(id) ?? new Map<string, string[]>();
    const present = Array.from(byField.keys());
    const declared = idx.constructors.get(atom.type);
    // Nonempty constructor arity follows its field declarations. Only the
    // zero() / zero distinction needs an additional relational fact.
    const arity = shape ? undefined : idx.nullary.has(id) ? 0 : declared?.size ?? (present.length ? undefined : -1);
    const mutable = [...(idx.mutableFields.get(id) ?? [])];
    if (mutable.some(p => arity === undefined || p >= arity)) throw new Error('Malformed Pyret mutable field positions');

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
      const positions = idx.objectPositions.get(id) ?? new Map();
      order = ordered(new Map([...positions].map(([field, position]) => [position, field])), 'object fields');
    } else if (arity !== undefined) {
      const schema = declared ?? new Map<string, number>();
      const count = Math.max(0, arity);
      if (present.length !== count || schema.size !== count
          || [...schema].some(([field, p]) => p >= count || !byField.has(field))) {
        throw new Error('Incomplete Pyret constructor fields');
      }
      order = [...schema].sort((a, b) => a[1] - b[1]).map(([f]) => f);
      obj.$arity = arity;
      obj.$constructor = { $fieldNames: order };
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
    for (const i of mutable) {
      const value = obj.dict![order[i]] as PyretObject;
      if (!value || typeof value !== 'object'
          || reifiedValueInfo(value)?.kind !== 'reference') {
        throw new Error('Pyret mutable field must contain a reference');
      }
    }
    pending.delete(id);
    return obj;
  };

  // The observation point belongs to the call, not the relational datum.
  if (rootIds !== undefined) {
    return rootIds.map(rootId => {
      if (!atomsById.has(rootId)) throw new Error('Unknown Pyret root ID: ' + rootId);
      return reifyAtom(rootId);
    });
  }
  const allIds = di.getAtoms().map(a => a.id);
  if (!allIds.length) return [];
  const roots = allIds.filter(id => !targets.has(id));
  if (roots.length !== 1) throw new Error('Pyret graph has no unique root; supply an explicit root ID');
  return [reifyAtom(roots[0])];
}
