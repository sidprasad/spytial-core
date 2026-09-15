import type { PyretObject } from './pyret-data-instance';
import type { ReifiedValue } from './reify';
import type { PyretValueInfo } from './values';

export type DictionaryInfo = Extract<PyretValueInfo, { kind: 'string-dict' }>;
export type DictionaryEntry = [string, ReifiedValue];

/** Pyret's string-dict module explicitly exposes these reflective backing
 * fields. Use the same keys/get boundary as its printer, not the HAMT nodes,
 * runtime brands, constructor names, or executing a user's _output method.
 */
export function runtimeDictionaryInfo(value: PyretObject): DictionaryInfo | undefined {
  const method = (name: string) => {
    const m = value.dict?.[name] as { meth?: unknown; full_meth?: unknown } | undefined;
    return m && typeof m.meth === 'function' && typeof m.full_meth === 'function';
  };
  const map = value.$underlyingMap as { size?: number; keys?: unknown; get?: unknown } | undefined;
  if (map && method('keys-list') && method('get-value') && method('unfreeze')) {
    if (!Number.isSafeInteger(map.size) || map.size! < 0 || typeof map.keys !== 'function' || typeof map.get !== 'function') {
      throw new Error('Malformed Pyret string dictionary backing map');
    }
    return { kind: 'string-dict', mutable: false, sealed: false };
  }
  if (value.$underlyingDict && method('keys-list-now') && method('get-value-now') && method('freeze')) {
    if (typeof value.$underlyingDict !== 'object' || (value.$sealed !== undefined && typeof value.$sealed !== 'boolean')) {
      throw new Error('Malformed Pyret mutable string dictionary backing map');
    }
    return { kind: 'string-dict',
      mutable: true, sealed: value.$sealed === true };
  }
  return undefined;
}

export function dictionaryEntries(value: PyretObject, info: DictionaryInfo): DictionaryEntry[] {
  let entries: unknown;
  if ('$pyretValue' in value) entries = value.entries;
  else if (info.mutable) entries = Object.entries(value.$underlyingDict as Record<string, unknown>);
  else {
    const map = value.$underlyingMap as { keys(): unknown; get(key: string): unknown };
    const keys = map.keys();
    if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string')) throw new Error('Malformed Pyret dictionary keys');
    entries = keys.map(key => [key, map.get(key)]);
  }
  if (!Array.isArray(entries)
      || entries.some(e => !Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string')
      || new Set(entries.map(e => e[0])).size !== entries.length) throw new Error('Malformed Pyret dictionary entries');
  return entries as DictionaryEntry[];
}

/** Requires the caller to include string-dict in the later evaluation scope. */
export function dictionarySource(info: DictionaryInfo, entries: DictionaryEntry[], child: (v: ReifiedValue) => string): string {
  const kind = info.mutable ? 'mutable-string-dict' : 'string-dict';
  const ordered = [...entries];
  if (!info.mutable && ordered.length > 8) {
    // Pyret's string-dict HAMT promotes its initial eight-entry array using
    // the ninth key first (createNodes in trove/string-dict.js). That rotates
    // a collision bucket. Put its observed first key ninth to undo that one
    // rotation; later insertions retain each bucket's order. Hashes here are
    // derived from exact keys, never stored in the datum or IDs.
    const hash = (key: string): number => {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (31 * h + key.charCodeAt(i)) | 0;
      return ((h >>> 1) & 0x40000000) | (h & 0xBFFFFFFF);
    };
    const ninthHash = hash(ordered[8][0]);
    const first = ordered.findIndex(([key]) => hash(key) === ninthHash);
    ordered.splice(8, 0, ordered.splice(first, 1)[0]);
  }
  return `[${kind}: ${ordered.flatMap(([key, value]) => [child(key), child(value)]).join(', ')}]`
    + (info.sealed ? '.seal()' : '');
}
