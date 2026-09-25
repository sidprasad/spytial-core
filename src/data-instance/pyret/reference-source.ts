import type { PyretObject } from './pyret-data-instance';
import type { ReifiedValue } from './reify';
import { constructorInfo } from './identity';
import { numberPayload } from './numbers';
import { reifiedValueInfo } from './values';
import { setContents } from './set-source';
import type { DictionaryEntry, DictionaryInfo } from './string-dict';
import { tableContents } from './table';

type Render = (value: ReifiedValue, child: (value: ReifiedValue) => string) => string;
type Owner = { value: PyretObject; field: string };

/** Emit graph construction for references, shared mutable dictionaries, and shared table cells.
 * Constructor calls allocate their own mutable cells. Bind aliases to those
 * cells, rather than passing a preallocated ref (which would wrap it again).
 * Each reference must have a reachable mutable constructor field that allocates
 * it: Pyret has no standalone reference expression (object ref fields are NYI,
 * and helper data declarations are forbidden inside expressions). No runtime
 * object, undeclared helper constructor, or constructor cache is consulted.
 */
export function referenceSource(root: ReifiedValue, render: Render, fieldName: (name: string) => string): string | undefined {
  const shapeOf = reifiedValueInfo;
  const structured = (v: ReifiedValue): v is PyretObject | ReifiedValue[] =>
    !!v && typeof v === 'object' && !numberPayload(v) && shapeOf(v as PyretObject)?.kind !== 'nothing';
  const children = (v: PyretObject | ReifiedValue[]): ReifiedValue[] => {
    if (Array.isArray(v)) return v;
    const shape = shapeOf(v);
    if (shape?.kind === 'reference') return [v.value as ReifiedValue];
    if (shape?.kind === 'string-dict') return (v.entries as DictionaryEntry[]).map(entry => entry[1]);
    if (shape?.kind === 'table') return tableContents(v).rows.flat();
    if (Array.isArray(v.vals)) return v.vals as ReifiedValue[];
    const set = setContents(v);
    if (set) return set.elements;
    return Object.keys(v.dict ?? {})
      .map(k => v.dict![k] as ReifiedValue);
  };
  const nodes = new Set<PyretObject | ReifiedValue[]>();
  const refs = new Set<PyretObject>();
  const dictionaries = new Map<PyretObject, DictionaryInfo>();
  let hasSharing = false;
  let hasTables = false;
  const stack = [root];
  while (stack.length) {
    const v = stack.pop()!;
    if (!structured(v)) continue;
    if (nodes.has(v)) { hasSharing = true; continue; }
    nodes.add(v);
    if (!Array.isArray(v) && shapeOf(v)?.kind === 'reference') refs.add(v);
    if (!Array.isArray(v)) {
      const shape = shapeOf(v);
      if (shape?.kind === 'string-dict' && shape.mutable) dictionaries.set(v, shape);
      if (shape?.kind === 'table') hasTables = true;
    }
    const next = children(v);
    for (let i = next.length - 1; i >= 0; i--) stack.push(next[i]);
  }
  if (!refs.size && !((dictionaries.size || hasTables) && hasSharing)) return undefined;

  const owners = new Map<PyretObject, Owner>();
  const mutable = new Map<PyretObject, string[]>();
  const reserved = new Set<string>(['nothing']);
  for (const v of nodes) {
    if (Array.isArray(v)) continue;
    if (typeof v.$name === 'string') reserved.add(v.$name);
    const info = constructorInfo(v);
    const fields = info?.mutableFields?.map(i => info.fields[i]) ?? [];
    mutable.set(v, fields);
    for (const field of fields) {
      const ref = v.dict![field] as PyretObject;
      if (!refs.has(ref)) throw new Error('Pyret mutable field must contain a reference');
      if (owners.has(ref)) throw new Error('A Pyret reference shared by multiple mutable constructor fields cannot be reconstructed');
      owners.set(ref, { value: v, field });
    }
  }
  let serial = 0;
  const fresh = (prefix: string): string => {
    let name: string;
    do { name = prefix + serial++; } while (reserved.has(name));
    reserved.add(name);
    return name;
  };
  const names = new Map<object, string>();
  const ready = new Set<object>();
  const lines: string[] = [];
  const patches = new Map<PyretObject, { owner: string; field: string }>();
  const available = (v: ReifiedValue): boolean => !structured(v) || ready.has(v);
  const expr = (v: ReifiedValue): string => {
    if (!structured(v)) return render(v, expr);
    if (!ready.has(v)) throw new Error('Unresolved Pyret construction dependency');
    return names.get(v)!;
  };
  for (const v of nodes) if (!refs.has(v as PyretObject)) names.set(v, fresh('spytial-value'));

  if ([...refs].some(r => !owners.has(r))) {
    throw new Error('Pyret reference source requires a reachable mutable constructor field for each reference');
  }

  // Mutable dictionaries allocate independently of their entries. A sealed
  // view is made before filling through its private local, so cycles and
  // aliases can point at the final view without bypassing its public seal.
  const dictionaryStorage = new Map<PyretObject, string>();
  for (const [v, shape] of dictionaries) {
    const name = names.get(v)!;
    const storage = shape.sealed ? fresh('spytial-dict') : name;
    lines.push(`shadow ${storage} = ${render({ $pyretValue: { ...shape, sealed: false }, entries: [] }, expr)}`);
    if (shape.sealed) lines.push(`shadow ${name} = ${storage}.seal()`);
    ready.add(v);
    dictionaryStorage.set(v, storage);
  }
  const unfilled = new Map(dictionaryStorage);
  const fillAvailable = (): void => {
    for (const [v, storage] of unfilled) {
      if (!children(v).every(available)) continue;
      for (const [key, value] of v.entries as DictionaryEntry[]) {
        lines.push(`${storage}.set-now(${expr(key)}, ${expr(value)})`);
      }
      unfilled.delete(v);
    }
    for (const [ref, { owner, field }] of patches) {
      if (!available(ref.value as ReifiedValue)) continue;
      lines.push(`${owner}!{${fieldName(field)}: ${expr(ref.value as ReifiedValue)}}`);
      patches.delete(ref);
    }
  };
  const complete = (value: ReifiedValue): boolean => {
    const seen = new Set<object>(), todo = [value];
    while (todo.length) {
      const v = todo.pop()!;
      if (!structured(v) || seen.has(v)) continue;
      if (!ready.has(v) || unfilled.has(v as PyretObject) || patches.has(v as PyretObject)) return false;
      seen.add(v);
      todo.push(...children(v));
    }
    return true;
  };

  // Construct immutable dependencies first. An unrestricted mutable field may
  // temporarily contain nothing, which breaks the reference cycle. Annotated
  // fields use their final target at construction time instead.
  const pending = [...nodes].filter(v => !refs.has(v as PyretObject) && !dictionaries.has(v as PyretObject));
  while (pending.length) {
    fillAvailable();
    let progress = false;
    for (let i = 0; i < pending.length;) {
      const v = pending[i];
      const fields = Array.isArray(v) ? [] : mutable.get(v) ?? [];
      let initial = v;
      if (fields.length) {
        const obj = v as PyretObject;
        const dict = { ...obj.dict };
        for (const field of fields) {
          const ref = obj.dict![field] as PyretObject;
          const shape = shapeOf(ref);
          dict[field] = available(ref.value as ReifiedValue) ? ref.value
            : shape?.kind === 'reference' && shape.unrestricted
              ? null : ref.value;
        }
        initial = { ...obj, dict };
      }
      if (!children(initial).every(available)) { i++; continue; }
      // Set constructors compare their elements. Comparing empty dictionary
      // shells would collapse distinct eventual elements into one member.
      if (setContents(initial) && !children(initial).every(complete)) { i++; continue; }
      const name = names.get(v)!;
      lines.push(`shadow ${name} = ${render(initial, expr)}`);
      ready.add(v);
      for (const field of fields) {
        const ref = (v as PyretObject).dict![field] as PyretObject;
        names.set(ref, `${name}.${fieldName(field).trim()}`);
        ready.add(ref);
        if (!available(ref.value as ReifiedValue) || (initial as PyretObject).dict![field] === null) {
          patches.set(ref, { owner: name, field });
        }
      }
      pending.splice(i, 1);
      progress = true;
    }
    if (!progress) {
      throw new Error('Pyret graph cannot be constructed: cycles need allocatable mutable fields and set elements need complete contents');
    }
  }
  fillAvailable();
  lines.push(expr(root));
  return `block:\n${lines.map(line => '  ' + line).join('\n')}\nend`;
}
