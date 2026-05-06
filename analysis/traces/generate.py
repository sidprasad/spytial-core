"""Generate trace JSON files for the TS runner.

Usage:
  python -m traces.generate --algorithm bst --keys 15,6,18,17,20,3,7
  python -m traces.generate --all
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
from typing import Any, Iterable

from spytial.provider_system import CnDDataInstanceBuilder
from spytial.annotations import serialize_to_yaml_string


REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_DIR, "traces", "out")


# Default operation sequences per algorithm. Each entry says how
# `algorithms.<module>.trace(...)` is invoked.
DEFAULTS: dict[str, dict[str, Any]] = {
    # Pointer tree with rotations (CLRS Ch. 13). Insert phase exercises
    # left/right-rotate fix-ups; delete phase exercises the harder
    # delete-fixup recolor + rotation cases.
    "rbtree": {
        "module": "traces.algorithms.rbtree",
        "kind": "rbtree",
        "insert_keys": [26, 17, 41, 47, 30, 38, 35],
        "delete_keys": [26, 41],
    },
    # Forest with path compression + union by rank (CLRS Ch. 21).
    # Mixed MAKE-SET / UNION sequence.
    "dsu": {
        "module": "traces.algorithms.dsu",
        "kind": "dsu",
        "operations": [
            ("make_set", "f"), ("make_set", "d"), ("make_set", "g"),
            ("make_set", "b"), ("make_set", "h"), ("make_set", "c"),
            ("make_set", "e"),
            ("union", "h", "b"), ("union", "c", "h"), ("union", "c", "e"),
            ("union", "d", "g"), ("union", "f", "d"), ("union", "f", "c"),
        ],
    },
    # Fixed graph + evolving distance attributes (CLRS Ch. 24, Fig 24.6).
    # Atoms persist across every frame; only `dist` and `pred` change.
    "dijkstra": {
        "module": "traces.algorithms.dijkstra",
        "kind": "dijkstra",
        "source_key": "s",
    },
    # Array-backed implicit binary tree (CLRS Ch. 6). Insert phase
    # builds the heap with sift-up; extract-max phase shrinks it with
    # sift-down.
    "heap": {
        "module": "traces.algorithms.heap",
        "kind": "heap",
        "insert_keys": [4, 1, 3, 2, 16, 9, 10, 14, 8, 7],
        "extract_count": 3,
    },
}


def _invoke_trace(algorithm: str):
    """Dispatch to the right `trace(...)` signature for each algorithm."""
    cfg = DEFAULTS[algorithm]
    mod = importlib.import_module(cfg["module"])
    if not hasattr(mod, "trace"):
        raise RuntimeError(f"{cfg['module']} has no trace() function")
    kind = cfg["kind"]
    if kind == "rbtree":
        return mod.trace(cfg["insert_keys"], cfg.get("delete_keys", []))
    if kind == "dsu":
        return mod.trace(cfg["operations"])
    if kind == "dijkstra":
        return mod.trace(cfg.get("source_key", "s"))
    if kind == "heap":
        return mod.trace(cfg["insert_keys"], cfg.get("extract_count", 0))
    raise ValueError(f"unknown trace kind {kind!r}")


def _algorithm_label(algorithm: str) -> str:
    cfg = DEFAULTS[algorithm]
    kind = cfg["kind"]
    if kind == "rbtree":
        return "rbtree-insert+delete"
    if kind == "dsu":
        return "dsu-makeset+union"
    if kind == "dijkstra":
        return "dijkstra-shortest-paths"
    if kind == "heap":
        return "heap-insert+extract"
    return algorithm


def build_trace(algorithm: str) -> dict[str, Any]:
    snapshots = _invoke_trace(algorithm)

    # Single shared builder so atom IDs stay stable across frames for
    # in-place-mutated objects (id(obj) is preserved). Matches the
    # SequenceRecorder pattern in spytial-py.
    builder = CnDDataInstanceBuilder(preserve_object_ids=True)

    frames = []
    merged_decorators: dict[str, list] = {"constraints": [], "directives": []}

    for step, (label, snap) in enumerate(snapshots):
        instance = builder.build_instance(snap)
        decorators = builder.get_collected_decorators()
        for k in ("constraints", "directives"):
            merged_decorators[k].extend(decorators.get(k, []))
        frames.append({"step": step, "label": label, "instance": instance})

    spec_yaml = serialize_to_yaml_string(merged_decorators)
    return {
        "algorithm": _algorithm_label(algorithm),
        "spec": spec_yaml,
        "frames": frames,
    }


def write_trace(trace_data: dict[str, Any], algorithm: str, suffix: str = "default") -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{algorithm}-{suffix}.trace.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(trace_data, f, indent=2, default=str)
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--algorithm", choices=sorted(DEFAULTS.keys()))
    parser.add_argument("--suffix", default="default", help="Output filename suffix")
    parser.add_argument("--all", action="store_true", help="Generate all default traces")
    args = parser.parse_args(argv)

    if args.all:
        for algo in DEFAULTS:
            data = build_trace(algo)
            path = write_trace(data, algo, suffix="default")
            print(f"wrote {path} ({len(data['frames'])} frames)")
        return 0

    if not args.algorithm:
        parser.error("--algorithm or --all required")

    data = build_trace(args.algorithm)
    path = write_trace(data, args.algorithm, suffix=args.suffix)
    print(f"wrote {path} ({len(data['frames'])} frames)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
