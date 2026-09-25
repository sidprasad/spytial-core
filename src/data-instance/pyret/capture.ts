import { PyretDataInstance } from './pyret-data-instance';
import { JSONDataInstance } from '../json-data-instance';
import type { IAtom, IRelation, IType } from '../interfaces';
import { constructorTypeId, readConstructorTypeId } from './identity';
import { reifyToValues, type ReifiedValue } from './reify';
import type { PyretObservation, PyretRuntimeAdapter } from './runtime-adapter';

export type PyretCaptureJson = null | boolean | number | string | PyretCaptureJson[] | { [key: string]: PyretCaptureJson };
export interface PyretCaptureRoot { name: string; value: unknown; observation?: PyretCaptureJson }
export interface PyretCaptureSnapshot {
  format: 'spytial-pyret-capture';
  version: 1;
  datum: { atoms: IAtom[]; relations: IRelation[]; types: IType[] };
  roots: Array<{ name: string; atomId: string; observation?: PyretCaptureJson }>;
  provenance?: PyretCaptureJson;
}

export class PyretCaptureError extends Error {
  constructor(public readonly root: string, public readonly path: readonly (string | number)[], public readonly reason: string) {
    super(`Cannot capture ${JSON.stringify(root)}${path.map(p => `[${JSON.stringify(p)}]`).join('')}: ${reason}`);
    this.name = 'PyretCaptureError';
  }
}

/** Reject capabilities, cycles and non-JSON values rather than silently drop them. */
function jsonCopy<T>(value: T): T {
  const active = new Set<object>();
  function check(v: unknown): void {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    const proto = v && typeof v === 'object' ? Object.getPrototypeOf(v) : undefined;
    if (!v || typeof v !== 'object' || (!Array.isArray(v) && proto !== null && Object.getPrototypeOf(proto) !== null)) {
      throw new Error('Capture metadata must contain only JSON values');
    }
    if (active.has(v)) throw new Error('Capture metadata must not contain cycles');
    active.add(v);
    for (const key of Reflect.ownKeys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
      if (typeof key !== 'string' || descriptor.get || descriptor.set) throw new Error('Capture metadata must not contain symbols or accessors');
    }
    for (const child of Array.isArray(v) ? Array.from(v) : Object.values(v)) check(child);
    active.delete(v);
  }
  check(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Snapshot declared state without running user code. Adapter observations are
 * materialized as transient structural carriers for the existing relationalizer;
 * only its datum is exported. The carriers and all live identities die here.
 */
export function capturePyret(roots: readonly PyretCaptureRoot[], adapter: PyretRuntimeAdapter,
  provenance?: PyretCaptureJson): PyretCaptureSnapshot {
  if (!Array.isArray(roots) || !roots.length) throw new Error('Capture requires at least one named root');
  const names = new Set<string>();
  for (const root of roots) {
    if (!root || typeof root.name !== 'string' || !root.name || names.has(root.name)) throw new Error('Capture root names must be nonempty and unique');
    names.add(root.name);
  }
  const scope = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const seen = new Map<unknown, any>();
  const constructors = new Map<object, { id: string; schema: string }>();
  type Work = { carrier: any; observed: PyretObservation; root: string; path: (string | number)[] };
  const queue: Work[] = [];
  const visit = (value: unknown, root: string, path: (string | number)[]): any => {
    if (seen.has(value)) return seen.get(value);
    try {
      const observed = adapter.observe(value);
      if (observed.kind === 'primitive') return observed.value;
      let carrier: any;
      switch (observed.kind) {
        case 'nothing': carrier = { $pyretValue: { kind: 'nothing' } }; break;
        case 'raw-array': carrier = []; break;
        case 'tuple': carrier = { vals: [] }; break;
        case 'object': carrier = { $pyretValue: { kind: 'object' }, dict: Object.create(null) }; break;
        case 'reference': carrier = { $pyretValue: { kind: 'reference', unrestricted: true } }; break;
        case 'string-dict': carrier = { $pyretValue: { kind: 'string-dict', mutable: observed.mutable, sealed: observed.sealed }, entries: [] }; break;
        case 'table': carrier = { $pyretValue: { kind: 'table' }, dict: Object.create(null) }; break;
        case 'constructor': {
          const schema = JSON.stringify(observed.info);
          let ctor = constructors.get(observed.identity);
          if (ctor && ctor.schema !== schema) throw new Error('Constructor schema changed during capture');
          if (!ctor) {
            ctor = { id: constructorTypeId(scope, constructors.size, observed.info.name), schema };
            constructors.set(observed.identity, ctor);
          }
          carrier = { $name: ctor.id, $arity: observed.info.arity,
            $constructor: { $fieldNames: observed.info.fields.slice() },
            $mut_fields_mask: observed.info.fields.map((_, i) => (observed.info.mutableFields ?? []).includes(i)),
            dict: Object.create(null) };
          break;
        }
        default: throw new Error('Unsupported adapter observation');
      }
      seen.set(value, carrier);
      queue.push({ carrier, observed, root, path });
      return carrier;
    } catch (error) {
      if (error instanceof PyretCaptureError) throw error;
      throw new PyretCaptureError(root, path, error instanceof Error ? error.message : String(error));
    }
  };
  const values = roots.map(r => visit(r.value, r.name, []));
  for (let i = 0; i < queue.length; i++) {
    const { carrier, observed: o, root, path } = queue[i];
    const child = (value: unknown, ...steps: (string | number)[]) => visit(value, root, [...path, ...steps]);
    switch (o.kind) {
      case 'constructor': o.info.fields.forEach((f, n) => { carrier.dict[f] = child(o.values[n], f); }); break;
      case 'object': o.fields.forEach(([f, value]) => { carrier.dict[f] = child(value, f); }); break;
      case 'raw-array': o.values.forEach((v, n) => carrier.push(child(v, n))); break;
      case 'tuple': o.values.forEach((v, n) => carrier.vals.push(child(v, n))); break;
      case 'reference': carrier.value = child(o.value, 'target'); break;
      case 'string-dict': o.entries.forEach(([key, value]) => carrier.entries.push([key, child(value, key)])); break;
      case 'table':
        carrier.dict['_header-raw-array'] = o.headers.slice();
        carrier.dict['_rows-raw-array'] = o.rows.map((row, n) => row.map((value, c) => child(value, 'rows', n, o.headers[c])));
        break;
    }
  }
  const { instance, rootIds } = PyretDataInstance.fromValues(values);
  return jsonCopy({ format: 'spytial-pyret-capture', version: 1,
    datum: { atoms: [...instance.getAtoms()], relations: [...instance.getRelations()], types: [...instance.getTypes()] },
    roots: roots.map((r, i) => ({ name: r.name, atomId: rootIds[i], ...(r.observation === undefined ? {} : { observation: r.observation }) })),
    ...(provenance === undefined ? {} : { provenance }),
  });
}

/** Import with no runtime, producer caches, browser or evaluator. Never repair invalid capture data. */
export function importPyretCapture(input: unknown): { snapshot: PyretCaptureSnapshot; instance: JSONDataInstance; values: ReadonlyMap<string, ReifiedValue> } {
  const s = jsonCopy(input) as PyretCaptureSnapshot;
  if (!s || s.format !== 'spytial-pyret-capture' || s.version !== 1) throw new Error('Unsupported Pyret capture format/version');
  if (!Array.isArray(s.roots) || !s.roots.length || !s.datum || !Array.isArray(s.datum.atoms)
      || !Array.isArray(s.datum.relations) || !Array.isArray(s.datum.types)) throw new Error('Malformed Pyret capture');
  const atoms = new Map<string, IAtom>();
  const kinds = new Set(['Number', 'String', 'Boolean', 'Nothing', 'Object', 'Index', 'Tuple', 'RawArray', 'Reference', 'StringDict', 'MutableStringDict', 'Table']);
  for (const a of s.datum.atoms) {
    if (!a || typeof a.id !== 'string' || !a.id || atoms.has(a.id) || typeof a.label !== 'string' || typeof a.type !== 'string'
        || (!kinds.has(a.type) && !readConstructorTypeId(a.type))) throw new Error('Malformed or duplicate Pyret capture atom');
    if (a.type === 'Index' && (!/^(0|[1-9][0-9]*)$/.test(a.label) || !Number.isSafeInteger(Number(a.label)))) throw new Error('Malformed Pyret capture index');
    atoms.set(a.id, a);
  }
  const relationIds = new Set<string>();
  const compatible = (type: string, atom: IAtom) => type === atom.type || type === 'PyretObject'
    || (!kinds.has(type) && type === readConstructorTypeId(atom.type)?.name);
  const typeIds = new Set<string>();
  for (const t of s.datum.types) {
    if (!t || typeof t.id !== 'string' || typeIds.has(t.id) || !Array.isArray(t.types)
        || t.types[0] !== t.id || t.types.some(type => typeof type !== 'string')
        || !Array.isArray(t.atoms) || typeof t.isBuiltin !== 'boolean') throw new Error('Malformed Pyret capture type');
    typeIds.add(t.id);
    const members = new Set<string>();
    for (const a of t.atoms) {
      const canonical = a && atoms.get(a.id);
      if (!canonical || members.has(a.id) || a.type !== canonical.type || a.label !== canonical.label
          || !compatible(t.id, canonical)) throw new Error('Invalid Pyret capture type membership');
      members.add(a.id);
    }
  }
  if ([...atoms.values()].some(a => !typeIds.has(a.type))
      || s.datum.types.some(t => t.types.some(id => !typeIds.has(id)))) throw new Error('Unknown Pyret capture type');
  for (const r of s.datum.relations) {
    if (!r || typeof r.id !== 'string' || relationIds.has(r.id) || typeof r.name !== 'string' || !Array.isArray(r.tuples)
        || !Array.isArray(r.types)) throw new Error('Malformed or duplicate Pyret capture relation');
    relationIds.add(r.id);
    const tupleIds = new Set<string>();
    for (const t of r.tuples) {
      if (!t || !Array.isArray(t.atoms) || !t.atoms.length || t.atoms.some(id => !atoms.has(id))
          || !Array.isArray(t.types) || t.types.length !== t.atoms.length
          || t.types.some((type, i) => !compatible(type, atoms.get(t.atoms[i])!))) throw new Error('Malformed Pyret capture tuple');
      const key = JSON.stringify(t.atoms);
      if (tupleIds.has(key)) throw new Error('Duplicate Pyret capture tuple');
      tupleIds.add(key);
    }
  }
  const names = new Set<string>();
  for (const root of s.roots) {
    if (!root || typeof root.name !== 'string' || !root.name || names.has(root.name)
        || !atoms.has(root.atomId) || atoms.get(root.atomId)!.type === 'Index') throw new Error('Invalid Pyret capture root');
    names.add(root.name);
  }
  const instance = new JSONDataInstance(s.datum);
  if (instance.getErrors().length) throw new Error(instance.getErrors().join('; '));
  // Validate the structural encoding, including fields, targets, and dense
  // positions. Structural cycles are valid even when source emission is not.
  const ids = [...atoms.values()].filter(a => a.type !== 'Index').map(a => a.id);
  const reconstructed = reifyToValues(instance, ids, { allowContainerCycles: true });
  const byId = new Map(ids.map((id, i) => [id, reconstructed[i]]));
  return { snapshot: s, instance, values: new Map(s.roots.map(r => [r.name, byId.get(r.atomId)!])) };
}
