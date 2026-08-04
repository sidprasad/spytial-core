import { IRelation, ITuple } from './interfaces';

/**
 * Looks up an atom's DECLARED type (`IAtom.type`) by id, or undefined if this
 * instance has no such atom. Each data instance passes its own index so
 * settling stays O(arity) rather than O(atoms) per write.
 */
export type AtomTypeLookup = (atomId: string) => string | undefined;

/** What a write should store, once the tuple has been settled against its relation. */
export interface SettledTuple {
  /** The tuple to store: same atoms, column types settled against the relation. */
  tuple: ITuple;
  /** The signature the relation should carry after the write. Never longer than the tuple's arity. */
  relationTypes: string[];
}

/**
 * Settle a tuple's column types against the relation it is being written into.
 *
 * `IRelation.types` is POSITIONAL — one entry per column, read back as
 * `relation.types[index]` (projections) and as the relation's arity
 * (`relation.types.length`, in the schema descriptor and the SQL evaluator).
 * It is NOT a set of the types a relation touches, so a write must never
 * append to it: sending per-atom types would otherwise widen the column list,
 * turning a binary `Person -> City` into `[Person, City, Student]` the first
 * time a `Student` endpoint shows up.
 *
 * The rules:
 * - The relation already declares one type per column: that signature wins.
 *   Its types are copied into the tuple, so the write leaves the relation
 *   untouched and `ITuple.types` means the same thing everywhere — the
 *   relation's declared column types, not the endpoints' own types.
 * - No usable signature yet (new relation, or the `[]` placeholder lenient
 *   JSON input leaves): seed one from each atom's DECLARED type (`IAtom.type`)
 *   — not from a most specific subtype, which would bake a subtype into the
 *   signature, and not from whatever the caller passed, which is routinely a
 *   placeholder such as `'unknown'`.
 * - The relation declares a different NUMBER of columns than the tuple has
 *   atoms: the relation is already inconsistent (mixed arity). Warn and leave
 *   its signature alone rather than widen it, which would hide the problem.
 *
 * @param tuple - The tuple being written (`types` may be missing or a placeholder)
 * @param relation - The relation it is going into, or undefined if it is new
 * @param atomType - Declared-type lookup over the instance's atoms
 */
export function settleTupleTypes(
  tuple: ITuple,
  relation: IRelation | undefined,
  atomType: AtomTypeLookup
): SettledTuple {
  const arity = tuple.atoms.length;
  const declared = Array.isArray(relation?.types) ? relation.types : [];

  if (declared.length === arity) {
    return { tuple: { ...tuple, types: [...declared] }, relationTypes: [...declared] };
  }

  // Callers may omit `types` entirely, so fall back through what they sent
  // before giving up on a column.
  const supplied = Array.isArray(tuple.types) ? tuple.types : [];
  const seeded = tuple.atoms.map((id, i) => atomType(id) ?? supplied[i] ?? 'untyped');

  if (declared.length > 0) {
    console.warn(
      `settleTupleTypes: relation "${relation!.id}" declares ${declared.length} column type(s) ` +
      `(${declared.join(', ')}) but this tuple has ${arity} atom(s) ` +
      `(${tuple.atoms.join(', ')}); leaving the declared signature alone.`
    );
    return { tuple: { ...tuple, types: seeded }, relationTypes: [...declared] };
  }

  return { tuple: { ...tuple, types: seeded }, relationTypes: seeded };
}
