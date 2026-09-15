import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { IAtom, IRelation } from '../../src/data-instance/interfaces';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { tableContents } from '../../src/data-instance/pyret/table';
import { canon } from '../../src/data-instance/pyret/canon';
import { readFieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';
import { generateAlloySchema } from '../../src/data-instance/schema-descriptor';
import { parseLayoutSpec } from '../../src/layout/layoutspec';
import { LayoutInstance } from '../../src/layout/layoutinstance';

const table = (headers: string[], rows: unknown[][]): PyretObject => ({
  brands: { '$brandtable123': true },
  dict: { '_header-raw-array': headers, '_rows-raw-array': rows,
    _output: { meth() { throw new Error('Must not inspect the display skeleton'); } } },
});
const box = (v: unknown): PyretObject => ({ $name: 'box', $arity: 1,
  $constructor: { $fieldNames: ['v'] }, dict: { v } });
const atom = (id: string, type: string, label = type): IAtom => ({ id, type, label });
const relation = (id: string, name: string, types: string[], tuples: string[][]): IRelation => ({
  id, name, types, tuples: tuples.map(atoms => ({ atoms, types })),
});

function transport(value: PyretObject) {
  const original = new PyretDataInstance(value);
  const raw = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  const ids = new Map(raw.atoms.map((a: IAtom, i: number) => [a.id, `opaque-${raw.atoms.length - i}`]));
  const rootId = ids.get(original.getAtoms()[0].id) as string;
  raw.atoms.forEach((a: IAtom) => {
    expect(a).not.toHaveProperty('metadata');
    a.id = ids.get(a.id) as string;
    if (!['Number', 'String', 'Boolean', 'Index'].includes(a.type)) a.label = 'display only';
  });
  raw.relations.forEach((r: IRelation, i: number) => {
    if (!readFieldId(r.id)) r.id = `unrelated-${i}`;
    r.tuples.forEach(t => { t.atoms = t.atoms.map(id => ids.get(id) as string); });
    r.tuples.reverse();
  });
  raw.types.forEach((t: { atoms: IAtom[] }) => {
    t.atoms = t.atoms.map(a => raw.atoms.find((renamed: IAtom) => renamed.id === ids.get(a.id)));
  });
  raw.atoms.reverse(); raw.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  const datum = new JSONDataInstance(raw);
  expect(datum.getErrors()).toEqual([]);
  const rebuilt = reifyToValue(datum, rootId) as PyretObject;
  expect(canon(new PyretDataInstance(rebuilt))).toBe(canon(original));
  return { datum, rebuilt, source: replit(datum, rootId), rootId };
}

/** Entirely authored input: no producer object, snapshot, or metadata. */
function authored() {
  return new JSONDataInstance({ atoms: [atom('t', 'Table'), atom('i', 'Index', '0'), atom('j', 'Index', '1'),
    atom('h', 'String', 'name'), atom('k', 'String', 'score'), atom('a', 'String', 'Ada'), atom('n', 'Number', '7')],
  relations: [relation('c', 'column', ['Table', 'Index', 'String'], [['t', 'i', 'h'], ['t', 'j', 'k']]),
    relation('r', 'row', ['Table', 'Index', 'PyretObject', 'PyretObject'], [['t', 'i', 'a', 'n'], ['t', 'j', 'a', 'n']])] });
}
const query = (di: JSONDataInstance, expression: string) => {
  const evaluator = new SGraphQueryEvaluator(); evaluator.initialize({ sourceData: di });
  return evaluator.evaluate(expression);
};
function contents(di: JSONDataInstance, root = 't') {
  return tableContents(reifyToValue(di, root) as PyretObject);
}
function verifyEdited(di: JSONDataInstance, expected: PyretObject) {
  const value = reifyToValue(di, 't') as PyretObject;
  expect(tableContents(value)).toEqual(tableContents(expected));
  // Leftover atoms after deletion are allowed: compare the reconstructed value
  // against an independently specified expected table, not the old payload.
  const again = new PyretDataInstance(value);
  expect(canon(again)).toBe(canon(new PyretDataInstance(expected)));
  expect(replit(di, 't')).toBe(replit(again));
}

describe('table structural fidelity (#599)', () => {
  it.each([
    ['ordinary', ['name', 'score'], [['Ada', 7], ['Ada', 7]]],
    ['empty', ['z', 'a'], []],
    ['no columns or rows', [], []],
    ['zero-column row occurrences', [], [[], []]],
    ['mixed types', ['x'], [[1], ['one'], [true]]],
    ['unusual names', ['', 'first name', 'row', 'end', 'é', '__proto__'], [[1, 2, 3, 4, 5, 6]]],
  ])('%s survives opaque IDs, shuffled tuples, and default JSON normalization', (_name, headers, rows) => {
    const original = table(headers as string[], rows as unknown[][]);
    expect(tableContents(transport(original).rebuilt)).toEqual(tableContents(original));
  });

  it('emits public source, including empty and string-named schemas', () => {
    expect(transport(table(['a', 'b'], [[1, 2]])).source).toBe('table: a, b\n  row: 1, 2\nend');
    expect(transport(table(['a'], [])).source).toBe('table: a\nend');
    expect(transport(table([], [[], []])).source).toBe('for fold(spytial-table from empty-table([list: ]), spytial-row from range(0, 2)):\n  spytial-table.add-row([raw-row: ])\nend');
    expect(transport(table(['first name'], [['Ada']])).source).toBe('[table-from-columns: {"first name"; [list: "Ada"]}]');
    expect(transport(table(['end'], [])).source).toBe('[table-from-columns: {"end"; [list: ]}]');
  });

  it('preserves structured cells, nested tables, and shared cell identity', () => {
    const shared = box([1, 1]);
    const { rebuilt, source } = transport(table(['x', 'y'], [[shared, shared], [table(['a'], [[2]]), { vals: [true] }]]));
    const { rows } = tableContents(rebuilt);
    expect(rows[0][0]).toBe(rows[0][1]);
    expect(tableContents(rows[1][0] as PyretObject).rows).toEqual([[2]]);
    expect(source).toContain('shadow spytial-value');
    expect(source.match(/box\(/g)).toHaveLength(1);
  });

  it('keeps table relations distinct from constructor and object fields with the same names', () => {
    const t = table(['a'], [[1]]);
    const constructor: PyretObject = { $name: 'record', $arity: 2,
      $constructor: { $fieldNames: ['row', 'column'] }, dict: { row: t, column: 2 } };
    const object: PyretObject = { $pyretValue: { kind: 'object' }, dict: { row: constructor, column: t } };
    const { rebuilt, datum } = transport(object);
    const record = rebuilt.dict!.row as PyretObject;
    expect(record.dict!.row).toBe(rebuilt.dict!.column);
    expect(record.dict!.column).toBe(2);
    expect(datum.getRelations().filter(r => r.name === 'row')).toHaveLength(3);
  });

  it('preserves a table cycle through an initialized mutable field', () => {
    const ref: PyretObject = { $pyretValue: { kind: 'reference', unrestricted: true } };
    const cell: PyretObject = { $name: 'cell', $arity: 1, $constructor: { $fieldNames: ['next'] },
      $mut_fields_mask: [true], dict: { next: ref } };
    const t = table(['x'], [[cell]]); ref.value = t;
    const { rebuilt, source } = transport(t);
    const rebuiltCell = tableContents(rebuilt).rows[0][0] as PyretObject;
    expect((rebuiltCell.dict!.next as PyretObject).value).toBe(rebuilt);
    expect(source).toContain('cell(nothing)');
    expect(source).toContain('!{next:');
  });

  it('retains rows beyond the runtime display limit', () => {
    const { rebuilt } = transport(table(['n'], Array.from({ length: 1002 }, (_, i) => [i])));
    expect(tableContents(rebuilt).rows).toHaveLength(1002);
    expect(tableContents(rebuilt).rows[1001]).toEqual([1001]);
  });

  it('uses separate signatures by width with shared lookup names and precise endpoint types', () => {
    const { datum } = transport(box([table(['a', 'b'], [[1, 'x'], [true, 2]]), table(['a'], [[false]])]));
    const rows = datum.getRelations().filter(r => r.name === 'row');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(r => r.id)).size).toBe(2);
    expect(rows.map(r => r.types.length).sort()).toEqual([3, 4]);
    expect(query(datum, '#row').prettyPrint()).toBe('3');
    expect(query(datum, 'Index.(Table.row)').getRawResult()).toHaveLength(3);
    for (const r of rows) for (const t of r.tuples) {
      t.atoms.forEach((id, i) => expect(datum.getAtomType(id).types).toContain(t.types[i]));
    }
    expect(generateAlloySchema(datum)).toContain('row');
  });

  it('preserves the useful binary graph view through projection', () => {
    const di = authored();
    expect(query(di, '#row').prettyPrint()).toBe('2');
    expect(query(di, 't.row').selectedTuplesAll()).toHaveLength(2);
    expect(query(di, 'Index.(t.row)').selectedTuplesAll()).toEqual([['a', 'n']]);
    expect(query(di, 'Index.(Table.row)').selectedTuplesAll()).toEqual([['a', 'n']]);
  });

  it('renders the projected row view as the original airport edges', () => {
    const { datum } = transport(table(['origin', 'destination'], [['PVD', 'ORD'], ['ORD', 'PVD']]));
    const evaluator = new SGraphQueryEvaluator(); evaluator.initialize({ sourceData: datum });
    const spec = parseLayoutSpec('directives:\n  - inferredEdge:\n      name: flight\n      selector: Index.(Table.row)');
    const layout = new LayoutInstance(spec, evaluator, 0, true).generateLayout(datum).layout;
    const edges = layout.edges.filter(e => e.id.includes('_inferred_') && e.id.includes('flight'));
    const labels = new Map(datum.getAtoms().map(a => [a.id, a.label]));
    expect(edges.map(e => [labels.get(e.source.id), labels.get(e.target.id)]).sort()).toEqual([['ORD', 'PVD'], ['PVD', 'ORD']]);
  });

  it('reifies without type membership lists or cached schemas', () => {
    const { datum, rootId } = transport(table(['a'], [[7]]));
    const withoutMembers = new JSONDataInstance({ atoms: [...datum.getAtoms()], relations: [...datum.getRelations()],
      types: datum.getTypes().map(t => ({ ...t, atoms: [] })) });
    PyretDataInstance.clearGlobalConstructorCache();
    expect(replit(withoutMembers, rootId)).toBe('table: a\n  row: 7\nend');
  });

  it('authors a zero-column table using its atom alone', () => {
    const di = new JSONDataInstance({ atoms: [atom('t', 'Table', 'arbitrary display label')], relations: [] });
    verifyEdited(di, table([], []));
  });

  it('edits cell labels, header names, and row multiplicity', () => {
    const di = authored();
    di.getAtoms().find(a => a.id === 'n')!.label = '9';
    di.getAtoms().find(a => a.id === 'h')!.label = 'first name';
    verifyEdited(di, table(['first name', 'score'], [['Ada', 9], ['Ada', 9]]));
    di.removeRelationTuple('r', { atoms: ['t', 'j', 'a', 'n'], types: [] });
    verifyEdited(di, table(['first name', 'score'], [['Ada', 9]]));
    di.addRelationTuple('r', { atoms: ['t', 'j', 'n', 'a'], types: [] });
    verifyEdited(di, table(['first name', 'score'], [['Ada', 9], [9, 'Ada']]));
  });

  it('reorders rows by changing their index endpoints without changing column positions', () => {
    const di = authored();
    const rows = di.getRelations().find(r => r.id === 'r')!.tuples;
    rows[0].atoms = ['t', 'j', 'n', 'a']; rows[1].atoms = ['t', 'i', 'a', 'n'];
    verifyEdited(di, table(['name', 'score'], [['Ada', 7], [7, 'Ada']]));
  });

  it('reorders columns by editing column positions and the corresponding tuple columns', () => {
    const di = authored();
    for (const r of di.getRelations()) for (const t of r.tuples) {
      if (r.name === 'column') t.atoms[1] = t.atoms[1] === 'i' ? 'j' : 'i';
      else [t.atoms[2], t.atoms[3]] = [t.atoms[3], t.atoms[2]];
    }
    verifyEdited(di, table(['score', 'name'], [[7, 'Ada'], [7, 'Ada']]));
  });

  it('derives empty schemas and zero-column row counts from edits alone', () => {
    const di = authored();
    di.getRelations().find(r => r.name === 'column')!.tuples = [];
    const rows = di.getRelations().find(r => r.name === 'row')!;
    rows.types = ['Table', 'Index'];
    rows.tuples.forEach(t => { t.atoms = t.atoms.slice(0, 2); t.types = rows.types; });
    verifyEdited(di, table([], [[], []]));
    rows.tuples = [];
    verifyEdited(di, table([], []));
  });

  it('keeps same-width tables separate when selecting and editing a root', () => {
    const di = authored();
    di.addAtom(atom('u', 'Table'));
    di.addRelationTuple('c', { atoms: ['u', 'i', 'h'], types: [] });
    di.addRelationTuple('c', { atoms: ['u', 'j', 'k'], types: [] });
    di.addRelationTuple('r', { atoms: ['u', 'i', 'n', 'a'], types: [] });
    expect(contents(di, 'u').rows).toEqual([[7, 'Ada']]);
    expect(contents(di).rows).toEqual([['Ada', 7], ['Ada', 7]]);
    expect(() => replit(di)).toThrow(/explicit root/);
  });

  it.each([
    ['missing column', (di: JSONDataInstance) => { di.getRelations()[0].tuples.shift(); }, /contiguous/],
    ['missing row', (di: JSONDataInstance) => { di.getRelations()[1].tuples.shift(); }, /contiguous/],
    ['wrong width', (di: JSONDataInstance) => { di.getRelations()[1].tuples[0].atoms.pop(); }, /width/],
    ['duplicate header', (di: JSONDataInstance) => { di.getAtoms().find(a => a.id === 'h')!.label = 'score'; }, /Duplicate.*column/],
    ['conflicting rows', (di: JSONDataInstance) => { di.getRelations()[1].tuples.push({ atoms: ['t', 'i', 'n', 'a'], types: [] }); }, /Conflicting.*row/],
    ['conflicting columns', (di: JSONDataInstance) => { di.getRelations()[0].tuples.push({ atoms: ['t', 'i', 'k'], types: [] }); }, /Conflicting.*column/],
    ['non-string header', (di: JSONDataInstance) => { di.getRelations()[0].tuples[0].atoms[2] = 'n'; }, /Malformed.*table/],
    ['invalid position', (di: JSONDataInstance) => { di.getAtoms().find(a => a.id === 'i')!.label = '-1'; }, /position/],
    ['unexpected relation', (di: JSONDataInstance) => { di.getRelations()[0].name = 'header'; }, /Malformed.*table/],
    ['index cell', (di: JSONDataInstance) => { di.getRelations()[1].tuples[0].atoms[2] = 'i'; }, /cells cannot be positions/],
    ['dangling cell', (di: JSONDataInstance) => { di.getRelations()[1].tuples[0].atoms[2] = 'absent'; }, /Malformed.*tuple/],
  ])('rejects %s in edited relations', (_name, edit, error) => {
    const di = authored(); edit(di);
    expect(() => replit(di, 't')).toThrow(error);
  });

  it.each([null, undefined, () => 1, { dict: {}, app() { return 1; } },
    { dict: {}, $rowData: [1], $underlyingTable: {} }])('rejects an unsupported cell instead of dropping its row: %s', value => {
    expect(() => new PyretDataInstance(table(['x'], [[value]]))).toThrow(/not supported|Unsupported/);
  });

  it('rejects malformed runtime storage and direct immutable table cycles', () => {
    expect(() => new PyretDataInstance(table(['x', 'x'], [[1, 2]]))).toThrow(/Malformed/);
    expect(() => new PyretDataInstance(table(['x'], [[1, 2]]))).toThrow(/Malformed/);
    expect(() => new PyretDataInstance(table(['x'], [new Array(1)]))).toThrow(/Unsupported/);
    const cyclic = table(['x'], []); (cyclic.dict!['_rows-raw-array'] as unknown[][]).push([cyclic]);
    const di = new PyretDataInstance(cyclic);
    expect(() => replit(di, di.getAtoms()[0].id)).toThrow(/Cyclic/);
  });

  it('generated rectangular tables preserve every value and position', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 5 }), fc.array(fc.array(fc.oneof(fc.integer(), fc.string(), fc.boolean()),
      { minLength: 5, maxLength: 5 }), { maxLength: 8 }), (width, input) => {
      const headers = Array.from({ length: width }, (_, i) => 'column-' + i);
      const rows = input.map(row => row.slice(0, width));
      expect(tableContents(transport(table(headers, rows)).rebuilt)).toEqual({ headers, rows });
    }), { numRuns: 100 });
  });
});
