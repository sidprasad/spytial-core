import { constructorInfo, type ConstructorInfo } from './identity';
import { numberPayload, type PyretNumberPayload } from './numbers';
import { runtimeDictionaryInfo, dictionaryEntries } from './string-dict';
import { isRuntimeTable, isRuntimeRow, tableContents } from './table';

/** The adapter returns observations, never serialized values or display output. */
export type PyretObservation =
  | { kind: 'primitive'; value: string | boolean | { $pyretNumber: PyretNumberPayload } }
  | { kind: 'nothing' }
  | { kind: 'constructor'; identity: object; info: ConstructorInfo; values: unknown[] }
  | { kind: 'object'; fields: Array<[string, unknown]> }
  | { kind: 'raw-array' | 'tuple'; values: unknown[] }
  | { kind: 'reference'; value: unknown }
  | { kind: 'string-dict'; mutable: boolean; sealed: boolean; entries: Array<[string, unknown]> }
  | { kind: 'table'; headers: string[]; rows: unknown[][] };

export interface PyretRuntimeAdapter {
  /** Throw for unsupported state; capture adds the selected root and path. */
  observe(value: unknown): PyretObservation;
}

/** Predicates must come from the runtime that owns the value, not another realm. */
export interface PyretCaptureRuntime {
  Any: unknown;
  isNumber(value: unknown): boolean;
  isNothing(value: unknown): boolean;
  isDataValue(value: unknown): boolean;
  isTuple(value: unknown): boolean;
  isRef(value: unknown): boolean;
  isFunction(value: unknown): boolean;
  isMethod(value: unknown): boolean;
  isOpaque(value: unknown): boolean;
  isObject(value: unknown): boolean;
}

/**
 * Adapter for upstream Pyret's JS runtime. All runtime representation reads are
 * isolated here (including library backing stores). No printers, annotations,
 * user functions, field dereferencing, or evaluator operations are invoked.
 */
export function createPyretRuntimeAdapter(runtime: PyretCaptureRuntime): PyretRuntimeAdapter {
  for (const name of ['isNumber', 'isNothing', 'isDataValue', 'isTuple', 'isRef',
    'isFunction', 'isMethod', 'isOpaque', 'isObject'] as const) {
    if (typeof runtime?.[name] !== 'function') throw new Error(`Pyret runtime lacks ${name}`);
  }
  return { observe(value): PyretObservation {
    if (typeof value === 'string' || typeof value === 'boolean') return { kind: 'primitive', value };
    if (runtime.isNumber(value)) {
      const payload = numberPayload(value);
      if (!payload) throw new Error('Unsupported Pyret numeric representation');
      return { kind: 'primitive', value: { $pyretNumber: payload } };
    }
    if (runtime.isFunction(value)) throw new Error('Unsupported Pyret function');
    if (runtime.isMethod(value)) throw new Error('Unsupported Pyret method');
    if (runtime.isOpaque(value)) throw new Error('Unsupported Pyret opaque value');
    if (runtime.isNothing(value)) return { kind: 'nothing' };
    if (Array.isArray(value)) {
      if (Array.from({ length: value.length }, (_, i) => i).some(i => !(i in value))) {
        throw new Error('Unsupported sparse raw array');
      }
      return { kind: 'raw-array', values: value.slice() };
    }
    // The owning predicates establish the kind before any representation access.
    const v = value as any;
    if (runtime.isRef(value)) {
      if (v.state !== 2) throw new Error('Unsupported Pyret reference state: only initialized mutable references are supported');
      if (!Array.isArray(v.anns?.anns) || !v.anns.anns.every((entry: any) => entry.ann === runtime.Any)) {
        throw new Error('Unsupported Pyret reference annotation: only the runtime Any annotation is supported');
      }
      return { kind: 'reference', value: v.value };
    }
    if (runtime.isTuple(value)) return { kind: 'tuple', values: v.vals.slice() };
    if (runtime.isDataValue(value)) {
      const info = constructorInfo(v);
      if (!info || !v.$constructor || typeof v.$constructor !== 'object') throw new Error('Invalid Pyret constructor metadata');
      for (const field in v.dict) {
        if (!info.fields.includes(field) && field !== '$fieldNames' && !runtime.isMethod(v.dict[field])) {
          throw new Error(`Unsupported extra constructor field ${JSON.stringify(field)}`);
        }
      }
      return { kind: 'constructor', identity: v.$constructor, info,
        values: info.fields.map(field => v.dict[field]) };
    }
    if (runtime.isObject(value)) {
      if (isRuntimeRow(v)) throw new Error('Unsupported standalone Pyret Row');
      if (isRuntimeTable(v)) return { kind: 'table', ...tableContents(v) };
      const dict = runtimeDictionaryInfo(v);
      if (dict) return { ...dict, entries: dictionaryEntries(v, dict) };
      // Library brands without a recognized adapter must not become empty objects.
      if (v.brands && Object.keys(v.brands).some(k => k !== 'brandCount' && v.brands[k] === true)) {
        throw new Error('Unsupported branded Pyret object');
      }
      const fields: Array<[string, unknown]> = [];
      for (const name in v.dict) fields.push([name, v.dict[name]]);
      return { kind: 'object', fields };
    }
    throw new Error('Unsupported value from this Pyret runtime');
  } };
}
