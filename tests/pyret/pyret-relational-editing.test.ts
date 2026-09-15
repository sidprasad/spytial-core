import { describe, expect, it } from 'vitest';
import type { IAtom, IRelation } from '../../src/data-instance/interfaces';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { fieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

const atom = (id: string, type: string, label = type): IAtom => ({ id, type, label });
const relation = (id: string, name: string, types: string[], rows: string[][]): IRelation => ({
  id, name, types, tuples: rows.map(atoms => ({ atoms, types })),
});
const input = (atoms: IAtom[], relations: IRelation[] = []) => new JSONDataInstance({ atoms, relations });
const get = (di: JSONDataInstance, id: string) => di.getAtoms().find(a => a.id === id)!;
const query = (di: JSONDataInstance, expression: string) => {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: di });
  return evaluator.evaluate(expression);
};

/** The input is authored/edited relational data, not a replay of a producer payload. */
function roundTrip(di: JSONDataInstance, rootId: string, expected?: string): PyretObject {
  PyretDataInstance.clearGlobalConstructorCache();
  if (expected !== undefined) expect(replit(di, rootId)).toBe(expected);
  const value = reifyToValue(di, rootId);
  const again = new PyretDataInstance(value as PyretObject);
  expect(again.getAtoms().every(a => !('metadata' in a))).toBe(true);
  expect(canon(again, again.getAtoms()[0].id)).toBe(canon(di, rootId));
  return value as PyretObject;
}

describe('Pyret values authored and edited in the relational model', () => {
  it.each(['7', '9007199254740993', '-123456789012345678901234567890', '1/3', '~7.25', '~-0']) (
    'changing a Number label to %s changes the value', label => {
      const di = input([atom('a', 'Number', '5')]);
      get(di, 'a').label = label;
      roundTrip(di, 'a', label);
    });

  it.each([
    ['9007199254740993.5', '18014398509481987/2'],
    ['1.25e-30', '1/800000000000000000000000000000'],
    ['-0.125', '-1/8'],
  ])('reads edited exact decimal %s without rounding', (label, expected) => {
    expect(replit(input([atom('a', 'Number', label)]))).toBe(expected);
  });

  it('ignores stale extra payloads on an imported atom', () => {
    const a = Object.assign(atom('a', 'Number', '7'), {
      metadata: { pyretNumber: { version: 1, kind: 'integer', value: '5' },
        pyretValue: { version: 1, kind: 'nothing' }, pyretRoot: { version: 99 } },
    });
    roundTrip(input([a]), 'a', '7');
  });

  it.each([['Nothing', 'nothing'], ['Object', '{}'], ['RawArray', '[raw-array: ]']]) (
    'can author an empty %s using its atom type alone', (type, source) => {
      roundTrip(input([atom('a', type, 'any display label')]), 'a', source);
    });

  it.each(['RawArray', 'Tuple'])('edits %s positions, length and repeated elements using tuples', type => {
    const di = input([atom('c', type), atom('i', 'Index', '0'), atom('j', 'Index', '1'),
      atom('a', 'Number', '7'), atom('b', 'Number', '9')], [
      relation('r', 'element', [type, 'Index', 'Number'], [['c', 'i', 'a'], ['c', 'j', 'b']]),
    ]);
    get(di, 'i').label = '1'; get(di, 'j').label = '0';
    roundTrip(di, 'c', type === 'Tuple' ? '{9; 7}' : '[raw-array: 9, 7]');
    di.addAtom(atom('k', 'Index', '2'));
    di.addRelationTuple('r', { atoms: ['c', 'k', 'a'], types: [] });
    expect(query(di, '#element').prettyPrint()).toBe('3');
    roundTrip(di, 'c', type === 'Tuple' ? '{9; 7; 7}' : '[raw-array: 9, 7, 7]');
    di.removeAtom('k');
    roundTrip(di, 'c', type === 'Tuple' ? '{9; 7}' : '[raw-array: 9, 7]');
  });

  it('renames, reorders, inserts and removes object fields without a parallel field list', () => {
    const di = input([atom('o', 'Object'), atom('i', 'Index', '0'), atom('j', 'Index', '1'),
      atom('a', 'Number', '7'), atom('b', 'String', 'hello')], [
      relation('r', 'x', ['Object', 'Index', 'Number'], [['o', 'i', 'a']]),
      relation('s', 'y', ['Object', 'Index', 'String'], [['o', 'j', 'b']]),
      relation('t', 'z', ['Object', 'Index', 'String'], []),
    ]);
    di.getRelations().find(r => r.id === 'r')!.name = 'renamed';
    get(di, 'i').label = '1'; get(di, 'j').label = '0';
    expect(query(di, 'renamed').selectedTuplesAll()).toEqual([['o', 'i', 'a']]);
    roundTrip(di, 'o', '{y: "hello", renamed: 7}');
    di.addAtom(atom('k', 'Index', '2'));
    di.addRelationTuple('t', { atoms: ['o', 'k', 'b'], types: [] });
    roundTrip(di, 'o', '{y: "hello", renamed: 7, z: "hello"}');
    di.removeAtom('k');
    roundTrip(di, 'o', '{y: "hello", renamed: 7}');
  });

  it('authors and edits dictionary entries, keys, mutability and sealing', () => {
    const di = input([atom('d', 'StringDict'), atom('i', 'Index', '0'), atom('k', 'String', 'old'),
      atom('v', 'Number', '5')], [
      relation('r', 'entry', ['PyretObject', 'Index', 'String', 'PyretObject'], [['d', 'i', 'k', 'v']]),
      relation('s', 'sealed', ['MutableStringDict'], []),
    ]);
    get(di, 'k').label = 'new'; get(di, 'v').label = '7';
    di.addAtom(atom('j', 'Index', '1')); di.addAtom(atom('l', 'String', 'alias'));
    di.addRelationTuple('r', { atoms: ['d', 'j', 'l', 'v'], types: [] });
    expect(query(di, 'entry').selectedTuplesAll()).toHaveLength(2);
    roundTrip(di, 'd', '[string-dict: "new", 7, "alias", 7]');
    get(di, 'd').type = 'MutableStringDict';
    di.addRelationTuple('s', { atoms: ['d'], types: [] });
    expect(query(di, 'sealed').selectedAtoms()).toEqual(['d']);
    roundTrip(di, 'd', '[mutable-string-dict: "new", 7, "alias", 7].seal()');
    di.removeRelationTuple('s', { atoms: ['d'], types: [] });
    di.removeAtom('j'); di.removeAtom('l');
    roundTrip(di, 'd', '[mutable-string-dict: "new", 7]');
    di.removeAtom('i'); di.removeAtom('k'); di.removeAtom('v');
    roundTrip(di, 'd', '[mutable-string-dict: ]');
  });

  it('uses the existing field identity and explicit mutable facts to author a reference cycle', () => {
    const next = fieldId({ name: 'cell', arity: 1, fields: ['next'] }, 0);
    const di = input([atom('c', 'cell'), atom('p', 'Reference'), atom('i', 'Index', '0')], [
      relation(next, 'next', ['cell', 'Reference'], [['c', 'p']]),
      relation('r', 'target', ['Reference', 'PyretObject'], [['p', 'c']]),
      relation('s', 'mutable-field', ['cell', 'Index'], [['c', 'i']]),
      relation('t', 'unrestricted', ['Reference'], [['p']]),
    ]);
    expect(query(di, 'next.target').selectedTuplesAll()).toEqual([['c', 'c']]);
    expect(query(di, 'unrestricted').selectedAtoms()).toEqual(['p']);
    expect(query(di, '`mutable-field`').selectedTuplesAll()).toEqual([['c', 'i']]);
    const value = roundTrip(di, 'c');
    expect((value.dict!.next as PyretObject).value).toBe(value);
    expect(replit(di, 'c')).toContain('cell(nothing)');
    expect(() => replit(di)).toThrow(/explicit root/);

    // An edit changes the graph itself: the ref now points to itself.
    di.removeRelationTuple('r', { atoms: ['p', 'c'], types: [] });
    di.addRelationTuple('r', { atoms: ['p', 'p'], types: [] });
    const edited = roundTrip(di, 'c');
    expect((edited.dict!.next as PyretObject).value).toBe(edited.dict!.next);
    expect(query(di, 'next.target').selectedTuplesAll()).toEqual([['c', 'p']]);

    // Without an unrestricted annotation, temporary nothing is not justified.
    di.removeRelationTuple('t', { atoms: ['p'], types: [] });
    roundTrip(di, 'c');
    expect(() => replit(di, 'c')).toThrow(/cannot be constructed/);
  });

  it('distinguishes a bare singleton from a nullary constructor with a queryable fact', () => {
    const di = input([atom('a', 'zero')], [relation('r', 'nullary-constructor', ['zero'], [])]);
    roundTrip(di, 'a', 'zero');
    di.addRelationTuple('r', { atoms: ['a'], types: [] });
    expect(query(di, '`nullary-constructor`').selectedAtoms()).toEqual(['a']);
    roundTrip(di, 'a', 'zero()');
    di.removeRelationTuple('r', { atoms: ['a'], types: [] });
    roundTrip(di, 'a', 'zero');
  });

  it('takes the observation point as an argument for independent roots', () => {
    const di = input([atom('a', 'Number', '5'), atom('b', 'Number', '7')]);
    expect(() => replit(di)).toThrow(/explicit root/);
    expect(replit(di, 'a')).toBe('5');
    expect(replit(di, 'b')).toBe('7');
    expect(() => replit(di, 'missing')).toThrow(/Unknown Pyret root ID/);
  });

  it('retains constructor field declarations when a value cannot be captured', () => {
    const value = { $name: 'box', $arity: 1, $constructor: { $fieldNames: ['v'] }, dict: { v: () => 5 } };
    const di = new PyretDataInstance(value);
    expect(di.getRelations()).toHaveLength(1);
    expect(di.getRelations()[0].tuples).toEqual([]);
    expect(() => replit(di)).toThrow(/Incomplete Pyret constructor fields/);
  });

  it('uses one valid constructor field signature for heterogeneous instances', () => {
    const box = (v: unknown) => ({ $name: 'box', $arity: 1, $constructor: { $fieldNames: ['v'] }, dict: { v } });
    const di = new PyretDataInstance([box(7), box('hello')]);
    const field = di.getRelations().find(r => r.name === 'v')!;
    expect(field.types).toEqual(['box', 'PyretObject']);
    for (const tuple of field.tuples) {
      tuple.atoms.forEach((id, i) => expect(di.getAtomType(id).types).toContain(tuple.types[i]));
    }
    roundTrip(new JSONDataInstance({ atoms: di.getAtoms(), relations: di.getRelations() }), di.getAtoms()[0].id,
      '[raw-array: box(7), box("hello")]');
  });
});
