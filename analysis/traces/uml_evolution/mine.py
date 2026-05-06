"""Git-history mining pipeline for the UML-evolution trace family.

Walks one OSS repository's history, picks out every commit that
modifies a PlantUML file matching the configured glob, parses the
file content into a typed graph at each commit, and yields
(label, UMLDiagram) tuples for the trace pipeline.

Usage:
  python -m traces.uml_evolution.mine --slug eclipse/microprofile-config
  python -m traces.uml_evolution.mine --all   # every repo in repos.json

Output: traces/out/uml-<slug-flat>.trace.json, in the same schema as
the algorithm traces, so the existing `runner/run.ts` consumes them
without modification.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Iterator, Optional

from spytial.provider_system import CnDDataInstanceBuilder
from spytial.annotations import serialize_to_yaml_string

from traces.uml_evolution.parsers import plantuml
from traces.uml_evolution.uml import (
    UMLDiagram, UMLEdge, intern_node, reset_registry,
)


REPO_DIR = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_DIR / "traces" / "uml_evolution" / "cache"
OUT_DIR = REPO_DIR / "traces" / "out"
REPOS_JSON = REPO_DIR / "traces" / "uml_evolution" / "repos.json"


# ──────────────────────────────────────────────────────────────────────
# Git plumbing
# ──────────────────────────────────────────────────────────────────────


def _run(cmd: list[str], cwd: Optional[Path] = None) -> str:
    return subprocess.check_output(cmd, cwd=cwd, text=True).strip()


def _ensure_clone(slug: str, *, depth: Optional[int] = None) -> Path:
    """Shallow-clone the repo into cache/<slug-flat>/. Returns the path.

    If already present, fetches latest origin/HEAD instead of recloning.
    """
    flat = slug.replace("/", "__")
    target = CACHE_DIR / flat
    if target.exists() and (target / ".git").exists():
        try:
            _run(["git", "fetch", "origin", "--quiet"], cwd=target)
        except subprocess.CalledProcessError:
            pass
        return target
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    args = ["git", "clone", "--quiet"]
    if depth is not None:
        args += ["--depth", str(depth)]
    args += [f"https://github.com/{slug}.git", str(target)]
    _run(args)
    return target


def _commits_touching(repo: Path, glob: str, *,
                      max_commits: int = 100) -> list[str]:
    """SHAs of commits (oldest → newest) that modified any path matching
    `glob`. Returns at most `max_commits` SHAs.
    """
    out = _run(
        ["git", "log", "--reverse", "--pretty=format:%H",
         f"--max-count={max_commits}", "--", glob],
        cwd=repo,
    )
    return [s for s in out.splitlines() if s]


def _files_at(repo: Path, sha: str, glob: str) -> list[str]:
    """Paths matching `glob` at commit `sha`."""
    out = _run(["git", "ls-tree", "-r", "--name-only", sha], cwd=repo)
    return [p for p in out.splitlines() if fnmatch.fnmatch(p, glob)]


def _read_at(repo: Path, sha: str, path: str) -> str:
    return _run(["git", "show", f"{sha}:{path}"], cwd=repo)


# ──────────────────────────────────────────────────────────────────────
# PlantUML → UMLDiagram
# ──────────────────────────────────────────────────────────────────────


def _build_diagram(parsed_files: list[plantuml.Diagram]) -> UMLDiagram:
    """Merge the parsed Diagrams from every PlantUML file at one commit
    into a single UMLDiagram, interning nodes through the registry so
    object identity is stable across commits.
    """
    diag = UMLDiagram()
    seen_node_ids: set[int] = set()
    for parsed in parsed_files:
        for n in parsed.nodes:
            node = intern_node(kind=n.kind, qname=n.id, stereotype=n.stereotype)
            if id(node) not in seen_node_ids:
                diag.nodes.append(node)
                seen_node_ids.add(id(node))
        for e in parsed.edges:
            src = intern_node(kind="class", qname=e.source)
            dst = intern_node(kind="class", qname=e.target)
            if id(src) not in seen_node_ids:
                diag.nodes.append(src)
                seen_node_ids.add(id(src))
            if id(dst) not in seen_node_ids:
                diag.nodes.append(dst)
                seen_node_ids.add(id(dst))
            diag.edges.append(UMLEdge(src, dst, kind=e.kind, label=e.label))
    return diag


def snapshot_at(repo: Path, sha: str, glob: str) -> Optional[UMLDiagram]:
    """Build the UMLDiagram for a single commit. Returns None if no
    matching files exist at that commit (defensive — earlier
    `_commits_touching` should have already filtered).
    """
    paths = _files_at(repo, sha, glob)
    if not paths:
        return None
    parsed_diagrams = []
    for p in paths:
        try:
            text = _read_at(repo, sha, p)
        except subprocess.CalledProcessError:
            continue
        parsed_diagrams.append(plantuml.parse(text))
    if not parsed_diagrams:
        return None
    return _build_diagram(parsed_diagrams)


# ──────────────────────────────────────────────────────────────────────
# Trace assembly
# ──────────────────────────────────────────────────────────────────────


def trace(slug: str, glob: str, max_commits: int = 50) -> Iterator[tuple[str, UMLDiagram]]:
    """Yield (label, UMLDiagram) for each commit (oldest first).

    Label is a short SHA (8 chars) — the harness uses it as the
    transition's `from_label` / `to_label` for diff reporting.
    """
    reset_registry()
    repo = _ensure_clone(slug)
    shas = _commits_touching(repo, glob, max_commits=max_commits)
    if not shas:
        raise RuntimeError(
            f"no commits in {slug} touch glob {glob!r} (check repos.json)"
        )
    for sha in shas:
        diag = snapshot_at(repo, sha, glob)
        if diag is None:
            continue
        yield (sha[:8], diag)


def build_trace(slug: str, glob: str, max_commits: int) -> dict:
    snapshots = list(trace(slug, glob, max_commits))
    if not snapshots:
        raise RuntimeError(f"trace for {slug} produced 0 frames")

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
        "algorithm": f"uml-{slug.replace('/', '__')}",
        "spec": spec_yaml,
        "frames": frames,
    }


def write_trace(data: dict, slug: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    flat = slug.replace("/", "__")
    path = OUT_DIR / f"uml-{flat}.trace.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    return path


# ──────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────


def _load_repos() -> list[dict]:
    with open(REPOS_JSON, encoding="utf-8") as f:
        return json.load(f)["repos"]


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--slug", help="GitHub slug (org/repo) to mine")
    p.add_argument("--glob", help="PlantUML path glob (overrides repos.json)")
    p.add_argument("--max-commits", type=int, default=None,
                   help="Cap on commits per repo (overrides repos.json)")
    p.add_argument("--all", action="store_true",
                   help="Mine every repo listed in repos.json")
    args = p.parse_args(argv)

    repos = _load_repos()
    if args.all:
        targets = repos
    elif args.slug:
        match = next((r for r in repos if r["slug"] == args.slug), None)
        if not match:
            match = {"slug": args.slug, "puml_glob": args.glob,
                     "max_commits": args.max_commits or 50}
        if not match.get("puml_glob"):
            p.error("--glob required when --slug is not in repos.json")
        targets = [match]
    else:
        p.error("--slug or --all required")

    rc = 0
    for r in targets:
        slug = r["slug"]
        glob = args.glob or r["puml_glob"]
        cap = args.max_commits or r.get("max_commits", 50)
        try:
            data = build_trace(slug, glob, cap)
            path = write_trace(data, slug)
            print(f"wrote {path} ({len(data['frames'])} frames)")
        except Exception as exc:
            print(f"FAILED {slug}: {exc}", file=sys.stderr)
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
