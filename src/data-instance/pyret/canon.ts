/**
 * Canonicalization of a data instance.
 *
 * Atom ids (`tno_3`, `num_7`, ...) are arbitrary gensyms, so two instances that
 * are equal *up to renaming* must be made byte-identical before comparison.
 * `canon` produces a stable string with:
 *   - atom ids renamed to integers via a deterministic traversal from the roots,
 *   - primitive atoms keyed by (type, label) — the label IS the data and is kept;
 *     object atoms keyed by type only — their labels are display gensyms and are
 *     dropped,
 *   - relations keyed by `rel.id` (the field name), tuples sorted lexicographically.
 *
 * Field ORDER is intentionally not part of canon: each field is a distinctly
 * named relation, so the field->value binding is already unambiguous. Order only
 * matters for positional string rendering (replit), not structural fidelity.
 *
 * This is the substrate for the self-contained (Tier A) fidelity oracles
 * (see tests/pyret/oracles.ts).
 */

import { IDataInstance } from '../interfaces';

const PRIMITIVE_TYPES = new Set(['Number', 'String', 'Boolean']);

interface OutEdge {
  rel: string;
  tuple: string[];
}

export function canon(di: IDataInstance): string {
  const atoms = di.getAtoms();
  const relations = di.getRelations();
  const atomsById = new Map(atoms.map((a) => [a.id, a] as const));

  const outBySrc = new Map<string, OutEdge[]>();
  const targetSet = new Set<string>();

  for (const rel of relations) {
    for (const tup of rel.tuples) {
      if (tup.atoms.length < 2) continue;
      const src = tup.atoms[0];
      for (let i = 1; i < tup.atoms.length; i++) targetSet.add(tup.atoms[i]);
      const arr = outBySrc.get(src) ?? [];
      arr.push({ rel: rel.id, tuple: tup.atoms.slice() });
      outBySrc.set(src, arr);
    }
  }

  const keyOf = (id: string): string => {
    const a = atomsById.get(id);
    if (!a) return `?`;
    return PRIMITIVE_TYPES.has(a.type) ? `${a.type}=${a.label}` : a.type;
  };

  // Canonical numbering: DFS from roots, children ordered by (relation, target keys).
  const roots = atoms.map((a) => a.id).filter((id) => !targetSet.has(id));
  const seeds = (roots.length ? roots : atoms.map((a) => a.id)).slice().sort((x, y) => {
    const k = keyOf(x).localeCompare(keyOf(y));
    return k !== 0 ? k : x.localeCompare(y);
  });

  const num = new Map<string, number>();
  let counter = 0;

  const visit = (start: string): void => {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (num.has(id)) continue;
      num.set(id, counter++);
      const outs = (outBySrc.get(id) ?? []).slice().sort((a, b) => {
        const k = a.rel.localeCompare(b.rel);
        if (k !== 0) return k;
        const ak = a.tuple.slice(1).map(keyOf).join('|');
        const bk = b.tuple.slice(1).map(keyOf).join('|');
        return ak.localeCompare(bk);
      });
      // push in reverse so the first edge is processed first (stack = LIFO)
      for (let e = outs.length - 1; e >= 0; e--) {
        const t = outs[e].tuple;
        for (let i = t.length - 1; i >= 1; i--) stack.push(t[i]);
      }
    }
  };

  for (const s of seeds) visit(s);
  // any atoms unreachable from the roots get numbered last, in id order
  atoms
    .map((a) => a.id)
    .sort()
    .forEach((id) => {
      if (!num.has(id)) num.set(id, counter++);
    });

  const canonAtoms = atoms
    .map((a) => ({
      id: num.get(a.id)!,
      type: a.type,
      label: PRIMITIVE_TYPES.has(a.type) ? a.label : undefined,
    }))
    .sort((x, y) => x.id - y.id);

  const canonRels = relations
    .map((rel) => {
      const tuples = rel.tuples
        .filter((t) => t.atoms.length >= 2)
        .map((t) => t.atoms.map((x) => num.get(x) ?? -1));
      tuples.sort((p, q) => {
        const n = Math.min(p.length, q.length);
        for (let i = 0; i < n; i++) if (p[i] !== q[i]) return p[i] - q[i];
        return p.length - q.length;
      });
      return { name: rel.id, tuples };
    })
    .filter((r) => r.tuples.length > 0)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        JSON.stringify(a.tuples).localeCompare(JSON.stringify(b.tuples)),
    );

  return JSON.stringify({ atoms: canonAtoms, relations: canonRels });
}
