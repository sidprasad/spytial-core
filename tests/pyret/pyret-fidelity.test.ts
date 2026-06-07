import { describe, it, expect } from 'vitest';
import { fixedPoint, relInjective, relationalize } from './oracles';
import { replit } from '../../src/data-instance/pyret/replit';
import { STRUCTURAL_CORPUS, DISCRIMINATOR_PAIRS, fuzzCorpus } from './corpus';

/**
 * Tier A fidelity measurement — self-contained, no Pyret runtime.
 *
 *   Fixed-Point:   canon(rel(v)) == canon(rel(reify(rel(v))))
 *   rel-injective: canon(rel(a)) != canon(rel(b))  for distinct a, b
 *
 * Tier B (R-eq via equal-always, R-inspect via torepr) needs a live Pyret
 * runtime and lives in an IDE-side harness — not here.
 */

const FUZZ_COUNT = 2000;

describe('Tier A — Fixed-Point (rel -> reify -> rel)', () => {
  for (const item of STRUCTURAL_CORPUS) {
    it(`${item.category} ${item.name} round-trips`, () => {
      const res = fixedPoint(item.value);
      if (!res.pass) {
        // eslint-disable-next-line no-console
        console.error(`FAIL ${item.name}\n  A: ${res.canonA}\n  B: ${res.canonB}`);
      }
      expect(res.pass).toBe(true);
    });
  }

  it(`T5 fuzz (${FUZZ_COUNT} cases) all round-trip`, () => {
    const items = fuzzCorpus(FUZZ_COUNT);
    const failures = items
      .map((item) => ({ item, res: fixedPoint(item.value) }))
      .filter(({ res }) => !res.pass);
    if (failures.length) {
      // eslint-disable-next-line no-console
      console.error(
        `Fuzz failures (${failures.length}/${FUZZ_COUNT}):\n` +
          failures
            .slice(0, 5)
            .map(({ item, res }) => `  ${item.name}\n    A:${res.canonA}\n    B:${res.canonB}`)
            .join('\n'),
      );
    }
    expect(failures.length).toBe(0);
  });
});

describe('Tier A — rel-injectivity (distinct values stay distinct)', () => {
  for (const pair of DISCRIMINATOR_PAIRS) {
    it(`${pair.name}${pair.note ? ` — ${pair.note}` : ''}`, () => {
      const distinct = relInjective(pair.a, pair.b, pair.options);
      if (distinct !== pair.expectDistinct) {
        // eslint-disable-next-line no-console
        console.error(`${pair.name}: distinct=${distinct} expected=${pair.expectDistinct}`);
      }
      expect(distinct).toBe(pair.expectDistinct);
    });
  }
});

describe('replit — REPL-equivalent rendering', () => {
  const cases: Array<[string, unknown, string]> = [
    ['number', 5, '5'],
    ['string', 'hi', '"hi"'],
    ['string-escape', 'a\nb', '"a\\nb"'],
    ['bool', true, 'true'],
    ['array', [1, 2, 3], '[list: 1, 2, 3]'],
    // KNOWN AMBIGUITY: an empty array has zero relations, so it is structurally
    // indistinguishable from an empty object — reify cannot recover "array-ness".
    ['empty-array (ambiguous)', [], 'RawArray'],
    [
      'point',
      { dict: { x: 1, y: 2 }, brands: { $brandpoint7: true } },
      'point(1, 2)',
    ],
    [
      'nested',
      {
        dict: {
          start: { dict: { x: 1, y: 2 }, brands: { $brandpoint7: true } },
          end: { dict: { x: 3, y: 4 }, brands: { $brandpoint7: true } },
        },
        brands: { $brandline8: true },
      },
      'line(point(1, 2), point(3, 4))',
    ],
  ];

  for (const [name, value, expected] of cases) {
    it(`renders ${name}`, () => {
      const di = relationalize(value as never);
      expect(replit(di)).toBe(expected);
    });
  }

  it('does not loop on cycles', () => {
    const n: any = { dict: {}, brands: { $brandcell14: true } };
    n.dict.next = n;
    const di = relationalize(n);
    const s = replit(di);
    expect(s).toContain('cell');
    expect(s).toContain('<cyclic>');
  });
});
