/**
 * Fidelity test corpus (T0-T5).
 *
 * Values are synthetic Pyret runtime objects ({ dict, brands }) — the exact
 * shape the runtime hands to PyretDataInstance — so the whole corpus runs with
 * NO Pyret runtime. Data variants use `brands` (exercising the real brand->type
 * logic); sharing/cycles use shared/back-referencing JS objects.
 */

import {
  PyretObject,
  PyretInstanceOptions,
} from '../../src/data-instance/pyret/pyret-data-instance';
import { Reifiable } from './oracles';

export interface CorpusItem {
  name: string;
  category: string; // T0..T5
  value: Reifiable;
}

export interface DiscriminatorPair {
  name: string;
  category: string;
  a: Reifiable;
  b: Reifiable;
  /** expected outcome of rel-injectivity (true = the two are distinguished) */
  expectDistinct: boolean;
  /** relationalization options to use for this pair (defaults if omitted) */
  options?: PyretInstanceOptions;
  note?: string;
}

/** Build a single-brand data-variant object. */
function variant(name: string, brandNum: number, dict: Record<string, unknown>): PyretObject {
  return { dict, brands: { [`$brand${name}${brandNum}`]: true } };
}

const point = (x: number, y: number): PyretObject => variant('point', 7, { x, y });
const line = (p: PyretObject, q: PyretObject): PyretObject =>
  variant('line', 8, { start: p, end: q });
const node = (val: number, left: unknown, right: unknown): PyretObject =>
  variant('node', 9, { val, left, right });
const leaf = (val: number): PyretObject => variant('leaf', 10, { val });

// ----------------------------------------------------------------------------
// T0 — primitives & flat containers
// ----------------------------------------------------------------------------
const T0: CorpusItem[] = [
  { name: 'int', category: 'T0', value: 5 },
  { name: 'negative', category: 'T0', value: -42 },
  { name: 'float', category: 'T0', value: 3.5 },
  { name: 'string', category: 'T0', value: 'hi' },
  { name: 'string-with-escapes', category: 'T0', value: 'line1\nline2\t"q"' },
  { name: 'empty-string', category: 'T0', value: '' },
  { name: 'bool-true', category: 'T0', value: true },
  { name: 'bool-false', category: 'T0', value: false },
  { name: 'array', category: 'T0', value: [1, 2, 3] },
  { name: 'empty-array', category: 'T0', value: [] },
  { name: 'array-of-strings', category: 'T0', value: ['a', 'b'] },
];

// ----------------------------------------------------------------------------
// T2 — user data types (flat and nested)
// ----------------------------------------------------------------------------
const T2: CorpusItem[] = [
  { name: 'point', category: 'T2', value: point(1, 2) },
  { name: 'point-zero', category: 'T2', value: point(0, 0) },
  { name: 'line', category: 'T2', value: line(point(1, 2), point(3, 4)) },
  {
    name: 'nested-record',
    category: 'T2',
    value: variant('box', 11, { contents: point(9, 9), tag: 'p' }),
  },
];

// ----------------------------------------------------------------------------
// T3a — sharing / DAG (the SAME object in two slots)
// ----------------------------------------------------------------------------
function sharedPair(): PyretObject {
  const p = point(1, 2);
  return variant('pair', 12, { fst: p, snd: p }); // same JS object reference
}
function sharedDeep(): PyretObject {
  const shared = point(5, 5);
  return variant('twolines', 13, {
    a: line(shared, point(0, 0)),
    b: line(shared, point(1, 1)),
  });
}
const T3a: CorpusItem[] = [
  { name: 'shared-point', category: 'T3a', value: sharedPair() },
  { name: 'shared-deep', category: 'T3a', value: sharedDeep() },
];

// ----------------------------------------------------------------------------
// T3b — cycles (real JS back-references)
// ----------------------------------------------------------------------------
function selfCycle(): PyretObject {
  const n: PyretObject = variant('cell', 14, {});
  (n.dict as Record<string, unknown>).next = n; // n.next = n
  return n;
}
function twoCycle(): PyretObject {
  const a: PyretObject = variant('cell', 14, {});
  const b: PyretObject = variant('cell', 14, {});
  (a.dict as Record<string, unknown>).next = b;
  (b.dict as Record<string, unknown>).next = a;
  return a;
}
const T3b: CorpusItem[] = [
  { name: 'self-cycle', category: 'T3b', value: selfCycle() },
  { name: 'two-cycle', category: 'T3b', value: twoCycle() },
];

// ----------------------------------------------------------------------------
// T4 — trees (sharing of leaf values via idempotency)
// ----------------------------------------------------------------------------
const T4: CorpusItem[] = [
  {
    name: 'binary-tree',
    category: 'T4',
    value: node(5, node(1, leaf(0), leaf(0)), node(6, leaf(0), leaf(0))),
  },
];

// ----------------------------------------------------------------------------
// T5 — fuzz (deterministic generator; no Math.random)
// ----------------------------------------------------------------------------
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function fuzzValue(rng: () => number, depth: number): Reifiable {
  if (depth <= 0 || rng() < 0.3) {
    const which = rng();
    if (which < 0.4) return Math.floor(rng() * 100);
    if (which < 0.7) return `s${Math.floor(rng() * 1000)}`;
    return rng() < 0.5;
  }
  const which = rng();
  if (which < 0.4) {
    return point(Math.floor(rng() * 10), Math.floor(rng() * 10));
  }
  if (which < 0.7) {
    const len = 1 + Math.floor(rng() * 3);
    return Array.from({ length: len }, () => fuzzValue(rng, depth - 1));
  }
  return variant('rec', 15, {
    head: fuzzValue(rng, depth - 1),
    tail: fuzzValue(rng, depth - 1),
  });
}

export function fuzzCorpus(count: number, baseSeed = 1): CorpusItem[] {
  const items: CorpusItem[] = [];
  for (let i = 0; i < count; i++) {
    const rng = makeRng(baseSeed + i * 2654435761);
    items.push({ name: `fuzz-${i}`, category: 'T5', value: fuzzValue(rng, 4) });
  }
  return items;
}

/** All structural (fixed-point) corpus items. */
export const STRUCTURAL_CORPUS: CorpusItem[] = [
  ...T0,
  ...T2,
  ...T3a,
  ...T3b,
  ...T4,
];

// ----------------------------------------------------------------------------
// T1 — discriminator pairs (rel-injectivity)
// ----------------------------------------------------------------------------
export const DISCRIMINATOR_PAIRS: DiscriminatorPair[] = [
  {
    name: 'number-vs-string',
    category: 'T1',
    a: 5,
    b: '5',
    expectDistinct: true,
    note: 'type tag must distinguish 5 from "5"',
  },
  {
    name: 'bool-vs-string',
    category: 'T1',
    a: true,
    b: 'true',
    expectDistinct: true,
  },
  {
    name: 'field-binding-swap',
    category: 'T1',
    a: point(1, 2),
    b: point(2, 1),
    expectDistinct: true,
    note: 'x/y bindings differ; distinguished by named relations (not order)',
  },
  {
    name: 'field-value-change',
    category: 'T1',
    a: point(1, 2),
    b: point(1, 3),
    expectDistinct: true,
  },
  {
    name: 'list-length',
    category: 'T1',
    a: [1, 2],
    b: [1],
    expectDistinct: true,
  },
  {
    name: 'list-multiplicity',
    category: 'T1',
    a: [1, 1],
    b: [1],
    expectDistinct: true,
    note: 'KNOWN RISK: idempotent primitives + tuple-dedup may collapse [1,1] to [1]',
  },
  {
    name: 'distinct-variants',
    category: 'T1',
    a: point(1, 2),
    b: variant('vec', 16, { x: 1, y: 2 }),
    expectDistinct: true,
    note: 'same fields, different constructor name',
  },
  {
    name: 'object-field-multiplicity (idempotent default)',
    category: 'T1',
    a: variant('bag', 17, { items: [1, 1] }),
    b: variant('bag', 17, { items: [1] }),
    expectDistinct: false,
    note:
      'KNOWN LOSS: with numbers idempotent, [1,1] under one field dedups to a ' +
      'single tuple (addRelationTuple drops duplicate (src,tgt)) — collapses to [1]',
  },
  {
    name: 'object-field-multiplicity (idempotent OFF)',
    category: 'T1',
    a: variant('bag', 17, { items: [1, 1] }),
    b: variant('bag', 17, { items: [1] }),
    expectDistinct: true,
    options: { numbersIdempotent: false },
    note: 'with idempotency off, the two 1s are distinct atoms -> multiplicity preserved',
  },
];
