import type { PyretObject } from './pyret-data-instance';
import type { ReifiedValue } from './reify';
import { constructorInfo } from './identity';
import { numberPayload } from './numbers';
import { readValueInfo } from './values';
import { setContents } from './set-source';

type Render = (value: ReifiedValue, child: (value: ReifiedValue) => string) => string;
type Owner = { value: PyretObject; field: string };

/** Emit a graph construction block only when references are reachable.
 * Constructor calls allocate their own mutable cells. Bind aliases to those
 * cells, rather than passing a preallocated ref (which would wrap it again).
 * Each reference must have a reachable mutable constructor field that allocates
 * it: Pyret has no standalone reference expression (object ref fields are NYI,
 * and helper data declarations are forbidden inside expressions). No runtime
 * object, undeclared helper constructor, or constructor cache is consulted.
 */
export function referenceSource(root: ReifiedValue, render: Render, fieldName: (name: string) => string): string | undefined {
  const shapeOf = (v: PyretObject) => '$pyretValue' in v ? readValueInfo({ pyretValue: v.$pyretValue }) : undefined;
  const structured = (v: ReifiedValue): v is PyretObject | ReifiedValue[] =>
    !!v && typeof v === 'object' && !numberPayload(v) && shapeOf(v as PyretObject)?.kind !== 'nothing';
  const children = (v: PyretObject | ReifiedValue[]): ReifiedValue[] => {
    if (Array.isArray(v)) return v;
    const shape = shapeOf(v);
    if (shape?.kind === 'reference') return [v.value as ReifiedValue];
    if (Array.isArray(v.vals)) return v.vals as ReifiedValue[];
    const set = setContents(v);
    if (set) return set.elements;
    return (shape?.kind === 'object' ? shape.fields : Object.keys(v.dict ?? {}))
      .map(k => v.dict![k] as ReifiedValue);
  };
  const nodes = new Set<PyretObject | ReifiedValue[]>();
  const refs = new Set<PyretObject>();
  const stack = [root];
  while (stack.length) {
    const v = stack.pop()!;
    if (!structured(v) || nodes.has(v)) continue;
    nodes.add(v);
    if (!Array.isArray(v) && shapeOf(v)?.kind === 'reference') refs.add(v);
    const next = children(v);
    for (let i = next.length - 1; i >= 0; i--) stack.push(next[i]);
  }
  if (!refs.size) return undefined;

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

  // Construct immutable dependencies first. An unrestricted mutable field may
  // temporarily contain nothing, which breaks the reference cycle. Annotated
  // fields use their final target at construction time instead.
  const pending = [...nodes].filter(v => !refs.has(v as PyretObject));
  while (pending.length) {
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
            : shape?.kind === 'reference' && shape.canInitializeWithNothing
              ? null : ref.value;
        }
        initial = { ...obj, dict };
      }
      if (!children(initial).every(available)) { i++; continue; }
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
      throw new Error('Pyret graph cannot be constructed: cycles must cross mutable fields that can initialize with nothing');
    }
  }
  for (const [ref, { owner, field }] of patches) {
    lines.push(`${owner}!{${fieldName(field)}: ${expr(ref.value as ReifiedValue)}}`);
  }
  lines.push(expr(root));
  return `block:\n${lines.map(line => '  ' + line).join('\n')}\nend`;
}
