# Computing "the mental-map-preserving thing": complexity notes

This doc records the computational difficulty of producing
constraint-feasible oracle layouts against which warm-start policies
can be scored. It is the companion to
`src/evaluation/oracle-layouts.ts` — the file builds the two oracles
that are tractable; this file explains why the others aren't (yet).

## Setup

For each transition the appropriateness experiment wants

```
L_oracle = argmin_L  d_mental_map(L, prior)
            s.t.    L satisfies the new hard constraints
```

with `d_mental_map` a chosen criterion. Then per policy P,

```
gap(P) = positionalConsistency(P_output, L_oracle)
```

is the appropriateness score: how far the policy lands from the
constraint-feasible mental-map optimum.

The complexity of the experiment is dominated by the cost of computing
`L_oracle` per criterion. Below, *N* = number of persisting nodes,
*C* = number of hard constraints, *K* = solver iterations.

## Tractable oracles (shipped in v1)

### 1. Positional oracle — `positionalOracle`

```
argmin  Σ_n ‖L(n) − prior(n)‖²
s.t.    Left / Top / Alignment constraints
```

**Complexity.** Quadratic objective, linear constraints — a quadratic
program. Kiwi.js (Cassowary's incremental simplex) handles the
weak-edit-variable formulation we use in **near-linear** time per
edit on typical inputs:

- One-shot solve: `O(N + C)` constraint setup, then incremental
  simplex with empirical scaling close to `O((N + C) · log)`.
- Practical cost on spytial-sized graphs (≤ 50 nodes, ≤ 100
  constraints): well under 1 ms.

**Why we ship it.** It is the layout `stability` is *trying* to
reach. `gap_positional(stability)` ≈ 0 is therefore a sanity check on
the WebCola hint-pass — a regression test that fails noisily.

### 2. Pairwise-distance oracle — `pairwiseDistanceOracle`

```
argmin  Σ_{i<j} (d_L(i,j) − d_prior(i,j))²
s.t.    Left / Top / Alignment constraints
```

**Complexity.** Smooth non-convex objective, linear constraints.
Implemented as cola.Layout's stress majorization with one virtual link
per node pair:

- Setup: `O(N²)` virtual links + `O(C)` constraints.
- Per iteration: `O(N² + C)` (pair-stress evaluation + VPSC sweep).
- Total: `O(K · (N² + C))`, K ≈ 30 iterations sufficient for spytial
  sizes.

**Why we ship it.** The natural numerical realization of Liang TOSEM
2026 §3.4 partial-consistency ("key substructures maintain shape").
Translation/rotation invariant, so it captures the
mental-map-shape question independently of where on the canvas the
configuration sits.

## Deferred oracles

These all answer well-formed questions about mental-map preservation,
but no one of them is computable in polynomial time on the general
case. The metrics from `consistency-metrics.ts` still *measure*
preservation along these axes; we just lack a per-criterion optimum
to score the gap against.

### 3. Orthogonal-ordering oracle (Misue criterion 1)

```
maximize  | { (i,j) : prev_x_relation(i,j) preserved AND
                     prev_y_relation(i,j) preserved } |
s.t.      Left / Top / Alignment constraints
```

**Complexity.** Each persisting pair contributes a soft satisfaction
term (preserve x relation? preserve y relation?). Maximizing the count
under hard linear constraints is **MaxSAT / mixed-integer
programming**: NP-hard in general (special cases of betweenness and
linear extensions are NP-complete; Garey & Johnson 1979).

- LP relaxation gives a polynomial-time approximation but no exact
  optimum.
- Exact methods (branch-and-bound on `N(N-1)/2` Boolean choices)
  scale to ~30 nodes before becoming impractical.
- A practical alternative is to enumerate a heuristic preserved subset
  via topological sort of the prev x / y orders intersected with the
  constraint feasibility cone, but the result is not the optimum.

**What this means for spytial.** The metric
`orthogonalOrderingPreservation` is computable in `O(N²)`, so we can
report the score for any policy. But "the actual ordering-optimal
feasible layout" requires NP-hard search; we do not compute it.

### 4. k-NN proximity oracle (Misue criterion 2)

```
maximize  Σ_n |knn_prev(n) ∩ knn_L(n)| / |knn_prev(n) ∪ knn_L(n)|
s.t.      Left / Top / Alignment constraints
```

**Complexity.** The objective is **discrete and non-local**: the
k-nearest-neighbor set of node `n` jumps as positions cross
equidistance hyperplanes. The objective is piecewise constant in `L`
with combinatorially many pieces (`O(N^k)` cells in the worst case).

- Bilevel formulations exist (one level picks neighborhood
  assignments, the other minimizes positional deviation under those
  assignments) but yield non-convex problems with `O(N^k)`
  combinatorial structure.
- Smooth relaxations (e.g., bias toward prior k-NN distances) give a
  pwd-like proxy — which is exactly what the
  `pairwise-distance oracle` already does, locally.
- No standard exact algorithm. Survey: Kuhn et al., "Distance
  metric learning under positional constraints" (line of work that
  formalizes the smoothed problem).

**What this means for spytial.** `knnJaccard` is computable
(`O(N²)` per evaluation). The optimum under hard constraints is not
practically computable for `N` beyond ~10 without heuristic
relaxation.

### 5. Edge-crossings oracle (related, often grouped with mental map)

```
minimize  number of strict edge-segment crossings in L
s.t.      Left / Top / Alignment constraints
```

**Complexity.** Minimum-crossing layout is **NP-hard** even
unconstrained (Garey & Johnson 1983). Adding hard constraints does not
help. Practical approaches are either:

- ILP with `O(E²)` Boolean crossing variables — feasible up to ~100
  edges with a real solver.
- Heuristic: orthogonal layout algorithms with
  bend / crossing minimization (Tamassia 1987), which trade exactness
  for speed.

We compute and report `edgeCrossings` and `edgeCrossingsDelta` but do
not compute a per-transition crossings-minimal oracle.

### 6. "The actual mental map" — composite

A unified oracle that combines criteria 1–4 (and possibly 5) into one
objective requires **a weighting choice that the literature does not
provide** — Misue, Liang, and Archambault each propose different
emphases, and Archambault's empirical critique is precisely that
combining them does not predict user success.

**Complexity.** Inherits from the worst constituent: NP-hard, since
the orthogonal-ordering and edge-crossings components alone are
NP-hard. Even if a weighting were agreed upon, the composite is
intractable on the same scales as criterion 3.

**Practical implication.** The "actual" mental-map-preserving thing
is not computable as a closed-form optimum. The two oracles we ship
are the **tractable proxies** that operationalize the dimensions
where convex / smooth optimization applies.

## Summary table

| Oracle / criterion         | Objective                       | Constraints | Complexity                         | Shipped |
|----------------------------|---------------------------------|-------------|------------------------------------|---------|
| Positional (Penlloy)       | quadratic                       | linear      | poly (Cassowary, near-linear)      | yes     |
| Pairwise-distance (Liang)  | smooth non-convex (stress)      | linear      | `O(K · (N² + C))`, K ≈ 30          | yes     |
| Orthogonal ordering (Misue 1) | combinatorial count          | linear      | NP-hard (MaxSAT / MIP)             | no      |
| k-NN proximity (Misue 2)   | discrete non-local              | linear      | NP-hard / bilevel                  | no      |
| Edge crossings             | combinatorial count             | linear      | NP-hard (Garey & Johnson 1983)     | no      |
| Composite "mental map"     | weighted sum of all above       | linear      | NP-hard                            | no      |

## What the experiment loses by the deferrals

- **`gap_positional`** is computable for every policy → sub-claim
  "warm-start matters at all" is fully testable in absolute units.
- **`gap_pwd`** is computable for every policy → sub-claim
  "appropriate warm-start preserves shape" is fully testable in
  absolute units against the Liang shape-preservation optimum.
- **No `gap_oop`, `gap_knn`, or `gap_crossings`** — for these we
  report the raw metric per policy (computable in `O(N²)` per
  evaluation) and rely on **relative** comparison across policies
  rather than absolute distance from an optimum.

The four-level appropriateness gradient
(`random → ignore → change_emphasis → stability`) plus relative
comparison covers the deferred dimensions adequately for sub-claim
2 ("choice of warm-start matters") even without their per-criterion
oracles. The two shipped oracles cover sub-claim 3 ("appropriate
preserves the mental map") for the dimensions where exact optima are
tractable. Promoting the deferred dimensions to oracles would mostly
sharpen reporting magnitudes, not change the experiment's structure.
