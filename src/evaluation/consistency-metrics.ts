/**
 * Visual-consistency metrics for sequence-policy output. Each metric
 * compares two LayoutStates (a previous frame D′ and a current frame D)
 * and is a scalar that takes a specific extreme value exactly when its
 * notion of consistency holds.
 *
 * The module hosts two metric lineages:
 *
 * **Penlloy / Liang (squared-error consistency).** Source: Liang,
 * Palliyil, Kang, Sunshine, "Towards Better Formal Methods
 * Visualizations," PLATEAU 2025 §6.2 ("Penlloy"); equivalent to cells
 * of Liang et al.'s TOSEM 2026 hard/soft × positional/relative
 * taxonomy. Each metric is a non-negative scalar, 0 when its consistency
 * notion holds:
 *
 *   • positional        — per-node coordinate preservation.
 *   • relative          — per-edge vector preservation. Only persisting
 *                         EDGES contribute.
 *   • pairwiseDistance  — per-pair Euclidean-distance preservation.
 *                         Computational realization of Liang TOSEM
 *                         §3.4: 0 iff the persisting subset's pairwise-
 *                         distance matrix is preserved, invariant under
 *                         translation and rotation of the subset.
 *
 * **Misue 1995 (mental-map battery).** Source: Misue, Eades, Lai,
 * Sugiyama, "Layout adjustment and the mental map," JVLC 1995. Three
 * operational criteria for whether a reader's cognitive representation
 * survives a transition:
 *
 *   • orthogonalOrderingPreservation — fraction of node pairs whose
 *                         left/right + up/down ordering survived. 1 = all
 *                         pairs preserved.
 *   • knnJaccard        — mean Jaccard overlap of each persisting
 *                         node's k-nearest-neighbor set across the two
 *                         frames. 1 = every node's neighborhood
 *                         preserved.
 *   • edgeCrossings /
 *     edgeCrossingsDelta — number of edge-segment crossings; 0 = none.
 *                         Delta = absolute change between frames.
 *   • directionalCoherence — mean resultant length of unit
 *                         displacement vectors over a node set. 1 = all
 *                         moving the same direction.
 *   • stableQuietRatio  — fraction of "stable" nodes whose displacement
 *                         is below a threshold. 1 = the still part is
 *                         truly still.
 *
 * All metrics in both lineages sum/average ONLY over elements that
 * persist across the two frames. "Persisting" means present in both D′
 * and D — added/removed nodes or edges contribute nothing.
 *
 * These functions are evaluation infrastructure: used by in-repo
 * assertion tests that defend the realization-policy claims, by the
 * sequence-metrics demo, and by downstream consumers driving richer
 * benchmarks (e.g., the thesis evaluation repo).
 */

import {
  isLeftConstraint,
  isTopConstraint,
  isAlignmentConstraint,
  type LayoutConstraint,
} from '../layout/interfaces';
import type { LayoutState } from '../translators/webcola/webcolatranslator';
import { positionalOracle } from './oracle-layouts';

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

/**
 * Convert captured layout coordinates into the same zoom/pan-adjusted
 * coordinate space the renderer uses on screen.
 */
const buildPositionMap = (state: LayoutState): Map<string, { x: number; y: number }> => {
  const m = new Map<string, { x: number; y: number }>();
  const k = Number.isFinite(state.transform?.k) && state.transform.k > 0 ? state.transform.k : 1;
  const tx = Number.isFinite(state.transform?.x) ? state.transform.x : 0;
  const ty = Number.isFinite(state.transform?.y) ? state.transform.y : 0;

  for (const p of state.positions) {
    m.set(p.id, { x: p.x * k + tx, y: p.y * k + ty });
  }
  return m;
};

/**
 * Positional consistency:
 *
 *     Σ ‖D(n) − D'(n)‖²    over n ∈ nodes(prev) ∩ nodes(curr)
 *
 * Returns 0 iff every persisting node is at the same position in both
 * frames. Squared units (px²).
 *
 * Source: Penlloy (PLATEAU 2025) §6.2; equivalent to the positional
 * cell of Liang et al. TOSEM 2026's hard/soft × positional/relative
 * taxonomy. The "hard positional" interpretation requires this to be
 * 0 strictly; "soft positional" minimizes it as an objective.
 *
 * @param prev      Layout state from the previous frame.
 * @param curr      Layout state from the current frame.
 * @param restrictTo
 *     If provided, only nodes whose id is in this set contribute to the
 *     sum (still requires presence in both frames). Used to score a
 *     subset (e.g., the stable subset of a stable-node-reflow policy).
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
 * Relative (edge-vector) consistency:
 *
 *     Σ ‖(D(n2) − D(n1)) − (D'(n2) − D'(n1))‖²
 *     over (n1, n2) ∈ edges(prev) ∩ edges(curr)
 *
 * Returns 0 iff every persisting edge has the same vector direction and
 * length in both frames. Squared units (px²).
 *
 * Source: Penlloy (PLATEAU 2025) §6.2; cited identically in Liang et al.
 * TOSEM 2026 §2.6.1, where it is described as "the changes to the
 * relative positions between nodes related by edges." The metric only
 * sums over EDGES — two persisting nodes that are not connected by an
 * edge contribute nothing, even if their positions diverged. For a
 * pair-based ("how did the shape of the node cloud hold up?") metric
 * see {@link pairwiseDistanceConsistency} below.
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
 *     contribute to the sum. Used to score a subset (e.g., the
 *     stable-stable edges of a stable-node-reflow policy).
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
 * Pairwise-distance consistency ("shape" preservation):
 *
 *     Σ (d_curr(n_i, n_j) − d_prev(n_i, n_j))²
 *     over unordered pairs {n_i, n_j} where both n_i and n_j persist
 *
 * where `d(a, b)` is the Euclidean distance ‖a − b‖. Returns 0 iff the
 * persisting subset's pairwise-distance matrix is preserved exactly,
 * which is **invariant under translation and rotation of the subset
 * as a whole** but sensitive to internal stretching, swapping, or
 * reflection. Squared units (px⁴, since each summand is a difference
 * of distances squared).
 *
 * Source: a computational realization of Liang et al. TOSEM 2026's
 * partial-consistency operationalization (§3.4):
 *
 *   "key substructures (at least three interconnected nodes) maintain
 *    their overall shape and relative positioning across states."
 *
 * In Liang's study this was applied as a manual annotation. The
 * pairwise-distance form here is the natural quantitative version:
 * shape preservation = pairwise-distance preservation. It captures the
 * intuition many readers reach for when they say "the relative
 * positions of the nodes" — broader than {@link relativeConsistency}
 * (which is edge-only) and more permissive than
 * {@link positionalConsistency} (which forbids any global
 * translation/rotation).
 *
 * Caveats:
 *  - O(N²) over the persisting subset. Cheap for the small graphs
 *    spytial-core typically renders; large graphs may want a sampled
 *    variant.
 *  - Reflections (mirroring) are detectable here as a positive metric
 *    even though the internal pairwise distances are preserved — the
 *    metric measures Euclidean distance, which is reflection-invariant,
 *    so a pure mirror returns 0. If you need to distinguish
 *    reflections, layer in an orientation check separately.
 *
 * @param prev        Previous-frame layout state.
 * @param curr        Current-frame layout state.
 * @param restrictTo
 *     If provided, only nodes whose id is in this set are considered
 *     when forming pairs. Used to evaluate "key substructure"
 *     preservation per Liang's partial-consistency framing.
 */
export function pairwiseDistanceConsistency(
  prev: LayoutState,
  curr: LayoutState,
  restrictTo?: Set<string>
): number {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  // Build the persisting-and-allowed id list once, in deterministic order.
  const ids: string[] = [];
  for (const p of curr.positions) {
    if (!prevPos.has(p.id)) continue;
    if (restrictTo && !restrictTo.has(p.id)) continue;
    ids.push(p.id);
  }

  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    const ci = currPos.get(ids[i])!;
    const pi = prevPos.get(ids[i])!;
    for (let j = i + 1; j < ids.length; j++) {
      const cj = currPos.get(ids[j])!;
      const pj = prevPos.get(ids[j])!;
      const dCurr = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      const dPrev = Math.hypot(pj.x - pi.x, pj.y - pi.y);
      const diff = dCurr - dPrev;
      total += diff * diff;
    }
  }
  return total;
}

/**
 * Summary for change-emphasis separation.
 *
 * `auc` is the primary score: the probability that a changed persisting
 * node moved farther than a stable persisting node. Higher is better.
 * `0.5` means no rank separation; `1.0` means every changed node moved
 * more than every stable node. `null` means the frame pair has no
 * changed/stable split to compare.
 */
export interface ChangeEmphasisSeparation {
  auc: number | null;
  changedMeanDrift: number | null;
  stableMeanDrift: number | null;
  changedPositional: number | null;
  stablePositional: number | null;
  changedPairwiseDistance: number | null;
  stablePairwiseDistance: number | null;
  changedCount: number;
  stableCount: number;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Change-emphasis separation:
 *
 *     AUC(drift(node), changed-vs-stable)
 *
 * over nodes present in both frames. `changedIds` should contain the
 * semantic-change set for the frame pair, typically nodes whose incident
 * tuples changed. The metric asks whether changed nodes are visually
 * emphasized more than stable nodes.
 *
 * This is motivated by difference-map style dynamic graph evaluation:
 * the visualization should distinguish added/removed/changed elements
 * while not unnecessarily disturbing persistent unchanged context.
 *
 * @param prev       Previous-frame layout state.
 * @param curr       Current-frame layout state.
 * @param changedIds Nodes that should be visually emphasized.
 */
export function changeEmphasisSeparation(
  prev: LayoutState,
  curr: LayoutState,
  changedIds: Set<string>
): ChangeEmphasisSeparation {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);
  const changedDrifts: number[] = [];
  const stableDrifts: number[] = [];

  for (const [id, p] of currPos) {
    const q = prevPos.get(id);
    if (!q) continue;

    const drift = Math.hypot(p.x - q.x, p.y - q.y);
    if (changedIds.has(id)) {
      changedDrifts.push(drift);
    } else {
      stableDrifts.push(drift);
    }
  }

  let auc: number | null = null;
  if (changedDrifts.length > 0 && stableDrifts.length > 0) {
    let wins = 0;
    for (const changed of changedDrifts) {
      for (const stable of stableDrifts) {
        if (changed > stable) {
          wins += 1;
        } else if (changed === stable) {
          wins += 0.5;
        }
      }
    }
    auc = wins / (changedDrifts.length * stableDrifts.length);
  }

  const changedPersistingIds = new Set<string>();
  const stablePersistingIds = new Set<string>();
  for (const [id] of currPos) {
    if (!prevPos.has(id)) continue;
    if (changedIds.has(id)) changedPersistingIds.add(id);
    else stablePersistingIds.add(id);
  }

  return {
    auc,
    changedMeanDrift: mean(changedDrifts),
    stableMeanDrift: mean(stableDrifts),
    changedPositional: changedPersistingIds.size > 0
      ? positionalConsistency(prev, curr, changedPersistingIds)
      : null,
    stablePositional: stablePersistingIds.size > 0
      ? positionalConsistency(prev, curr, stablePersistingIds)
      : null,
    changedPairwiseDistance: changedPersistingIds.size >= 2
      ? pairwiseDistanceConsistency(prev, curr, changedPersistingIds)
      : null,
    stablePairwiseDistance: stablePersistingIds.size >= 2
      ? pairwiseDistanceConsistency(prev, curr, stablePersistingIds)
      : null,
    changedCount: changedDrifts.length,
    stableCount: stableDrifts.length,
  };
}

// ──────────────────────────────────────────────────────────────────
// Constraint adherence — a fairness check, not a consistency metric.
// ──────────────────────────────────────────────────────────────────

/**
 * Minimum shape needed to score constraint adherence: an id, post-solver
 * coordinates, and visual dimensions for the separation calculation.
 * Compatible with `NodeWithMetadata` from the WebCola translator (returned
 * by `runHeadlessLayout`'s `nodes`).
 */
export interface ConstraintAdherenceNode {
  id: string;
  x?: number;
  y?: number;
  visualWidth?: number;
  visualHeight?: number;
  width?: number;
  height?: number;
}

/**
 * Match the translator's `computeHorizontalSeparation`
 * (webcolatranslator.ts:505-518). Half-widths + minDistance + adaptive
 * padding capped at 20px.
 */
function requiredHorizontalSep(
  n1: ConstraintAdherenceNode,
  n2: ConstraintAdherenceNode,
  minDistance: number
): number {
  const w1 = n1.visualWidth ?? n1.width ?? 100;
  const w2 = n2.visualWidth ?? n2.width ?? 100;
  const base = w1 / 2 + w2 / 2 + minDistance;
  const adaptive = Math.min(Math.max(w1, w2) * 0.1, 20);
  return base + adaptive;
}

/**
 * Match the translator's `computeVerticalSeparation`
 * (webcolatranslator.ts:523-535). Half-heights + minDistance + adaptive
 * padding capped at 15px.
 */
function requiredVerticalSep(
  n1: ConstraintAdherenceNode,
  n2: ConstraintAdherenceNode,
  minDistance: number
): number {
  const h1 = n1.visualHeight ?? n1.height ?? 60;
  const h2 = n2.visualHeight ?? n2.height ?? 60;
  const base = h1 / 2 + h2 / 2 + minDistance;
  const adaptive = Math.min(Math.max(h1, h2) * 0.1, 15);
  return base + adaptive;
}

/**
 * Constraint adherence — a *fairness check* on the solver, not a
 * consistency metric on the policy.
 *
 *     adherence = (# enforceable constraints satisfied) / (# enforceable constraints)
 *
 * Returns a value in [0, 1]. 1.0 means every Left/Top/Alignment
 * constraint declared in the layout spec holds at the supplied
 * positions, within tolerance.
 *
 * **Why this earns its keep alongside the consistency metrics.**
 * Consistency metrics measure whether the policy preserved the
 * previous frame; adherence measures whether the *solver* respected
 * the spec, regardless of policy. The two answer different questions:
 *
 *   - In the typical case, adherence will be ≈ 1.0 across every
 *     policy, including `randomPositioning`. That flatness IS the
 *     information: the partial orders the user declared are honored
 *     no matter where the solver started from. `randomPositioning`'s
 *     row staying at 1.0 even though everything else is randomized is
 *     the visible proof that the constraint *forced* the arrangement.
 *
 *   - When adherence drops below 1.0, you have evidence of either an
 *     over-constrained spec or a reduced-iteration solve that exited
 *     before reaching feasibility. Either is worth investigating.
 *
 * Constraint types we score:
 *   - `LeftConstraint(a, b)`:  satisfied iff `b.x − a.x + tol ≥ required horizontal sep`.
 *   - `TopConstraint(a, b)`:   satisfied iff `b.y − a.y + tol ≥ required vertical sep`.
 *   - `AlignmentConstraint(a, b, axis)`: satisfied iff `|a.axis − b.axis| ≤ tol`.
 *
 * `BoundingBoxConstraint` and `GroupBoundaryConstraint` are not
 * translated to WebCola today, so they don't enter the denominator.
 *
 * If there are no enforceable constraints at all, returns 1.0 by
 * convention (vacuous satisfaction).
 *
 * @param constraints  The original `LayoutConstraint[]` from
 *                     `LayoutInstance.generateLayout` /
 *                     `HeadlessLayoutResult.constraints`.
 * @param nodes        Post-solver nodes with at minimum `{id, x, y}`,
 *                     plus optional `visualWidth/visualHeight` for
 *                     accurate separation calculations.
 * @param tol          Slack in px. Default 5 — matches the post-solver
 *                     constraint-satisfaction tolerance used elsewhere.
 */
export function constraintAdherence(
  constraints: LayoutConstraint[],
  nodes: ConstraintAdherenceNode[],
  tol: number = 5
): number {
  const byId = new Map(nodes.map(n => [n.id, n]));
  let total = 0;
  let satisfied = 0;

  for (const c of constraints) {
    if (isLeftConstraint(c)) {
      const left = byId.get(c.left.id);
      const right = byId.get(c.right.id);
      if (!left || !right) continue;
      const required = requiredHorizontalSep(left, right, c.minDistance);
      const actual = (right.x ?? 0) - (left.x ?? 0);
      total += 1;
      if (actual + tol >= required) satisfied += 1;
    } else if (isTopConstraint(c)) {
      const top = byId.get(c.top.id);
      const bottom = byId.get(c.bottom.id);
      if (!top || !bottom) continue;
      const required = requiredVerticalSep(top, bottom, c.minDistance);
      const actual = (bottom.y ?? 0) - (top.y ?? 0);
      total += 1;
      if (actual + tol >= required) satisfied += 1;
    } else if (isAlignmentConstraint(c)) {
      const n1 = byId.get(c.node1.id);
      const n2 = byId.get(c.node2.id);
      if (!n1 || !n2) continue;
      const a = c.axis === 'x' ? (n1.x ?? 0) : (n1.y ?? 0);
      const b = c.axis === 'x' ? (n2.x ?? 0) : (n2.y ?? 0);
      total += 1;
      if (Math.abs(a - b) <= tol) satisfied += 1;
    }
    // BoundingBoxConstraint / GroupBoundaryConstraint: not translated
    // to WebCola, so they don't enter the denominator.
  }

  return total === 0 ? 1 : satisfied / total;
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
  const outputPos = buildPositionMap(policyOutput);
  const stable = new Set<string>();
  for (const [id, p] of outputPos) {
    const q = priorPos.get(id);
    if (!q) continue;
    if (Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol) {
      stable.add(id);
    }
  }
  return stable;
}

// ──────────────────────────────────────────────────────────────────
// Misue mental-map battery
//
// Misue, Eades, Lai, Sugiyama, "Layout adjustment and the mental
// map," JVLC 1995. Three operational criteria for mental-map
// preservation across a transition: orthogonal ordering, k-NN
// proximity, topological structure (the last realized as
// pairwiseDistanceConsistency above). The metrics below cover the
// remaining mental-map dimensions plus two related diagnostics
// (edge crossings, directional coherence, stable quiet ratio).
//
// All metrics consider ONLY persisting nodes/edges. A metric is
// `null` when there is no data to compute it (e.g., < 2 persisting
// nodes for a pair-based metric).
// ──────────────────────────────────────────────────────────────────

/**
 * Edge shape used by the crossings metrics. Only `source` and `target`
 * are read; any superset (such as `EdgeKey`) is accepted.
 */
export interface CrossingEdge {
  source: string;
  target: string;
}

/**
 * Strict line-segment intersection test (no endpoint touches counted).
 * Mirrors the CCW predicate used in derived_metrics.py:_segments_cross.
 */
function segmentsCross(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  // Reject incident edges (shared endpoints).
  if ((p1.x === q1.x && p1.y === q1.y) || (p1.x === q2.x && p1.y === q2.y)) return false;
  if ((p2.x === q1.x && p2.y === q1.y) || (p2.x === q2.x && p2.y === q2.y)) return false;

  const ccw = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

  const d1 = ccw(q1, q2, p1);
  const d2 = ccw(q1, q2, p2);
  const d3 = ccw(p1, p2, q1);
  const d4 = ccw(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Orthogonal ordering preservation (Misue 1995, criterion 1):
 *
 *     fraction of unordered pairs (i, j) ∈ persisting × persisting
 *     such that the L/R relation between i and j AND the U/D relation
 *     between i and j are both the same in prev and curr.
 *
 * Returns a number in [0, 1], or `null` when fewer than 2 persisting
 * nodes exist.
 *
 * @param prev       Previous-frame layout state.
 * @param curr       Current-frame layout state.
 * @param restrictTo If provided, only nodes whose id is in this set
 *                   (still requiring presence in both frames) form
 *                   pairs.
 */
export function orthogonalOrderingPreservation(
  prev: LayoutState,
  curr: LayoutState,
  restrictTo?: Set<string>
): number | null {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  const ids: string[] = [];
  for (const [id] of currPos) {
    if (!prevPos.has(id)) continue;
    if (restrictTo && !restrictTo.has(id)) continue;
    ids.push(id);
  }
  ids.sort();

  if (ids.length < 2) return null;

  let preserved = 0;
  let total = 0;
  for (let a = 0; a < ids.length; a++) {
    const ip = prevPos.get(ids[a])!;
    const ic = currPos.get(ids[a])!;
    for (let b = a + 1; b < ids.length; b++) {
      const jp = prevPos.get(ids[b])!;
      const jc = currPos.get(ids[b])!;

      const xSame =
        (ip.x < jp.x && ic.x < jc.x) ||
        (ip.x > jp.x && ic.x > jc.x) ||
        (ip.x === jp.x && ic.x === jc.x);
      const ySame =
        (ip.y < jp.y && ic.y < jc.y) ||
        (ip.y > jp.y && ic.y > jc.y) ||
        (ip.y === jp.y && ic.y === jc.y);

      if (xSame && ySame) preserved += 1;
      total += 1;
    }
  }
  return total === 0 ? null : preserved / total;
}

/**
 * k-nearest-neighbor Jaccard preservation (Misue 1995, criterion 2):
 *
 *     mean over persisting nodes n of  |knn_prev(n) ∩ knn_curr(n)|
 *                                      ────────────────────────────
 *                                      |knn_prev(n) ∪ knn_curr(n)|
 *
 * Each node's k-NN is computed within the persisting subset only (its
 * neighbors in `prev` are restricted to nodes that also persist).
 * Returns a number in [0, 1], or `null` when fewer than k+1 persisting
 * nodes exist.
 *
 * @param prev       Previous-frame layout state.
 * @param curr       Current-frame layout state.
 * @param k          Neighborhood size. Default 3.
 * @param restrictTo If provided, only nodes whose id is in this set
 *                   (and persist in both frames) participate.
 */
export function knnJaccard(
  prev: LayoutState,
  curr: LayoutState,
  k: number = 3,
  restrictTo?: Set<string>
): number | null {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  const ids: string[] = [];
  for (const [id] of currPos) {
    if (!prevPos.has(id)) continue;
    if (restrictTo && !restrictTo.has(id)) continue;
    ids.push(id);
  }
  ids.sort();

  if (ids.length < k + 1) return null;

  const nearestK = (
    posMap: Map<string, { x: number; y: number }>,
    queryId: string
  ): Set<string> => {
    const q = posMap.get(queryId)!;
    const dists: Array<{ id: string; d: number }> = [];
    for (const other of ids) {
      if (other === queryId) continue;
      const o = posMap.get(other)!;
      dists.push({ id: other, d: Math.hypot(o.x - q.x, o.y - q.y) });
    }
    dists.sort((a, b) => (a.d - b.d) || a.id.localeCompare(b.id));
    return new Set(dists.slice(0, k).map(d => d.id));
  };

  let totalOverlap = 0;
  let count = 0;
  for (const id of ids) {
    const a = nearestK(prevPos, id);
    const b = nearestK(currPos, id);
    const union = new Set([...a, ...b]);
    if (union.size === 0) continue;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter += 1;
    totalOverlap += inter / union.size;
    count += 1;
  }
  return count === 0 ? null : totalOverlap / count;
}

/**
 * Number of edge-segment crossings in a single layout. Strict
 * crossings only — segments that meet at a shared endpoint (incident
 * edges) do not count.
 *
 * @param state   Layout state with positions for the relevant nodes.
 * @param edges   Edges to test. Edges referencing absent nodes are
 *                silently skipped.
 */
export function edgeCrossings(
  state: LayoutState,
  edges: CrossingEdge[]
): number {
  const pos = buildPositionMap(state);
  const segments: Array<{
    a: { x: number; y: number };
    b: { x: number; y: number };
  }> = [];
  for (const e of edges) {
    const a = pos.get(e.source);
    const b = pos.get(e.target);
    if (!a || !b) continue;
    segments.push({ a, b });
  }

  let crossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segmentsCross(segments[i].a, segments[i].b, segments[j].a, segments[j].b)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

/**
 * Absolute change in edge-crossing count between two frames.
 *
 *     |edgeCrossings(curr, currEdges) − edgeCrossings(prev, prevEdges)|
 *
 * 0 when the visual entanglement is unchanged. The metric does not
 * require persisting edges — adding/removing edges contributes to the
 * delta naturally through the per-frame counts.
 */
export function edgeCrossingsDelta(
  prev: LayoutState,
  prevEdges: CrossingEdge[],
  curr: LayoutState,
  currEdges: CrossingEdge[]
): number {
  return Math.abs(edgeCrossings(curr, currEdges) - edgeCrossings(prev, prevEdges));
}

/**
 * Directional coherence of a node set's displacement.
 *
 *     | Σ_{n ∈ ids ∩ persisting, ‖d(n)‖>0}  d(n)/‖d(n)‖ |   /   N
 *
 * where d(n) = curr(n) − prev(n) and N is the number of nodes that
 * actually moved (zero-drift nodes are excluded — their direction is
 * undefined). Returns a number in [0, 1] (the resultant length of unit
 * vectors), or `null` when no node in `ids` moved.
 *
 * Used downstream to test whether changed-context atoms move
 * coherently (1.0 = same direction) versus chaotically (~0).
 */
export function directionalCoherence(
  prev: LayoutState,
  curr: LayoutState,
  ids: Iterable<string>
): number | null {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const id of ids) {
    const p = prevPos.get(id);
    const c = currPos.get(id);
    if (!p || !c) continue;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) continue;
    sx += dx / d;
    sy += dy / d;
    n += 1;
  }
  if (n === 0) return null;
  return Math.hypot(sx, sy) / n;
}

/**
 * Fraction of "stable" nodes whose total displacement stayed below a
 * pixel threshold.
 *
 *     |{ n ∈ stableIds ∩ persisting  :  ‖d(n)‖ ≤ threshold }|
 *     ──────────────────────────────────────────────────────
 *               |stableIds ∩ persisting|
 *
 * Returns a number in [0, 1] (1 = the part the policy claims is
 * unchanged really did not move), or `null` when no stable id
 * persists.
 *
 * @param prev       Previous-frame layout state.
 * @param curr       Current-frame layout state.
 * @param stableIds  Nodes the policy claims are unchanged this step.
 * @param threshold  Per-node displacement tolerance in px. Default 5.
 */
export function stableQuietRatio(
  prev: LayoutState,
  curr: LayoutState,
  stableIds: Iterable<string>,
  threshold: number = 5
): number | null {
  const prevPos = buildPositionMap(prev);
  const currPos = buildPositionMap(curr);

  let total = 0;
  let quiet = 0;
  for (const id of stableIds) {
    const p = prevPos.get(id);
    const c = currPos.get(id);
    if (!p || !c) continue;
    total += 1;
    if (Math.hypot(c.x - p.x, c.y - p.y) <= threshold) quiet += 1;
  }
  return total === 0 ? null : quiet / total;
}

// ──────────────────────────────────────────────────────────────────
// Constraint-induced perturbation — moderator for the appropriateness
// experiment.
//
// When new hard constraints push the prior layout outside the new
// feasible region, no warm-start can fully preserve. Without measuring
// this, "warm-start failure" gets mis-attributed to bad policy when it
// was actually constraint-forced. constraintPerturbation answers: how
// far does the prior layout sit from the new feasible region?
// ──────────────────────────────────────────────────────────────────

/**
 * Total L2 displacement of the closest constraint-feasible projection
 * of the prior positions onto the new constraint set.
 *
 *     Σ_{n ∈ persisting}  ‖ project(prior(n), feasible_new) − prior(n) ‖
 *
 * Returns a non-negative number. 0 means the prior layout already
 * satisfies the new constraints (no constraint-induced perturbation
 * is forced).
 *
 * Implementation: builds a Kiwi.js solver, soft-anchors each prior
 * node at its prior `(x, y)` (weak edit variables — Kiwi minimizes
 * squared deviation from suggested values), hard-adds Left/Top/Alignment
 * constraints from `newConstraints`, solves, sums per-node displacement.
 *
 * Constraint types handled (matching the WebCola translator's Kiwi
 * coverage in `constraint-validator.ts`): `LeftConstraint`,
 * `TopConstraint`, `AlignmentConstraint`. `BoundingBoxConstraint` and
 * `GroupBoundaryConstraint` are not Kiwi-translated today — they are
 * silently skipped. New nodes referenced by constraints but absent
 * from `prev` are given free variables (no anchor) so the constraint
 * is expressible.
 *
 * @param prev            Previous-frame layout state.
 * @param newConstraints  Constraint set in effect for the current frame.
 */
export function constraintPerturbation(
  prev: LayoutState,
  newConstraints: LayoutConstraint[]
): number {
  if (prev.positions.length === 0) return 0;

  // Project the prior layout onto the new feasible region, then sum
  // per-node L2 displacement. positionalOracle owns the Kiwi machinery;
  // this metric is its scalar summary.
  const projected = positionalOracle(prev, newConstraints);
  const projectedById = new Map(projected.positions.map(p => [p.id, p]));

  let total = 0;
  for (const p of prev.positions) {
    const q = projectedById.get(p.id);
    if (!q) continue;
    total += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return total;
}
