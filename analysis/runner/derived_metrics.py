"""Derived metrics: smoothness, Misue mental-map, and inconsistency.

Reads enriched per-run JSONs from `results/per-run/*.result.json` (must
contain top-level `frames` with positions+edges and per-transition
`changed_ids`/`stable_ids`) and emits `results/derived.csv`.

Three families of metrics, beyond what `consistency-metrics.ts` reports:

1. **Smoothness** (Friedrich & Eades 2001, "Graph drawing in motion"):
   * `velocity_max` — max single-frame displacement of any persisting
     atom across the trace.
   * `velocity_mean` — mean per-atom-frame displacement.
   * `acceleration_max` — max single-frame change in displacement.
   * `arclength_mean` — mean total path-length traveled by an atom
     across the whole trace.

2. **Mental-map structural** (Misue, Eades, Lai, Sugiyama 1995, "Layout
   adjustment and the mental map"):
   * `orthogonal_ordering_preservation` — fraction of (i, j) atom pairs
     whose left/right and up/down ordering survived a transition.
   * `knn_jaccard` — for each persisting atom, Jaccard overlap of its
     k=3 nearest-neighbor sets at consecutive frames.
   * `edge_crossings_delta` — absolute change in the number of
     edge-segment crossings per transition.

3. **Inconsistency / salience** (no canonical citation; constructed):
   * `changed_displacement_concentration` — Gini coefficient of drifts
     among changed-context atoms. High = focal change; low = smear.
   * `stable_quiet_ratio` — fraction of stable-context atoms whose drift
     is below a small threshold (5 px). High = the still part is truly
     still.
   * `directional_coherence` — mean resultant length of the unit
     direction-of-motion vectors among changed atoms. 1.0 = all moving
     together; 0.0 = scattered.

References (full citations in `analysis.ipynb` § References):
- Misue/Eades/Lai/Sugiyama JVLC 1995 (mental map)
- Friedrich/Eades GD 2001 (smoothness, dynamic stress)
- Diehl/Görg GD 2002 (foresighted layout / change-stability tradeoff)
"""

from __future__ import annotations

import csv
import glob
import json
import math
import os
import statistics
from collections import defaultdict
from typing import Iterable, Optional

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PER_RUN_DIR = os.path.join(REPO_DIR, "results", "per-run")
OUT_PATH = os.path.join(REPO_DIR, "results", "derived.csv")

QUIET_THRESHOLD_PX = 5.0
KNN_K = 3


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _positions_at(frame) -> Optional[dict[str, tuple[float, float]]]:
    if frame.get("failed") or not frame.get("positions"):
        return None
    return {p["id"]: (p["x"], p["y"]) for p in frame["positions"]}


def _drifts(prev: dict, curr: dict, ids: Iterable[str]) -> list[float]:
    out: list[float] = []
    for i in ids:
        if i not in prev or i not in curr:
            continue
        dx = curr[i][0] - prev[i][0]
        dy = curr[i][1] - prev[i][1]
        out.append(math.hypot(dx, dy))
    return out


def _safe_mean(xs: list[float]) -> Optional[float]:
    return statistics.mean(xs) if xs else None


def _safe_max(xs: list[float]) -> Optional[float]:
    return max(xs) if xs else None


def _bbox_diag(positions: dict[str, tuple[float, float]]) -> float:
    if not positions:
        return 0.0
    xs = [p[0] for p in positions.values()]
    ys = [p[1] for p in positions.values()]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


def _trace_mean_diag(frames: list) -> float:
    """Mean bounding-box diagonal across all frames with positions.

    Used as the denominator for smoothness `*_norm` columns so that
    per-atom velocity / arclength readings are comparable across traces
    rendered into different absolute pixel extents.
    """
    diags = []
    for fr in frames:
        pos = _positions_at(fr)
        if pos:
            d = _bbox_diag(pos)
            if d > 0:
                diags.append(d)
    return statistics.mean(diags) if diags else 0.0


def _norm(value: Optional[float], scale: float) -> Optional[float]:
    if value is None or scale <= 0:
        return None
    return value / scale


# ──────────────────────────────────────────────────────────────────────
# Smoothness
# ──────────────────────────────────────────────────────────────────────


def smoothness(frames: list) -> dict:
    """Per-atom velocity / acceleration / arclength across the trace.

    For each atom, we track its position across the consecutive frames
    in which it exists. Atoms that appear/disappear are accumulated only
    for the frames they're present in.
    """
    pos_by_frame = [(_positions_at(fr) or {}) for fr in frames]
    if len(pos_by_frame) < 2:
        return dict(velocity_max=None, velocity_mean=None,
                    acceleration_max=None, arclength_mean=None)

    # atom_id → list of (frame_index, x, y) for frames where the atom is present
    paths: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for i, pos in enumerate(pos_by_frame):
        for aid, (x, y) in pos.items():
            paths[aid].append((i, x, y))

    all_velocities: list[float] = []
    all_accelerations: list[float] = []
    arclengths: list[float] = []

    for aid, path in paths.items():
        if len(path) < 2:
            continue
        velocities: list[float] = []
        for (a_i, a_x, a_y), (b_i, b_x, b_y) in zip(path, path[1:]):
            if b_i != a_i + 1:
                # Atom skipped a frame; treat each contiguous segment
                # separately. Skip discontinuities.
                continue
            velocities.append(math.hypot(b_x - a_x, b_y - a_y))
        if not velocities:
            continue
        all_velocities.extend(velocities)
        arclengths.append(sum(velocities))
        accels = [abs(v2 - v1) for v1, v2 in zip(velocities, velocities[1:])]
        all_accelerations.extend(accels)

    return dict(
        velocity_max=_safe_max(all_velocities),
        velocity_mean=_safe_mean(all_velocities),
        acceleration_max=_safe_max(all_accelerations),
        arclength_mean=_safe_mean(arclengths),
    )


# ──────────────────────────────────────────────────────────────────────
# Misue mental-map battery
# ──────────────────────────────────────────────────────────────────────


def orthogonal_ordering_preservation(prev: dict, curr: dict) -> Optional[float]:
    """Fraction of atom-pairs that preserve their L/R + U/D ordering.

    Misue et al. 1995. We count a pair (i, j) as "preserved" iff both
    the x-ordering and the y-ordering are the same in prev and curr
    (with strict inequality treated as 0.5 for ties to avoid bias).
    """
    common = sorted(set(prev) & set(curr))
    if len(common) < 2:
        return None
    preserved = 0
    total = 0
    for a in range(len(common)):
        for b in range(a + 1, len(common)):
            i, j = common[a], common[b]
            xi_p, yi_p = prev[i]
            xj_p, yj_p = prev[j]
            xi_c, yi_c = curr[i]
            xj_c, yj_c = curr[j]
            x_same = ((xi_p < xj_p and xi_c < xj_c) or
                      (xi_p > xj_p and xi_c > xj_c) or
                      (xi_p == xj_p and xi_c == xj_c))
            y_same = ((yi_p < yj_p and yi_c < yj_c) or
                      (yi_p > yj_p and yi_c > yj_c) or
                      (yi_p == yj_p and yi_c == yj_c))
            if x_same and y_same:
                preserved += 1
            total += 1
    return preserved / total if total else None


def knn_jaccard(prev: dict, curr: dict, k: int = KNN_K) -> Optional[float]:
    """Mean Jaccard overlap of k-NN sets across persisting atoms."""
    common = sorted(set(prev) & set(curr))
    if len(common) < k + 1:
        return None

    def knn(pos: dict, query: str) -> set[str]:
        qx, qy = pos[query]
        dists = [(other, math.hypot(pos[other][0] - qx, pos[other][1] - qy))
                 for other in common if other != query]
        dists.sort(key=lambda t: t[1])
        return {t[0] for t in dists[:k]}

    overlaps: list[float] = []
    for atom in common:
        a = knn(prev, atom)
        b = knn(curr, atom)
        union = a | b
        if not union:
            continue
        overlaps.append(len(a & b) / len(union))
    return _safe_mean(overlaps)


def _segments_cross(p1, p2, q1, q2) -> bool:
    """Strict line-segment crossing test (no endpoint touches counted)."""
    def ccw(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    # Reject shared endpoints (incident edges).
    if p1 == q1 or p1 == q2 or p2 == q1 or p2 == q2:
        return False
    d1 = ccw(q1, q2, p1)
    d2 = ccw(q1, q2, p2)
    d3 = ccw(p1, p2, q1)
    d4 = ccw(p1, p2, q2)
    return ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
           ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0))


def edge_crossings(positions: dict, edges: list) -> int:
    segs = []
    for e in edges:
        s, t = e["source"], e["target"]
        if s in positions and t in positions:
            segs.append((positions[s], positions[t]))
    crossings = 0
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            if _segments_cross(segs[i][0], segs[i][1], segs[j][0], segs[j][1]):
                crossings += 1
    return crossings


# ──────────────────────────────────────────────────────────────────────
# Inconsistency / salience
# ──────────────────────────────────────────────────────────────────────


def gini(xs: list[float]) -> Optional[float]:
    """Gini coefficient on a list of non-negative values. Higher = more
    concentrated (one value dominates). 0 = uniform; ~1 = one wins all."""
    if not xs or sum(xs) == 0:
        return None
    n = len(xs)
    sorted_xs = sorted(xs)
    cum = 0.0
    for i, x in enumerate(sorted_xs, 1):
        cum += i * x
    return (2 * cum) / (n * sum(sorted_xs)) - (n + 1) / n


def directional_coherence(prev: dict, curr: dict, ids: Iterable[str]) -> Optional[float]:
    """Mean resultant length of unit displacement vectors. R in [0,1].

    1.0 = every changed atom moves in the same direction; 0.0 = no
    coherence. Atoms with zero drift are excluded (their direction is
    undefined)."""
    sx = sy = 0.0
    n = 0
    for i in ids:
        if i not in prev or i not in curr:
            continue
        dx = curr[i][0] - prev[i][0]
        dy = curr[i][1] - prev[i][1]
        d = math.hypot(dx, dy)
        if d == 0:
            continue
        sx += dx / d
        sy += dy / d
        n += 1
    if n == 0:
        return None
    return math.hypot(sx, sy) / n


def stable_quiet_ratio(prev: dict, curr: dict, stable_ids: list[str],
                       threshold: float = QUIET_THRESHOLD_PX) -> Optional[float]:
    drifts = _drifts(prev, curr, stable_ids)
    if not drifts:
        return None
    quiet = sum(1 for d in drifts if d <= threshold)
    return quiet / len(drifts)


# ──────────────────────────────────────────────────────────────────────
# Per-run aggregation
# ──────────────────────────────────────────────────────────────────────


def _per_transition_metrics(frames: list, transitions: list) -> dict:
    """Aggregate per-transition Misue + inconsistency metrics into a
    single (algo, policy, seed) row by averaging across transitions."""
    oop_vals, knn_vals = [], []
    ec_vals, ec_norm_vals = [], []
    gini_vals, coh_vals, quiet_vals = [], [], []

    for t in transitions:
        if t.get("solver_failure"):
            continue
        idx = t["transition_index"]
        prev_frame = frames[idx]
        curr_frame = frames[idx + 1]
        prev_pos = _positions_at(prev_frame)
        curr_pos = _positions_at(curr_frame)
        if not prev_pos or not curr_pos:
            continue

        oop = orthogonal_ordering_preservation(prev_pos, curr_pos)
        if oop is not None:
            oop_vals.append(oop)
        knn = knn_jaccard(prev_pos, curr_pos)
        if knn is not None:
            knn_vals.append(knn)

        prev_edges = prev_frame.get("edges") or []
        curr_edges = curr_frame.get("edges") or []
        prev_ec = edge_crossings(prev_pos, prev_edges)
        curr_ec = edge_crossings(curr_pos, curr_edges)
        ec_delta = abs(curr_ec - prev_ec)
        ec_vals.append(ec_delta)
        denom_edges = max(len(prev_edges), len(curr_edges))
        if denom_edges > 0:
            ec_norm_vals.append(ec_delta / denom_edges)

        changed_ids = t.get("changed_ids") or []
        stable_ids = t.get("stable_ids") or []

        if changed_ids:
            cdrifts = _drifts(prev_pos, curr_pos, changed_ids)
            g = gini(cdrifts)
            if g is not None:
                gini_vals.append(g)
            r = directional_coherence(prev_pos, curr_pos, changed_ids)
            if r is not None:
                coh_vals.append(r)
        if stable_ids:
            q = stable_quiet_ratio(prev_pos, curr_pos, stable_ids)
            if q is not None:
                quiet_vals.append(q)

    return dict(
        orthogonal_ordering_preservation=_safe_mean(oop_vals),
        knn_jaccard=_safe_mean(knn_vals),
        edge_crossings_delta=_safe_mean(ec_vals),
        edge_crossings_delta_norm=_safe_mean(ec_norm_vals),
        changed_displacement_concentration=_safe_mean(gini_vals),
        directional_coherence=_safe_mean(coh_vals),
        stable_quiet_ratio=_safe_mean(quiet_vals),
    )


def derive_one(path: str) -> dict:
    with open(path) as f:
        r = json.load(f)
    frames = r.get("frames") or []
    transitions = r.get("transitions") or []

    diag = _trace_mean_diag(frames)

    row = dict(
        algorithm=r["algorithm"],
        policy=r["policy"],
        seed=r["seed"],
        num_frames=r.get("num_frames"),
        num_transitions=r.get("num_transitions"),
        trace_mean_diag=diag if diag > 0 else None,
    )
    sm = smoothness(frames)
    row.update(sm)
    # Normalized smoothness: divide each linear-pixel quantity by the
    # mean per-frame bounding-box diagonal so that velocities and
    # arclengths read as "fraction of frame" instead of raw pixels.
    row["velocity_max_norm"] = _norm(sm.get("velocity_max"), diag)
    row["velocity_mean_norm"] = _norm(sm.get("velocity_mean"), diag)
    row["acceleration_max_norm"] = _norm(sm.get("acceleration_max"), diag)
    row["arclength_mean_norm"] = _norm(sm.get("arclength_mean"), diag)
    row.update(_per_transition_metrics(frames, transitions))
    return row


def main() -> int:
    paths = sorted(glob.glob(os.path.join(PER_RUN_DIR, "*.result.json")))
    if not paths:
        print(f"no per-run results at {PER_RUN_DIR}")
        return 1

    rows = [derive_one(p) for p in paths]
    columns = list(rows[0].keys())

    with open(OUT_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})

    print(f"wrote {OUT_PATH} ({len(rows)} rows, {len(columns)} columns)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
