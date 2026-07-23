import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SQLEvaluator } from '../src/evaluators/data/sql-evaluator';

// Property-based coverage for DataInstanceNormalizer's lenient-JSON handling.
//
// Three separate correctness bugs (Codex's split-relation union, the
// independent review's mergeRelations dedup-collapse, and the empty-relation
// signature wipe) were all violations of ONE invariant: a relation's type
// signature must stay arity-consistent, because SQLEvaluator reads
// `relation.types.length` as the relation's arity. These properties encode that
// invariant over adversarial input the unit tests can only sample by hand.

const TYPES = ['Person', 'Car', 'Bike', 'Node'] as const;
// Deliberately avoid SQL/alasql reserved words (e.g. 'edge') so the SQL
// integration property exercises the normalizer contract, not SQLEvaluator's
// separate reserved-word sanitization.
const REL_NAMES = ['friend', 'owns', 'knows'] as const;

// A realistic "lenient" instance: atoms drawn from a real pool; a fixed arity
// per relation name; tuples in mixed shapes (bare array | {atoms} |
// {atoms,types}); relation `types`/`id` sometimes present. Names come from a
// small pool so same-name records collide and exercise mergeRelations — the
// path where the dedup-collapse bug lived.
const arbLenientInstance: fc.Arbitrary<IJsonDataInstance> = fc
  .array(fc.constantFrom(...TYPES), { minLength: 1, maxLength: 8 })
  .chain((atomTypes) => {
    const atoms = atomTypes.map((type, i) => ({ id: `a${i}`, type, label: `A${i}` }));
    const ids = atoms.map((a) => a.id);
    const typeOf = (id: string) => atoms.find((a) => a.id === id)?.type ?? 'univ';

    const arityByName = fc.record(
      Object.fromEntries(REL_NAMES.map((n) => [n, fc.integer({ min: 1, max: 3 })])),
    ) as fc.Arbitrary<Record<string, number>>;

    return arityByName.chain((arity) => {
      const arbRecord = fc.constantFrom(...REL_NAMES).chain((name) => {
        const k = arity[name];
        const arbTuple = fc
          .array(fc.constantFrom(...ids), { minLength: k, maxLength: k })
          .chain((tupleAtoms) =>
            fc.oneof(
              fc.constant(tupleAtoms as unknown), // bare array shorthand
              fc.constant({ atoms: tupleAtoms }), // object, types inferred
              fc.constant({ atoms: tupleAtoms, types: tupleAtoms.map(typeOf) }), // full form
            ),
          );
        return fc.record({
          name: fc.constant(name),
          arity: fc.constant(k),
          tuples: fc.array(arbTuple, { minLength: 0, maxLength: 4 }),
          withId: fc.boolean(),
          // 'homogeneous' = a valid-length all-same-type signature: the exact
          // trigger for mergeRelations' type-dedup collapse.
          typesMode: fc.constantFrom('none', 'homogeneous'),
        });
      });

      return fc.array(arbRecord, { minLength: 1, maxLength: 6 }).map((records) => {
        const relations = records.map((r) => {
          const rel: Record<string, unknown> = { name: r.name, tuples: r.tuples };
          if (r.withId) rel.id = r.name;
          if (r.typesMode === 'homogeneous') rel.types = Array.from({ length: r.arity }, () => TYPES[0]);
          return rel;
        });
        return { atoms, relations } as unknown as IJsonDataInstance;
      });
    });
  });

describe('DataInstanceNormalizer — property-based invariants', () => {
  it('keeps every non-empty relation arity-consistent (types.length === tuple arity)', () => {
    fc.assert(
      fc.property(arbLenientInstance, (data) => {
        const rels = new JSONDataInstance(data).getRelations();
        for (const r of rels) {
          // Tuple completeness: each tuple's own types match its own atoms.
          for (const t of r.tuples) expect(t.types.length).toBe(t.atoms.length);
          if (r.tuples.length === 0) continue;
          const arity = r.tuples[0].atoms.length;
          // The invariant SQLEvaluator.createRelationTable depends on.
          expect(r.types.length).toBe(arity);
          for (const t of r.tuples) expect(t.atoms.length).toBe(arity);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('derives the per-position unique-or-univ signature when none is provided', () => {
    // Strip provided signatures so derivation is authoritative and can be
    // checked against an independent oracle.
    const arbNoTypes = arbLenientInstance.map((d) => ({
      atoms: (d as any).atoms,
      relations: ((d as any).relations as any[]).map(({ types, ...rest }) => rest),
    })) as fc.Arbitrary<IJsonDataInstance>;

    fc.assert(
      fc.property(arbNoTypes, (data) => {
        const rels = new JSONDataInstance(data).getRelations();
        for (const r of rels) {
          if (r.tuples.length === 0) continue;
          const arity = r.tuples[0].atoms.length;
          const expected = Array.from({ length: arity }, (_, i) => {
            const seen = new Set(r.tuples.map((t) => t.types[i]));
            return seen.size === 1 ? [...seen][0] : 'univ';
          });
          expect(r.types).toEqual(expected);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('feeds SQLEvaluator without arity errors', () => {
    fc.assert(
      fc.property(arbLenientInstance, (data) => {
        const instance = new JSONDataInstance(data);
        const ev = new SQLEvaluator();
        expect(() => ev.initialize({ sourceData: instance })).not.toThrow();
      }),
      { numRuns: 40 },
    );
  });

  it('never throws on messy input (dangling refs, wrong-length types, mixed shapes/arity)', () => {
    const arbId = fc.string({ minLength: 1, maxLength: 3 });
    const arbMessyTuple = fc.oneof(
      fc.array(arbId, { minLength: 0, maxLength: 4 }), // bare array, arbitrary length
      fc.record({ atoms: fc.array(arbId, { minLength: 0, maxLength: 4 }) }), // maybe-dangling refs
      fc.record({
        atoms: fc.array(arbId, { minLength: 0, maxLength: 4 }),
        types: fc.array(fc.constantFrom(...TYPES), { minLength: 0, maxLength: 5 }), // possibly mismatched length
      }),
    );
    const arbMessy = fc.record({
      atoms: fc.array(fc.record({ id: arbId, type: fc.constantFrom(...TYPES) }), { minLength: 0, maxLength: 5 }),
      relations: fc.array(
        fc.record({
          name: fc.constantFrom(...REL_NAMES, 'x', 'y'),
          tuples: fc.array(arbMessyTuple, { minLength: 0, maxLength: 4 }),
        }),
        { minLength: 0, maxLength: 5 },
      ),
    });

    fc.assert(
      fc.property(arbMessy, (data) => {
        expect(() => new JSONDataInstance(data as any, { validateReferences: false })).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});
