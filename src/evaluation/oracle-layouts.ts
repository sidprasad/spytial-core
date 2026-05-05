/**
 * Oracle layouts for the appropriateness experiment.
 *
 * For each transition we want a reference layout `L_oracle` =
 * "the mental-map-preserving feasible layout under the new hard
 * constraints." Per policy P, the gap
 *
 *     gap(P) = positionalConsistency(P_output, L_oracle)
 *
 * measures appropriateness in absolute units. Smaller gap = more
 * appropriate warm-start.
 *
 * Two oracles ship in v1:
 *
 *   • positionalOracle           — the constraint-feasible projection
 *                                  of the prior layout.
 *
 *                                      L = argmin ‖L − prior‖²
 *                                          s.t. L satisfies new constraints
 *
 *                                  Trivially tractable via Kiwi.js. By
 *                                  construction this is the layout the
 *                                  `stability` policy is *trying* to
 *                                  reach, so `gap_positional(stability)`
 *                                  is a sanity check (expected near
 *                                  zero).
 *
 *   • pairwiseDistanceOracle     — the constraint-feasible layout
 *                                  whose pairwise-distance matrix is
 *                                  closest to prior's. Liang TOSEM
 *                                  2026 §3.4 partial-consistency
 *                                  ("key substructures maintain shape")
 *                                  realized as a numerical optimum.
 *                                  Implemented as cola.Layout with one
 *                                  virtual link per node pair.
 *
 * Combinatorial oracles (orthogonal-ordering, k-NN-proximity) are
 * deferred — see plan Phase 5e.
 */

import { Layout as ColaLayout } from 'webcola';
import {
  isLeftConstraint,
  isTopConstraint,
  isAlignmentConstraint,
  type LayoutConstraint,
} from '../layout/interfaces';
import { Solver, Variable, Constraint as KiwiConstraint, Operator, Strength } from 'kiwi.js';
import type { LayoutState } from '../translators/webcola/webcolatranslator';

/**
 * Constraint-feasible projection of the prior layout.
 *
 *     L_oracle_positional = argmin_L  Σ_n ‖L(n) − prior(n)‖²
 *                            s.t.     L satisfies new hard constraints
 *
 * Returns a `LayoutState` containing one position per persisting node,
 * with the same `transform` as the input (positions are in the same
 * pre-transform coordinate space).
 *
 * Uses Kiwi.js: persisting nodes become weak edit-variables suggested
 * at their prior position; constraints are added at `Strength.required`;
 * Kiwi finds the closest feasible point via squared-deviation
 * minimization.
 *
 * Constraint coverage matches the WebCola translator: `LeftConstraint`,
 * `TopConstraint`, `AlignmentConstraint`. `BoundingBoxConstraint` and
 * `GroupBoundaryConstraint` are not Kiwi-translated and are silently
 * skipped.
 */
export function positionalOracle(
  prev: LayoutState,
  newConstraints: LayoutConstraint[]
): LayoutState {
  if (prev.positions.length === 0) {
    return { positions: [], transform: { ...prev.transform } };
  }

  const priorMap = new Map(prev.positions.map(p => [p.id, { x: p.x, y: p.y }]));

  const ids = new Set<string>(priorMap.keys());
  for (const c of newConstraints) {
    if (isLeftConstraint(c)) {
      ids.add(c.left.id);
      ids.add(c.right.id);
    } else if (isTopConstraint(c)) {
      ids.add(c.top.id);
      ids.add(c.bottom.id);
    } else if (isAlignmentConstraint(c)) {
      ids.add(c.node1.id);
      ids.add(c.node2.id);
    }
  }

  const solver = new Solver();
  const xs = new Map<string, Variable>();
  const ys = new Map<string, Variable>();
  for (const id of ids) {
    xs.set(id, new Variable());
    ys.set(id, new Variable());
  }

  for (const c of newConstraints) {
    if (isLeftConstraint(c)) {
      const lx = xs.get(c.left.id)!;
      const rx = xs.get(c.right.id)!;
      solver.addConstraint(
        new KiwiConstraint(lx.plus(c.minDistance ?? 0), Operator.Le, rx, Strength.required)
      );
    } else if (isTopConstraint(c)) {
      const ty = ys.get(c.top.id)!;
      const by = ys.get(c.bottom.id)!;
      solver.addConstraint(
        new KiwiConstraint(ty.plus(c.minDistance ?? 0), Operator.Le, by, Strength.required)
      );
    } else if (isAlignmentConstraint(c)) {
      const v1 = c.axis === 'x' ? xs.get(c.node1.id)! : ys.get(c.node1.id)!;
      const v2 = c.axis === 'x' ? xs.get(c.node2.id)! : ys.get(c.node2.id)!;
      solver.addConstraint(new KiwiConstraint(v1, Operator.Eq, v2, Strength.required));
    }
  }

  for (const [id, p] of priorMap) {
    solver.addEditVariable(xs.get(id)!, Strength.weak);
    solver.addEditVariable(ys.get(id)!, Strength.weak);
    solver.suggestValue(xs.get(id)!, p.x);
    solver.suggestValue(ys.get(id)!, p.y);
  }

  solver.updateVariables();

  const projected = prev.positions.map(p => ({
    id: p.id,
    x: xs.get(p.id)!.value(),
    y: ys.get(p.id)!.value(),
  }));

  return { positions: projected, transform: { ...prev.transform } };
}

/**
 * Options for `pairwiseDistanceOracle`.
 */
export interface PairwiseDistanceOracleOptions {
  /**
   * Cola iteration counts. Default 30 inner / 30 outer. Higher gives a
   * tighter optimum at proportional cost. Test fixtures find ≥ 30
   * iterations sufficient for graphs of typical spytial size (≤ 50
   * nodes).
   */
  iterations?: number;
  /** Figure width passed to cola.Layout. Default 800. */
  figWidth?: number;
  /** Figure height passed to cola.Layout. Default 600. */
  figHeight?: number;
}

/**
 * Constraint-feasible layout that minimizes pairwise-distance
 * deviation from the prior layout.
 *
 *     L_oracle_pwd = argmin_L  Σ_{i,j} (d_L(i,j) − d_prior(i,j))²
 *                    s.t.     L satisfies new hard constraints
 *
 * Implementation: cola.Layout's stress majorization minimizes exactly
 * `Σ w_ij (d_L(i,j) − target_ij)²` subject to its separation
 * constraints. We configure it with one virtual link per unordered
 * pair `(i, j)` of persisting nodes, target length = prior Euclidean
 * distance, and translate `LayoutConstraint`s into cola's
 * `{type: 'separation', axis, left, right, gap}` form.
 *
 * Initialization is at prior positions. Pairwise-distance preservation
 * is translation/rotation invariant, so the unconstrained optimum is a
 * manifold; initializing at prior breaks the symmetry by picking the
 * rigid-frame member closest to the prior layout. Under non-trivial
 * constraints this initialization also speeds convergence.
 *
 * Constraint coverage matches `positionalOracle` —
 * `LeftConstraint` / `TopConstraint` / `AlignmentConstraint` only.
 */
export function pairwiseDistanceOracle(
  prev: LayoutState,
  newConstraints: LayoutConstraint[],
  options: PairwiseDistanceOracleOptions = {}
): LayoutState {
  if (prev.positions.length < 2) {
    return {
      positions: prev.positions.map(p => ({ ...p })),
      transform: { ...prev.transform },
    };
  }

  const iterations = options.iterations ?? 30;
  const figWidth = options.figWidth ?? 800;
  const figHeight = options.figHeight ?? 600;

  // Cola identifies nodes by index. Build the index map first.
  const idToIndex = new Map<string, number>();
  prev.positions.forEach((p, i) => idToIndex.set(p.id, i));

  // Cola mutates the node objects in place (sets x, y); make a working
  // copy so the input LayoutState is not modified.
  const nodes = prev.positions.map((p, i) => ({
    index: i,
    id: p.id,
    x: p.x,
    y: p.y,
  }));

  // One virtual link per unordered pair, target length = prior distance.
  // Skip degenerate pairs (zero distance) — cola fails on length 0.
  const links: Array<{ source: number; target: number; length: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d = Math.hypot(dx, dy);
      if (d > 0) {
        links.push({ source: i, target: j, length: d });
      }
    }
  }

  // Translate Layout constraints to Cola separation constraints by
  // index. Constraints referencing absent nodes are silently dropped
  // (the oracle restricts to persisting nodes only).
  const colaConstraints: Array<{
    type: 'separation';
    axis: 'x' | 'y';
    left: number;
    right: number;
    gap: number;
    equality?: boolean;
  }> = [];
  for (const c of newConstraints) {
    if (isLeftConstraint(c)) {
      const li = idToIndex.get(c.left.id);
      const ri = idToIndex.get(c.right.id);
      if (li !== undefined && ri !== undefined) {
        colaConstraints.push({
          type: 'separation',
          axis: 'x',
          left: li,
          right: ri,
          gap: c.minDistance ?? 0,
        });
      }
    } else if (isTopConstraint(c)) {
      const ti = idToIndex.get(c.top.id);
      const bi = idToIndex.get(c.bottom.id);
      if (ti !== undefined && bi !== undefined) {
        colaConstraints.push({
          type: 'separation',
          axis: 'y',
          left: ti,
          right: bi,
          gap: c.minDistance ?? 0,
        });
      }
    } else if (isAlignmentConstraint(c)) {
      const i1 = idToIndex.get(c.node1.id);
      const i2 = idToIndex.get(c.node2.id);
      if (i1 !== undefined && i2 !== undefined) {
        colaConstraints.push({
          type: 'separation',
          axis: c.axis,
          left: i1,
          right: i2,
          gap: 0,
          equality: true,
        });
      }
    }
  }

  const colaLayout = new ColaLayout()
    .convergenceThreshold(0.01)
    // Pure pairwise-distance preservation — overlap avoidance would
    // add a competing objective the oracle is not asking for.
    .avoidOverlaps(false)
    .handleDisconnected(false)
    .nodes(nodes as any)
    .links(links as any)
    .linkDistance((link: any) => link.length)
    .constraints(colaConstraints as any[])
    .size([figWidth, figHeight]);

  // Stress-majorization phase, no descent / shake. The configuration
  // matches the unconstrained-prior fixed point: starting at prior
  // with target distances = prior distances, stress is exactly 0 and
  // the layout is already optimal.
  colaLayout.start(iterations, 0, 0, 0);

  return {
    positions: nodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
    })),
    transform: { ...prev.transform },
  };
}
