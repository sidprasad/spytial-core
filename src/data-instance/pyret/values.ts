/** Container/value shape lives on atoms, never in their IDs. */
export type PyretValueInfo = { version: 1 } & (
  | { kind: 'nothing' }
  | { kind: 'object'; fields: string[] }
  | { kind: 'tuple' | 'raw-array'; length: number }
);

export function readValueInfo(metadata?: Record<string, unknown>): PyretValueInfo | undefined {
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, 'pyretValue')) return undefined;
  const v = metadata.pyretValue as Partial<PyretValueInfo> | null;
  if (v?.version === 1) {
    if (v.kind === 'nothing') return { version: 1, kind: 'nothing' };
    if (v.kind === 'object' && Array.isArray(v.fields)
        && v.fields.every(f => typeof f === 'string') && new Set(v.fields).size === v.fields.length) {
      return { version: 1, kind: 'object', fields: [...v.fields] };
    }
    if ((v.kind === 'tuple' || v.kind === 'raw-array') && Number.isSafeInteger(v.length) && v.length! >= 0) {
      return { version: 1, kind: v.kind, length: v.length! };
    }
  }
  throw new Error('Malformed Pyret value metadata');
}

/** PNothing and PObject have identical own data. Their runtime protocols differ.
 * Do not use constructor.name: Pyret's inheritance helper does not set it, and
 * bundles/minifiers and separate runtime realms can change constructors.
 * PNothing has brand/extendWith but no updateDict; PFunction/PMethod have extra
 * app/meth fields. The structural reifier instead supplies an explicit tag. */
export function isRuntimeNothing(value: Record<string, unknown>): boolean {
  return !!value.dict && typeof value.dict === 'object'
    && Object.keys(value.dict).length === 0
    && typeof value.brand === 'function' && typeof value.extendWith === 'function'
    && !('updateDict' in value)
    && Object.keys(value).every(k => k === 'dict' || k === 'brands');
}

export function isCallableField(value: unknown): boolean {
  return typeof value === 'function' || (value !== null && typeof value === 'object'
    && ('app' in value || ('meth' in value && 'full_meth' in value)));
}

/** Match the runtime printer's for-in order, including inherited object fields. */
export function objectFields(dict: Record<string, unknown>, showFunctions: boolean): string[] {
  const fields: string[] = [];
  for (const name in dict) {
    if (showFunctions || !isCallableField(dict[name])) fields.push(name);
  }
  return fields;
}
