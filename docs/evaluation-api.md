# Evaluation API

A small public surface for **headless consistency analysis** of spytial-core
layouts — running the layout pipeline outside the browser and scoring
sequence-policy output against three visual-consistency metrics (Penlloy
PLATEAU 2025 §6.2 and Liang TOSEM 2026 §3.4 partial-consistency) plus a
`constraintAdherence` fairness check on the solver. See
[`webcola-demo/sequence-metrics-demo.html`](../webcola-demo/sequence-metrics-demo.html)
for an interactive walkthrough.

> Intended for evaluation, not production rendering. The renderer's
> tuning lives in [`webcola-cnd-graph.ts`](../src/translators/webcola/webcola-cnd-graph.ts);
> evaluation's job is to use that production setup faithfully.

---

## What's exported

From the package root:

```ts
import {
  // headless layout pipeline
  runHeadlessLayout,
  type HeadlessLayoutOptions,
  type HeadlessLayoutResult,

  // Visual-consistency metrics (Penlloy PLATEAU 2025 §6.2 + Liang TOSEM 2026 §3.4)
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  changeEmphasisSeparation,
  constraintAdherence,
  classifyChangeEmphasisChangedSet,
  classifyChangeEmphasisStableSet,
  type EdgeKey,
  type ChangeEmphasisSeparation,
  type ConstraintAdherenceNode,
} from 'spytial-core';
```

| Export                              | What it does                                                                              |
|-------------------------------------|-------------------------------------------------------------------------------------------|
| `runHeadlessLayout`                 | `LayoutSpec + IDataInstance → post-solver positions`. No DOM, no d3.                      |
| `positionalConsistency`             | `Σ ‖D(n) − D'(n)‖²` over persisting nodes. Squared L2. (Penlloy PLATEAU 2025 §6.2.)        |
| `relativeConsistency`               | `Σ ‖(D(n₂)−D(n₁))−(D'(n₂)−D'(n₁))‖²` over persisting edges. Squared L2. (Penlloy §6.2.)   |
| `pairwiseDistanceConsistency`       | `Σ (d_curr(i,j) − d_prev(i,j))²` over unordered persisting node pairs. Translation- and rotation-invariant; operationalizes Liang TOSEM 2026 §3.4 partial-consistency. |
| `changeEmphasisSeparation`          | AUC-style score asking whether semantically changed persisting nodes moved farther than stable persisting nodes. Higher is better; `1.0` is perfect separation, `0.5` is no separation. |
| `constraintAdherence`               | Fraction in `[0,1]` of `Left`/`Top`/`Alignment` constraints satisfied at the post-solver positions. Per-frame fairness check on the solver. |
| `classifyChangeEmphasisChangedSet`  | Returns the exact changed-node set used internally by `changeEmphasis` to decide which prior positions to jitter. |
| `classifyChangeEmphasisStableSet`   | Recovers the stable subset for a `stable-node-reflow`-style policy from its output.       |

The scoring functions are pure over `LayoutState` (and, for
`constraintAdherence`, over the solver's `LayoutConstraint[]` and
node geometry). You don't need `runHeadlessLayout` to compute them if
you have positions from elsewhere.

---

## The recipe

```ts
import {
  parseLayoutSpec,
  JSONDataInstance,
  stability,
  runHeadlessLayout,
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  constraintAdherence,
} from 'spytial-core';

const spec = parseLayoutSpec(`
  constraints:
    - orientation:
        selector: next
        directions:
          - right
`);

const prevInstance = new JSONDataInstance({
  atoms: [
    { id: 'A', type: 'Node', label: 'A' },
    { id: 'B', type: 'Node', label: 'B' },
  ],
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }],
  }],
});

const currInstance = new JSONDataInstance({
  atoms: [
    { id: 'A', type: 'Node', label: 'A' },
    { id: 'B', type: 'Node', label: 'B' },
    { id: 'C', type: 'Node', label: 'C' },
  ],
  relations: [{
    id: 'next', name: 'next', types: ['Node', 'Node'],
    tuples: [
      { atoms: ['A', 'B'], types: ['Node', 'Node'] },
      { atoms: ['B', 'C'], types: ['Node', 'Node'] },
    ],
  }],
});

// 1. Lay out the previous frame from scratch.
const prevResult = await runHeadlessLayout(spec, prevInstance);

// 2. Lay out the current frame under the `stability` policy.
const currResult = await runHeadlessLayout(spec, currInstance, {
  policy: stability,
  prevInstance,
  currInstance,
  priorPositions: prevResult.positions,
});

// 3. Score consistency.
const positional = positionalConsistency(prevResult.positions, currResult.positions);
const relative = relativeConsistency(
  prevResult.positions, prevResult.edges,
  currResult.positions, currResult.edges,
);
const pairwise = pairwiseDistanceConsistency(prevResult.positions, currResult.positions);
const adherence = constraintAdherence(currResult.constraints, currResult.nodes);

console.log({ positional, relative, pairwise, adherence });
```

- `positional` is `Σ ‖D(n) − D'(n)‖²` over nodes present in both frames.
- `relative` is the same sum over edges present in both frames, of
  edge-vector deltas.
- `pairwise` is `Σ (d_curr(i,j) − d_prev(i,j))²` over unordered persisting
  node pairs — translation- and rotation-invariant, so a rigidly
  translated/rotated layout scores 0 even when `positional` and
  `relative` do not.
- `adherence` is in `[0,1]`: the fraction of `Left`/`Top`/`Alignment`
  constraints the solver actually satisfied at the returned positions.

The first three are 0 when the corresponding consistency type holds
exactly; `adherence` is 1 when every applicable constraint is met.

---

## What the metrics measure

For two diagrams `D'` (previous) and `D` (current), with `D(n) ∈ ℝ²`:

```
positional(D, D') = Σ ‖D(n) − D'(n)‖²       n ∈ nodes(D) ∩ nodes(D')

relative(D, D')   = Σ ‖(D(n₂) − D(n₁)) − (D'(n₂) − D'(n₁))‖²
                    (n₁, n₂) ∈ edges(D) ∩ edges(D')

pairwise(D, D')   = Σ (‖D(i) − D(j)‖ − ‖D'(i) − D'(j)‖)²
                    {i, j} ⊆ nodes(D) ∩ nodes(D'),  i ≠ j
```

`positional` and `relative` are lifted verbatim from §6.2 of:

> Liang, Palliyil, Kang, Sunshine. *Towards Better Formal Methods Visualizations.* PLATEAU 2025. doi:[10.1184/R1/29086949.v1](https://doi.org/10.1184/R1/29086949.v1)

`pairwise` is a computational form of the Liang TOSEM 2026 §3.4
partial-consistency notion: it scores how much the *shape* of the node
set deformed between frames, independent of any rigid translation or
rotation.

Penlloy's framing distinguishes **hard** consistency (the metric is a
constraint that must equal 0) from **soft** consistency (the metric is
in the objective and yields under other constraint pressure).
spytial-core's `stability` policy implements **soft** positional
consistency: it minimizes drift but does not enforce zero.

`constraintAdherence(constraints, nodes, tol = 5)` is not a
between-frame metric — it's a per-frame fairness check on the solver,
asking what fraction of the `LayoutConstraint[]` returned by
`LayoutInstance.generateLayout` are actually satisfied at the
post-solver positions. Useful when probing whether a policy's locking
strategy starves the solver of feasibility (e.g., randomPositioning
typically scores ~1.0 here, since constraints are still emitted; a
policy that locks endpoints inconsistently would not).

---

## Two modes for `runHeadlessLayout`

**Direct.** Pass `priorPositions` (and optionally `lockUnconstrainedNodes`)
to manage prior state yourself.

```ts
runHeadlessLayout(spec, currInstance, {
  priorPositions: prevState,
  lockUnconstrainedNodes: true,
});
```

**Policy-driven.** Pass `policy`, `prevInstance`, `currInstance`. The
API applies the policy and uses its `effectivePriorState` plus
`useReducedIterations` to set `lockUnconstrainedNodes`, matching
production semantics in
[`webcola-cnd-graph.ts:1645-1678`](../src/translators/webcola/webcola-cnd-graph.ts).

```ts
runHeadlessLayout(spec, currInstance, {
  policy: changeEmphasis,
  prevInstance,
  currInstance,
  priorPositions: prevState,
});
```

If both are supplied, policy-driven wins.

---

## Mapping built-in policies to predicted metric values

For any benchmark scenario:

| Built-in policy       | `positional`                         | `relative`                            | `pairwise`                            | `adherence` |
|-----------------------|--------------------------------------|---------------------------------------|---------------------------------------|-------------|
| `ignoreHistory`       | high                                 | high                                  | high                                  | ≈ 1         |
| `randomPositioning`   | very high                            | very high                             | very high                             | ≈ 1         |
| `stability`           | low (≈ 0 when constraints permit)    | low (downstream of positional)        | low                                   | ≈ 1         |
| `changeEmphasis`      | low on stable subset; high on reflow | low on stable-stable edges            | low on stable subset                  | ≈ 1         |

The headline observation from the demo: `randomPositioning` blows up
the three consistency metrics by orders of magnitude while
`adherence` stays near 1 — the solver still satisfies the spec on
every frame; it just discards inter-frame continuity. The other three
metrics are the ones that distinguish policies.

Use `classifyChangeEmphasisStableSet(prior, policyOutput)` to recover
the stable/reflow split from a `changeEmphasis` invocation:

```ts
import { changeEmphasis, classifyChangeEmphasisStableSet } from 'spytial-core';

const policyResult = changeEmphasis.apply({
  priorState, prevInstance, currInstance, spec,
});
const stableSet = classifyChangeEmphasisStableSet(priorState, policyResult.effectivePriorState!);
const stablePositional = positionalConsistency(priorState, currResult.positions, stableSet);
```

For a direct change-emphasis conjecture check, use the same changed-node
classifier that `changeEmphasis` uses internally, then pass that set to
`changeEmphasisSeparation`:

```ts
const changedIds = classifyChangeEmphasisChangedSet(prevInstance, currInstance);
const separation = changeEmphasisSeparation(prevResult.positions, currResult.positions, changedIds);
// separation.auc: higher is better; 1.0 perfect, 0.5 no rank separation
// separation also reports changed/stable positional and pairwise costs
```

---

## Caveats

- **`stability` holds singleton closure state.** Two evaluation runs
  through the same `stability` reference share the same recall cache.
  Calling `stability.apply({ priorState: { positions: [], ... }, ... })`
  resets it. (Source:
  [`sequence-policy.ts:316-348`](../src/translators/webcola/sequence-policy.ts).)
- **`HeadlessLayoutOptions` does not expose iteration counts or the
  convergence threshold.** They match production's reduced-iterations
  path. Adding a knob here would let evaluation drift from production
  semantics — defeating the purpose.
- **Soft vs hard consistency is a property of the policy, not this API.**
  spytial-core's `stability` is soft (drifts under constraint
  pressure); a Penlloy-style hard variant would require runtime
  changes outside this API's scope.

---

## Test topology

Three test files exercise the evaluation API and the policies, in
increasing order of cost. Run via `npm run test:run -- <file>`.

| File | Tier | What it asserts | Cost |
|---|---|---|---|
| [`tests/sequence-policy-metrics-pbt.test.ts`](../tests/sequence-policy-metrics-pbt.test.ts) | 1 — pure metric algebra (PBT) | Non-negativity, symmetry, translation invariance, restrict-to subset monotonicity for `positional` / `relative` / `pairwise`; rotation invariance for `pairwise`; range/permutation/vacuous/satisfied/violated for `constraintAdherence`; idempotence and tolerance-ball semantics for the classifier. 200 trials per property. | ~150 ms |
| [`tests/sequence-policy-apply-pbt.test.ts`](../tests/sequence-policy-apply-pbt.test.ts) | 2 — policy `apply()` invariants (PBT) | `ignoreHistory` always returns `{ undefined, false }`; `stability` preserves shared-atom positions exactly; `changeEmphasis` is deterministic and respects viewport + jitter range; `randomPositioning` covers every curr atom and stays in bounds. 100 trials per property. | ~80 ms |
| [`tests/sequence-policy-consistency-metrics.test.ts`](../tests/sequence-policy-consistency-metrics.test.ts) | 3 — full-pipeline behavioural (example-based) | Per-policy promises observed at the **post-solver** positions on a small fixed benchmark of five scenarios (identity, relation change, atom add/remove, restructure). | ~300 ms |

PBT (Tiers 1 and 2) catches regressions across a wide input space
cheaply; example-based Tier 3 covers full-pipeline behaviour where
PBT trial cost would balloon (cola.Layout runs ≈ 200-900 ms per
trial). End-to-end PBT through the solver is deliberately deferred
until a specific class of inputs surfaces a regression worth
generalising; see the May 14 follow-up
([routine](https://claude.ai/code/routines/trig_01BF8tevRZXFyuwGtZnxE5Yn)).

Reusable arbitraries for sequence-policy PBT live in
[`tests/helpers/sequence-policy-arbitraries.ts`](../tests/helpers/sequence-policy-arbitraries.ts).
