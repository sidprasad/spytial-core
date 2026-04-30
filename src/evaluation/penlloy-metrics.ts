/**
 * Penlloy consistency metrics, lifted verbatim from §6.2 of:
 *
 *   Liang, Palliyil, Kang, Sunshine. "Towards Better Formal Methods
 *   Visualizations." PLATEAU 2025. doi:10.1184/R1/29086949.v1
 *
 * For two diagrams D' (previous) and D (current), with D(n) ∈ ℝ²:
 *
 *   positional(D, D') = Σ ‖D(n) − D'(n)‖²        n ∈ nodes(D) ∩ nodes(D')
 *
 *   relative(D, D')   = Σ ‖(D(n2) − D(n1)) − (D'(n2) − D'(n1))‖²
 *                       (n1, n2) ∈ edges(D) ∩ edges(D')
 *
 * Both are squared L2; both sum ONLY over elements that persist across
 * the two frames. A consistency metric is 0 exactly when that
 * consistency type is satisfied.
 *
 * These functions are evaluation infrastructure — used by the in-repo
 * assertion tests that defend the realization-policy claims, and by
 * downstream consumers (e.g., the thesis evaluation repo) that drive
 * richer benchmarks against the same definitions.
 */

import type { LayoutState } from '../translators/webcola/webcolatranslator';

/**
 * Edge identity used to determine persistence between two frames.
 * Two edges are "the same" iff they share source, target, and relation
 * name. Matches the matching key used elsewhere when deduplicating
 * edges across frames.
 */
export interface EdgeKey {
  source: string;
  target: string;
  rel: string;
}

const edgeKeyString = (e: EdgeKey): string =>
  `${e.source}->${e.target}#${e.rel}`;

const buildPositionMap = (state: LayoutState): Map<string, { x: number; y: number }> => {
  const m = new Map<string, { x: number; y: number }>();
  for (const p of state.positions) {
    m.set(p.id, { x: p.x, y: p.y });
  }
  return m;
};

/**
 * Penlloy's positional consistency metric:
 *
 *     Σ ‖D(n) − D'(n)‖²    over n ∈ nodes(prev) ∩ nodes(curr)
 *
 * Returns 0 iff every persisting node is at the same position in both
 * frames. Squared units (px²).
 *
 * @param prev      Layout state from the previous frame.
 * @param curr      Layout state from the current frame.
 * @param restrictTo
 *     If provided, only nodes whose id is in this set contribute to the
 *     sum (still requires presence in both frames). Used to score the
 *     "stable subset" half of the partial-consistency case.
 */
export function positionalConsistency(
  prev: LayoutState,
  curr: LayoutState,
  restrictTo?: Set<string>
): number {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  let total = 0;
  for (const [id, p] of currPos) {
    if (!prevPos.has(id)) continue;
    if (restrictTo && !restrictTo.has(id)) continue;
    const q = prevPos.get(id)!;
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    total += dx * dx + dy * dy;
  }
  return total;
}

/**
 * Penlloy's relative consistency metric:
 *
 *     Σ ‖(D(n2) − D(n1)) − (D'(n2) − D'(n1))‖²
 *     over (n1, n2) ∈ edges(prev) ∩ edges(curr)
 *
 * Returns 0 iff every persisting edge has the same vector direction and
 * length in both frames. Squared units (px²).
 *
 * Persistence is by `(source, target, rel)` triple. An edge present in
 * curr but not prev (or vice versa) does not contribute.
 *
 * @param prev               Previous-frame layout state.
 * @param prevEdges          Edge set in the previous frame.
 * @param curr               Current-frame layout state.
 * @param currEdges          Edge set in the current frame.
 * @param restrictToNodes
 *     If provided, only edges whose BOTH endpoints are in this set
 *     contribute to the sum. Used to score the "stable-stable edges"
 *     half of the partial-consistency case.
 */
export function relativeConsistency(
  prev: LayoutState,
  prevEdges: EdgeKey[],
  curr: LayoutState,
  currEdges: EdgeKey[],
  restrictToNodes?: Set<string>
): number {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  const prevEdgeSet = new Set(prevEdges.map(edgeKeyString));

  let total = 0;
  for (const e of currEdges) {
    if (!prevEdgeSet.has(edgeKeyString(e))) continue;
    if (restrictToNodes && (!restrictToNodes.has(e.source) || !restrictToNodes.has(e.target))) continue;

    const ps = prevPos.get(e.source);
    const pt = prevPos.get(e.target);
    const cs = currPos.get(e.source);
    const ct = currPos.get(e.target);
    if (!ps || !pt || !cs || !ct) continue;

    const prevDx = pt.x - ps.x;
    const prevDy = pt.y - ps.y;
    const currDx = ct.x - cs.x;
    const currDy = ct.y - cs.y;

    const ddx = currDx - prevDx;
    const ddy = currDy - prevDy;
    total += ddx * ddx + ddy * ddy;
  }
  return total;
}

/**
 * Recover the "stable" subset of nodes for a `stable-node-reflow`-style
 * policy by observing which output positions equal prior positions
 * within `tol` (default 0.5 px per axis).
 *
 * Lets the partial-consistency case (positional = 0 over stable;
 * bounded over reflow) be scored without changing the SequencePolicy
 * interface to expose a stable/reflow classification.
 *
 * @param prior         The prior LayoutState fed into the policy.
 * @param policyOutput  The LayoutState the policy returned
 *                      (`SequencePolicyResult.effectivePriorState`).
 * @param tol           Per-axis tolerance for "unchanged". Default 0.5 px.
 */
export function classifyChangeEmphasisStableSet(
  prior: LayoutState,
  policyOutput: LayoutState,
  tol: number = 0.5
): Set<string> {
  const priorPos = buildPositionMap(prior);
  const stable = new Set<string>();
  for (const p of policyOutput.positions) {
    const q = priorPos.get(p.id);
    if (!q) continue;
    if (Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol) {
      stable.add(p.id);
    }
  }
  return stable;
}
