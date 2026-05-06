"""Spytial-annotated UML data classes.

The mining pipeline (`mine.py`) parses a `.puml` file at each commit,
builds an instance of `UMLDiagram` whose `nodes` and `edges` lists
mutate frame-to-frame, and the existing `CnDDataInstanceBuilder` (with
`preserve_object_ids=True`) does the rest. Object identity is the
identity carrier across frames: a class node that survives between
two commits keeps its Python `id`, and the spytial builder gives it
the same atom ID, so the realization-policy harness can recognize it
as a persisting atom.

This is the same pattern the algorithm trace generators follow
(`traces/algorithms/dsu.py:DSUNode`, etc.).
"""

from __future__ import annotations
from typing import List, Optional

from spytial.annotations import attribute, hideAtom, inferredEdge


# A persistent identity registry. The mining pipeline calls `intern()`
# for each (kind, qualified_name) it sees in any commit's diagrams; the
# returned UMLNode instance is reused across every commit it appears
# in. That keeps the Python `id()` stable, which is what the spytial
# builder uses to assign stable atom IDs.
_REGISTRY: dict[tuple[str, str], "UMLNode"] = {}


@attribute(field="qname")
@attribute(field="kind")
class UMLNode:
    """A class / interface / component / enum / package node.

    `qname` is the fully-qualified name (parser-derived). `kind` is
    one of {class, interface, enum, annotation, component, node,
    package}.
    """

    def __init__(self, kind: str, qname: str, stereotype: Optional[str] = None):
        self.kind = kind
        self.qname = qname
        self.stereotype = stereotype


# UMLEdge tuples carry the edge kind so the renderer can style
# inheritance vs composition vs association differently. The selector
# extracts (source, target) so the existing harness sees them as
# directed edges; the kind is exposed as an inferredEdge attribute.
EDGE_SELECTOR = "{src : (UMLEdge.source), dst : (UMLEdge.target) | true}"


@inferredEdge(selector=EDGE_SELECTOR, name="ref")
@hideAtom(selector="UMLEdge")
class UMLEdge:
    def __init__(self, source: UMLNode, target: UMLNode, kind: str,
                 label: Optional[str] = None):
        self.source = source
        self.target = target
        self.kind = kind
        self.label = label


# orientation directives are emitted lazily by the renderer; declarative
# spec for UML class diagrams stays minimal in the trace harness
@hideAtom(selector="list + UMLDiagram + str + NoneType + int")
class UMLDiagram:
    """The root snapshot. Mining pipeline replaces `nodes` and `edges`
    in place between commits; the builder sees a sequence of related
    instances."""

    def __init__(self):
        self.nodes: List[UMLNode] = []
        self.edges: List[UMLEdge] = []


def intern_node(kind: str, qname: str,
                stereotype: Optional[str] = None) -> UMLNode:
    """Return the canonical UMLNode for (kind, qname).

    First call creates a new instance and caches it; subsequent calls
    return the same object. Stable Python `id()` across calls is what
    the spytial builder uses to assign stable atom IDs across frames.
    """
    key = (kind, qname)
    node = _REGISTRY.get(key)
    if node is None:
        node = UMLNode(kind=kind, qname=qname, stereotype=stereotype)
        _REGISTRY[key] = node
    elif stereotype and not node.stereotype:
        node.stereotype = stereotype
    return node


def reset_registry() -> None:
    """Drop the interned UMLNode cache. Call between independent traces
    (one per repo) so node identity is not carried across repos."""
    _REGISTRY.clear()
