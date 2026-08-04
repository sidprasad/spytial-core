import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import type { IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { AlloyDataInstance, createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { DotDataInstance } from '../src/data-instance/dot/dot-data-instance';
import { generateSQLSchema } from '../src/data-instance/schema-descriptor';
import { settleTupleTypes } from '../src/data-instance/tuple-types';
import type { ITuple } from '../src/data-instance/interfaces';

/**
 * `IRelation.types` is POSITIONAL: one entry per column, read back as
 * `relation.types[index]` (projections) and as the relation's arity
 * (`relation.types.length`, in the schema descriptor and the SQL evaluator).
 *
 * A write must therefore never append to it. These tests pin that invariant on
 * every implementation that stores a signature, against a Person/Student/City
 * hierarchy: writing a `Student` endpoint into a relation declared
 * `Person -> City` must not turn its types into `[Person, City, Student]`.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Person/Student/City, with `lives_in` declared as `Person -> City`. */
function personStudentCity(): IJsonDataInstance {
  return {
    atoms: [
      { id: 'P1', type: 'Person', label: 'Ada' },
      { id: 'S1', type: 'Student', label: 'Bo' },
      { id: 'C1', type: 'City', label: 'Providence' },
    ],
    types: [
      { id: 'Person', types: ['Person'], atoms: [], isBuiltin: false },
      { id: 'Student', types: ['Student', 'Person'], atoms: [], isBuiltin: false },
      { id: 'City', types: ['City'], atoms: [], isBuiltin: false },
    ],
    relations: [
      {
        id: 'lives_in',
        name: 'lives_in',
        types: ['Person', 'City'],
        tuples: [{ atoms: ['P1', 'C1'], types: ['Person', 'City'] }],
      },
    ],
  };
}

const relationNamed = (instance: { getRelations(): readonly { name: string }[] }, name: string) =>
  instance.getRelations().find(r => r.name === name)!;

// ═══════════════════════════════════════════════════════════════════════════════
// JSONDataInstance — the implementation that used to widen
// ═══════════════════════════════════════════════════════════════════════════════

describe('JSONDataInstance.addRelationTuple — positional column types', () => {
  it('keeps the declared signature when a subtype endpoint is written', () => {
    const instance = new JSONDataInstance(personStudentCity());

    // What the graph sends: the endpoints' own types, not the declared columns.
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    const lives_in = relationNamed(instance, 'lives_in');
    expect(lives_in.types).toEqual(['Person', 'City']);
    // The stored tuple carries the relation's declared column types, not S1's.
    expect(lives_in.tuples[1].types).toEqual(['Person', 'City']);
  });

  it('seeds a new relation from each atom\'s declared type', () => {
    const instance = new JSONDataInstance(personStudentCity());

    instance.addRelationTuple('studies_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    // S1's declared type really is Student — nothing to settle against yet.
    expect(relationNamed(instance, 'studies_in').types).toEqual(['Student', 'City']);
  });

  it('ignores placeholder types from the caller (InstanceBuilder sends "unknown")', () => {
    const instance = new JSONDataInstance(personStudentCity());

    instance.addRelationTuple('visits', { atoms: ['P1', 'C1'], types: ['unknown', 'unknown'] });
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['unknown', 'unknown'] });

    expect(relationNamed(instance, 'visits').types).toEqual(['Person', 'City']);
    expect(relationNamed(instance, 'lives_in').types).toEqual(['Person', 'City']);
  });

  it('does not append duplicate types within a single tuple', () => {
    const instance = new JSONDataInstance({
      atoms: [
        { id: 'P1', type: 'Person', label: 'Ada' },
        { id: 'S1', type: 'Student', label: 'Bo' },
      ],
      relations: [
        { id: 'knows', name: 'knows', types: ['Person', 'Person'], tuples: [] },
      ],
    });

    // Both columns carry the same unseen type — each used to be pushed, taking a
    // binary relation to arity 4.
    instance.addRelationTuple('knows', { atoms: ['S1', 'S1'], types: ['Student', 'Student'] });

    expect(relationNamed(instance, 'knows').types).toEqual(['Person', 'Person']);
  });

  it('keeps the arity stable when the same relation is written with different types', () => {
    // The ExtensibleParsers list shape: `link` written first as Item -> link,
    // then as List -> link.
    const instance = new JSONDataInstance({
      atoms: [
        { id: 'i1', type: 'Item', label: '1' },
        { id: 'l1', type: 'link', label: 'link(1, empty)' },
        { id: 'list1', type: 'List', label: 'list' },
      ],
      relations: [],
    });

    instance.addRelationTuple('link', { atoms: ['i1', 'l1'], types: ['Item', 'link'] });
    instance.addRelationTuple('link', { atoms: ['list1', 'l1'], types: ['List', 'link'] });

    const link = relationNamed(instance, 'link');
    expect(link.types).toEqual(['Item', 'link']);
    expect(link.tuples).toHaveLength(2);
  });

  it('never grows the signature no matter how many tuples are written', () => {
    const instance = new JSONDataInstance(personStudentCity());

    for (let i = 0; i < 10; i++) {
      instance.addAtom({ id: `S${i + 2}`, type: 'Student', label: `Student ${i}` });
      instance.addRelationTuple('lives_in', {
        atoms: [`S${i + 2}`, 'C1'],
        types: ['Student', 'City'],
      });
    }

    expect(relationNamed(instance, 'lives_in').types).toHaveLength(2);
  });

  it('fills an empty signature rather than leaving it short', () => {
    // Lenient JSON input leaves `types: []` on a relation with no tuples.
    const instance = new JSONDataInstance({
      atoms: [
        { id: 'P1', type: 'Person', label: 'Ada' },
        { id: 'P2', type: 'Person', label: 'Bo' },
      ],
      relations: [{ id: 'knows', name: 'knows', types: [], tuples: [] }],
    });

    instance.addRelationTuple('knows', { atoms: ['P1', 'P2'], types: ['Person', 'Person'] });

    // One entry per column — a set-like merge would have collapsed this to ['Person'].
    expect(relationNamed(instance, 'knows').types).toEqual(['Person', 'Person']);
  });

  it('tolerates a tuple with no types at all', () => {
    const instance = new JSONDataInstance(personStudentCity());

    // PyretIdAllocationParser writes tuples as just { atoms }.
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'] } as unknown as ITuple);
    instance.addRelationTuple('born_in', { atoms: ['S1', 'C1'] } as unknown as ITuple);

    expect(relationNamed(instance, 'lives_in').types).toEqual(['Person', 'City']);
    expect(relationNamed(instance, 'born_in').types).toEqual(['Student', 'City']);
  });

  it('warns and leaves the signature alone on an arity mismatch', () => {
    const instance = new JSONDataInstance(personStudentCity());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    instance.addRelationTuple('lives_in', {
      atoms: ['P1', 'S1', 'C1'],
      types: ['Person', 'Student', 'City'],
    });

    expect(relationNamed(instance, 'lives_in').types).toEqual(['Person', 'City']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lives_in'));
    warn.mockRestore();
  });

  it('keeps the SQL schema binary after a subtype endpoint is written', () => {
    const instance = new JSONDataInstance(personStudentCity());
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    // generateSQLSchema emits one column per entry in relation.types.
    const schema = generateSQLSchema(instance);
    const columns = schema
      .split('CREATE TABLE lives_in (')[1]
      .split(');')[0]
      .split('\n')
      .filter(line => line.trim().length > 0);

    expect(columns).toHaveLength(2);
    expect(schema).not.toContain('arg2_Student');
  });

  it('emits the settled tuple on relationTupleAdded', () => {
    const instance = new JSONDataInstance(personStudentCity());
    const seen: ITuple[] = [];
    instance.addEventListener('relationTupleAdded', e => seen.push(e.data.tuple!));

    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    expect(seen[0].types).toEqual(['Person', 'City']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The other implementations
// ═══════════════════════════════════════════════════════════════════════════════

describe('AlloyDataInstance.addRelationTuple — positional column types', () => {
  it('keeps the declared field signature when a subtype endpoint is written', () => {
    const instance = createEmptyAlloyDataInstance();
    instance.addAtom({ id: 'P1', type: 'Person', label: 'Ada' });
    instance.addAtom({ id: 'S1', type: 'Student', label: 'Bo' });
    instance.addAtom({ id: 'C1', type: 'City', label: 'Providence' });

    instance.addRelationTuple('lives_in', { atoms: ['P1', 'C1'], types: ['Person', 'City'] });
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    const lives_in = relationNamed(instance, 'lives_in');
    expect(lives_in.types).toEqual(['Person', 'City']);
    expect(lives_in.tuples[1].types).toEqual(['Person', 'City']);
  });

  it('still reads builtin columns positionally in reify()', () => {
    // A spec declaring `age: Person -> Int`, with a Student atom to hang off it.
    const instance = new AlloyDataInstance({
      types: {
        univ: { _: 'type', id: 'univ', types: [], atoms: [], meta: { builtin: true } },
        Int: {
          _: 'type',
          id: 'Int',
          types: ['Int', 'univ'],
          atoms: [{ _: 'atom', id: '7', type: 'Int' }],
          meta: { builtin: true },
        },
        Person: { _: 'type', id: 'Person', types: ['Person', 'univ'], atoms: [] },
        Student: { _: 'type', id: 'Student', types: ['Student', 'Person', 'univ'], atoms: [] },
      },
      relations: {
        'Person<:age': {
          _: 'relation',
          id: 'Person<:age',
          name: 'age',
          types: ['Person', 'Int'],
          tuples: [],
        },
      },
      skolems: {},
    } as never);

    instance.addAtom({ id: 'S1', type: 'Student', label: 'Bo' });
    instance.addRelationTuple('age', { atoms: ['S1', '7'], types: ['Student', 'Int'] });

    expect(relationNamed(instance, 'age').types).toEqual(['Person', 'Int']);

    // reify() reads tuple.types[i] positionally to decide backticking: the Int
    // literal stays bare, the atom id gets a backtick.
    expect(instance.reify() as string).toContain('age = (`S1->7)');
  });
});

describe('PyretDataInstance.addRelationTuple — positional column types', () => {
  it('gives the relation one column type per tuple position', () => {
    const instance = new PyretDataInstance({ dict: {} } as never);
    instance.addAtom({ id: 'P1', type: 'Person', label: 'Ada' });
    instance.addAtom({ id: 'S1', type: 'Student', label: 'Bo' });
    instance.addAtom({ id: 'C1', type: 'City', label: 'Providence' });

    instance.addRelationTuple('lives_in', { atoms: ['P1', 'C1'], types: ['Person', 'City'] });
    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    const lives_in = relationNamed(instance, 'lives_in');
    expect(lives_in.types).toEqual(['Person', 'City']);
    for (const tuple of lives_in.tuples) {
      expect(tuple.types).toHaveLength(tuple.atoms.length);
      expect(tuple.types).toEqual(lives_in.types);
    }
  });
});

describe('DotDataInstance.addRelationTuple — positional column types', () => {
  it('recomputes a per-column signature from the endpoint atoms', () => {
    const instance = new DotDataInstance(
      'digraph { P1 [type="Person"]; S1 [type="Student"]; C1 [type="City"]; P1 -> C1 [label="lives_in"]; }'
    );

    instance.addRelationTuple('lives_in', { atoms: ['S1', 'C1'], types: ['Student', 'City'] });

    const lives_in = relationNamed(instance, 'lives_in');
    // One entry per column — the column itself holds the union of what it saw.
    expect(lives_in.types).toHaveLength(2);
    expect(lives_in.types[0].split('|').sort()).toEqual(['Person', 'Student']);
    expect(lives_in.types[1]).toBe('City');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// The shared helper, directly
// ═══════════════════════════════════════════════════════════════════════════════

describe('settleTupleTypes', () => {
  const atomType = (id: string) =>
    ({ P1: 'Person', S1: 'Student', C1: 'City' } as Record<string, string>)[id];

  const relation = { id: 'lives_in', name: 'lives_in', types: ['Person', 'City'], tuples: [] };

  it('copies the declared signature into the tuple', () => {
    const settled = settleTupleTypes(
      { atoms: ['S1', 'C1'], types: ['Student', 'City'] },
      relation,
      atomType
    );
    expect(settled.tuple.types).toEqual(['Person', 'City']);
    expect(settled.relationTypes).toEqual(['Person', 'City']);
  });

  it('does not hand back the relation\'s own array', () => {
    const settled = settleTupleTypes({ atoms: ['P1', 'C1'], types: [] }, relation, atomType);
    settled.relationTypes.push('leaked');
    settled.tuple.types.push('leaked');
    expect(relation.types).toEqual(['Person', 'City']);
  });

  it('seeds from atoms when there is no relation yet', () => {
    const settled = settleTupleTypes(
      { atoms: ['S1', 'C1'], types: ['unknown', 'unknown'] },
      undefined,
      atomType
    );
    expect(settled.tuple.types).toEqual(['Student', 'City']);
    expect(settled.relationTypes).toEqual(['Student', 'City']);
  });

  it('falls back to the supplied type, then "untyped", for an unknown atom', () => {
    const settled = settleTupleTypes(
      { atoms: ['ghost', 'other'], types: ['Ghost'] },
      undefined,
      atomType
    );
    expect(settled.tuple.types).toEqual(['Ghost', 'untyped']);
  });
});
