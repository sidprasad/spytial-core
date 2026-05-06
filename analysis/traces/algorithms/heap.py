"""Max-Heap (CLRS Ch. 6) — copied verbatim from spytial-clrs/src/heaps.ipynb.

Adds a `trace(insert_keys, extract_count)` helper at the bottom.
"""

from typing import List

from spytial.annotations import hideAtom, orientation, inferredEdge


HEAP_VALUES = "((int - 0).(list.idx))"
LEFT_CHILDREN = "(~(list.idx)).({ i, j : (int-0) | j = multiply[i,2] }).(list.idx)"
RIGHT_CHILDREN = "(~(list.idx)).({ i, j : (int-0) | j = add[1, multiply[i, 2]] }).(list.idx)"


@hideAtom(selector=f'MaxHeap + list + (int - {HEAP_VALUES})')
@orientation(selector=LEFT_CHILDREN, directions=["left", "below"])
@inferredEdge(selector=LEFT_CHILDREN, name="left")
@orientation(selector=RIGHT_CHILDREN, directions=["right", "below"])
@inferredEdge(selector=RIGHT_CHILDREN, name="right")
class MaxHeap:
    """CLRS-style max heap storing integers. 1-indexed: a[0] unused."""

    def __init__(self, data: List[int] = None):
        self.a: List[int] = [0]
        if data:
            self.a.extend(data)
        self.n = len(self.a) - 1
        if self.n > 1:
            self.build_max_heap()

    @staticmethod
    def _parent(i: int) -> int: return i // 2

    @staticmethod
    def _left(i: int) -> int: return 2 * i

    @staticmethod
    def _right(i: int) -> int: return 2 * i + 1

    def _max_heapify(self, i: int) -> None:
        while True:
            l, r = self._left(i), self._right(i)
            largest = i
            if l <= self.n and self.a[l] > self.a[largest]:
                largest = l
            if r <= self.n and self.a[r] > self.a[largest]:
                largest = r
            if largest == i:
                break
            self.a[i], self.a[largest] = self.a[largest], self.a[i]
            i = largest

    def build_max_heap(self) -> None:
        for i in range(self.n // 2, 0, -1):
            self._max_heapify(i)

    def max(self) -> int:
        if self.n < 1:
            raise IndexError("heap underflow")
        return self.a[1]

    def extract_max(self) -> int:
        if self.n < 1:
            raise IndexError("heap underflow")
        m = self.a[1]
        self.a[1] = self.a[self.n]
        self.a.pop()
        self.n -= 1
        if self.n >= 1:
            self._max_heapify(1)
        return m

    def increase_key(self, i: int, key: int) -> None:
        if i < 1 or i > self.n:
            raise IndexError("index out of range")
        if key < self.a[i]:
            raise ValueError("new key is smaller than current key")
        self.a[i] = key
        while i > 1 and self.a[self._parent(i)] < self.a[i]:
            p = self._parent(i)
            self.a[i], self.a[p] = self.a[p], self.a[i]
            i = p

    def insert(self, key: int) -> None:
        self.n += 1
        self.a.append(float("-inf"))
        self.increase_key(self.n, key)


def trace(insert_keys, extract_count: int = 0):
    """Yield (label, heap) after each insert / extract-max."""
    h = MaxHeap()
    for k in insert_keys:
        h.insert(k)
        yield (f"insert({k})", h)
    for i in range(extract_count):
        m = h.extract_max()
        yield (f"extract-max -> {m}", h)
