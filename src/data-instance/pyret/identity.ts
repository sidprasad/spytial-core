/**
 * Versioned, reversible Pyret field metadata in relation IDs.
 * Names/labels remain ordinary host names. JSON arrays avoid delimiter and
 * Unicode collisions. No field order or constructor kind lives in a cache.
 */
const FIELD = 'pyret:field:v1:';

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

export function readMutableFields(metadata?: Record<string, unknown>): number[] {
  const arity = readConstructorMetadata(metadata);
  const positions = (metadata?.pyret as { mutableFields?: unknown } | undefined)?.mutableFields;
  if (positions === undefined) return [];
  if (arity === undefined || !Array.isArray(positions) || new Set(positions).size !== positions.length
      || positions.some(p => !Number.isInteger(p) || p < 0 || p >= arity)) {
    throw new Error('Malformed Pyret mutable field positions');
  }
  return [...positions];
}

export function fieldId(info: ConstructorInfo, position: number): string {
  return FIELD + JSON.stringify([info.name, position, info.fields[position]]);
}

export function readConstructorMetadata(metadata?: Record<string, unknown>): number | undefined {
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, 'pyret')) return undefined;
  const value = metadata.pyret as { version?: number; arity?: number } | null;
  if (!value || value.version !== 1 || !Number.isInteger(value.arity) || value.arity! < -1) {
    throw new Error('Malformed Pyret constructor metadata');
  }
  return value.arity;
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
