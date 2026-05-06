# spytial-core / analysis

> **This subdirectory is the sequence-policy analysis harness. It is not
> shipped with the npm package.** `package.json` restricts publishing to
> `dist/browser` and `dist/components`, so everything under `analysis/`
> is excluded from the published artifact. The browser bundle (built by
> `tsup.browser.config.ts` from `src/index.ts`) does not import anything
> from `analysis/` either, so production users incur no cost from its
> presence.

## Pipeline

```
trace.json  ──runHeadlessLayout──►  per-run.json
                       │
                       └── policy × seed sweep
                                  │
                                  ▼
                           aggregate.csv
```

## Layout

```
analysis/
├── runner/                      The harness itself
│   ├── run.ts                   Replays trace.json under each (policy, seed) → per-run.json
│   ├── aggregate.ts             Sweeps per-run JSONs → aggregate.csv with raw + _norm columns
│   ├── metrics.ts               Re-exports of consistency / Misue / oracle metrics from spytial-core
│   ├── policies.ts              Re-exports of canonical SequencePolicy bindings from spytial-core
│   ├── derived_metrics.py       Post-hoc Python: smoothness, Misue battery, inconsistency / salience
│   └── bootstrap_cis.py         Bootstrap 95% CIs per (algorithm, policy) cell
├── tests/
│   └── smoke.test.ts            stability ≤ ignore_history on aggregate (RB-tree fixture)
├── traces/
│   └── out/*.trace.json         Pre-generated input traces (4 algorithms — see below)
├── pyproject.toml               Python deps for derived_metrics + bootstrap
└── README.md                    This file
```

## Quickstart from repo root

```bash
# Run one trace through one policy
npm run analysis:run -- analysis/traces/out/rbtree-default.trace.json \
                        --policy stability --seed 1

# Full sweep across every policy / trace / seed
npm run analysis:run -- --all-traces --all-policies --seeds 1,2,3

# Aggregate per-run JSONs → CSV (raw + _norm columns)
npm run analysis:aggregate

# Smoke test (slow — drives the full layout pipeline through every policy)
npm run analysis:test

# Post-hoc Python (smoothness, Misue battery, inconsistency / salience)
python3 analysis/runner/derived_metrics.py
python3 analysis/runner/bootstrap_cis.py
```

Outputs land in `analysis/results/` and are gitignored.

## Trace fixtures

The four `traces/out/*.trace.json` files are pre-generated inputs the
harness reads. They cover four CLRS algorithms (red-black tree, disjoint
set union, Dijkstra, max-heap) and were produced by Python generators
that originally lived in this directory; the generators have been moved
out of this co-located harness because they are research-input
machinery, not part of the harness itself. Re-cloning new fixtures is a
separate concern.

## What the columns in `aggregate.csv` mean

Each `_norm` column is interpretable as **fraction of theoretical
worst** for its underlying metric — i.e., a "% from ideal" reading in
[0, 1]. 0 = ideal (no drift / no gap / already feasible); 1 = every
persisting element contributed its theoretical maximum (corner-to-corner
drift, full pairwise warp, etc.). See the inline header comment in
`runner/aggregate.ts` for the per-column denominators, and
`docs/MENTAL_MAP_ORACLE_COMPLEXITY.md` at the spytial-core repo root for
why some criteria (orthogonal-ordering, k-NN, edge-crossings) have raw
metrics but no oracle gap (they are NP-hard to optimize exactly).

## How to read all the metrics

Three families, three questions:

| Family | The question it answers | Which metrics |
|---|---|---|
| **Consistency** — did the layout stay similar? | "How preserved is X across this transition?" | `positional`, `relative`, `pairwise_distance`, `orthogonal_ordering_preservation`, `knn_jaccard` |
| **Salience** — did the right things move? | "Is the changed bit emphasized and the stable bit quiet?" | `changed_vs_stable_auc`, `directional_coherence`, `stable_quiet_ratio`, `edge_crossings_delta` |
| **Appropriateness** — is the policy close to optimal? | "How far from the constraint-feasible mental-map ideal?" | `gap_positional`, `gap_pwd` |
| Moderator | "How forced was the change at all?" | `constraint_perturbation` |

The headline metric is **`gap_pwd_norm`** — fraction of theoretical
worst, smaller = more appropriate warm-start.
