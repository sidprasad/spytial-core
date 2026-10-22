import { describe, expect, it } from 'vitest';
import { AlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { editSchemaFromAlloy, validateInstanceStructure, checkRelationTuple } from '../src/data-instance/edit-schema';
import { alloyUnivFixture } from './helpers/alloy-univ-fixture';

const type = (id: string, parents = [id], atoms: string[] = [], meta = {}) => ({
  _: 'type', id, types: parents, atoms: atoms.map(id2 => ({ _: 'atom', id: id2, type: id })), meta,
});
function fixture() {
  const raw = {
    types: {
      Entity: type('Entity', ['Entity'], [], { abstract: true }),
      Person: type('Person', ['Person', 'Entity'], ['p']),
      Place: type('Place', ['Place'], ['home'], { one: true }),
    },
    relations: { 'Person<:at': { _: 'relation', id: 'Person<:at', name: 'at', types: ['Entity', 'Place'], tuples: [] } },
    skolems: {},
  } as any;
  return { data: new AlloyDataInstance(raw), schema: editSchemaFromAlloy(raw) };
}

describe('authoritative edit schema', () => {
  it('accepts all declared Alloy atom types in univ columns without changing the parsed hierarchy', () => {
    const raw = alloyUnivFixture();
    const before = JSON.stringify(raw);
    const data = new AlloyDataInstance(raw);
    const schema = editSchemaFromAlloy(raw);
    expect(raw.types.Person.types).toEqual(['Person']);
    expect(raw.types.univ.atoms).toEqual([]);
    expect(validateInstanceStructure(data, schema)).toEqual({ status: 'valid', issues: [] });
    for (const atom of data.getAtoms()) {
      expect(checkRelationTuple(data, schema, 'Person<:related', {
        atoms: ['Person$0', atom.id], types: [],
      }), atom.id).toEqual([]);
    }
    // Universal membership must not make unrelated types fit a narrower column.
    expect(checkRelationTuple(data, schema, 'Person<:related', {
      atoms: ['Place$0', 'Person$0'], types: [],
    })).toMatchObject([{ code: 'type-mismatch', atomIds: ['Place$0'] }]);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('does not treat a host-declared type named univ as universal', () => {
    const { data } = fixture();
    const schema = {
      types: ['Person', 'Place', 'univ'].map(id => ({ id, parents: [] })),
      relations: [{ id: 'Person<:at', name: 'at', columns: ['Person', 'univ'] }],
    };
    expect(checkRelationTuple(data, schema, 'Person<:at', {
      atoms: ['p', 'home'], types: [],
    })).toMatchObject([{ code: 'type-mismatch', atomIds: ['home'] }]);
  });

  it('accepts inheritance and disconnected atoms without inventing required fields', () => {
    const { data, schema } = fixture();
    expect(validateInstanceStructure(data, schema).status).toBe('valid');
    expect(checkRelationTuple(data, schema, 'Person<:at', { atoms: ['p', 'home'], types: [] })).toEqual([]);
  });

  it('checks exact relation identity, tuple arity, missing atoms and column types', () => {
    const { data, schema } = fixture();
    const codes = (id: string, atoms: string[]) => checkRelationTuple(data, schema, id, { atoms, types: [] }).map(i => i.code);
    expect(codes('at', ['p', 'home'])).toEqual(['unknown-relation']);
    expect(codes('Person<:at', ['p'])).toEqual(['arity']);
    expect(codes('Person<:at', ['missing', 'home'])).toEqual(['missing-atom']);
    expect(codes('Person<:at', ['home', 'p'])).toEqual(['type-mismatch', 'type-mismatch']);
  });

  it('preserves empty type metadata when deleting and replacing a singleton', () => {
    const { data, schema } = fixture();
    data.removeAtom('home');
    expect(validateInstanceStructure(data, schema).status).toBe('incomplete');
    expect(data.getAlloyInstance().types.Place.meta).toEqual({ one: true });
    data.addAtom({ id: 'new-home', type: 'Place', label: 'new-home' });
    expect(validateInstanceStructure(data, schema).status).toBe('valid');
    data.addAtom({ id: 'other-home', type: 'Place', label: 'other-home' });
    expect(validateInstanceStructure(data, schema)).toMatchObject({ status: 'invalid', issues: [{ code: 'multiplicity' }] });
  });

  it('flags undeclared and abstract atom types without changing the draft', () => {
    const { data, schema } = fixture();
    data.addAtom({ id: 'e', type: 'Entity', label: 'e' });
    data.addAtom({ id: 'x', type: 'Unknown', label: 'x' });
    expect(validateInstanceStructure(data, schema).issues.map(i => i.code)).toEqual(expect.arrayContaining(['abstract-type', 'unknown-type']));
    expect(data.getAtoms().map(a => a.id)).toContain('x');
  });

  it('does not claim validation without a schema', () => {
    expect(validateInstanceStructure(fixture().data).status).toBe('unavailable');
  });
});

it('reads one and abstract metadata from real XML instead of inferring cardinality', async () => {
  const { parseAlloyXML } = await import('../src/data-instance/alloy/alloy-instance');
  const xml = `<alloy><instance bitwidth="2" maxseq="2" command="run {}" filename="test.als">
    <sig label="seq/Int" ID="0" parentID="1" builtin="yes"/>
    <sig label="Int" ID="1" parentID="2" builtin="yes"/>
    <sig label="univ" ID="2" builtin="yes"/>
    <sig label="Entity" ID="3" parentID="2" abstract="yes"/>
    <sig label="Person" ID="4" parentID="3"><atom label="Person$0"/></sig>
    <sig label="Place" ID="5" parentID="2" one="yes"><atom label="Place$0"/></sig>
    </instance></alloy>`;
  const raw = parseAlloyXML(xml).instances[0];
  const schema = editSchemaFromAlloy(raw);
  expect(schema.types.find(t => t.id === 'Place')).toMatchObject({ min: 1, max: 1 });
  expect(schema.types.find(t => t.id === 'Entity')).toMatchObject({ abstract: true });
  expect(schema.types.find(t => t.id === 'Person')?.max).toBeUndefined();
  const data = new AlloyDataInstance(raw);
  expect(validateInstanceStructure(data, schema).status).toBe('valid');
  data.removeAtom('Place$0');
  expect(validateInstanceStructure(data, schema).status).toBe('incomplete');
});
