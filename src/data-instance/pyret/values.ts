/** Internal reconstructed value tags, never serialized into IDataInstance. */
export type PyretValueInfo =
  | { kind: 'nothing' }
  | { kind: 'reference'; unrestricted: boolean }
  | { kind: 'object' }
  | { kind: 'tuple' | 'raw-array' }
  | { kind: 'table' }
  | { kind: 'string-dict'; mutable: boolean; sealed: boolean };

export function reifiedValueInfo(value: Record<string, unknown>): PyretValueInfo | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, '$pyretValue')) return undefined;
  const v = value.$pyretValue as Partial<PyretValueInfo> | null;
  if (v?.kind === 'nothing' || v?.kind === 'object' || v?.kind === 'tuple' || v?.kind === 'raw-array' || v?.kind === 'table') {
    return { kind: v.kind };
  }
  if (v?.kind === 'reference' && typeof v.unrestricted === 'boolean') return { kind: v.kind, unrestricted: v.unrestricted };
  if (v?.kind === 'string-dict' && typeof v.mutable === 'boolean' && typeof v.sealed === 'boolean' && (v.mutable || !v.sealed)) {
    return { kind: v.kind, mutable: v.mutable, sealed: v.sealed };
  }
  throw new Error('Malformed reconstructed Pyret value');
}

/** PRef has no dict/brand. Recognize its data and annotation-list protocol
 * without relying on constructor names, runtime realms, or executing checks. */
export function isRuntimeReference(value: unknown): value is {
  state: number; value: unknown; anns: { anns: Array<{ ann: { name?: string } }> };
} {
  if (!value || typeof value !== 'object' || 'dict' in value) return false;
  const ref = value as Record<string, any>;
  return Number.isInteger(ref.state) && 'value' in ref && !!ref.anns
    && Array.isArray(ref.anns.anns) && typeof ref.anns.check === 'function'
    && typeof ref.anns.addAnn === 'function'
    && Object.keys(ref).every(k => k === 'state' || k === 'value' || k === 'anns');
}

export function referenceInfo(value: unknown): Extract<PyretValueInfo, { kind: 'reference' }> | undefined {
  if (!isRuntimeReference(value)) return undefined;
  // Pyret states: 0 graphable, 1 unset, 2 set, 3 frozen. This feature snapshots
  // initialized mutable cells; silently dropping other states would lose data.
  if (value.state !== 2) throw new Error('Only initialized mutable Pyret references are supported');
  return { kind: 'reference',
    // Only Any is known safe without running potentially stateful annotations.
    // Other annotations can still be reconstructed using the real target first.
    unrestricted: value.anns.anns.every(entry => entry.ann?.name === 'Any') };
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
