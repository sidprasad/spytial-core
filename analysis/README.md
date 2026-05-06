# spytial-core / analysis

> **This subdirectory is the sequence-policy analysis harness. It is not
> shipped with the npm package.** `package.json` restricts publishing to
> `dist/browser` and `dist/components`, so everything under `analysis/`
> is excluded from the published artifact. The browser bundle (built by
> `tsup.browser.config.ts` from `src/index.ts`) does not import anything
> from `analysis/` either, so production users incur no cost from its
> presence.
>
> Run from the repo root with:
>
> ```
> npm run analysis:run --      <trace.json>            # one trace
> npm run analysis:run --      --all-traces --all-policies --seeds 1,2,3
> npm run analysis:aggregate                            # per-run JSONs → aggregate.csv
> npm run analysis:test                                 # smoke test (full pipeline, slow)
> ```
>
> Outputs land in `analysis/results/` and are gitignored.

Originally lived as a separate repo (`spytial-sequence-analysis/`); merged
into spytial-core so the runner, traces, and notebook track the same
commits as the policies and metrics they evaluate. The original docs
follow.

---

Sequencing-policy analysis harness for spytial-core. Runs CLRS
tree-like data structure traces through every realization policy and emits the
metric vector specified in the thesis evaluation contract
(`Thesis_Proposal/guzdial-chart.md:36,141-148`, RQ6.2).

## Pipeline

```
Python (traces/)                          TypeScript (runner/)
─────────────────                         ─────────────────────
algorithm step  ──build_instance──►  trace.json  ──runHeadlessLayout──►  per-run.json
                                                          │
                                                          └── policy × seed sweep
                                                                     │
                                                                     ▼
                                                              aggregate.csv
```

## Algorithms covered

Four CLRS algorithms spanning four different data-structure paradigms:

| Module          | Source                                      | Operations                  |
| --------------- | ------------------------------------------- | --------------------------- |
| `rbtree.py`     | `spytial-clrs/src/trees.ipynb`              | insert + delete (CLRS Ch. 13) |
| `dsu.py`        | `spytial-clrs/src/disjoint-sets.ipynb`      | MAKE-SET + UNION (CLRS Ch. 21) |
| `dijkstra.py`   | `spytial-clrs/src/graphs.ipynb` (Graph)     | Dijkstra on CLRS Fig 24.6   |
| `heap.py`       | `spytial-clrs/src/heaps.ipynb`              | insert + extract-max (CLRS Ch. 6) |

Class definitions copied verbatim from the spytial-clrs source notebooks.

## Quickstart

```bash
# 1. Generate a trace
python -m traces.generate --algorithm rbtree

# 2. Run it through one policy
npx tsx runner/run.ts traces/out/rbtree-default.trace.json --policy stability --seed 1

# 3. Sweep all policies/seeds
npx tsx runner/run.ts --all-traces --all-policies --seeds 1,2,3

# 4. Aggregate to CSV (raw + *_norm columns)
npx tsx runner/aggregate.ts

# 5. Compute derived metrics (smoothness, Misue battery, inconsistency)
python3 runner/derived_metrics.py

# 6. Bootstrap 95% CIs per (algorithm, policy) cell
python3 runner/bootstrap_cis.py

# 7. Render the per-algorithm analysis notebook
python3 scripts/build_notebook.py
jupyter nbconvert --to notebook --execute analysis.ipynb --inplace
```

Per-run results land in `results/per-run/`; the aggregate CSV in
`results/aggregate.csv`; per-cell bootstrap CIs in
`results/cells.csv`.

## Normalization

`aggregate.csv` and `derived.csv` carry `*_norm` companions for every
squared-px metric. The denominator is the prior frame's bounding-box
diagonal: `positional_norm = positional / (n_persisting × diag²)`,
similarly for `pairwise_distance` (over pairs) and for the two-level
split. `relative_norm` divides by `n_edges × mean_edge_length²`.
Smoothness norms (`velocity_*_norm`, `arclength_mean_norm`,
`acceleration_max_norm`) divide by the trace-mean diagonal; the
`*_norm` quantities are the cross-paradigm-comparable view, since the
four CLRS algorithms render into different absolute viewports.

## Trace-data hazard: container-atom identity

Earlier versions of `traces/algorithms/dsu.py` returned a fresh Python
`list` from each `snapshot()` call. The spytial-py builder gave the
fresh list a fresh atom ID, which rewired every `DSUNode`'s
edge-fingerprint via the `list.idx` relation, which made every node
look context-changed every frame and degenerated
`changed_vs_stable_auc` to NaN. Fixed by returning a stable-identity
list. This is a *general* hazard: any sequence-encoding that wraps
frame data in a fresh container per frame will have the same problem
in the partial-consistency framework. The fix is to ensure container
atoms persist across frames — equivalent to spytial-py's
`SequenceRecorder` pattern of using a single shared
`CnDDataInstanceBuilder` across snapshots.

## Metric columns

`results/aggregate.csv` — whole-frame and two-level split:

- **Whole-frame:** `positional`, `relative`, `pairwise_distance`,
  `constraint_adherence`, `runtime_ms`, `solver_failure`.
- **Two-level split** on persisting nodes — for *every* policy, not just
  `change_emphasis`. A persisting node is "changed-context" if its
  incident-edge fingerprint differs between frames; otherwise
  "stable-context". From
  `spytial-core/src/translators/webcola/sequence-policy.ts:208`. Columns:
  `changed_count`, `stable_count`, `changed_vs_stable_auc`,
  `changed_mean_drift`, `stable_mean_drift`, `changed_positional`,
  `stable_positional`, `changed_pairwise_distance`,
  `stable_pairwise_distance`.

`results/derived.csv` — three further families produced by
`runner/derived_metrics.py`:

- **Smoothness** (Friedrich & Eades 2002): `velocity_max`,
  `velocity_mean`, `acceleration_max`, `arclength_mean` — per-atom
  motion across the whole trace, not just frame pairs.
- **Mental-map structural** (Misue, Eades, Lai, Sugiyama 1995):
  `orthogonal_ordering_preservation`, `knn_jaccard`,
  `edge_crossings_delta` — what classical mental-map metrics say about
  each policy.
- **Inconsistency / salience** (constructed): `changed_displacement_concentration`
  (Gini), `directional_coherence` (mean resultant length), `stable_quiet_ratio`
  — when a policy is *supposed* to introduce change, is the change
  focal, directional, and clean?

The closest prior work is **Diehl & Görg (GD 2002), "Graphs, they are
changing"**, which frames the change-stability tradeoff this harness
runs. See `analysis.ipynb` § References for the full bibliography.

## Non-goals

- No new policies invented here — only the four in `sequence-policy.ts`.
- No user study; structural metrics only.
- No Forge temporal traces in the first cut.
