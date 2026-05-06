/**
 * Sweep results/per-run/*.result.json into one aggregate.csv with columns
 * matching the thesis evaluation contract (guzdial-chart.md:144-146).
 *
 * Each raw consistency metric is reported alongside a `*_norm` column.
 *
 * ## What `_norm` means
 *
 * Each `_norm` column is interpretable as **fraction of theoretical
 * worst** for its underlying metric — i.e., a "% from ideal" reading
 * in [0, 1]:
 *
 *   - 0 means the metric is at its ideal value (no drift / no gap /
 *     no constraint perturbation).
 *   - 1 means every persisting element contributed its theoretical
 *     maximum to the sum (every node drifted corner-to-corner of the
 *     prior-frame bounding box, every pair distorted by a full
 *     diagonal, etc.).
 *
 * Concretely, the divisors are:
 *
 *   - sum-of-squared per node:  `N_persist · diag²`
 *     used for: positional, gap_positional, gap_pwd, changed/stable_positional
 *   - sum-of-squared per edge:  `N_persistEdges · meanEdgeLen²`
 *     used for: relative
 *   - sum-of-squared per pair:  `N_pairs · diag²`
 *     used for: pairwise_distance, changed/stable_pairwise_distance
 *   - sum-of-linear per node:   `N_persist · diag`
 *     used for: constraint_perturbation
 *   - mean-already (no count):  `diag`
 *     used for: changed_mean_drift, stable_mean_drift
 *   - count over edges:         `max(|prevEdges|, |currEdges|)`
 *     used for: edge_crossings_delta (matches derived_metrics.py)
 *
 * Real-world numbers are usually small fractions of 1 — random
 * positioning typically lands around 0.1-0.3 because nodes don't fill
 * the corner-to-corner box. That compression is intentional: the
 * theoretical worst is a clean, deterministic anchor; if you want a
 * tighter dynamic range you can rescale downstream against the
 * `random_positioning` rows in this same CSV.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_DIR = path.resolve(__dirname, '..');
const PER_RUN_DIR = path.join(REPO_DIR, 'results', 'per-run');
const AGGREGATE_PATH = path.join(REPO_DIR, 'results', 'aggregate.csv');

const COLUMNS = [
  'algorithm',
  'policy',
  'seed',
  'transition_index',
  'from_label',
  'to_label',
  // Penlloy / Liang squared-error consistency. The bare names are the
  // post-solver scores (preserved for back-compat with existing
  // consumers); `_seed` companions score the policy seed pre-solver
  // for the appropriateness-experiment decomposition.
  'positional',
  'positional_norm',
  'positional_seed',
  'positional_seed_norm',
  'relative',
  'relative_norm',
  'relative_seed',
  'relative_seed_norm',
  'pairwise_distance',
  'pairwise_distance_norm',
  'pairwise_distance_seed',
  'pairwise_distance_seed_norm',
  'constraint_adherence',
  'runtime_ms',
  'solver_failure',
  // Misue mental-map battery. All five are in [0, 1] except
  // edge_crossings_delta, which is a non-negative integer normalized
  // by max edge count.
  'orthogonal_ordering_preservation',
  'orthogonal_ordering_preservation_seed',
  'knn_jaccard',
  'knn_jaccard_seed',
  'edge_crossings_delta',
  'edge_crossings_delta_norm',
  'edge_crossings_delta_seed',
  'edge_crossings_delta_seed_norm',
  'directional_coherence',
  'directional_coherence_seed',
  'stable_quiet_ratio',
  'stable_quiet_ratio_seed',
  // Moderator: how far the prior sits from the new feasible region.
  'constraint_perturbation',
  'constraint_perturbation_norm',
  // Appropriateness gaps. Headline of the experiment.
  'gap_positional',
  'gap_positional_norm',
  'gap_positional_seed',
  'gap_positional_seed_norm',
  'gap_pwd',
  'gap_pwd_norm',
  'gap_pwd_seed',
  'gap_pwd_seed_norm',
  'changed_count',
  'stable_count',
  'changed_vs_stable_auc',
  'changed_mean_drift',
  'changed_mean_drift_norm',
  'stable_mean_drift',
  'stable_mean_drift_norm',
  'changed_positional',
  'changed_positional_norm',
  'stable_positional',
  'stable_positional_norm',
  'changed_pairwise_distance',
  'changed_pairwise_distance_norm',
  'stable_pairwise_distance',
  'stable_pairwise_distance_norm',
  'frame_diag',
];

type Position = { id: string; x: number; y: number };
type Edge = { source: string; target: string };

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && !Number.isFinite(v)) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function bboxDiag(positions: Position[]): number {
  if (positions.length === 0) return 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function meanPersistingEdgeLength(
  edges: Edge[],
  posMap: Map<string, Position>,
  curr: Map<string, Position>
): { count: number; mean: number } {
  let sum = 0;
  let count = 0;
  for (const e of edges) {
    const a = posMap.get(e.source);
    const b = posMap.get(e.target);
    if (!a || !b) continue;
    if (!curr.has(e.source) || !curr.has(e.target)) continue;
    sum += Math.hypot(a.x - b.x, a.y - b.y);
    count += 1;
  }
  return { count, mean: count > 0 ? sum / count : 0 };
}

/** divides a sum-of-squared-deltas metric by `count * scale²`, returning
 *  null if the denominator is zero or the input is missing. */
function normSquared(metric: unknown, count: number, scale: number): number | null {
  if (typeof metric !== 'number' || !Number.isFinite(metric)) return null;
  const denom = count * scale * scale;
  if (denom <= 0) return null;
  return metric / denom;
}

/** divides a linear (not squared) metric by `scale`, returning null if
 *  the denominator is zero or the input is missing. */
function normLinear(metric: unknown, scale: number): number | null {
  if (typeof metric !== 'number' || !Number.isFinite(metric)) return null;
  if (scale <= 0) return null;
  return metric / scale;
}

/** divides a linear sum-over-nodes metric by `count * scale`, giving
 *  a per-node fraction-of-frame quantity comparable across traces. */
function normLinearPerCount(metric: unknown, count: number, scale: number): number | null {
  if (typeof metric !== 'number' || !Number.isFinite(metric)) return null;
  const denom = count * scale;
  if (denom <= 0) return null;
  return metric / denom;
}

function main() {
  if (!fs.existsSync(PER_RUN_DIR)) {
    console.error(`no per-run results at ${PER_RUN_DIR}`);
    process.exit(1);
  }
  const files = fs.readdirSync(PER_RUN_DIR).filter(f => f.endsWith('.result.json'));
  if (files.length === 0) {
    console.error('no .result.json files to aggregate');
    process.exit(1);
  }

  const rows: string[] = [COLUMNS.join(',')];

  for (const f of files) {
    const result = JSON.parse(fs.readFileSync(path.join(PER_RUN_DIR, f), 'utf-8'));
    const frames: Array<{ positions?: Position[]; edges?: Edge[]; failed?: boolean }> =
      result.frames ?? [];

    for (const t of result.transitions) {
      const prevFrame = frames[t.transition_index];
      const currFrame = frames[t.transition_index + 1];
      const prevPositions: Position[] = prevFrame?.positions ?? [];
      const currPositions: Position[] = currFrame?.positions ?? [];
      const prevEdges: Edge[] = prevFrame?.edges ?? [];

      const prevMap = new Map(prevPositions.map(p => [p.id, p] as const));
      const currMap = new Map(currPositions.map(p => [p.id, p] as const));

      const persistingIds: string[] = [];
      for (const id of prevMap.keys()) {
        if (currMap.has(id)) persistingIds.push(id);
      }
      const nPersist = persistingIds.length;
      const nPairs = (nPersist * (nPersist - 1)) / 2;

      const diag = bboxDiag(prevPositions);
      const { count: nPersistEdges, mean: meanEdgeLen } =
        meanPersistingEdgeLength(prevEdges, prevMap, currMap);

      const changedCount: number = t.changed_count ?? 0;
      const stableCount: number = t.stable_count ?? 0;
      const changedPairs = (changedCount * (changedCount - 1)) / 2;
      const stablePairs = (stableCount * (stableCount - 1)) / 2;

      // Edge-crossings normalization: divide by max edge count across
      // the two frames, matching `derived_metrics.py:351-353`.
      const currEdges: Edge[] = currFrame?.edges ?? [];
      const ecDenom = Math.max(prevEdges.length, currEdges.length);
      const ecNorm = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) && ecDenom > 0 ? v / ecDenom : null;

      rows.push(
        [
          result.algorithm,
          result.policy,
          result.seed,
          t.transition_index,
          t.from_label,
          t.to_label,
          t.positional,
          normSquared(t.positional, nPersist, diag),
          t.positional_seed,
          normSquared(t.positional_seed, nPersist, diag),
          t.relative,
          normSquared(t.relative, nPersistEdges, meanEdgeLen),
          t.relative_seed,
          normSquared(t.relative_seed, nPersistEdges, meanEdgeLen),
          t.pairwise_distance,
          normSquared(t.pairwise_distance, nPairs, diag),
          t.pairwise_distance_seed,
          normSquared(t.pairwise_distance_seed, nPairs, diag),
          t.constraint_adherence,
          t.runtime_ms,
          t.solver_failure,
          t.orthogonal_ordering_preservation,
          t.orthogonal_ordering_preservation_seed,
          t.knn_jaccard,
          t.knn_jaccard_seed,
          t.edge_crossings_delta,
          ecNorm(t.edge_crossings_delta),
          t.edge_crossings_delta_seed,
          ecNorm(t.edge_crossings_delta_seed),
          t.directional_coherence,
          t.directional_coherence_seed,
          t.stable_quiet_ratio,
          t.stable_quiet_ratio_seed,
          t.constraint_perturbation,
          // constraint_perturbation is a SUM over persisting nodes of
          // ‖proj − prior‖, so the "% of theoretical worst" denominator
          // is `N_persist · diag` (every node moves a full diagonal),
          // not just `diag`.
          normLinearPerCount(t.constraint_perturbation, nPersist, diag),
          t.gap_positional,
          normSquared(t.gap_positional, nPersist, diag),
          t.gap_positional_seed,
          normSquared(t.gap_positional_seed, nPersist, diag),
          t.gap_pwd,
          normSquared(t.gap_pwd, nPersist, diag),
          t.gap_pwd_seed,
          normSquared(t.gap_pwd_seed, nPersist, diag),
          t.changed_count,
          t.stable_count,
          t.changed_vs_stable_auc,
          t.changed_mean_drift,
          normLinear(t.changed_mean_drift, diag),
          t.stable_mean_drift,
          normLinear(t.stable_mean_drift, diag),
          t.changed_positional,
          normSquared(t.changed_positional, changedCount, diag),
          t.stable_positional,
          normSquared(t.stable_positional, stableCount, diag),
          t.changed_pairwise_distance,
          normSquared(t.changed_pairwise_distance, changedPairs, diag),
          t.stable_pairwise_distance,
          normSquared(t.stable_pairwise_distance, stablePairs, diag),
          diag,
        ]
          .map(csvCell)
          .join(',')
      );
    }
  }

  fs.writeFileSync(AGGREGATE_PATH, rows.join('\n') + '\n');
  console.log(`wrote ${AGGREGATE_PATH} (${rows.length - 1} rows)`);
}

main();
