import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { readFieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

// Runtime-shaped values, not a substitute for the real-Pyret IDE experiment.
const data = (name: string, fields: string[], values: unknown[], singleton = false): PyretObject => ({
  $name: name, $arity: singleton ? -1 : fields.length, $constructor: { $fieldNames: fields },
  // Deliberately reverse dict insertion order: declared metadata is authoritative.
  dict: Object.fromEntries(fields.map((f, i) => [f, values[i]]).reverse()),
});
function serialized(value: PyretObject | number | string | boolean) {
  const original = new PyretDataInstance(value);
  const payload = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  payload.atoms.reverse();
  payload.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  return new JSONDataInstance(payload);
}

describe('Pyret constructor identity survives serialized data', () => {
  it('escapes Unicode code units so Pyret source normalization cannot change the value', () => {
    expect(replit(serialized('\uFAAA'))).toBe('"\\uFAAA"');
    expect(replit(serialized('e\u0301\uD800'))).toBe('"e\\u0301\\uD800"');
  });
  it.each([0, false, '', true, -2147483648, 2147483647, 'hello'])('handles primitive root %j in the working constructor', value => {
    expect(reifyToValue(serialized(value))).toBe(value);
  });
  it('reads declared order, not dictionary order, relation enumeration, or cached guesses', () => {
    const datum = serialized(data('duo', ['zebra', 'alpha'], [9, 2]));
    new PyretDataInstance({ $name: 'duo', dict: { alpha: 0, zebra: 0 } });
    expect(replit(datum)).toBe('duo(9, 2)');
    expect(datum.getRelations().map(r => r.name).sort()).toEqual(['alpha', 'zebra']);
    expect(datum.getRelations().map(r => readFieldId(r.id)?.position).sort()).toEqual([0, 1]);
  });
  it('distinguishes singleton and zero-argument application with the same name', () => {
    const singleton = serialized(data('zero', [], [], true));
    const application = serialized(data('zero', [], []));
    expect(replit(singleton)).toBe('zero');
    expect(replit(application)).toBe('zero()');
    expect(canon(singleton)).not.toBe(canon(application));
  });
  it('preserves same-named fields at different positions through default JSON normalization', () => {
    const value = data('pair', ['first', 'second'], [
      data('A', ['value', 'other'], [1, 2]), data('B', ['other', 'value'], [3, 4]),
    ]);
    const datum = serialized(value);
    expect(datum.getRelations().filter(r => r.name === 'value')).toHaveLength(2);
    expect(replit(datum)).toBe('pair(A(1, 2), B(3, 4))');
    const ev = new SGraphQueryEvaluator();
    ev.initialize({ sourceData: datum });
    expect(ev.evaluate('value').selectedTuplesAll()).toHaveLength(2);
  });
  it('retains constructor facts when atom IDs are remapped during composition', () => {
    const source = serialized(data('zero', [], []));
    const combined = new JSONDataInstance({ atoms: [], relations: [] });
    combined.addFromDataInstance(source, false);
    expect(replit(combined)).toBe('zero()');
    const pyret = new PyretDataInstance();
    pyret.addFromDataInstance(new PyretDataInstance(data('zero', [], [])), false);
    expect(replit(pyret)).toBe('zero()');
  });
  it('retains sharing and ignores non-constructor dictionary fields', () => {
    const leaf = data('leaf', ['value'], [7]);
    leaf.dict!.extra = 99;
    const datum = serialized(data('pair', ['left', 'right'], [leaf, leaf]));
    const v = reifyToValue(datum) as PyretObject;
    expect(v.dict!.left).toBe(v.dict!.right);
    expect(replit(datum)).toBe('pair(leaf(7), leaf(7))');
  });
  it('rejects missing and conflicting positions instead of guessing', () => {
    const datum = serialized(data('duo', ['z', 'a'], [1, 2])).reify();
    datum.relations[0].tuples = [];
    expect(() => replit(new JSONDataInstance(datum), datum.atoms.find(a => a.type === 'duo')!.id)).toThrow(/Incomplete/);
    const conflict = serialized(data('duo', ['z', 'a'], [1, 2])).reify();
    conflict.relations[0].id = 'pyret:field:v1:' + JSON.stringify(['duo', 0, conflict.relations[0].name]);
    expect(() => replit(new JSONDataInstance(conflict))).toThrow(/Conflicting/);
  });
  it('property: arbitrary declared orders round-trip without producer metadata', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom('zebra', 'alpha', 'value', 'tail'), { maxLength: 4 }),
      fc.array(fc.integer(), { minLength: 4, maxLength: 4 }),
      (fields, values) => {
        const value = data('variant', fields, values);
        const datum = serialized(value);
        const result = reifyToValue(datum) as PyretObject;
        expect((result.$constructor as any).$fieldNames).toEqual(fields);
        expect(fields.map(f => result.dict![f])).toEqual(values.slice(0, fields.length));
        expect(canon(new PyretDataInstance(result))).toBe(canon(datum));
        expect(replit(datum)).toBe(`variant(${values.slice(0, fields.length).join(', ')})`);
      }), { numRuns: 500 });
  });
});
