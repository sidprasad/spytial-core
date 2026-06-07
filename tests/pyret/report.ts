/**
 * Tier A fidelity report — computes a score matrix + violation list.
 *
 * This is the programmatic form of the headline "fidelity number": per-oracle,
 * per-category pass rates over the corpus, plus every concrete violation. Use it
 * from a script or CI step to emit a JSON artifact, or to print a summary.
 *
 * Tier B (R-eq / R-inspect via the live Pyret runtime) is intentionally absent —
 * it requires an IDE/runtime-backed harness.
 */

import { fixedPoint, relInjective } from './oracles';
import {
  STRUCTURAL_CORPUS,
  DISCRIMINATOR_PAIRS,
  fuzzCorpus,
  CorpusItem,
} from './corpus';

export interface Violation {
  oracle: 'fixed-point' | 'rel-injectivity';
  name: string;
  category: string;
  detail: string;
}

export interface CategoryScore {
  category: string;
  oracle: string;
  pass: number;
  total: number;
  rate: number;
}

export interface FidelityReport {
  scores: CategoryScore[];
  violations: Violation[];
  /** headline: overall fixed-point pass rate */
  fixedPointRate: number;
  /** overall rel-injectivity pass rate (matches-expectation) */
  relInjectivityRate: number;
}

export function runTierA(fuzzCount = 1000): FidelityReport {
  const violations: Violation[] = [];
  const byKey = new Map<string, { pass: number; total: number }>();

  const bump = (category: string, oracle: string, ok: boolean) => {
    const key = `${oracle}::${category}`;
    const e = byKey.get(key) ?? { pass: 0, total: 0 };
    e.total += 1;
    if (ok) e.pass += 1;
    byKey.set(key, e);
  };

  const structural: CorpusItem[] = [...STRUCTURAL_CORPUS, ...fuzzCorpus(fuzzCount)];
  for (const item of structural) {
    const res = fixedPoint(item.value);
    bump(item.category, 'fixed-point', res.pass);
    if (!res.pass) {
      violations.push({
        oracle: 'fixed-point',
        name: item.name,
        category: item.category,
        detail: `A=${res.canonA} B=${res.canonB}`,
      });
    }
  }

  for (const pair of DISCRIMINATOR_PAIRS) {
    const distinct = relInjective(pair.a, pair.b, pair.options);
    const ok = distinct === pair.expectDistinct;
    bump(pair.category, 'rel-injectivity', ok);
    if (!ok) {
      violations.push({
        oracle: 'rel-injectivity',
        name: pair.name,
        category: pair.category,
        detail: `distinct=${distinct} expected=${pair.expectDistinct}`,
      });
    }
  }

  const scores: CategoryScore[] = Array.from(byKey.entries())
    .map(([key, e]) => {
      const [oracle, category] = key.split('::');
      return { oracle, category, pass: e.pass, total: e.total, rate: e.pass / e.total };
    })
    .sort((a, b) => a.oracle.localeCompare(b.oracle) || a.category.localeCompare(b.category));

  const sum = (oracle: string) =>
    scores.filter((s) => s.oracle === oracle).reduce(
      (acc, s) => ({ pass: acc.pass + s.pass, total: acc.total + s.total }),
      { pass: 0, total: 0 },
    );
  const fp = sum('fixed-point');
  const ri = sum('rel-injectivity');

  return {
    scores,
    violations,
    fixedPointRate: fp.total ? fp.pass / fp.total : 1,
    relInjectivityRate: ri.total ? ri.pass / ri.total : 1,
  };
}

/** Render the report as a compact text matrix. */
export function formatReport(report: FidelityReport): string {
  const lines: string[] = [];
  lines.push('=== Tier A fidelity report (self-contained, no Pyret runtime) ===');
  for (const s of report.scores) {
    lines.push(`  ${s.oracle.padEnd(16)} ${s.category.padEnd(6)} ${s.pass}/${s.total} (${(s.rate * 100).toFixed(1)}%)`);
  }
  lines.push(`  fixed-point overall:     ${(report.fixedPointRate * 100).toFixed(2)}%`);
  lines.push(`  rel-injectivity overall: ${(report.relInjectivityRate * 100).toFixed(2)}%`);
  if (report.violations.length) {
    lines.push(`  violations: ${report.violations.length}`);
    for (const v of report.violations.slice(0, 10)) {
      lines.push(`    [${v.oracle}] ${v.category} ${v.name}: ${v.detail}`);
    }
  } else {
    lines.push('  violations: none');
  }
  return lines.join('\n');
}
