/**
 * Versioned, reversible Pyret field metadata in relation IDs.
 * Names/labels remain ordinary host names. JSON arrays avoid delimiter and
 * Unicode collisions. No field order or constructor kind lives in a cache.
 */
const FIELD = 'pyret:field:v1:';
const CONSTRUCTOR = 'pyret:constructor:v1:';

/** Capture-scoped nominal identity; display spelling is never its identity. */
export function constructorTypeId(scope: string, index: number, name: string): string {
  return CONSTRUCTOR + JSON.stringify([scope, index, name]);
}

export function readConstructorTypeId(id: string): { scope: string; index: number; name: string } | undefined {
  if (!id.startsWith(CONSTRUCTOR)) return undefined;
  const v: unknown = JSON.parse(id.slice(CONSTRUCTOR.length));
  if (!Array.isArray(v) || v.length !== 3 || typeof v[0] !== 'string' || !v[0]
      || !Number.isSafeInteger(v[1]) || v[1] < 0 || typeof v[2] !== 'string' || !v[2]) {
    throw new Error('Malformed Pyret constructor identity');
  }
  return { scope: v[0], index: v[1], name: v[2] };
}

export function constructorDisplayName(id: string): string {
  return readConstructorTypeId(id)?.name ?? id;
}

export interface ConstructorInfo { name: string; arity: number; fields: string[]; mutableFields?: number[] }

export function constructorInfo(value: {
  $name?: string; $arity?: number; $constructor?: unknown; $mut_fields_mask?: unknown;
}): ConstructorInfo | undefined {
  const { $name: name, $arity: arity } = value;
  if (typeof name !== 'string' || !Number.isInteger(arity) || arity! < -1) return undefined;
  const fields = (value.$constructor as { $fieldNames?: unknown } | undefined)?.$fieldNames;
  if (arity === -1) return { name, arity, fields: [] };
  if (!Array.isArray(fields) || fields.length !== arity || fields.some(f => typeof f !== 'string')
      || new Set(fields).size !== fields.length) {
    throw new Error(`Invalid Pyret constructor metadata for ${name}`);
  }
  const mask = value.$mut_fields_mask;
  if (mask !== undefined && (!Array.isArray(mask) || mask.length !== arity || mask.some(v => typeof v !== 'boolean'))) {
    throw new Error(`Invalid Pyret mutable field mask for ${name}`);
  }
  const mutableFields = (mask as boolean[] | undefined)?.flatMap((mut, i) => mut ? [i] : []) ?? [];
  return { name, arity: arity!, fields, ...(mutableFields.length ? { mutableFields } : {}) };
}

export function fieldId(info: ConstructorInfo, position: number): string {
  return FIELD + JSON.stringify([info.name, position, info.fields[position]]);
}

export function readFieldId(id: string): { name: string; position: number; field: string } | undefined {
  if (!id.startsWith(FIELD)) return undefined;
  const value: unknown = JSON.parse(id.slice(FIELD.length));
  if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'string'
      || !Number.isInteger(value[1]) || value[1] < 0 || typeof value[2] !== 'string') {
    throw new Error('Malformed Pyret field ID');
  }
  return { name: value[0], position: value[1], field: value[2] };
}
