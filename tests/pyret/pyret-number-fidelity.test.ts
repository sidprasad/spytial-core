import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

// Runtime-shaped fixtures: actual runtime acceptance lives in spyret-ide's
// test/reify-fidelity harness. Conversion to Number/valueOf must never occur.
const big = (value: string) => ({
  isInteger: () => true, isExact: () => true, toString: () => value,
  valueOf: () => { throw new Error('Lossy numeric coercion'); },
});
const rough = (n: number) => ({ n, isRoughnum: () => true });
const box = (value: unknown): PyretObject => ({
  $name: 'box', $arity: 1, $constructor: { $fieldNames: ['value'] }, dict: { value },
});
function serialized(value: PyretObject | number) {
  const original = new PyretDataInstance(value);
  const payload = JSON.parse(JSON.stringify({
    atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes(),
  }));
  payload.atoms.reverse(); payload.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  return new JSONDataInstance(payload);
}
function check(value: PyretObject | number, expected: string) {
  const datum = serialized(value);
  expect(replit(datum)).toBe(expected);
  const again = new PyretDataInstance(reifyToValue(datum) as PyretObject | number);
  expect(canon(again)).toBe(canon(datum));
  return datum;
}

describe('lossless Pyret numbers through default JSON normalization (#592)', () => {
  it.each([
    ['rational', { n: 1, d: 3 }, '1/3'],
    ['rational-field', box({ n: 1, d: 3 }), 'box(1/3)'],
    ['decimal-literal', { n: 1, d: 2 }, '1/2'],
    ['roughnum', rough(3.14), '~3.14'],
    ['roughnum-field', box(rough(1.5)), 'box(~1.5)'],
    ['bignum', big('123456789012345678901234567890'), '123456789012345678901234567890'],
    ['bignum-field', box(big('123456789012345678901234567890')), 'box(123456789012345678901234567890)'],
  ] as const)('number/%s', (_id, value, expected) => { check(value, expected); });

  it.each(['9000000000000000', '9000000000000001', '9007199254740991', '9007199254740992',
    '9007199254740993', '-9007199254740993', '100000000000000000000000000000000000001']) (
    'preserves integer boundary %s', value => {
      const datum = check(box(big(value)), `box(${value})`);
      expect(datum.getAtoms().find(a => a.type === 'Number')?.metadata).toEqual({
        pyretNumber: { version: 1, kind: 'integer', value },
      });
    });

  it.each([Number.MIN_VALUE, Number.MAX_VALUE, -1e-100, -0, 0, 1])('preserves rough payload %s', n => {
    const datum = check(box(rough(n)), `box(~${Object.is(n, -0) ? '-0' : String(n)})`);
    const reconstructed = reifyToValue(datum) as PyretObject;
    const payload = (reconstructed.dict!.value as any).$pyretNumber;
    expect(Object.is(Number(payload.value), n)).toBe(true);
  });

  it('decodes metadata independently of labels and preserves relation IDs and name lookup', () => {
    const datum = serialized(box({ n: big('123456789012345678901234567891'), d: big('9007199254740993') }));
    const payload = datum.reify();
    payload.atoms.forEach(a => { a.label = 'display only'; });
    const renamed = new JSONDataInstance(payload);
    expect(replit(renamed)).toBe('box(123456789012345678901234567891/9007199254740993)');
    expect(renamed.getRelations().map(r => r.id)).toEqual(datum.getRelations().map(r => r.id));
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: renamed });
    expect(evaluator.evaluate('value').selectedTuplesAll()).toHaveLength(1);
  });

  it('reuses equal exact values but keeps rough values distinct', () => {
    const datum = serialized({ $name: 'values', dict: {
      integer: 1, rational: { n: 2, d: 2 }, rough: rough(1), repeated: rough(1),
    } });
    const numbers = datum.getAtoms().filter(a => a.type === 'Number');
    expect(numbers).toHaveLength(2);
    expect(numbers.map(a => (a.metadata!.pyretNumber as any).kind).sort()).toEqual(['integer', 'roughnum']);
    expect(new PyretDataInstance({ dict: { a: rough(1), b: rough(1) } }, { numbersIdempotent: false })
      .getAtoms().filter(a => a.type === 'Number')).toHaveLength(2);
  });

  it('retains safe integer and legacy label-only decoding', () => {
    for (const n of [0, -1, -2147483648, 2147483647, Number.MAX_SAFE_INTEGER]) {
      expect(reifyToValue(serialized(n))).toBe(n);
    }
    expect(reifyToValue(new JSONDataInstance({ atoms: [{ id: 'n', type: 'Number', label: '42' }], relations: [] }))).toBe(42);
  });

  it.each([
    { version: 2, kind: 'integer', value: '1' },
    { version: 1, kind: 'integer', value: 9007199254740992 },
    { version: 1, kind: 'rational', numerator: '1', denominator: '0' },
    { version: 1, kind: 'roughnum', value: 'Infinity' },
    { version: 1, kind: 'roughnum', value: '1); arbitrary-code(' },
  ])('rejects malformed numeric metadata rather than falling back to labels', pyretNumber => {
    const datum = new JSONDataInstance({ atoms: [{ id: 'n', type: 'Number', label: '1', metadata: { pyretNumber } }], relations: [] });
    expect(() => replit(datum)).toThrow(/Pyret/);
  });

  it('bounded generated exact integers and rationals survive nested serialized round trips', () => {
    const bound = 10n ** 80n;
    fc.assert(fc.property(fc.bigInt({ min: -bound, max: bound }), fc.bigInt({ min: 1n, max: bound }), (n, d) => {
      let a = n < 0n ? -n : n, b = d;
      while (b) { [a, b] = [b, a % b]; }
      const numerator = n / a, denominator = d / a;
      const expected = denominator === 1n ? String(numerator) : `${numerator}/${denominator}`;
      check(big(String(n)), String(n));
      check(box(box({ n: big(String(n)), d: big(String(d)) })), `box(box(${expected}))`);
    }), { numRuns: 250, seed: 592 });
  });
});
