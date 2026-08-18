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
 * `relation.types[index]` by the schema descriptor. It is NOT a set of the
 * types a relation touches, so a write must never append to it: sending
 * per-atom types would otherwise widen the column list, turning a binary
 * `Person -> City` into `[Person, City, Student]` the first time a `Student`
 * endpoint shows up.
 *
 * It is a SUMMARY, and only exists when every tuple has the same arity. A
 * relation is allowed to be ragged — one name holding tuples of different
 * arity — and a ragged relation carries `types: []`.
 *
 * The rules, in order:
 * - The relation ALREADY HOLDS tuples and its signature does not fit this one:
 *   the relation is ragged. Clear the signature to `[]` — no positional list
 *   describes it — and give the tuple its own seeded one.
 *
 *   Note what this asks: the tuples the relation holds, not the signature
 *   alone. `[]` means two different things — "brand new, nothing settled yet"
 *   and "ragged, nothing CAN be settled" — and only the tuple count tells them
 *   apart. Reading `[]` as "new" handed a ragged relation a signature back the
 *   moment a later write happened to match the width of the earlier tuples:
 *   writing widths 2, 3, 2 left the relation holding all three and claiming to
 *   be two columns wide.
 * - The relation declares one type per column and it fits: that signature
 *   wins. Its types are copied into the tuple, so the write leaves the
 *   relation untouched and `ITuple.types` means the same thing everywhere —
 *   the relation's declared column types, not the endpoints' own types.
 * - Anything else — a new relation, the `[]` placeholder lenient JSON input
 *   leaves, or a declared width no tuple has ever met: seed a signature from
 *   each atom's DECLARED type (`IAtom.type`) — not from a most specific
 *   subtype, which would bake a subtype into the signature, and not from
 *   whatever the caller passed, which is routinely a placeholder such as
 *   `'unknown'`.
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
  // Every caller settles BEFORE it stores, so these are the tuples already
  // there, not counting the one being written.
  const held = relation?.tuples?.length ?? 0;

  // Ragged: the relation holds tuples, and the signature it carries does not
  // fit the one arriving. Both ways in land here — a signature of the wrong
  // width (uniform relation, wider tuple) and no signature at all (already
  // ragged, so nothing to fit). Legal either way, but no positional list
  // describes the relation any more, so it carries none. This is the same
  // answer the bulk JSON path reaches in
  // DataInstanceNormalizer.inferRelationSignatures.
  //
  // The check is O(1) on purpose: settling stays cheap per write, so bulk
  // insertion does not go quadratic. The cost is that a MALFORMED signature on
  // an otherwise uniform relation (`types: ['A']` over two-atom tuples) reads
  // as ragged and clears. `[]` is honest there — that signature was never
  // usable — where the bulk path, which sees every tuple at once, can rebuild
  // it.
  const ragged = held > 0 && declared.length !== arity;

  if (!ragged && declared.length === arity) {
    return { tuple: { ...tuple, types: [...declared] }, relationTypes: [...declared] };
  }

  // Callers may omit `types` entirely, so fall back through what they sent
  // before giving up on a column.
  const supplied = Array.isArray(tuple.types) ? tuple.types : [];
  const seeded = tuple.atoms.map((id, i) => atomType(id) ?? supplied[i] ?? 'untyped');

  return { tuple: { ...tuple, types: seeded }, relationTypes: ragged ? [] : seeded };
}
