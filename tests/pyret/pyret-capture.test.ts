// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { capturePyret, importPyretCapture, PyretCaptureError } from '../../src/pyret-capture';
import type { PyretRuntimeAdapter } from '../../src/pyret-capture';
import { numberPayload } from '../../src/data-instance/pyret/numbers';
import { readConstructorTypeId } from '../../src/data-instance/pyret/identity';
import { PyretDataInstance } from '../../src/data-instance/pyret/pyret-data-instance';
import { SGraphQueryEvaluator } from '../../src/evaluators/data/sgq-evaluator';

// Adapter contract tests use independent host values. Real runtime predicates,
// numeric representations and library storage are checked by the integration script.
const adapter: PyretRuntimeAdapter = { observe(v: any) {
  if (typeof v === 'string' || typeof v === 'boolean') return { kind: 'primitive', value: v };
  const n = numberPayload(v);
  if (n) return { kind: 'primitive', value: { $pyretNumber: n } };
  if (typeof v === 'function') throw new Error('Unsupported function');
  if (Array.isArray(v)) return { kind: 'raw-array', values: v };
  if (v.ref) return { kind: 'reference', value: v.target };
  if (v.ctor) return { kind: 'constructor', identity: v.ctor,
    info: { name: v.ctor.name, arity: v.ctor.arity, fields: v.ctor.fields, mutableFields: v.ctor.mutableFields },
    values: v.values };
  return { kind: 'object', fields: Object.entries(v) };
} };
const ctor = (name: string, fields: string[], arity = fields.length) => ({ name, fields, arity });
const value = (c: any, ...values: unknown[]) => ({ ctor: c, values });
const snapshot = (v: unknown) => capturePyret([{ name: 'root', value: v }], adapter);
const round = (v: unknown) => importPyretCapture(JSON.parse(JSON.stringify(snapshot(v))));

describe('portable Pyret capture', () => {
  it('imports with no browser or runtime and retains roots/context and shared identities', () => {
    expect(typeof window).toBe('undefined');
    const leaf = value(ctor('leaf', ['n']), 3);
    const s = capturePyret([{ name: 'a', value: leaf, observation: { expression: 'a' } },
      { name: 'b', value: leaf }, { name: 'equal', value: value(leaf.ctor, 3) }], adapter, { module: 'example' });
    s.datum.atoms.reverse(); s.datum.relations.reverse();
    PyretDataInstance.clearGlobalConstructorCache();
    const imported = importPyretCapture(JSON.parse(JSON.stringify(s)));
    expect(imported.values.get('a')).toBe(imported.values.get('b'));
    expect(imported.values.get('a')).not.toBe(imported.values.get('equal'));
    expect(imported.snapshot.roots[0].observation).toEqual({ expression: 'a' });
    expect(imported.snapshot.provenance).toEqual({ module: 'example' });
  });

  it('distinguishes same-named declarations with identical and incompatible schemas', () => {
    const a = ctor('same', ['x', 'y']);
    const b = ctor('same', ['y', 'x']);
    const c = ctor('same', ['x', 'y']);
    const { snapshot: s, values } = round([value(a, 1, 2), value(b, 3, 4), value(c, 1, 2), value(a, 5, 6)]);
    const rows = values.get('root') as any[];
    expect(new Set(rows.slice(0, 3).map(v => v.$name)).size).toBe(3);
    expect(rows[0].$name).toBe(rows[3].$name);
    expect(rows[1].dict).toEqual({ y: 3, x: 4 });
    expect(s.datum.atoms.filter(a => readConstructorTypeId(a.type)).every(a => a.label === 'same')).toBe(true);
  });

  it('keeps ordinary selector names while separating nominal IDs and builtin-name collisions', () => {
    const { instance, values } = round([value(ctor('node', ['v']), 1), value(ctor('Number', ['v']), 2)]);
    const ev = new SGraphQueryEvaluator(); ev.initialize({ sourceData: instance });
    expect(ev.evaluate('node').selectedAtoms()).toHaveLength(1);
    expect(ev.evaluate('Number').selectedAtoms()).toHaveLength(2);
    const rows = values.get('root') as any[];
    expect(rows[1].dict.v).toBe(2);
    expect(readConstructorTypeId(rows[1].$name)?.name).toBe('Number');
  });

  it('preserves raw array cycles and repeated positions, including cross-root cycles', () => {
    const array: unknown[] = []; array.push(array, 1, 1);
    const { values } = round(array);
    const result = values.get('root') as any[];
    expect(result[0]).toBe(result);
    expect(result.slice(1)).toEqual([1, 1]);
  });

  it('preserves reference cells and mutable declaration positions', () => {
    const cell = ctor('cell', ['next']) as any; cell.mutableFields = [0];
    const ref: any = { ref: true };
    const owner = value(cell, ref); ref.target = owner;
    const result: any = round(owner).values.get('root');
    expect(result.dict.next.value).toBe(result);
    expect(result.$mut_fields_mask).toEqual([true]);
  });

  it('distinguishes singleton from zero-argument construction', () => {
    const s: any = round(value(ctor('empty', [], -1))).values.get('root');
    const z: any = round(value(ctor('empty', [], 0))).values.get('root');
    expect(s.$arity).toBe(-1); expect(z.$arity).toBe(0);
  });

  it('reports the root and exact nested path instead of returning a partial graph', () => {
    try { snapshot({ items: [1, () => 2] }); throw new Error('Expected capture failure'); }
    catch (e) {
      expect(e).toBeInstanceOf(PyretCaptureError);
      expect(e).toMatchObject({ root: 'root', path: ['items', 1], reason: 'Unsupported function' });
    }
  });

  it('takes a detached snapshot and rejects nonportable observation context', () => {
    const data = { x: [1] }; const s = snapshot(data); data.x[0] = 9;
    expect((importPyretCapture(s).values.get('root') as any).dict.x).toEqual([1]);
    expect(() => capturePyret([{ name: 'x', value: 1, observation: (() => 1) as any }], adapter)).toThrow(/JSON/);
    expect(() => capturePyret([{ name: 'x', value: 1 }, { name: 'x', value: 2 }], adapter)).toThrow(/unique/);
  });

  it.each(['version', 'root', 'endpoint', 'duplicate', 'position', 'missing-field'])('rejects malformed %s data before use', kind => {
    const s = snapshot(value(ctor('pair', ['x', 'y']), 1, 2));
    if (kind === 'version') (s as any).version = 99;
    if (kind === 'root') s.roots[0].atomId = 'absent';
    if (kind === 'endpoint') s.datum.relations[0].tuples[0].atoms[1] = 'absent';
    if (kind === 'duplicate') s.datum.atoms.push(s.datum.atoms[0]);
    if (kind === 'position') s.datum.relations[1].id = s.datum.relations[1].id.replace(',1,', ',0,');
    if (kind === 'missing-field') s.datum.relations[0].tuples = [];
    expect(() => importPyretCapture(s)).toThrow();
  });
});
