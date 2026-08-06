import { describe, it, expect, beforeEach } from 'vitest';
import {
  PyretDataInstance,
  PyretObject,
} from '../../src/data-instance/pyret/pyret-data-instance';
import { reifyToValue } from '../../src/data-instance/pyret/reify';
import { replit } from '../../src/data-instance/pyret/replit';

/**
 * Regression tests for issue #422 — the old `reifyAtom` tracked visited atoms
 * with a set it `delete`d on the way out, so the set only ever held the current
 * path. Shared atoms were re-reified on every visit, and a fully cyclic
 * instance never reached the cycle check at all (root detection found no
 * in-degree-0 atom and bailed with "# No root atoms found").
 *
 * `reify()` now goes through the memoized reifier (reify.ts -> replit.ts): the
 * value graph is built once, keyed by atom id, so sharing is real JS sharing
 * and a cycle is a real back-reference.
 */

/** Build a single-brand data-variant object, as the Pyret runtime hands them over. */
function variant(name: string, brandNum: number, dict: Record<string, unknown>): PyretObject {
  return { dict, brands: { [`$brand${name}${brandNum}`]: true } };
}

describe('reify() cycle handling (issue #422)', () => {
  beforeEach(() => {
    // Field order comes from the static constructor cache; clear it so these
    // tests do not depend on what other instances registered earlier.
    PyretDataInstance.clearGlobalConstructorCache();
  });

  it('marks the back-edge of a self-loop instead of recursing forever', () => {
    const n: PyretObject = variant('RBNode', 1, { value: 4 });
    (n.dict as Record<string, unknown>).next = n;
    const holder = variant('Holder', 2, { start: n });

    const di = new PyretDataInstance(holder);

    expect(di.reify()).toBe('Holder(RBNode(4, <cyclic>))');
  });

  it('marks the back-edge of a multi-atom cycle', () => {
    const a: PyretObject = variant('N', 3, { name: 'a' });
    const b: PyretObject = variant('N', 3, { name: 'b' });
    (a.dict as Record<string, unknown>).peer = b;
    (b.dict as Record<string, unknown>).peer = a;
    const holder = variant('Holder', 2, { start: a });

    const di = new PyretDataInstance(holder);

    expect(di.reify()).toBe('Holder(N("a", N("b", <cyclic>)))');
  });

  it('reifies a fully cyclic instance instead of reporting no roots', () => {
    // Every atom is pointed at, so there is no in-degree-0 atom to start from.
    const a: PyretObject = variant('N', 3, { name: 'a' });
    const b: PyretObject = variant('N', 3, { name: 'b' });
    (a.dict as Record<string, unknown>).peer = b;
    (b.dict as Record<string, unknown>).peer = a;

    const di = new PyretDataInstance(a);
    const out = di.reify();

    expect(out).not.toContain('No root atoms found');
    // Entry point is the first atom that has fields, not a leaf string.
    expect(out).toBe('N("a", N("b", <cyclic>))');
  });

  it('reifies a hand-built self-loop tuple (no original object to fall back on)', () => {
    // The repro from the issue: a self-referencing tuple on an instance built
    // through the editing API, so there is no parsed object to read field order
    // from.
    const di = new PyretDataInstance();
    di.addAtom({ id: 'n4', type: 'RBNode', label: 'n4' });
    di.addRelationTuple('next', { atoms: ['n4', 'n4'], types: ['RBNode', 'RBNode'] });

    const out = di.reify();

    expect(out).toBe('RBNode(<cyclic>)');
  });

  it('reconstructs a shared atom once and keeps it shared', () => {
    const shared = variant('Leaf', 4, { value: 7 });
    const root = variant('Pair', 5, { left: shared, right: shared });

    const di = new PyretDataInstance(root);
    const value = reifyToValue(di) as PyretObject;
    const dict = value.dict as Record<string, unknown>;

    // The memo is keyed by atom id, so both slots hold the SAME object —
    // the sharing in the original value survives the round trip.
    expect(dict.left).toBe(dict.right);

    // The flat string form cannot express sharing, so it re-prints (torepr).
    expect(di.reify()).toBe('Pair(Leaf(7), Leaf(7))');
  });

  it('keeps a shared subtree consistent no matter which path reaches it first', () => {
    // Old behaviour: `visited` was path-scoped, so a subtree reached down two
    // different paths was re-walked each time, and a back-edge crossing the two
    // paths could land the "cycle" marker in the wrong place.
    const shared = variant('Leaf', 4, { value: 1 });
    const left = variant('Wrap', 6, { inner: shared });
    const right = variant('Wrap', 6, { inner: shared });
    const root = variant('Pair', 5, { left, right });

    const di = new PyretDataInstance(root);

    expect(di.reify()).toBe('Pair(Wrap(Leaf(1)), Wrap(Leaf(1)))');
  });

  it('reify() is the string form of the memoized reifier', () => {
    const tree = variant('Black', 7, {
      value: 5,
      left: variant('Leaf', 4, { value: 1 }),
      right: variant('Leaf', 4, { value: 6 }),
    });

    const di = new PyretDataInstance(tree);

    expect(di.reify()).toBe(replit(di));
    expect(di.reify()).toBe('Black(5, Leaf(1), Leaf(6))');
  });

  it('reifies an empty instance to nothing', () => {
    expect(new PyretDataInstance().reify()).toBe('nothing');
  });
});
