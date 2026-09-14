import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { readValueInfo } from '../../src/data-instance/pyret/values';
import { readFieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

const object = (dict: Record<string, unknown> = {}): PyretObject => ({ dict });
const box = (v: unknown): PyretObject => ({ $name: 'box', $arity: 1, $constructor: { $fieldNames: ['v'] }, dict: { v } });
const tuple = (...vals: unknown[]): PyretObject => ({ vals });
// Matches the runtime protocol; its own dict/brands match an empty PObject.
const nothing = (): PyretObject => Object.assign(Object.create({
  brand() {}, extendWith() {},
}), { dict: Object.create(null), brands: { brandCount: 0 } });

function serialize(value: unknown) {
  const original = new PyretDataInstance(value as PyretObject);
  const raw = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  // Arbitrary atom IDs, opaque relation IDs, display labels and record order
  // must not carry reconstruction information. Keep existing constructor IDs.
  const ids = new Map(raw.atoms.map((a: any, i: number) => [a.id, `opaque-${i}`]));
  raw.atoms.forEach((a: any) => {
    a.id = ids.get(a.id);
    if (a.metadata) a.label = 'display only';
  });
  raw.relations.forEach((r: any, i: number) => {
    if (!readFieldId(r.id)) r.id = `unrelated-${i}`;
    r.tuples.forEach((t: any) => { t.atoms = t.atoms.map((id: string) => ids.get(id)); });
    r.tuples.reverse();
  });
  // Let default normalization rebuild type membership from the renamed atoms.
  raw.types.forEach((t: any) => { t.atoms = []; });
  raw.atoms.reverse(); raw.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  return { original, datum: new JSONDataInstance(raw) };
}
function roundTrip(value: unknown, expected: string) {
  const { datum } = serialize(value);
  expect(datum.getErrors()).toEqual([]);
  expect(replit(datum)).toBe(expected);
  const reconstructed = reifyToValue(datum);
  // Canon includes numeric display labels for the old tests. Compare a fresh
  // re-relationalization to the original, not the deliberately relabeled data.
  expect(canon(new PyretDataInstance(reconstructed as PyretObject))).toBe(canon(new PyretDataInstance(value as PyretObject)));
  return { datum, reconstructed };
}

describe('nothing and plain objects (#595)', () => {
  it.each([
    ['nothing/root', nothing(), 'nothing'],
    ['nothing/field', box(nothing()), 'box(nothing)'],
    ['object/flat', object({ x: 1, y: 2 }), '{x: 1, y: 2}'],
    ['object/empty', object(), '{}'],
    ['object/nested', object({ p: box(1) }), '{p: box(1)}'],
    ['object/field', box(object({ x: 1 })), 'box({x: 1})'],
  ])('%s', (_id, value, expected) => { roundTrip(value, expected as string); });

  it('distinguishes nothing and an empty object before and after default normalization', () => {
    const a = serialize(nothing()), b = serialize(object());
    expect(canon(a.original)).not.toBe(canon(b.original));
    expect(canon(a.datum)).not.toBe(canon(b.datum));
    expect(replit(a.datum)).toBe('nothing');
    expect(replit(b.datum)).toBe('{}');
    // PObject has updateDict, so even an otherwise identical runtime shape is an object.
    const empty = Object.assign(Object.create({ brand() {}, extendWith() {}, updateDict() {} }),
      { dict: Object.create(null), brands: { brandCount: 0 } });
    roundTrip(empty, '{}');
  });

  it('preserves field order, inherited fields, unusual valid names, and sharing', () => {
    const shared = object({ z: 2 });
    const dict = Object.assign(Object.create({ inherited: shared }), {
      zebra: shared, 'a--b': 3, constructor: 4,
    });
    Object.defineProperty(dict, '__proto__', { value: 5, enumerable: true });
    const { reconstructed } = roundTrip(object(dict), '{zebra: {z: 2}, a--b: 3, constructor: 4, __proto__: 5, inherited: {z: 2}}');
    expect((reconstructed as PyretObject).dict!.zebra).toBe((reconstructed as PyretObject).dict!.inherited);
  });

  it('keeps fields as named binary relations, including names shared with constructor fields', () => {
    const { datum } = roundTrip(object({ v: box(1), element: 2 }), '{v: box(1), element: 2}');
    const ev = new SGraphQueryEvaluator();
    ev.initialize({ sourceData: datum });
    expect(ev.evaluate('v').selectedTuplesAll()).toHaveLength(2);
    expect(datum.getRelations().every(r => r.tuples.every(t => t.atoms.length === 2))).toBe(true);
  });

  it('separates field names from colon-keyword tokens and rejects reserved names', () => {
    roundTrip(object({ row: 1, block: 2, source: 3 }), '{row : 1, block : 2, source : 3}');
    expect(() => replit(serialize(object({ end: 1 })).datum)).toThrow(/no literal spelling/);
  });

  it('retains arbitrary field names structurally and rejects names with no Pyret literal spelling', () => {
    const { datum } = serialize(object({ 'not a name': 1, 'quote"': 2, '\uFAAA': 3 }));
    expect(Object.keys((reifyToValue(datum) as PyretObject).dict!)).toEqual(['not a name', 'quote"', '\uFAAA']);
    expect(() => replit(datum)).toThrow(/no literal spelling/);
  });

  it('preserves the data-constructor path and excludes attached methods from its arguments', () => {
    const value = box(object());
    value.dict!.method = { meth() {}, full_meth() {} };
    roundTrip(value, 'box({})');
  });
});

describe('tuple and raw-array positions and multiplicity (#594)', () => {
  const shared = box(1);
  it.each([
    ['tuple/root', tuple(1, 2), '{1; 2}'],
    ['tuple/field', box(tuple(1, 2)), 'box({1; 2})'],
    ['tuple/shared-elements', tuple(shared, shared), '{box(1); box(1)}'],
    ['raw-array/root', [1, 2], '[raw-array: 1, 2]'],
    ['raw-array/field', box([1, 2]), 'box([raw-array: 1, 2])'],
    ['raw-array/duplicates', box([1, 1]), 'box([raw-array: 1, 1])'],
    ['raw-array/empty', [], '[raw-array: ]'],
    ['raw-array/singleton', [1], '[raw-array: 1]'],
    ['tuple/singleton', tuple(1), '{1;}'],
    ['nested', [tuple(nothing(), []), object({ x: [1, 1] })], '[raw-array: {nothing; [raw-array: ]}, {x: [raw-array: 1, 1]}]'],
  ])('%s', (_id, value, expected) => { roundTrip(value, expected as string); });

  it('represents occurrences with (container, index, value), even when the value is reused', () => {
    const { original, datum } = serialize(box([1, 1]));
    expect(original.getAtoms().filter(a => a.type === 'Number')).toHaveLength(1);
    const elements = datum.getRelations().find(r => r.name === 'element')!.tuples;
    expect(elements).toHaveLength(2);
    expect(elements[0].atoms[0]).toBe(elements[1].atoms[0]);
    expect(elements[0].atoms[1]).not.toBe(elements[1].atoms[1]);
    expect(elements[0].atoms[2]).toBe(elements[1].atoms[2]);
    const ev = new SGraphQueryEvaluator();
    ev.initialize({ sourceData: datum });
    expect(ev.evaluate('element').selectedTuplesAll()).toHaveLength(2);
  });

  it('distinguishes one occurrence from two before and after default normalization', () => {
    const a = serialize(box([1])), b = serialize(box([1, 1]));
    expect(canon(a.original)).not.toBe(canon(b.original));
    expect(canon(a.datum)).not.toBe(canon(b.datum));
  });

  it('preserves shared containers/elements and equal-but-distinct objects', () => {
    const a = object({ x: 1 }), b = object({ x: 1 }), list = [a, a, b];
    const { reconstructed } = roundTrip(tuple(list, list), '{[raw-array: {x: 1}, {x: 1}, {x: 1}]; [raw-array: {x: 1}, {x: 1}, {x: 1}]}');
    const vals = (reconstructed as PyretObject).vals as any[];
    expect(vals[0]).toBe(vals[1]);
    expect(vals[0][0]).toBe(vals[0][1]);
    expect(vals[0][0]).not.toBe(vals[0][2]);
  });

  it('preserves an empty runtime tuple structurally without emitting the object literal {}', () => {
    const { datum } = serialize(tuple());
    const value = reifyToValue(datum) as PyretObject;
    expect(value.vals).toEqual([]);
    expect(canon(new PyretDataInstance(value))).toBe(canon(new PyretDataInstance(tuple())));
    expect(() => replit(datum)).toThrow(/no empty tuple literal/);
  });

  it('rejects incomplete, conflicting, and out-of-range element positions', () => {
    const make = () => serialize([1, 2]).datum.reify();
    const missing = make(); missing.relations[0].tuples.pop();
    expect(() => replit(new JSONDataInstance(missing))).toThrow(/Incomplete/);
    const conflict = make();
    conflict.relations[0].tuples[1].atoms[1] = conflict.relations[0].tuples[0].atoms[1];
    expect(() => replit(new JSONDataInstance(conflict))).toThrow(/Conflicting/);
    const outOfRange = make();
    outOfRange.atoms.find(a => a.type === 'Index')!.metadata!.pyretIndex = 9;
    expect(() => replit(new JSONDataInstance(outOfRange))).toThrow(/Malformed/);
  });

  it('rejects cyclic mutable containers without rejecting ordinary sharing', () => {
    const a: any[] = []; a.push(a);
    expect(() => reifyToValue(serialize(a).datum)).toThrow(/Cyclic Pyret containers/);
    const b: any[] = []; b.push(object({ back: b }));
    expect(() => replit(serialize(b).datum)).toThrow(/Cyclic Pyret containers/);
  });

  it('bounded generated arrays retain every position independently of relation order', () => {
    fc.assert(fc.property(fc.array(fc.array(fc.integer({ min: -2, max: 2 }), { maxLength: 6 }), { maxLength: 5 }), rows => {
      const { datum } = serialize(rows);
      expect(reifyToValue(datum)).toEqual(rows);
      expect(canon(new PyretDataInstance(rows))).toBe(canon(new PyretDataInstance(reifyToValue(datum) as any)));
      expect(datum.getAtoms().filter(a => readValueInfo(a.metadata)?.kind === 'raw-array')).toHaveLength(rows.length + 1);
    }), { numRuns: 200, seed: 594 });
  });
});
