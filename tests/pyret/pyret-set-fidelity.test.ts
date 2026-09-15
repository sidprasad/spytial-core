import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { setContents } from '../../src/data-instance/pyret/set-source';
import { canon } from '../../src/data-instance/pyret/canon';
import { readFieldId } from '../../src/data-instance/pyret/identity';

const ctor = (name: string, dict: Record<string, unknown> = {}): PyretObject => ({
  $name: name, $arity: Object.keys(dict).length || -1,
  $constructor: { $fieldNames: Object.keys(dict) }, dict,
});
const list = (values: unknown[]) => values.reduceRight<PyretObject>(
  (rest, first) => ctor('link', { first, rest }), ctor('empty'));
const listSet = (values: unknown[]) => ctor('list-set', { elems: list(values) });
const branch = (value: unknown, left = ctor('leaf'), right = ctor('leaf'), h = 1) =>
  ctor('branch', { value, h, left, right });
const treeSet = (elems = ctor('leaf')) => ctor('tree-set', { elems });
const box = (v: unknown) => ctor('box', { v });
const cell = (value: unknown): PyretObject => ({
  ...ctor('cell', { next: { state: 2, value, anns: {
    anns: [{ ann: { name: 'Any' } }], check() {}, addAnn() {},
  } } }), $mut_fields_mask: [true],
});

function transport(value: PyretObject) {
  const original = new PyretDataInstance(value);
  const raw = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  const ids = new Map(raw.atoms.map((a: any, i: number) => [a.id, `opaque-${raw.atoms.length - i}`]));
  raw.atoms.forEach((a: any) => {
    a.id = ids.get(a.id);
    expect(a).not.toHaveProperty('metadata');
    if (!['Number', 'String', 'Boolean', 'Index'].includes(a.type)) a.label = 'display only';
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
  const rebuilt = reifyToValue(datum) as PyretObject;
  expect(canon(new PyretDataInstance(rebuilt))).toBe(canon(original));
  expect(replit(datum)).toBe(replit(original));
  return { datum, rebuilt, source: replit(datum) };
}

describe('built-in set source fidelity (#597)', () => {
  it.each([
    ['empty list set', listSet([]), '[list-set: ]'],
    ['singleton list set', listSet([1]), '[list-set: ].add(1)'],
    ['list order', listSet([3, 1, 2]), '[list-set: ].add(2).add(1).add(3)'],
    ['empty tree set', treeSet(), '[tree-set: ]'],
    ['singleton tree set', treeSet(branch(1)), '[tree-set: 1]'],
    ['inorder tree traversal', treeSet(branch(2, branch(1), branch(3), 2)), '[tree-set: 1, 2, 3]'],
    ['constructor field', box(treeSet(branch(1))), 'box([tree-set: 1])'],
    ['nested sets', listSet([treeSet(branch(2)), listSet([1])]), '[list-set: ].add([list-set: ].add(1)).add([tree-set: 2])'],
    ['constructor elements', listSet([box(2), box(1)]), '[list-set: ].add(box(1)).add(box(2))'],
    ['tuple and array', { vals: [[treeSet()], listSet([])] }, '{[raw-array: [tree-set: ]]; [list-set: ]}'],
  ])('%s survives cache-free JSON replay', (_id, value, expected) => {
    expect(transport(value as PyretObject).source).toBe(expected);
  });

  it('retains the existing list/tree atoms and constructor-field relations', () => {
    const { datum, rebuilt } = transport(treeSet(branch(2, branch(1), branch(3), 2)));
    expect(datum.getAtoms().filter(a => a.type === 'branch')).toHaveLength(3);
    expect(datum.getRelations().map(r => r.name).sort()).toEqual(['elems', 'h', 'left', 'right', 'value']);
    for (const relation of datum.getRelations()) {
      expect(readFieldId(relation.id)).toBeDefined();
      expect(relation.tuples.every(t => t.atoms.length === 2)).toBe(true);
    }
    expect((rebuilt.dict!.elems as PyretObject).$name).toBe('branch');
  });

  it('ignores AVL shape and heights for printing while keeping them structurally', () => {
    const a = treeSet(branch(2, branch(1), branch(3), 2));
    const b = treeSet(branch(1, ctor('leaf'), branch(2, ctor('leaf'), branch(3), 2), 3));
    expect(transport(a).source).toBe(transport(b).source);
    expect(canon(new PyretDataInstance(a))).not.toBe(canon(new PyretDataInstance(b)));
  });

  it('renders sets inside reference graphs without scheduling internal AVL constructors', () => {
    const set = treeSet(branch(2, branch(1)));
    const { source } = transport({ dict: { owner: cell(set), set } });
    expect(source).toContain('[tree-set: 1, 2]');
    expect(source).toContain('cell(');
    expect(source).not.toMatch(/\b(branch|leaf|link|empty)\b/);
  });

  it('constructs a set element with a reference before constructing the set', () => {
    const { source } = transport(listSet([cell(5)]));
    expect(source).toContain('cell(5)');
    expect(source).toMatch(/\[list-set: \]\.add\(spytial-value\d+\)/);
    expect(source.indexOf('cell(5)')).toBeLessThan(source.indexOf('[list-set: ]'));
  });

  it('does not identify a set from its name alone', () => {
    expect(transport(ctor('list-set', { other: 1 })).source).toBe('list-set(1)');
    expect(transport(ctor('tree-set', { other: 1 })).source).toBe('tree-set(1)');
    expect(transport({ dict: { elems: list([1]) } }).source).toBe('{elems: link(1, empty)}');
  });

  it('rejects incomplete backing structures and cycles on either tree side', () => {
    expect(() => setContents(ctor('list-set', { elems: 1 }))).toThrow(/Malformed Pyret list-set/);
    expect(() => setContents(treeSet(ctor('branch', { value: 1 })))).toThrow(/Malformed Pyret tree-set/);
    const spine = list([1]); spine.dict!.rest = spine;
    expect(() => setContents(ctor('list-set', { elems: spine }))).toThrow(/Malformed Pyret list-set/);
    for (const side of ['left', 'right']) {
      const tree = branch(1); tree.dict![side] = tree;
      expect(() => setContents(treeSet(tree))).toThrow(/Malformed Pyret tree-set/);
    }
  });

  it('retains list order across the literal optimization boundary and generated permutations', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: -20, max: 20 }), { maxLength: 12 }), values => {
      const { rebuilt, source } = transport(listSet(values));
      expect(setContents(rebuilt)!.elements).toEqual(values);
      // Public add prepends, so simulate its effect rather than a literal's
      // size-dependent make/makeN implementation.
      const calls = [...source.matchAll(/\.add\((-?\d+)\)/g)].map(m => Number(m[1]));
      expect(calls.reduce<number[]>((result, value) => [value, ...result], [])).toEqual(values);
    }), { seed: 597, numRuns: 100 });
  });
});
