import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { readFieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';
import { generateAlloySchema } from '../../src/data-instance/schema-descriptor';

const method = () => ({ meth() { throw new Error('Pyret method executed'); }, full_meth() { throw new Error('Pyret method executed'); } });
// Match the reflective fields and method protocols of trove/string-dict.js.
// Its HAMT implementation and actual printer are exercised in the runtime script.
function dictionary(entries: [string, unknown][], mutable = false, sealed = false): PyretObject {
  if (mutable) return { dict: { 'keys-list-now': method(), 'get-value-now': method(), freeze: method(), _output: method() },
    $underlyingDict: Object.assign(Object.create(null), Object.fromEntries(entries)), $sealed: sealed };
  return { dict: { 'keys-list': method(), 'get-value': method(), unfreeze: method(), _output: method() },
    $underlyingMap: { size: entries.length, keys: () => entries.map(e => e[0]),
      get: (key: string) => entries.find(e => e[0] === key)![1] } };
}
const box = (v: unknown): PyretObject => ({ $name: 'box', $arity: 1, $constructor: { $fieldNames: ['v'] }, dict: { v } });

function transport(value: PyretObject) {
  const original = new PyretDataInstance(value);
  const raw = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  const ids = new Map(raw.atoms.map((a: any, i: number) => [a.id, `opaque-${raw.atoms.length - i}`]));
  raw.atoms.forEach((a: any) => {
    a.id = ids.get(a.id);
    if (a.metadata) a.label = 'display only';
  });
  raw.relations.forEach((r: any, i: number) => {
    if (!readFieldId(r.id)) r.id = `unrelated-${i}`;
    r.tuples.forEach((t: any) => { t.atoms = t.atoms.map((id: string) => ids.get(id)); });
    r.tuples.reverse();
  });
  raw.types.forEach((t: any) => { t.atoms = []; });
  raw.atoms.reverse(); raw.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  const datum = new JSONDataInstance(raw);
  expect(datum.getErrors()).toEqual([]);
  return { original, datum, raw };
}
function roundTrip(value: PyretObject) {
  const { original, datum, raw } = transport(value);
  const rebuilt = reifyToValue(datum) as PyretObject;
  expect(canon(new PyretDataInstance(rebuilt))).toBe(canon(original));
  expect(replit(datum)).toBe(replit(original));
  return { original, datum, rebuilt, raw, source: replit(datum) };
}

describe('string dictionary fidelity (#598)', () => {
  it.each([
    ['empty', dictionary([]), '[string-dict: ]'],
    ['singleton', dictionary([['a', 1]]), '[string-dict: "a", 1]'],
    ['multiple', dictionary([['z', 1], ['a', 2]]), '[string-dict: "z", 1, "a", 2]'],
    ['mutable', dictionary([['z', 1]], true), '[mutable-string-dict: "z", 1]'],
    ['sealed', dictionary([['z', 1]], true, true), '[mutable-string-dict: "z", 1].seal()'],
    ['nested', dictionary([['a', dictionary([['b', 2]])]]), '[string-dict: "a", [string-dict: "b", 2]]'],
    ['field', box(dictionary([['a', box(1)]])), 'box([string-dict: "a", box(1)])'],
  ])('%s survives default JSON normalization without live objects or caches', (_id, value, expected) => {
    expect(roundTrip(value as PyretObject).source).toBe(expected);
  });

  it('uses dictionary/index/key/value columns and recursively relationalizes heterogeneous values', () => {
    const { datum } = roundTrip(dictionary([['a', box(1)], ['b', { vals: [true] }], ['c', 'hello']]));
    const entries = datum.getRelations().find(r => r.name === 'entry')!;
    expect(entries.types).toEqual(['PyretObject', 'Index', 'String', 'PyretObject']);
    expect(entries.tuples).toHaveLength(3);
    for (const t of entries.tuples) {
      expect(t.atoms).toHaveLength(4);
      t.atoms.forEach((id, i) => expect(datum.getAtomType(id).types).toContain(t.types[i]));
    }
    const ev = new SGraphQueryEvaluator(); ev.initialize({ sourceData: datum });
    expect(ev.evaluate('entry').selectedTuplesAll()).toHaveLength(3);
    expect(generateAlloySchema(datum)).toContain('PyretObject -> Index -> String -> PyretObject');
  });

  it('preserves exact keys as String atoms, including empty, escaped, Unicode and prototype-like names', () => {
    const keys = ['', '"\\\n', 'é', '\uFAAA', 'e\u0301', '\uD800', '__proto__', 'constructor'];
    const { datum, rebuilt, source } = roundTrip(dictionary(keys.map((key, i) => [key, i])));
    expect((rebuilt.entries as unknown[][]).map(e => e[0])).toEqual(keys);
    expect(datum.getAtoms().filter(a => a.type === 'String').map(a => a.label).sort()).toEqual([...keys].sort());
    expect(source).toContain('\\uFAAA');
    expect(source).toContain('\\uD800');
    expect(source).toContain('"__proto__"');
  });

  it('distinguishes entries, key order, empty objects and dictionary kinds after transport', () => {
    const values = [dictionary([]), { dict: {} }, dictionary([], true),
      dictionary([['a', 1]]), dictionary([['b', 1]]), dictionary([['a', 2]]),
      dictionary([['a', 1], ['b', 2]]), dictionary([['b', 2], ['a', 1]])];
    expect(new Set(values.map(v => canon(transport(v).datum))).size).toBe(values.length);
  });

  it('retains shared values and distinct dictionaries with equal contents', () => {
    const shared = box(1), a = dictionary([['a', shared], ['b', shared]]), b = dictionary([['a', shared], ['b', shared]]);
    const { rebuilt } = roundTrip({ vals: [a, a, b] });
    const [first, second, third] = rebuilt.vals as PyretObject[];
    expect(first).toBe(second);
    expect(first).not.toBe(third);
    const entries = first.entries as unknown[][];
    expect(entries[0][1]).toBe(entries[1][1]);
  });

  it('preserves a mutable dictionary self-cycle and its observation point', () => {
    const value = dictionary([], true);
    (value.$underlyingDict as Record<string, unknown>).self = value;
    const { rebuilt, source } = roundTrip(value);
    expect((rebuilt.entries as unknown[][])[0][1]).toBe(rebuilt);
    expect(source).toContain('= [mutable-string-dict: ]');
    expect(source).toContain('.set-now("self", spytial-value0)');
  });

  it('supports cycles through arrays and shared sealed dictionary views', () => {
    const value = dictionary([], true, true), container = [value];
    (value.$underlyingDict as Record<string, unknown>).back = container;
    const { rebuilt, source } = roundTrip({ vals: [container, value, value] });
    const vals = rebuilt.vals as any[];
    expect(vals[0][0]).toBe(vals[1]);
    expect(vals[1]).toBe(vals[2]);
    expect(vals[1].entries[0][1]).toBe(vals[0]);
    expect(source).toContain('.seal()');
    expect(source).toContain('.set-now("back",');
  });

  it('does not treat an ordinary object with dictionary-like field names as a dictionary', () => {
    expect(roundTrip({ dict: { 'keys-list': 1, 'get-value': 2, unfreeze: 3 } }).source)
      .toBe('{keys-list: 1, get-value: 2, unfreeze: 3}');
  });

  it('fills mutable dictionaries before a containing set compares them', () => {
    const a = dictionary([['a', 1]], true), b = dictionary([['a', 2]], true);
    const ctor = (name: string, dict: Record<string, unknown>): PyretObject => ({
      $name: name, $arity: Object.keys(dict).length || -1,
      $constructor: { $fieldNames: Object.keys(dict) }, dict,
    });
    const set = ctor('list-set', { elems: ctor('link', { first: a,
      rest: ctor('link', { first: b, rest: ctor('empty', {}) }) }) });
    const { source } = roundTrip({ dict: { set, dictionary: a } });
    expect(source.lastIndexOf('.set-now(')).toBeLessThan(source.indexOf('[list-set: ]'));
  });

  it('rejects unsupported values rather than silently dropping dictionary entries', () => {
    expect(() => new PyretDataInstance(dictionary([['a', undefined]]))).toThrow(/Unsupported Pyret dictionary value/);
  });

  it('rejects missing, conflicting, duplicate-key and invalid-position entries', () => {
    const make = () => transport(dictionary([['a', 1], ['b', 2]])).raw;
    const missing = make(); missing.relations[0].tuples.pop();
    expect(() => reifyToValue(new JSONDataInstance(missing))).toThrow(/Incomplete Pyret dictionary/);
    const conflict = make(); conflict.relations[0].tuples[1].atoms[1] = conflict.relations[0].tuples[0].atoms[1];
    expect(() => reifyToValue(new JSONDataInstance(conflict))).toThrow(/Conflicting Pyret dictionary/);
    const duplicate = make(); duplicate.relations[0].tuples[1].atoms[2] = duplicate.relations[0].tuples[0].atoms[2];
    expect(() => reifyToValue(new JSONDataInstance(duplicate))).toThrow(/Duplicate Pyret dictionary key/);
    const invalid = make(); invalid.atoms.find((a: any) => a.type === 'Index').metadata.pyretIndex = 99;
    expect(() => reifyToValue(new JSONDataInstance(invalid))).toThrow(/Malformed Pyret dictionary entry/);
    const type = make(); type.atoms.find((a: any) => a.type === 'String').type = 'Number';
    expect(() => reifyToValue(new JSONDataInstance(type))).toThrow(/Malformed Pyret dictionary entry/);
    const root = make(); root.atoms.forEach((a: any) => { delete a.metadata?.pyretRoot; });
    expect(() => reifyToValue(new JSONDataInstance(root))).toThrow(/explicit root/);
  });

  it('generated exact key/value pairs retain their pairing and order', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.tuple(fc.string(), fc.integer()), { selector: e => e[0], maxLength: 20 }), pairs => {
      expect(roundTrip(dictionary(pairs)).rebuilt.entries).toEqual(pairs);
    }), { seed: 598, numRuns: 100 });
  });
});
