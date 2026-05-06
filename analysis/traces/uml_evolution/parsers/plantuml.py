"""Minimal PlantUML parser for class and component diagrams.

Goal: parse a `.puml` file into a typed graph
({nodes: [{id, kind, label}], edges: [{source, target, kind}]}) so
that successive frames of the same diagram can be diffed and rendered
through the existing harness.

Out of scope (intentional, for the GD short-paper sweep):
- sequence diagrams (lifelines, activations)
- activity / state diagrams (start/end nodes, decisions)
- skinparam, !define, !include, !theme directives
- nested packages beyond one level
- stereotypes (parsed and stored as a property, but not branched on)

If the parser hits a construct it doesn't recognise, it logs a
warning and skips that line. The goal is partial coverage that
extracts enough structure for layout, not roundtrip fidelity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# ──────────────────────────────────────────────────────────────────────
# Token patterns
# ──────────────────────────────────────────────────────────────────────

# Strip @startuml / @enduml fences; comments; blank lines.
_FENCE_RE = re.compile(r"^\s*@(?:start|end)uml\b.*$", re.IGNORECASE)
_COMMENT_RE = re.compile(r"^\s*'.*$|^\s*/'.*?'/\s*$", re.DOTALL)

# Class / interface / enum declarations.
#   class Foo
#   class Foo<T> << stereotype >> { fields ... }
#   abstract class Foo extends Bar
_CLASS_RE = re.compile(
    r"""^\s*
        (?P<kind>(?:abstract\s+)?class|interface|enum|annotation|component|node|package)
        \s+
        ["']?(?P<name>[A-Za-z_][\w<>.]*)["']?
        (?:\s*<<\s*(?P<stereotype>[^>]+?)\s*>>)?
        (?:\s*\{[^}]*\})?
        \s*$
    """,
    re.VERBOSE,
)

# Edge declarations (associations, inheritance, composition, dependency).
#   Foo --> Bar
#   Foo <|-- Bar
#   Foo *-- Bar
#   Foo -- Bar : label
# We capture the operator string and classify it below.
_EDGE_RE = re.compile(
    r"""^\s*
        ["']?(?P<src>[A-Za-z_][\w.]*)["']?
        (?:\s*"[^"]*")?                  # optional source multiplicity ("1", "*", "0..1", ...)
        \s*
        (?P<arrow>[<>|*o.+\-]+)
        \s*
        (?:"[^"]*"\s*)?                  # optional target multiplicity
        ["']?(?P<dst>[A-Za-z_][\w.]*)["']?
        (?:\s*:\s*(?P<label>.+?))?
        \s*$
    """,
    re.VERBOSE,
)

# Edge-arrow → edge kind classifier. Matches any substring on either side.
_ARROW_KIND = [
    ("inherit", re.compile(r"<\|--|--\|>")),
    ("compose", re.compile(r"\*--|--\*")),
    ("aggregate", re.compile(r"o--|--o")),
    ("realize",  re.compile(r"<\|\.\.|\.\.\|>")),
    ("depend",   re.compile(r"<\.\.|\.\.>|\.\.")),
    ("assoc",    re.compile(r"<--|-->|--")),
]


# ──────────────────────────────────────────────────────────────────────
# Public types
# ──────────────────────────────────────────────────────────────────────


@dataclass
class Node:
    id: str
    kind: str
    stereotype: Optional[str] = None


@dataclass
class Edge:
    source: str
    target: str
    kind: str
    label: Optional[str] = None


@dataclass
class Diagram:
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "nodes": [
                {"id": n.id, "kind": n.kind,
                 **({"stereotype": n.stereotype} if n.stereotype else {})}
                for n in self.nodes
            ],
            "edges": [
                {"source": e.source, "target": e.target, "kind": e.kind,
                 **({"label": e.label} if e.label else {})}
                for e in self.edges
            ],
        }


# ──────────────────────────────────────────────────────────────────────
# Parser
# ──────────────────────────────────────────────────────────────────────


def _classify_arrow(arrow: str) -> str:
    """Return a coarse edge kind for the arrow operator string."""
    for kind, pattern in _ARROW_KIND:
        if pattern.search(arrow):
            return kind
    return "assoc"


def parse(text: str) -> Diagram:
    """Parse a PlantUML source string into a typed Diagram.

    Implicit-node references (an edge mentioning a name not yet
    declared as a class) are auto-promoted to nodes of kind "class".
    PlantUML accepts this, and we follow that convention.
    """
    diagram = Diagram()
    seen: set[str] = set()

    # 1) Strip fences and comments line-by-line, and collapse multi-line
    #    `class Foo { ... }` bodies into the single declaration line.
    raw_lines = text.splitlines()
    lines: list[str] = []
    in_body_depth = 0
    for raw in raw_lines:
        if _FENCE_RE.match(raw) or _COMMENT_RE.match(raw):
            continue
        if not raw.strip():
            continue
        stripped = raw.rstrip()
        # Skip lines inside a multi-line `{ ... }` class body. We just
        # need the declaration line; the field/method content does not
        # affect graph structure.
        if in_body_depth > 0:
            in_body_depth += stripped.count("{") - stripped.count("}")
            in_body_depth = max(in_body_depth, 0)
            continue
        opens = stripped.count("{")
        closes = stripped.count("}")
        if opens > closes:
            in_body_depth += opens - closes
            stripped = stripped.split("{", 1)[0].rstrip()
        lines.append(stripped)

    # 2) First pass: explicit declarations.
    for ln in lines:
        m = _CLASS_RE.match(ln)
        if m:
            name = m["name"].strip()
            kind = m["kind"].strip().split()[-1].lower()
            stereo = m["stereotype"].strip() if m["stereotype"] else None
            if name not in seen:
                diagram.nodes.append(Node(id=name, kind=kind, stereotype=stereo))
                seen.add(name)
            continue

    # 3) Second pass: edges (auto-promote implicit endpoints).
    for ln in lines:
        if _CLASS_RE.match(ln):
            continue
        m = _EDGE_RE.match(ln)
        if not m:
            if any(c.isalpha() for c in ln) and not ln.lstrip().startswith(
                ("skinparam", "title", "header", "footer", "left", "right",
                 "top", "bottom", "!", "hide", "show", "scale", "package",
                 "namespace", "}", "{", "note", "legend", "caption")
            ):
                diagram.warnings.append(f"unparsed: {ln[:80]}")
            continue
        src, dst = m["src"], m["dst"]
        for end in (src, dst):
            if end not in seen:
                diagram.nodes.append(Node(id=end, kind="class"))
                seen.add(end)
        diagram.edges.append(Edge(
            source=src,
            target=dst,
            kind=_classify_arrow(m["arrow"]),
            label=m["label"].strip() if m["label"] else None,
        ))

    return diagram


# ──────────────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────────────


if __name__ == "__main__":
    sample = """\
@startuml
class Order {
  +id: int
  +place(): void
}
class Customer
class LineItem << value >>
Customer "1" --> "*" Order : places
Order *-- LineItem
Order ..> PaymentService
@enduml
"""
    d = parse(sample)
    import json
    print(json.dumps(d.to_dict(), indent=2))
    if d.warnings:
        print("WARNINGS:", *d.warnings, sep="\n  ")
