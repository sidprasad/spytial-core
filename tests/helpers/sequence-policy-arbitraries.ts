/**
 * Fast-check arbitraries for sequence-policy property-based tests.
 *
 * Generators for the inputs the metric and policy-apply tests need:
 *
 *   - synthetic LayoutState pairs (positions arrays for the metrics)
 *   - synthetic EdgeKey arrays (for relativeConsistency)
 *   - JSONDataInstance pairs with controllable overlap (for the
 *     policy-apply properties — change detection, jitter, etc.)
 *
 * Kept small and orthogonal to `tests/helpers/constraint-arbitraries.ts`,
 * which generates `LayoutNode` / `LayoutConstraint` for the constraint
 * validator's own PBT — different model, different generators.
 */

import * as fc from 'fast-check';
import type { IJsonDataInstance } from '../../src/data-instance/json-data-instance';
import type { LayoutState } from '../../src/translators/webcola/webcolatranslator';
import type { EdgeKey } from '../../src/evaluation';

// ─── Atom ids ─────────────────────────────────────────────────────────────

/**
 * Short, unique-friendly atom ids (`N0`, `N1`, …). Numerically suffixed
 * rather than truly random so debug output is readable.
 */
export const arbAtomIds = (n: number): fc.Arbitrary<string[]> =>
  fc.constant(Array.from({ length: n }, (_, i) => `N${i}`));

// ─── LayoutState (positions) ──────────────────────────────────────────────

/**
 * Positions are sampled in a fixed [0, 800] × [0, 600] rectangle —
 * matches the default figure dimensions of `runHeadlessLayout`. The
 * metric tests don't run a solver, so the bounds are arbitrary; they
 * just need to be finite and reasonable.
 */
export function arbLayoutState(ids: string[]): fc.Arbitrary<LayoutState> {
  if (ids.length === 0) {
    return fc.constant({ positions: [], transform: { k: 1, x: 0, y: 0 } });
  }
  return fc.tuple(
    ...ids.map(id =>
      fc.record({
        id: fc.constant(id),
        x: fc.double({ min: 0, max: 800, noNaN: true, noDefaultInfinity: true }),
        y: fc.double({ min: 0, max: 600, noNaN: true, noDefaultInfinity: true }),
      })
    )
  ).map(positions => ({ positions, transform: { k: 1, x: 0, y: 0 } }));
}

/**
 * A pair of LayoutStates over the SAME id set. Ensures non-trivial
 * intersection — useful for non-empty positionalConsistency sums.
 */
export function arbLayoutStatePair(ids: string[]): fc.Arbitrary<{ prev: LayoutState; curr: LayoutState }> {
  return fc.tuple(arbLayoutState(ids), arbLayoutState(ids))
    .map(([prev, curr]) => ({ prev, curr }));
}

// ─── EdgeKey arrays ───────────────────────────────────────────────────────

/**
 * Random edges among the given ids. Edges are NOT guaranteed unique —
 * a sane policy/translator emits unique edges, but the metric should
 * be robust to duplicates, so generators don't enforce uniqueness.
 */
export function arbEdgeKeyArray(ids: string[], maxEdges = 6): fc.Arbitrary<EdgeKey[]> {
  if (ids.length < 2) return fc.constant([]);
  const idArb = fc.constantFrom(...ids);
  const edge = fc.record({
    source: idArb,
    target: idArb,
    rel: fc.constantFrom('next', 'edge', 'r1', 'r2'),
  });
  return fc.array(edge, { minLength: 0, maxLength: maxEdges });
}

// ─── JSONDataInstance ─────────────────────────────────────────────────────

interface InstanceShapeOptions {
  minAtoms: number;
  maxAtoms: number;
  minTuples: number;
  maxTuples: number;
}

/**
 * Build a JSONDataInstance dict given an explicit atom-id set and a
 * tuple list. Wrapped as a helper so the pair generator can produce
 * partly-overlapping instances.
 */
export function buildJsonDataInstance(
  atomIds: string[],
  tuples: Array<[string, string]>,
  relName: string = 'next'
): IJsonDataInstance {
  return {
    atoms: atomIds.map(id => ({ id, type: 'Node', label: id })),
    relations: [
      {
        id: relName,
        name: relName,
        types: ['Node', 'Node'],
        tuples: tuples.map(([s, t]) => ({ atoms: [s, t], types: ['Node', 'Node'] })),
      },
    ],
  };
}

/**
 * Generate a JSONDataInstance with a random number of atoms and
 * random `next` tuples drawn from those atoms. Single relation only —
 * the policies don't differentiate by relation name, so multiple
 * relations would just inflate the input space without exercising
 * new behaviour.
 */
export function arbJsonDataInstance(opts: InstanceShapeOptions): fc.Arbitrary<IJsonDataInstance> {
  return fc.integer({ min: opts.minAtoms, max: opts.maxAtoms }).chain(n =>
    arbAtomIds(n).chain(ids => {
      if (ids.length < 1) {
        return fc.constant(buildJsonDataInstance([], []));
      }
      const idArb = fc.constantFrom(...ids);
      const tuple = fc.tuple(idArb, idArb);
      return fc.array(tuple, { minLength: opts.minTuples, maxLength: opts.maxTuples })
        .map(tuples => buildJsonDataInstance(ids, tuples));
    })
  );
}

/**
 * Generate a `(prev, curr)` instance pair with controllable overlap.
 *
 *   `addProb` — probability each prev atom survives into curr.
 *   `addNewProb` — probability of an extra new atom in curr.
 *   `relChangeProb` — probability of a different tuple set in curr.
 *
 * The pair is the workhorse for changeEmphasis / stability properties.
 */
export function arbInstancePair(opts: {
  minAtoms?: number;
  maxAtoms?: number;
  minTuples?: number;
  maxTuples?: number;
} = {}): fc.Arbitrary<{ prev: IJsonDataInstance; curr: IJsonDataInstance; sharedIds: string[] }> {
  const minAtoms = opts.minAtoms ?? 2;
  const maxAtoms = opts.maxAtoms ?? 5;
  const minTuples = opts.minTuples ?? 0;
  const maxTuples = opts.maxTuples ?? 4;

  return fc.integer({ min: minAtoms, max: maxAtoms }).chain(prevN =>
    fc.integer({ min: 0, max: prevN }).chain(removedCount =>
      fc.integer({ min: 0, max: 2 }).chain(addedCount => {
        const prevIds = Array.from({ length: prevN }, (_, i) => `N${i}`);
        const survivingIds = prevIds.slice(0, prevN - removedCount);
        const newIds = Array.from({ length: addedCount }, (_, i) => `M${i}`);
        const currIds = [...survivingIds, ...newIds];
        const sharedIds = survivingIds;

        const prevTuplesArb =
          prevIds.length < 1
            ? fc.constant([] as Array<[string, string]>)
            : fc.array(
                fc.tuple(fc.constantFrom(...prevIds), fc.constantFrom(...prevIds)),
                { minLength: minTuples, maxLength: maxTuples }
              );

        const currTuplesArb =
          currIds.length < 1
            ? fc.constant([] as Array<[string, string]>)
            : fc.array(
                fc.tuple(fc.constantFrom(...currIds), fc.constantFrom(...currIds)),
                { minLength: minTuples, maxLength: maxTuples }
              );

        return fc.tuple(prevTuplesArb, currTuplesArb).map(([pt, ct]) => ({
          prev: buildJsonDataInstance(prevIds, pt),
          curr: buildJsonDataInstance(currIds, ct),
          sharedIds,
        }));
      })
    )
  );
}
