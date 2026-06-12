import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAlloyXML } from '../src/data-instance/alloy/alloy-instance/src/xml';
import {
  AlloyDataInstance,
  createEmptyAlloyDataInstance,
} from '../src/data-instance/alloy-data-instance';
import { extractDomainSchema } from '../src/spec-editor';
import type { IInputDataInstance, IType, IRelation } from '../src/data-instance/interfaces';

/** Load the dining-philosophers (smiths) sample as a real AlloyDataInstance. */
function loadSmiths(): AlloyDataInstance {
  const xml = fs.readFileSync(
    path.resolve(__dirname, '../sample/smiths/datum.xml'),
    'utf-8',
  );
  const datum = parseAlloyXML(xml);
  return new AlloyDataInstance(datum.instances[0]);
}

describe('extractDomainSchema — real AlloyDataInstance (smiths sample)', () => {
  it('extracts user sigs as types and excludes Alloy built-ins', () => {
    const schema = extractDomainSchema(loadSmiths());
    const typeNames = schema.types.map((t) => t.name).sort();

    // User sigs are present.
    expect(typeNames).toContain('Smith');
    expect(typeNames).toContain('Table');
    expect(typeNames).toContain('Chopstick');

    // Built-ins are excluded.
    expect(typeNames).not.toContain('univ');
    expect(typeNames).not.toContain('Int');
    expect(typeNames).not.toContain('seq/Int');
  });

  it('attaches atoms to their types', () => {
    const schema = extractDomainSchema(loadSmiths());
    const smith = schema.types.find((t) => t.name === 'Smith');
    expect(smith).toBeDefined();
    // The smiths sample has 5 Smith atoms.
    expect(smith!.atoms.length).toBe(5);
    // Atom labels look like Smith0..Smith4 (id === label in Alloy).
    expect(smith!.atoms.every((a) => typeof a === 'string' && a.length > 0)).toBe(true);
  });

  it('derives relations with arity / typeSignature from relation tuples types', () => {
    const schema = extractDomainSchema(loadSmiths());
    const byName = new Map(schema.relations.map((r) => [r.name, r]));

    // `smiths : Table -> Int -> Smith` is arity 3.
    const smiths = byName.get('smiths');
    expect(smiths).toBeDefined();
    expect(smiths!.arity).toBe(3);
    expect(smiths!.typeSignature).toEqual(['Table', 'Int', 'Smith']);

    // `avail : Table -> Chopstick` is arity 2.
    const avail = byName.get('avail');
    expect(avail).toBeDefined();
    expect(avail!.arity).toBe(2);
    expect(avail!.typeSignature).toEqual(['Table', 'Chopstick']);
  });

  it('excludes the internal all-built-in guard relation (no-field-guard)', () => {
    const schema = extractDomainSchema(loadSmiths());
    const names = schema.relations.map((r) => r.name);
    expect(names).not.toContain('no-field-guard');
  });

  it('does not produce duplicate type or relation entries', () => {
    const schema = extractDomainSchema(loadSmiths());
    const typeNames = schema.types.map((t) => t.name);
    const relSigs = schema.relations.map((r) => `${r.name} ${(r.typeSignature ?? []).join(' ')}`);
    expect(new Set(typeNames).size).toBe(typeNames.length);
    expect(new Set(relSigs).size).toBe(relSigs.length);
  });
});

describe('extractDomainSchema — empty / degenerate instances', () => {
  it('returns an empty-ish schema for a freshly created empty Alloy instance', () => {
    const schema = extractDomainSchema(createEmptyAlloyDataInstance());
    // The empty instance carries only built-in types (univ/Int/seq/Int), all
    // of which are excluded, so there are no user types and no relations.
    expect(schema.types).toEqual([]);
    expect(schema.relations).toEqual([]);
  });

  it('surfaces programmatically-added user atoms as a type', () => {
    const instance = createEmptyAlloyDataInstance();
    instance.addAtom({ id: 'p1', type: 'Person', label: 'Alice' });
    instance.addAtom({ id: 'p2', type: 'Person', label: 'Bob' });
    const schema = extractDomainSchema(instance);
    const person = schema.types.find((t) => t.name === 'Person');
    expect(person).toBeDefined();
    // The Alloy instance uses the atom id as the display label (id === label in
    // Alloy), so the schema surfaces the ids.
    expect(person!.atoms).toContain('p1');
    expect(person!.atoms).toContain('p2');
  });

  it('returns an empty schema for null / undefined without throwing', () => {
    expect(extractDomainSchema(null)).toEqual({ types: [], relations: [] });
    expect(extractDomainSchema(undefined)).toEqual({ types: [], relations: [] });
  });

  it('never throws on a hostile instance whose getters throw', () => {
    const hostile = {
      getTypes(): readonly IType[] {
        throw new Error('boom');
      },
      getRelations(): readonly IRelation[] {
        throw new Error('boom');
      },
      getAtoms(): readonly [] {
        return [];
      },
    } as unknown as IInputDataInstance;
    expect(() => extractDomainSchema(hostile)).not.toThrow();
    expect(extractDomainSchema(hostile)).toEqual({ types: [], relations: [] });
  });

  it('skips a single malformed type but keeps the well-formed ones', () => {
    const partial = {
      getTypes(): readonly IType[] {
        return [
          // malformed: no id
          { types: [], atoms: [], isBuiltin: false } as unknown as IType,
          {
            id: 'Node',
            types: ['Node', 'univ'],
            atoms: [{ id: 'n0', type: 'Node', label: 'n0' }],
            isBuiltin: false,
          },
        ];
      },
      getRelations(): readonly IRelation[] {
        return [];
      },
      getAtoms(): readonly [] {
        return [];
      },
    } as unknown as IInputDataInstance;
    const schema = extractDomainSchema(partial);
    expect(schema.types.map((t) => t.name)).toEqual(['Node']);
  });
});
