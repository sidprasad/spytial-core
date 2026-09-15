/**
 * Fidelity oracles — Tier A (self-contained, no Pyret runtime).
 *
 * These run entirely inside spytial-core because:
 *   - `relationalize` is the existing PyretDataInstance relationalizer,
 *   - `reifyToValue` emits a synthetic value the relationalizer can re-consume,
 *   - `canon` compares the two data instances up to atom-id renaming.
 *
 * So `canon(rel(v)) == canon(rel(reify(rel(v))))` is computable end-to-end with
 * no language runtime. That is the measurable answer to "how faithful is the
 * round trip?".
 *
 * Tier B oracles (R-eq via equal-always, R-inspect via torepr) require a live
 * Pyret runtime and belong in an IDE-side harness — they are NOT here.
 */

import {
  PyretDataInstance,
  PyretObject,
  PyretInstanceOptions,
} from '../../src/data-instance/pyret/pyret-data-instance';
import { reifyToValue, ReifiedValue } from '../../src/data-instance/pyret/reify';
import { canon } from '../../src/data-instance/pyret/canon';

/** Anything we can relationalize: a Pyret object graph, an array, or a primitive. */
export type Reifiable = PyretObject | ReifiedValue;

/** Use the working constructor directly, including primitive and array roots. */
export function relationalize(v: Reifiable, options: PyretInstanceOptions = {}): PyretDataInstance {
  return new PyretDataInstance(v as PyretObject | unknown[] | number | string | boolean | null, options);
}

export interface RoundTripResult {
  pass: boolean;
  canonA: string;
  canonB: string;
}

/**
 * Fixed-Point oracle: does `rel -> reify -> rel` reach a fixed point?
 *
 * Catches reify drift (dropped fields, mangled sharing, cycle crashes) without
 * any external notion of "truth". It is the only oracle that survives cycles.
 *
 * Note: it is a fixed point *of rel*, so information `rel` never captured is
 * invisible to it. rel-injectivity (below) covers known collapses.
 */
export function fixedPoint(
  v: Reifiable,
  options: PyretInstanceOptions = {},
): RoundTripResult {
  // Reset the static field-order cache so each case is self-contained.
  PyretDataInstance.clearGlobalConstructorCache();

  const di1 = relationalize(v, options); // populates the cache from v's field order
  const reified = reifyToValue(di1); // reads the cache
  const di2 = relationalize(reified, options); // repopulates with the same order

  const canonA = canon(di1);
  const canonB = canon(di2);
  return { pass: canonA === canonB, canonA, canonB };
}

/**
 * rel-injectivity oracle: do two genuinely distinct values relationalize to
 * distinct (canonicalized) data instances?
 *
 * The only oracle that catches *collapses* — distinct values that `rel` maps to
 * the same graph (type/value confusions, multiplicity loss, etc.). No reify in
 * the loop, so it tests `rel` head-on.
 *
 * @returns true if the two values are distinguished (the desirable outcome).
 */
export function relInjective(
  a: Reifiable,
  b: Reifiable,
  options: PyretInstanceOptions = {},
): boolean {
  PyretDataInstance.clearGlobalConstructorCache();
  const ca = canon(relationalize(a, options));
  PyretDataInstance.clearGlobalConstructorCache();
  const cb = canon(relationalize(b, options));
  return ca !== cb;
}
