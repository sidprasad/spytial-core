"""Dijkstra's shortest-paths algorithm on a weighted graph.

The Graph class is adapted from spytial-clrs/src/graphs.ipynb (the
weighted-graph form). We extend `GNode` with `dist` and `pred` attributes
that are mutated as Dijkstra relaxes edges, and adjust the spec so the
graph structure is fixed across frames while the per-node distance is
visualized as a node attribute (and a `pred` edge highlights the
shortest-path tree as it grows).

The fixed graph is the one used in CLRS Fig 24.6 (Dijkstra's example):
  s --1--> t      s --10-> y
  t --2--> y      t --3--> x
  y --9--> x      y --4--> t   y --2--> z
  x --4--> z
  z --7--> s      z --6--> x
"""

from __future__ import annotations
from typing import List, Tuple, Optional

from spytial.annotations import attribute, hideAtom, inferredEdge, orientation


# Fixed-arity edge selector: tuples (u, v, w). Same shape as
# spytial-clrs/src/graphs.ipynb's EDGE_SELECTOR but renamed locally for
# clarity.
EDGE_SELECTOR = "{u : (tuple.t0), w : (tuple.t2), v : (tuple.t1) | some(u.~t0 & v.~t1 & w.~t2)}"


@attribute(field="key")
@attribute(field="dist")
class GNode:
    def __init__(self, key):
        self.key = key
        self.dist = float("inf")
        self.pred: Optional["GNode"] = None


@inferredEdge(selector=EDGE_SELECTOR, name='edge')
@hideAtom(selector='list + tuple + Graph + int + str + NoneType + float')
class Graph:
    def __init__(self):
        self.adj: List[Tuple[GNode, GNode, int]] = []

    def add_edge(self, u: GNode, v: GNode, w: int):
        self.adj.append((u, v, w))

    def neighbors(self, u: GNode):
        for src, dst, w in self.adj:
            if src is u:
                yield dst, w


def initialize_single_source(graph: Graph, source: GNode, nodes: List[GNode]):
    """CLRS Fig 24.5 — INITIALIZE-SINGLE-SOURCE."""
    for n in nodes:
        n.dist = float("inf")
        n.pred = None
    source.dist = 0


def relax(u: GNode, v: GNode, w: int) -> bool:
    """Return True if v's distance was updated."""
    if v.dist > u.dist + w:
        v.dist = u.dist + w
        v.pred = u
        return True
    return False


def build_clrs_example() -> Tuple[Graph, dict]:
    """Build CLRS Fig 24.6: a 5-node directed weighted graph.

    Returns (graph, {key: GNode}) so the caller can pick a source by key.
    """
    keys = ["s", "t", "y", "x", "z"]
    nodes = {k: GNode(k) for k in keys}
    g = Graph()
    edges = [
        ("s", "t", 10), ("s", "y", 5),
        ("t", "y", 2),  ("t", "x", 1),
        ("y", "t", 3),  ("y", "x", 9),  ("y", "z", 2),
        ("x", "z", 4),
        ("z", "s", 7),  ("z", "x", 6),
    ]
    for u, v, w in edges:
        g.add_edge(nodes[u], nodes[v], w)
    return g, nodes


def trace(source_key: str = "s"):
    """Yield (label, graph) after each Dijkstra step.

    Frame 0: initial state with all distances at INF except source = 0.
    Each subsequent frame: extract the min-distance unvisited node, relax
    its outgoing edges, and snapshot the resulting graph.

    The graph topology is fixed across frames — every atom persists. Only
    `dist` and `pred` change. This makes the trace structurally trivial
    but attribute-rich, which is the deliberate complement to the other
    three algorithms.
    """
    g, nodes = build_clrs_example()
    node_list = list(nodes.values())
    source = nodes[source_key]
    initialize_single_source(g, source, node_list)
    yield ("INIT", g)

    visited: set[GNode] = set()
    while len(visited) < len(node_list):
        # Extract-min: pick the unvisited node with smallest dist.
        candidates = [n for n in node_list if n not in visited and n.dist < float("inf")]
        if not candidates:
            break
        u = min(candidates, key=lambda n: n.dist)
        visited.add(u)
        # Relax outgoing edges.
        for v, w in g.neighbors(u):
            relax(u, v, w)
        yield (f"relax({u.key})", g)
