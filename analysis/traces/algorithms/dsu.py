"""Disjoint-Set Forest (Union-Find) — class definitions copied verbatim
from spytial-clrs/src/disjoint-sets.ipynb, with the FOREST_ONLY view fixed
(no `apply_if` indirection) so the trace is reproducible.

Adds a `trace(operations)` helper at the bottom.
"""

from spytial.annotations import attribute, hideAtom, orientation


# CLRS Fig 21.4 — disjoint-set forest, parents drawn above children.
@attribute(field="key")
@attribute(field="rank")
@hideAtom(selector="int + str")
@orientation(selector='(parent - iden) & (DSUNode->DSUNode)', directions=['above'])
class DSUNode:
    def __init__(self, key):
        self.key = key
        self.parent = self   # MAKE-SET
        self.rank = 0


class DisjointSet:
    def __init__(self):
        # Single persistent list object so every snapshot() call returns
        # the SAME Python id() — keeping the list's atom ID stable across
        # frames. Without this the spytial builder allocates a fresh
        # list-atom each frame, which rewires the `list.idx` tuples that
        # connect every DSUNode to the list and makes every DSUNode look
        # context-changed on every transition. That's a snapshot artifact,
        # not a property of union-find.
        self._nodes = []

    def make_set(self, key):
        node = DSUNode(key)
        self._nodes.append(node)
        return node

    def find_set(self, x):
        if x.parent is not x:
            x.parent = self.find_set(x.parent)
        return x.parent

    def union(self, x, y):
        return self._link(self.find_set(x), self.find_set(y))

    def _link(self, x_root, y_root):
        if x_root is y_root:
            return x_root
        if x_root.rank > y_root.rank:
            y_root.parent = x_root
            return x_root
        x_root.parent = y_root
        if x_root.rank == y_root.rank:
            y_root.rank += 1
        return y_root

    def snapshot(self):
        """Return the SAME persistent list of DSUNode handles. Returning a
        copy via `list(self._nodes)` would mint a new Python object each
        call and the spytial builder would assign it a new atom ID, which
        rewires every DSUNode's edge fingerprint and breaks the
        two-level metric. See the comment in __init__."""
        return self._nodes


def trace(operations):
    """Yield (label, forest_snapshot) after each MAKE-SET / UNION op.

    `operations` is a list of tuples:
      ('make_set', key)
      ('union', key_a, key_b)
    Atom IDs are stable across frames (in-place mutation).
    """
    ds = DisjointSet()
    by_key = {}
    for op in operations:
        if op[0] == 'make_set':
            key = op[1]
            n = ds.make_set(key)
            by_key[key] = n
            yield (f"MAKE-SET({key})", ds.snapshot())
        elif op[0] == 'union':
            a, b = op[1], op[2]
            ds.union(by_key[a], by_key[b])
            yield (f"UNION({a},{b})", ds.snapshot())
        else:
            raise ValueError(f"unknown op {op!r}")
