import type { IDataInstance, IRelation, ITuple } from './interfaces';

/** Tuple identity is its ordered atom IDs, not its inferred type signature. */
export function tupleKey(tuple: ITuple): string {
  return JSON.stringify(tuple.atoms);
}

/** Set union, without mutating the records supplied by a host. */
export function uniqueTuples(tuples: readonly ITuple[]): ITuple[] {
  const seen = new Set<string>();
  return tuples.filter(tuple => {
    const key = tupleKey(tuple);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(tuple => ({ ...tuple, atoms: [...tuple.atoms], types: [...tuple.types] }));
}

/** Summarize column types positionally; mixed arities have no shared signature. */
export function relationSignature(tuples: readonly ITuple[], empty: string[] = []): string[] {
  if (!tuples.length) return [...empty];
  const arity = tuples[0].atoms.length;
  if (tuples.some(t => t.atoms.length !== arity)) return [];
  return Array.from({ length: arity }, (_, i) => {
    const types = new Set(tuples.map(t => t.types[i] ?? 'univ'));
    return types.size === 1 ? [...types][0] : 'univ';
  });
}

/**
 * Query projection only: all records named foo denote the set union foo.
 * Never use this projection as the stored datum or as input to a reifier.
 */
export function relationsByName(relations: readonly IRelation[]): IRelation[] {
  const groups = new Map<string, IRelation[]>();
  for (const relation of relations) {
    const group = groups.get(relation.name) ?? [];
    group.push(relation);
    groups.set(relation.name, group);
  }
  return [...groups].map(([name, records]) => {
    const allTuples = records.flatMap(r => r.tuples);
    const tuples = uniqueTuples(allTuples);
    return { id: name, name, tuples, types: relationSignature(allTuples, records[0].types) };
  });
}

/** Read-only evaluator boundary: keep the original data instance untouched. */
export function nameBasedView(instance: IDataInstance): IDataInstance {
  return {
    getAtoms: () => instance.getAtoms(),
    getTypes: () => instance.getTypes(),
    getAtomType: id => instance.getAtomType(id),
    getRelations: () => relationsByName(instance.getRelations()),
    generateGraph: (a, b) => instance.generateGraph(a, b),
  };
}

/** One ID must never silently acquire another relation's name. */
export function assertSameRelationName(existing: IRelation, incoming: IRelation): void {
  if (existing.name !== incoming.name) {
    throw new Error(`Conflicting names for relation ID ${JSON.stringify(existing.id)}: `
      + `${JSON.stringify(existing.name)} and ${JSON.stringify(incoming.name)}`);
  }
}
