import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PyretDataInstance, type PyretObject } from '../../src/data-instance/pyret/pyret-data-instance';
import { JSONDataInstance } from '../../src/data-instance/json-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';
import { canon } from '../../src/data-instance/pyret/canon';
import { readFieldId } from '../../src/data-instance/pyret/identity';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

// Match the runtime's PRef and PAnnList protocols. No constructor-name test and
// no annotation callback execution: the integration script uses real PRefs.
const ref = (value: unknown, annotation = 'Any'): PyretObject => ({
  state: 2, value, anns: { anns: [{ ann: { name: annotation } }],
    check() { throw new Error('Annotation executed during relationalization'); }, addAnn() {} },
});
const ctor = (name: string, dict: Record<string, unknown>, mask: boolean[]): PyretObject => ({
  $name: name, $arity: mask.length, $mut_fields_mask: mask,
  $constructor: { $fieldNames: Object.keys(dict) }, dict,
});
const cell = (value: unknown): PyretObject => ctor('cell', { next: ref(value) }, [true]);
const box = (value: unknown): PyretObject => ctor('box', { v: value }, [false]);
const target = (c: PyretObject): PyretObject => c.dict!.next as PyretObject;
const self = (): PyretObject => { const c = cell(0); target(c).value = c; return c; };

function transport(value: PyretObject | unknown[]) {
  const original = new PyretDataInstance(value);
  const raw = JSON.parse(JSON.stringify({ atoms: original.getAtoms(), relations: original.getRelations(), types: original.getTypes() }));
  const ids = new Map(raw.atoms.map((a: any, i: number) => [a.id, `opaque-${raw.atoms.length - i}`]));
  raw.atoms.forEach((a: any) => {
    a.id = ids.get(a.id);
    expect(a).not.toHaveProperty('metadata');
    if (!['Number', 'String', 'Boolean', 'Index'].includes(a.type)) a.label = 'display only';
  });
  raw.relations.forEach((r: any, i: number) => {
    if (!readFieldId(r.id)) r.id = `arbitrary-${i}`;
    r.tuples.forEach((t: any) => { t.atoms = t.atoms.map((id: string) => ids.get(id)); });
    r.tuples.reverse();
  });
  raw.types.forEach((t: any) => { t.atoms = []; });
  raw.atoms.reverse(); raw.relations.reverse();
  PyretDataInstance.clearGlobalConstructorCache();
  const datum = new JSONDataInstance(raw);
  expect(datum.getErrors()).toEqual([]);
  return { original, datum, raw, rootId: ids.get(original.getAtoms()[0].id) as string };
}
function roundTrip(value: PyretObject | unknown[]) {
  const { original, datum, rootId } = transport(value);
  const rebuilt = reifyToValue(datum, rootId) as PyretObject;
  expect(canon(new PyretDataInstance(rebuilt))).toBe(canon(original));
  expect(replit(datum, rootId)).toBe(replit(original, original.getAtoms()[0].id));
  return { datum, rebuilt, rootId, source: replit(datum, rootId) };
}

describe('initialized Pyret references and cycles (#593)', () => {
  it('keeps the field, reference, and target as distinct relational components', () => {
    const { datum, rebuilt, source } = roundTrip(cell(5));
    expect(datum.getAtoms().map(a => a.type).sort()).toEqual(['Index', 'Number', 'Reference', 'cell']);
    expect((target(rebuilt).value)).toBe(5);
    expect(source).toContain('cell(5)');
    const ev = new SGraphQueryEvaluator(); ev.initialize({ sourceData: datum });
    expect(ev.evaluate('next.target').selectedTuplesAll()).toHaveLength(1);
    const relation = datum.getRelations().find(r => r.name === 'target')!;
    expect(relation.types).toEqual(['Reference', 'PyretObject']);
  });

  it('preserves the root and a self-cycle after arbitrary ID and record reordering', () => {
    const { datum, rebuilt, source } = roundTrip(self());
    expect(target(rebuilt).value).toBe(rebuilt);
    expect(datum.getRelations().some(r => r.name === 'root')).toBe(false);
    expect(source).toContain('cell(nothing)');
    expect(source).toContain('!{next: spytial-value0}');
    expect(source).not.toContain('<cyclic>');
  });

  it('preserves an asymmetric two-node cycle and its observation point', () => {
    const a = cell(0), b = ctor('other', { next: ref(a), label: 'B' }, [true, false]);
    target(a).value = b;
    const { rebuilt } = roundTrip(a);
    expect(target(target(rebuilt).value as PyretObject).value).toBe(rebuilt);
    expect(rebuilt.$name).toBe('cell');
    expect((target(rebuilt).value as PyretObject).$name).toBe('other');
  });

  it('preserves an unowned reference structurally and explicitly rejects source generation', () => {
    const r = ref(0); r.value = r;
    const { datum, original, rootId } = transport(r);
    const rebuilt = reifyToValue(datum, rootId) as PyretObject;
    expect(rebuilt.value).toBe(rebuilt);
    expect(canon(new PyretDataInstance(rebuilt))).toBe(canon(original));
    expect(() => replit(datum, rootId)).toThrow(/reachable mutable constructor/);
  });

  it('supports a reference root when its constructor owner is reachable', () => {
    const c = self();
    const { rebuilt } = roundTrip(target(c));
    expect(target(rebuilt.value as PyretObject)).toBe(rebuilt);
  });

  it('distinguishes reference cycles from cycles through the containing object', () => {
    const c = cell(0); target(c).value = target(c);
    const { rebuilt } = roundTrip(c);
    expect(target(rebuilt).value).toBe(target(rebuilt));
    expect(canon(new PyretDataInstance(c))).not.toBe(canon(new PyretDataInstance(self())));
  });

  it('preserves aliases to an owned reference and equal-but-distinct cells', () => {
    const c = cell(5), r = target(c), second = cell(5), separate = target(second);
    const value = { dict: { owner: c, left: r, right: r, separate, second } };
    const { rebuilt, source } = roundTrip(value);
    expect(rebuilt.dict!.left).toBe(rebuilt.dict!.right);
    expect(rebuilt.dict!.left).toBe(target(rebuilt.dict!.owner as PyretObject));
    expect(rebuilt.dict!.left).not.toBe(rebuilt.dict!.separate);
    expect(source.match(/cell\(/g)).toHaveLength(2);
  });

  it('distinguishes an implicit mutable field from an ordinary field holding a reference', () => {
    const c = cell(5);
    const { source, rebuilt } = roundTrip({ dict: { c, boxed: box(target(c)) } });
    expect((rebuilt.dict!.boxed as PyretObject).$mut_fields_mask).toBeUndefined();
    expect(source).toMatch(/box\(spytial-value\d+\.next\)/);
    expect(source).not.toContain('box(5)');
  });

  it('supports cycles through immutable objects, tuples, and arrays when a reference breaks the cycle', () => {
    const c = cell(0), values = { vals: [c, [c]] };
    target(c).value = values;
    const { rebuilt } = roundTrip(values);
    const vals = rebuilt.vals as any[];
    expect(vals[0]).toBe(vals[1][0]);
    expect(target(vals[0]).value).toBe(rebuilt);
  });

  it('retains named object target fields alongside the new reference target relation', () => {
    roundTrip({ dict: { target: self() } });
  });

  it('keeps multiple mutable fields distinct while preserving a shared target', () => {
    const a = ref(0), b = ref(0), value = ctor('two', { row: a, second: b }, [true, true]);
    a.value = value; b.value = value;
    const { rebuilt, source } = roundTrip(value);
    expect(rebuilt.dict!.row).not.toBe(rebuilt.dict!.second);
    expect((rebuilt.dict!.row as PyretObject).value).toBe(rebuilt);
    expect((rebuilt.dict!.second as PyretObject).value).toBe(rebuilt);
    expect(source).toContain('!{row :');
  });

  it('constructs annotated acyclic fields using their real target without running annotations', () => {
    const c = ctor('typed', { next: ref(5, 'Number') }, [true]);
    const { source } = roundTrip(c);
    expect(source).toContain('typed(5)');
    expect(source).not.toContain('nothing');
  });

  it('preserves structurally but rejects cycles that cannot use a placeholder', () => {
    const c = ctor('typed', { next: ref(0, 'Cell') }, [true]);
    target(c).value = c;
    const { datum, rootId } = transport(c);
    const rebuilt = reifyToValue(datum, rootId) as PyretObject;
    expect(target(rebuilt).value).toBe(rebuilt);
    expect(() => replit(datum, rootId)).toThrow(/cannot be constructed/);
  });

  it('rejects assigning one reference to multiple implicit mutable fields instead of copying it', () => {
    const r = ref(1), pair = ctor('pair', { a: r, b: r }, [true, true]);
    const { datum, rootId } = transport(pair);
    expect(() => replit(datum, rootId)).toThrow(/multiple mutable constructor fields/);
  });

  it.each([0, 1, 3, 7])('rejects unsupported runtime reference state %s', state => {
    const r = ref(1); r.state = state;
    expect(() => new PyretDataInstance(box(r))).toThrow(/initialized mutable/);
  });

  it('rejects unsupported reference targets rather than dropping them', () => {
    expect(() => new PyretDataInstance(ref(undefined))).toThrow(/reference target/);
  });

  it('validates missing/conflicting targets and mutable positions using relational data', () => {
    const make = () => transport(self()).raw;
    const decode = (raw: any) => reifyToValue(new JSONDataInstance(raw), raw.atoms.find((a: any) => a.type === 'cell').id);
    const missing = make(); missing.relations = missing.relations.filter((r: any) => r.name !== 'target');
    expect(() => decode(missing)).toThrow(/Incomplete Pyret reference/);
    const conflict = make(), rel = conflict.relations.find((r: any) => r.name === 'target');
    rel.tuples.push({ atoms: [rel.tuples[0].atoms[0], rel.tuples[0].atoms[0]], types: rel.types });
    expect(() => decode(conflict)).toThrow(/Conflicting Pyret reference/);
    const mask = make(); mask.atoms.find((a: any) => a.type === 'Index').label = '1';
    expect(() => decode(mask)).toThrow(/mutable field positions/);
  });

  it('requires the caller to choose an observation point for a cycle', () => {
    const { datum, rootId } = transport(self());
    expect(() => reifyToValue(datum)).toThrow(/explicit root/);
    expect(() => reifyToValue(datum, 'unknown')).toThrow(/Unknown Pyret root ID/);
    const owner = reifyToValue(datum, rootId) as PyretObject;
    const reference = reifyToValue(datum, datum.getAtoms().find(a => a.type === 'Reference')!.id) as PyretObject;
    expect(target(owner).value).toBe(owner);
    expect(target(reference.value as PyretObject)).toBe(reference);
  });

  it('uses generated variable names that do not shadow reachable constructors', () => {
    const c = ctor('spytial-value0', { next: ref(1) }, [true]);
    const { source } = roundTrip(c);
    expect(source).not.toContain('spytial-value0 =');
    expect(source).toContain('= spytial-value0(1)');
  });

  it('generated reference graphs preserve every target and sharing after JSON replay', () => {
    fc.assert(fc.property(fc.array(fc.nat({ max: 100 }), { minLength: 1, maxLength: 12 }), edges => {
      const cells = edges.map(() => cell(0));
      edges.forEach((n, i) => { target(cells[i]).value = cells[n % cells.length]; });
      const { rebuilt } = roundTrip(cells);
      const actual = rebuilt as unknown as PyretObject[];
      edges.forEach((n, i) => expect(target(actual[i]).value).toBe(actual[n % actual.length]));
    }), { seed: 593, numRuns: 100 });
  });
});
