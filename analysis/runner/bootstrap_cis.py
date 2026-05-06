"""Bootstrap 95% CIs per (algorithm, policy) cell.

Reads `results/aggregate.csv` (per-transition rows) and `results/derived.csv`
(per-(algorithm, policy, seed) rows) and emits `results/cells.csv` with
one row per (algorithm, policy) and three columns per metric of interest:
`<metric>_mean`, `<metric>_lo`, `<metric>_hi` (95% percentile CI from B
bootstrap resamples).

The contract at `Thesis_Proposal/guzdial-chart.md:59` ("paired analyses
with bootstrap CIs") is what this script exists to satisfy. The report's
per-strategy tables in §3 should quote these CI columns rather than raw
seed-mean point estimates.
"""

from __future__ import annotations

import csv
import os
import random
import statistics
from collections import defaultdict
from typing import Optional

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGGREGATE_PATH = os.path.join(REPO_DIR, "results", "aggregate.csv")
DERIVED_PATH = os.path.join(REPO_DIR, "results", "derived.csv")
OUT_PATH = os.path.join(REPO_DIR, "results", "cells.csv")

N_BOOTSTRAP = 2000
SEED = 0xC0DA

# Metrics from aggregate.csv worth bootstrapping (one row per transition).
AGG_METRICS = [
    "positional", "positional_norm",
    "relative", "relative_norm",
    "pairwise_distance", "pairwise_distance_norm",
    "constraint_adherence",
    "runtime_ms",
    "changed_vs_stable_auc",
    "changed_mean_drift_norm",
    "stable_mean_drift_norm",
    "changed_positional_norm",
    "stable_positional_norm",
]

# Metrics from derived.csv worth bootstrapping (one row per seed-trace).
DERIVED_METRICS = [
    "velocity_mean_norm",
    "acceleration_max_norm",
    "arclength_mean_norm",
    "orthogonal_ordering_preservation",
    "knn_jaccard",
    "edge_crossings_delta_norm",
    "changed_displacement_concentration",
    "directional_coherence",
    "stable_quiet_ratio",
]


def _to_float(s: str) -> Optional[float]:
    if s is None or s == "":
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    if v != v:  # NaN
        return None
    return v


def _bootstrap(values: list[float], n: int = N_BOOTSTRAP
               ) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Returns (mean, lo, hi). If <2 samples, returns (mean, None, None)."""
    if not values:
        return (None, None, None)
    mean = statistics.mean(values)
    if len(values) < 2:
        return (mean, None, None)
    rng = random.Random(SEED)
    means: list[float] = []
    k = len(values)
    for _ in range(n):
        means.append(statistics.mean(rng.choices(values, k=k)))
    means.sort()
    lo = means[int(0.025 * n)]
    hi = means[int(0.975 * n) - 1]
    return (mean, lo, hi)


def _collect(path: str, metrics: list[str]
             ) -> dict[tuple[str, str], dict[str, list[float]]]:
    cells: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row["algorithm"], row["policy"])
            for m in metrics:
                v = _to_float(row.get(m, ""))
                if v is not None:
                    cells[key][m].append(v)
    return cells


def main() -> int:
    if not os.path.exists(AGGREGATE_PATH):
        print(f"missing {AGGREGATE_PATH}; run aggregate.ts first")
        return 1
    if not os.path.exists(DERIVED_PATH):
        print(f"missing {DERIVED_PATH}; run derived_metrics.py first")
        return 1

    agg = _collect(AGGREGATE_PATH, AGG_METRICS)
    der = _collect(DERIVED_PATH, DERIVED_METRICS)

    keys = sorted(set(agg) | set(der))
    metrics = AGG_METRICS + DERIVED_METRICS

    columns = ["algorithm", "policy"]
    for m in metrics:
        columns += [f"{m}_mean", f"{m}_lo", f"{m}_hi", f"{m}_n"]

    with open(OUT_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for algorithm, policy in keys:
            row: dict[str, object] = {"algorithm": algorithm, "policy": policy}
            for m in AGG_METRICS:
                values = agg[(algorithm, policy)].get(m, [])
                mean, lo, hi = _bootstrap(values)
                row[f"{m}_mean"] = "" if mean is None else mean
                row[f"{m}_lo"] = "" if lo is None else lo
                row[f"{m}_hi"] = "" if hi is None else hi
                row[f"{m}_n"] = len(values)
            for m in DERIVED_METRICS:
                values = der[(algorithm, policy)].get(m, [])
                mean, lo, hi = _bootstrap(values)
                row[f"{m}_mean"] = "" if mean is None else mean
                row[f"{m}_lo"] = "" if lo is None else lo
                row[f"{m}_hi"] = "" if hi is None else hi
                row[f"{m}_n"] = len(values)
            w.writerow(row)

    print(f"wrote {OUT_PATH} ({len(keys)} cells, "
          f"{len(metrics)} metrics × 4 columns)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
