import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DataInstanceNormalizer, JSONDataInstance } from '../src/data-instance/json-data-instance';
import { relationsByName } from '../src/data-instance/relation-identity';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { SQLEvaluator } from '../src/evaluators/data/sql-evaluator';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { generateSQLSchema } from '../src/data-instance/schema-descriptor';
import type { IRelation } from '../src/data-instance/interfaces';
import { addInstanceRelationTuple, removeInstanceRelationTuple } from '../src/data-instance/alloy/alloy-instance/src/instance';

const atoms = ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'Node', label: id }));
const rel = (id: string, name: string, pairs: string[][]): IRelation => ({
  id, name, types: ['Node', 'Node'], tuples: pairs.map(atoms => ({ atoms, types: atoms.map(() => 'Node') })),
});
const make = () => new JSONDataInstance({ atoms, relations: [
  rel('A:foo', 'foo', [['a', 'b']]), rel('B:foo', 'foo', [['a', 'b'], ['a', 'c']]),
] });

describe('v6 relation identity: storage by ID, observation by name', () => {
  it('public mergeRelations defaults absent IDs without mutating input or merging distinct IDs', () => {
    const { id: _id, ...foo } = rel('unused', 'foo', [['a', 'b']]);
    const bar = { ...foo, name: 'bar' };
    const input = [foo, bar, { ...foo, tuples: [{ atoms: ['a', 'c'], types: ['Node', 'Node'] }] },
      rel('A<:foo', 'foo', [['a', 'd']])];
    const before = JSON.stringify(input);
    const result = DataInstanceNormalizer.mergeRelations(input);
    expect(result.map(r => r.id)).toEqual(['foo', 'bar', 'A<:foo']);
    expect(result[0].tuples.map(t => t.atoms)).toEqual([['a', 'b'], ['a', 'c']]);
    expect(JSON.stringify(input)).toBe(before);
    expect(() => DataInstanceNormalizer.mergeRelations([foo, rel('foo', 'bar', [])])).toThrow(/Conflicting names/);
  });

  it('keeps legacy name-only JSON working and preserves explicit empty relations', () => {
    const instance = new JSONDataInstance({ atoms, relations: [
      { name: 'foo', tuples: [['a', 'b']] }, { name: 'foo', tuples: [['a', 'c']] },
      rel('empty-A', 'empty', []), rel('empty-B', 'empty', []),
    ] } as any);
    expect(instance.getRelations().map(r => r.id)).toEqual(['foo', 'empty-A', 'empty-B']);
    expect(instance.getRelations()[0].tuples).toHaveLength(2);
    expect(instance.getRelations()[1].types).toEqual(['Node', 'Node']);
  });
  it('normalization does not mutate producer records, including display labels', () => {
    const input = { atoms: atoms.map(a => ({ ...a, labels: { detail: ['record'] } })),
      relations: [rel('A:foo', 'foo', [['a', 'b']]), rel('A:foo', 'foo', [['a', 'c']])] };
    const before = JSON.stringify(input);
    const instance = new JSONDataInstance(input);
    expect(JSON.stringify(input)).toBe(before);
    const received = new JSONDataInstance(JSON.stringify(instance.reify()));
    expect(received.getAtoms()[0].labels).toEqual(input.atoms[0].labels);
  });
  it('Alloy mutation also uses exact IDs rather than first matching names', () => {
    const tuple = { _: 'tuple', atoms: ['a', 'b'], types: ['Node', 'Node'] } as const;
    const instance: any = { types: {}, skolems: {}, relations: {
      'A:foo': { ...rel('A:foo', 'foo', [['a', 'b']]), _: 'relation' },
      foo: { ...rel('foo', 'bar', []), _: 'relation' },
    } };
    const result = addInstanceRelationTuple(instance, 'foo', tuple as any);
    expect(result.relations['A:foo'].tuples).toHaveLength(1);
    expect(result.relations.foo.tuples).toHaveLength(1);
    expect(() => removeInstanceRelationTuple(result, 'bar', tuple as any)).toThrow(/relation ID/);
  });
  it('preserves IDs through default JSON normalization and serialization', () => {
    const instance = make();
    expect(instance.getRelations().map(r => r.id)).toEqual(['A:foo', 'B:foo']);
    expect(new JSONDataInstance(JSON.stringify(instance.reify())).getRelations()).toEqual(instance.getRelations());
    expect(instance.generateGraph(false, false).edgeCount()).toBe(2);
  });
  it('merges repeated IDs using atom-tuple identity, with positional signatures', () => {
    const instance = new JSONDataInstance({ atoms, relations: [
      rel('A:foo', 'foo', [['a', 'b']]), rel('A:foo', 'foo', [['a', 'b'], ['a', 'c']]),
    ] });
    expect(instance.getRelations()).toHaveLength(1);
    expect(instance.getRelations()[0].tuples).toHaveLength(2);
    expect(instance.getRelations()[0].types).toEqual(['Node', 'Node']);
  });
  it('rejects conflicting names for one ID, including before composition writes', () => {
    expect(() => new JSONDataInstance({ atoms, relations: [rel('x', 'foo', []), rel('x', 'bar', [])] })).toThrow(/Conflicting names/);
    const instance = make();
    const before = JSON.stringify(instance.reify());
    const incoming = new JSONDataInstance({ atoms, relations: [rel('A:foo', 'bar', [['a', 'd']])] });
    expect(() => instance.addFromDataInstance(incoming, false)).toThrow(/Conflicting names/);
    expect(JSON.stringify(instance.reify())).toBe(before);
  });
  it('rejects duplicate IDs when merging is disabled, but allows duplicate names', () => {
    expect(() => new JSONDataInstance({ atoms, relations: [rel('x', 'foo', []), rel('x', 'foo', [])] }, { mergeRelations: false })).toThrow(/Duplicate relation ID/);
    expect(() => new JSONDataInstance(make().reify(), { mergeRelations: false })).not.toThrow();
  });
  it('uses exact IDs for writes, even when an ID equals another record name', () => {
    const instance = new JSONDataInstance({ atoms, relations: [rel('A:foo', 'foo', [['a', 'b']]), rel('foo', 'bar', [['a', 'c']])] });
    instance.addRelationTuple('foo', { atoms: ['a', 'd'], types: [] });
    expect(instance.getRelations()[0].tuples).toHaveLength(1);
    expect(instance.getRelations()[1].tuples).toHaveLength(2);
    instance.removeRelationTuple('foo', { atoms: ['a', 'd'], types: [] });
    expect(() => instance.removeRelationTuple('bar', { atoms: ['a', 'c'], types: [] })).toThrow(/Cannot remove/);
  });
  it('preserves different IDs when composing instances', () => {
    const left = new JSONDataInstance({ atoms, relations: [rel('A:foo', 'foo', [['a', 'b']])] });
    left.addFromDataInstance(new JSONDataInstance({ atoms, relations: [rel('B:foo', 'foo', [['a', 'c']])] }), false);
    expect(left.getRelations().map(r => r.id)).toEqual(['A:foo', 'B:foo']);
  });
  it('SGQ reads the name-based set union, including cardinality and joins', () => {
    const instance = make(), evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });
    expect(evaluator.evaluate('foo').selectedTuplesAll()).toEqual([['a', 'b'], ['a', 'c']]);
    expect(evaluator.evaluate('#foo').prettyPrint()).toBe('2');
    expect(evaluator.evaluate('a.foo').selectedAtoms()).toEqual(['b', 'c']);
    expect(instance.getRelations()).toHaveLength(2);
  });
  it('SQL reads one deduplicated name table, not one table per ID', async () => {
    const instance = make(), evaluator = new SQLEvaluator();
    await evaluator.initialize({ sourceData: instance });
    expect(evaluator.evaluate('SELECT src, tgt FROM foo ORDER BY tgt').selectedTwoples()).toEqual([['a', 'b'], ['a', 'c']]);
    expect(evaluator.getTableSchemas().filter(s => s.name === 'foo')).toHaveLength(1);
    expect((generateSQLSchema(instance, { includeBuiltInTypes: true }).match(/CREATE TABLE foo\b/g) ?? [])).toHaveLength(1);
  });
  it('layout name lookups see every record but each tuple only once', () => {
    const lookup = (LayoutInstance.prototype as any).getFieldTuples;
    expect(lookup.call({}, make(), 'foo')).toEqual([['a', 'b'], ['a', 'c']]);
  });
  it('property: storage retains each ID while query projection is invariant to partition/order', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 })), { maxLength: 30 }), entries => {
      const records = entries.map(([owner, target]) => rel(`owner-${owner}`, 'foo', [['a', atoms[target].id]]));
      const instance = new JSONDataInstance({ atoms, relations: records });
      const expectedIDs = [...new Set(records.map(r => r.id))].sort();
      expect(instance.getRelations().map(r => r.id).sort()).toEqual(expectedIDs);
      for (const stored of instance.getRelations()) {
        const expected = [...new Set(records.filter(r => r.id === stored.id).flatMap(r => r.tuples.map(t => JSON.stringify(t.atoms))))].sort();
        expect(stored.tuples.map(t => JSON.stringify(t.atoms)).sort()).toEqual(expected);
      }
      const query = (rs: IRelation[]) => relationsByName(rs).flatMap(r => r.tuples.map(t => JSON.stringify(t.atoms))).sort();
      expect(query([...instance.getRelations()])).toEqual(query(records.reverse()));
    }), { numRuns: 300 });
  });
});
