/**
 * Replay a trace JSON through every (policy × seed) and emit per-run
 * metric JSON to results/per-run/.
 *
 * Usage:
 *   tsx runner/run.ts <trace.json> [--policy stability] [--seed 1]
 *   tsx runner/run.ts --all-traces --all-policies --seeds 1,2,3,4,5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  type SequencePolicy,
} from './policies';

import {
  runHeadlessLayout,
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  changeEmphasisSeparation,
  constraintAdherence,
  classifyChangeEmphasisChangedSet,
  // Misue mental-map battery
  orthogonalOrderingPreservation,
  knnJaccard,
  edgeCrossingsDelta,
  directionalCoherence,
  stableQuietRatio,
  // Moderator + oracles (appropriateness experiment)
  constraintPerturbation,
  positionalOracle,
  pairwiseDistanceOracle,
  JSONDataInstance,
  parseLayoutSpec,
  type HeadlessLayoutResult,
  type EdgeKey,
} from './metrics';

const REPO_DIR = path.resolve(__dirname, '..');
const TRACES_DIR = path.join(REPO_DIR, 'traces', 'out');
const RESULTS_DIR = path.join(REPO_DIR, 'results', 'per-run');

const ALL_POLICIES: Record<string, SequencePolicy> = {
  ignore_history: ignoreHistory,
  stability,
  change_emphasis: changeEmphasis,
  random_positioning: randomPositioning,
};

interface Frame {
  step: number;
  label: string;
  instance: any;
}

interface Trace {
  algorithm: string;
  spec: string;
  frames: Frame[];
}

interface TransitionMetrics {
  transition_index: number;
  from_label: string;
  to_label: string;
  // Penlloy / Liang (output, post-solver). The existing column names
  // remain — they are the post-solver scores. `_seed` companions below
  // score the policy seed (pre-solver) for the seed-vs-output
  // decomposition in the appropriateness experiment.
  positional: number | null;
  positional_seed: number | null;
  relative: number | null;
  relative_seed: number | null;
  pairwise_distance: number | null;
  pairwise_distance_seed: number | null;
  constraint_adherence: number | null;
  runtime_ms: number;
  solver_failure: boolean;
  // Misue mental-map battery (JVLC 1995). _output / _seed parallel.
  orthogonal_ordering_preservation: number | null;
  orthogonal_ordering_preservation_seed: number | null;
  knn_jaccard: number | null;
  knn_jaccard_seed: number | null;
  edge_crossings_delta: number | null;
  edge_crossings_delta_seed: number | null;
  directional_coherence: number | null;
  directional_coherence_seed: number | null;
  stable_quiet_ratio: number | null;
  stable_quiet_ratio_seed: number | null;
  // Moderator: how far the prior layout sits from the new feasible
  // region. Independent of policy choice.
  constraint_perturbation: number | null;
  // Appropriateness gaps. `gap_positional` is `stability`'s near-zero
  // sanity check (verbatim warm-start ≈ positional oracle).
  // `gap_pwd` is the headline measurement: how far the policy is from
  // the constraint-feasible pairwise-distance optimum.
  gap_positional: number | null;
  gap_positional_seed: number | null;
  gap_pwd: number | null;
  gap_pwd_seed: number | null;
  // Two-level split on persisting nodes: "changed" = neighborhood (incident
  // edges) differs between frames; "stable" = unchanged neighborhood.
  // Computed for every policy, not just change_emphasis.
  changed_count: number | null;
  stable_count: number | null;
  changed_vs_stable_auc: number | null;
  changed_mean_drift: number | null;
  stable_mean_drift: number | null;
  changed_positional: number | null;
  stable_positional: number | null;
  changed_pairwise_distance: number | null;
  stable_pairwise_distance: number | null;
  // Atom-ID assignments for the two-level split. Required for derived
  // metrics that need per-atom drift partitioned by context-change
  // (concentration, directional coherence, stable_quiet_ratio).
  changed_ids: string[] | null;
  stable_ids: string[] | null;
}

const NULL_TRANSITION: Omit<TransitionMetrics, 'transition_index' | 'from_label' | 'to_label' | 'runtime_ms' | 'solver_failure'> = {
  positional: null,
  positional_seed: null,
  relative: null,
  relative_seed: null,
  pairwise_distance: null,
  pairwise_distance_seed: null,
  constraint_adherence: null,
  orthogonal_ordering_preservation: null,
  orthogonal_ordering_preservation_seed: null,
  knn_jaccard: null,
  knn_jaccard_seed: null,
  edge_crossings_delta: null,
  edge_crossings_delta_seed: null,
  directional_coherence: null,
  directional_coherence_seed: null,
  stable_quiet_ratio: null,
  stable_quiet_ratio_seed: null,
  constraint_perturbation: null,
  gap_positional: null,
  gap_positional_seed: null,
  gap_pwd: null,
  gap_pwd_seed: null,
  changed_count: null,
  stable_count: null,
  changed_vs_stable_auc: null,
  changed_mean_drift: null,
  stable_mean_drift: null,
  changed_positional: null,
  stable_positional: null,
  changed_pairwise_distance: null,
  stable_pairwise_distance: null,
  changed_ids: null,
  stable_ids: null,
};

interface FrameSnapshot {
  /** Original step index from the trace. */
  step: number;
  label: string;
  /** Post-solver positions. Shape matches LayoutState.positions. */
  positions: { id: string; x: number; y: number }[] | null;
  /** Edge identities at this frame. */
  edges: { source: string; target: string; rel: string }[] | null;
  /**
   * Pre-solver seed positions returned by the policy for this frame,
   * or `null` when no policy was applied (first frame, or
   * `ignore_history`). Used downstream by `derived_metrics.py` and the
   * seed-vs-output decomposition.
   */
  seed_positions: { id: string; x: number; y: number }[] | null;
  /** Whether the layout failed for this frame. */
  failed: boolean;
}

interface PerRunResult {
  trace_path: string;
  algorithm: string;
  policy: string;
  seed: number;
  num_frames: number;
  num_transitions: number;
  transitions: TransitionMetrics[];
  /** Per-frame post-solver positions and edges, for derived metrics. */
  frames: FrameSnapshot[];
}

function loadTrace(tracePath: string): Trace {
  const raw = fs.readFileSync(tracePath, 'utf-8');
  return JSON.parse(raw) as Trace;
}

async function runOne(
  trace: Trace,
  policyName: string,
  policy: SequencePolicy,
  seed: number
): Promise<PerRunResult> {
  // Mathjs-like seeded jitter is internal to changeEmphasis (line 219 in
  // sequence-policy.ts). The harness sets Math.random for randomPositioning.
  // For reproducibility under random_positioning we install a seeded RNG.
  const origRandom = Math.random;
  let seedState = seed >>> 0;
  Math.random = () => {
    // xorshift32
    seedState ^= seedState << 13;
    seedState ^= seedState >>> 17;
    seedState ^= seedState << 5;
    return ((seedState >>> 0) % 1_000_003) / 1_000_003;
  };

  const spec = parseLayoutSpec(trace.spec);
  const transitions: TransitionMetrics[] = [];
  const frameSnapshots: FrameSnapshot[] = [];

  let prevInstance: JSONDataInstance | undefined;
  let prevResult: HeadlessLayoutResult | undefined;
  let prevLabel = '';
  let prevFailed = false;

  try {
    for (let i = 0; i < trace.frames.length; i++) {
      const frame = trace.frames[i];
      const currInstance = new JSONDataInstance(frame.instance);

      const t0 = performance.now();
      let result: HeadlessLayoutResult | null = null;
      let currFailed = false;
      try {
        result = await runHeadlessLayout(spec, currInstance, {
          policy: i > 0 ? policy : undefined,
          prevInstance: i > 0 ? prevInstance : undefined,
          currInstance: i > 0 ? currInstance : undefined,
          priorPositions: i > 0 ? prevResult?.positions : undefined,
          figWidth: 800,
          figHeight: 600,
        });
      } catch (err) {
        currFailed = true;
      }
      const runtimeMs = performance.now() - t0;
      const transitionFailed = currFailed || prevFailed;

      // Snapshot per-frame post-solver positions and edges (for derived
      // metrics computed downstream by `derived_metrics.py`). Also
      // capture the policy seed when present, for seed-vs-output
      // decomposition.
      frameSnapshots.push({
        step: frame.step,
        label: frame.label,
        positions: result
          ? result.positions.positions.map(p => ({ id: p.id, x: p.x, y: p.y }))
          : null,
        edges: result ? result.edges.map(e => ({ ...e })) : null,
        seed_positions: result?.seed
          ? result.seed.positions.map(p => ({ id: p.id, x: p.x, y: p.y }))
          : null,
        failed: currFailed,
      });

      if (i > 0 && result && prevResult && prevInstance && !transitionFailed) {
        let sep: ReturnType<typeof changeEmphasisSeparation> | null = null;
        let changedSet = new Set<string>();
        try {
          changedSet = classifyChangeEmphasisChangedSet(prevInstance, currInstance);
          sep = changeEmphasisSeparation(prevResult.positions, result.positions, changedSet);
        } catch {
          sep = null;
        }

        // Build the changed/stable atom-ID lists from the persisting set
        // and the changedSet — same logic as inside changeEmphasisSeparation.
        const prevIds = new Set(prevResult.positions.positions.map(p => p.id));
        const currIds = new Set(result.positions.positions.map(p => p.id));
        const changedIds: string[] = [];
        const stableIds: string[] = [];
        for (const id of currIds) {
          if (!prevIds.has(id)) continue;
          if (changedSet.has(id)) changedIds.push(id);
          else stableIds.push(id);
        }

        // Crossing-edge inputs share `source`/`target`; the EdgeKey shape
        // (with `rel`) is a superset that satisfies CrossingEdge.
        const prevEdgesForCrossings = prevResult.edges;
        const currEdgesForCrossings = result.edges;

        // Output (post-solver) Misue scores.
        const oop_out = orthogonalOrderingPreservation(prevResult.positions, result.positions);
        const knn_out = knnJaccard(prevResult.positions, result.positions);
        const ec_out = edgeCrossingsDelta(
          prevResult.positions,
          prevEdgesForCrossings,
          result.positions,
          currEdgesForCrossings
        );
        const dc_out = directionalCoherence(prevResult.positions, result.positions, changedIds);
        const sqr_out = stableQuietRatio(prevResult.positions, result.positions, stableIds);

        // Moderator: distance from prior layout to the new feasible region.
        // Independent of policy choice — same value across policies for a
        // given (prev, current_constraints) pair.
        const cPerturb = constraintPerturbation(prevResult.positions, result.constraints);

        // Oracles. Computed against the prior layout + the current
        // frame's hard constraints; policy-independent.
        const oracle_pos = positionalOracle(prevResult.positions, result.constraints);
        const oracle_pwd = pairwiseDistanceOracle(prevResult.positions, result.constraints);

        // Output gaps to oracles.
        const gap_pos_out = positionalConsistency(oracle_pos, result.positions);
        const gap_pwd_out = positionalConsistency(oracle_pwd, result.positions);

        // Seed-side scores. result.seed is null for ignore_history (no
        // policy applied to this frame); seed-side metrics stay null in
        // that case.
        const seedState = result.seed;
        const positional_seed = seedState ? positionalConsistency(prevResult.positions, seedState) : null;
        const relative_seed = seedState
          ? relativeConsistency(prevResult.positions, prevResult.edges, seedState, result.edges)
          : null;
        const pairwise_distance_seed = seedState
          ? pairwiseDistanceConsistency(prevResult.positions, seedState)
          : null;
        const oop_seed = seedState ? orthogonalOrderingPreservation(prevResult.positions, seedState) : null;
        const knn_seed = seedState ? knnJaccard(prevResult.positions, seedState) : null;
        const ec_seed = seedState
          ? edgeCrossingsDelta(prevResult.positions, prevEdgesForCrossings, seedState, currEdgesForCrossings)
          : null;
        const dc_seed = seedState ? directionalCoherence(prevResult.positions, seedState, changedIds) : null;
        const sqr_seed = seedState ? stableQuietRatio(prevResult.positions, seedState, stableIds) : null;
        const gap_pos_seed = seedState ? positionalConsistency(oracle_pos, seedState) : null;
        const gap_pwd_seed = seedState ? positionalConsistency(oracle_pwd, seedState) : null;

        transitions.push({
          transition_index: i - 1,
          from_label: prevLabel,
          to_label: frame.label,
          positional: positionalConsistency(prevResult.positions, result.positions),
          positional_seed,
          relative: relativeConsistency(
            prevResult.positions,
            prevResult.edges,
            result.positions,
            result.edges
          ),
          relative_seed,
          pairwise_distance: pairwiseDistanceConsistency(prevResult.positions, result.positions),
          pairwise_distance_seed,
          constraint_adherence: constraintAdherence(result.constraints, result.nodes),
          runtime_ms: runtimeMs,
          solver_failure: false,
          orthogonal_ordering_preservation: oop_out,
          orthogonal_ordering_preservation_seed: oop_seed,
          knn_jaccard: knn_out,
          knn_jaccard_seed: knn_seed,
          edge_crossings_delta: ec_out,
          edge_crossings_delta_seed: ec_seed,
          directional_coherence: dc_out,
          directional_coherence_seed: dc_seed,
          stable_quiet_ratio: sqr_out,
          stable_quiet_ratio_seed: sqr_seed,
          constraint_perturbation: cPerturb,
          gap_positional: gap_pos_out,
          gap_positional_seed: gap_pos_seed,
          gap_pwd: gap_pwd_out,
          gap_pwd_seed: gap_pwd_seed,
          changed_count: sep?.changedCount ?? null,
          stable_count: sep?.stableCount ?? null,
          changed_vs_stable_auc: sep?.auc ?? null,
          changed_mean_drift: sep?.changedMeanDrift ?? null,
          stable_mean_drift: sep?.stableMeanDrift ?? null,
          changed_positional: sep?.changedPositional ?? null,
          stable_positional: sep?.stablePositional ?? null,
          changed_pairwise_distance: sep?.changedPairwiseDistance ?? null,
          stable_pairwise_distance: sep?.stablePairwiseDistance ?? null,
          changed_ids: changedIds,
          stable_ids: stableIds,
        });
      } else if (i > 0) {
        transitions.push({
          transition_index: i - 1,
          from_label: prevLabel,
          to_label: frame.label,
          runtime_ms: runtimeMs,
          solver_failure: transitionFailed,
          ...NULL_TRANSITION,
        });
      }

      if (result) {
        prevInstance = currInstance;
        prevResult = result;
        prevLabel = frame.label;
      }
      prevFailed = currFailed;
    }
  } finally {
    Math.random = origRandom;
  }

  return {
    trace_path: '',
    algorithm: trace.algorithm,
    policy: policyName,
    seed,
    num_frames: trace.frames.length,
    num_transitions: transitions.length,
    transitions,
    frames: frameSnapshots,
  };
}

function resultPath(traceFile: string, policy: string, seed: number): string {
  const base = path.basename(traceFile, '.trace.json');
  return path.join(RESULTS_DIR, `${base}__${policy}__seed${seed}.result.json`);
}

function parseSeeds(s: string | undefined, fallback: number[]): number[] {
  if (!s) return fallback;
  return s.split(',').map(p => parseInt(p.trim(), 10)).filter(n => Number.isFinite(n));
}

async function main() {
  const argv = process.argv.slice(2);
  const allTraces = argv.includes('--all-traces');
  const allPolicies = argv.includes('--all-policies');

  const flagValue = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const policyArg = flagValue('--policy');
  const seedArg = flagValue('--seed');
  const seedsArg = flagValue('--seeds');
  const positional = argv.filter(a => !a.startsWith('--'));
  const explicitTrace = positional[0];

  const tracePaths: string[] = [];
  if (allTraces) {
    for (const f of fs.readdirSync(TRACES_DIR)) {
      if (f.endsWith('.trace.json')) tracePaths.push(path.join(TRACES_DIR, f));
    }
  } else if (explicitTrace) {
    tracePaths.push(path.resolve(explicitTrace));
  } else {
    console.error('Usage: tsx runner/run.ts <trace.json> [--policy NAME] [--seed N]');
    console.error('   or: tsx runner/run.ts --all-traces --all-policies --seeds 1,2,3');
    process.exit(2);
  }

  const policies: [string, SequencePolicy][] = allPolicies
    ? Object.entries(ALL_POLICIES)
    : (() => {
        const name = policyArg ?? 'stability';
        const pol = ALL_POLICIES[name];
        if (!pol) throw new Error(`unknown policy: ${name}`);
        return [[name, pol]];
      })();

  const seeds: number[] = seedsArg
    ? parseSeeds(seedsArg, [1])
    : seedArg
      ? [parseInt(seedArg, 10)]
      : [1];

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  for (const tracePath of tracePaths) {
    const trace = loadTrace(tracePath);
    for (const [policyName, policy] of policies) {
      // Stochastic policies vary with seed; deterministic ones don't.
      const isStochastic = policyName === 'random_positioning' || policyName === 'change_emphasis';
      const seedsToRun = isStochastic ? seeds : [seeds[0]];
      for (const seed of seedsToRun) {
        const result = await runOne(trace, policyName, policy, seed);
        result.trace_path = path.relative(REPO_DIR, tracePath);
        const outPath = resultPath(tracePath, policyName, seed);
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
        console.log(`${path.basename(outPath)}  transitions=${result.num_transitions}`);
      }
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
