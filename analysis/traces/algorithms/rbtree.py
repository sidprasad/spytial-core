"""Red-Black Tree — copied verbatim from `spytial-clrs/src/trees.ipynb`.

Adds a `trace(keys)` helper at the bottom.
"""

from spytial.annotations import attribute, orientation, hideAtom, hideField, atomColor


RED = "red"
BLACK = "black"


@orientation(selector='left & (RBNode -> (RBNode - NoneType.~key))', directions=['below', 'left'])
@orientation(selector='right & (RBNode -> (RBNode - NoneType.~key))', directions=['below', 'right'])
@atomColor(selector='{ x : RBNode | @:(x.color) = red }', value='red')
@atomColor(selector='{ x : RBNode | @:(x.color) = black }', value='black')
@attribute(field="key")
@attribute(field="color")
@hideAtom(selector='{ x : RBNode | (x.key in NoneType) } + RBTree + int + NoneType + {s : str | @:s = red or @:s = black}')
@hideField(field='parent')
class RBNode:
    def __init__(self, key=None, color=BLACK, left=None, right=None, parent=None):
        self.key = key
        self.color = color
        self.left = left
        self.right = right
        self.parent = parent


NIL = RBNode(key=None, color=BLACK)
NIL.left = NIL.right = NIL.parent = NIL


class RBTree:
    def __init__(self):
        self.root = NIL

    def search(self, key):
        x = self.root
        while x is not NIL and key != x.key:
            x = x.left if key < x.key else x.right
        return x

    def minimum(self, x):
        while x.left is not NIL:
            x = x.left
        return x

    def left_rotate(self, x):
        y = x.right
        assert y is not NIL, "left_rotate requires x.right != NIL"
        x.right = y.left
        if y.left is not NIL:
            y.left.parent = x
        y.parent = x.parent
        if x.parent is NIL:
            self.root = y
        elif x is x.parent.left:
            x.parent.left = y
        else:
            x.parent.right = y
        y.left = x
        x.parent = y

    def right_rotate(self, y):
        x = y.left
        assert x is not NIL, "right_rotate requires y.left != NIL"
        y.left = x.right
        if x.right is not NIL:
            x.right.parent = y
        x.parent = y.parent
        if y.parent is NIL:
            self.root = x
        elif y is y.parent.left:
            y.parent.left = x
        else:
            y.parent.right = x
        x.right = y
        y.parent = x

    def insert(self, key):
        z = RBNode(key=key, color=RED, left=NIL, right=NIL, parent=None)
        y = NIL
        x = self.root
        while x is not NIL:
            y = x
            x = x.left if z.key < x.key else x.right
        z.parent = y
        if y is NIL:
            self.root = z
        elif z.key < y.key:
            y.left = z
        else:
            y.right = z
        self._insert_fixup(z)
        return z

    def _insert_fixup(self, z):
        while z.parent.color is RED:
            if z.parent is z.parent.parent.left:
                y = z.parent.parent.right
                if y.color is RED:
                    z.parent.color = BLACK
                    y.color = BLACK
                    z.parent.parent.color = RED
                    z = z.parent.parent
                else:
                    if z is z.parent.right:
                        z = z.parent
                        self.left_rotate(z)
                    z.parent.color = BLACK
                    z.parent.parent.color = RED
                    self.right_rotate(z.parent.parent)
            else:
                y = z.parent.parent.left
                if y.color is RED:
                    z.parent.color = BLACK
                    y.color = BLACK
                    z.parent.parent.color = RED
                    z = z.parent.parent
                else:
                    if z is z.parent.left:
                        z = z.parent
                        self.right_rotate(z)
                    z.parent.color = BLACK
                    z.parent.parent.color = RED
                    self.left_rotate(z.parent.parent)
        self.root.color = BLACK

    # ----- delete (CLRS 13.4) — ported verbatim from the OSTree
    # implementation in spytial-clrs/src/trees.ipynb, with size-augmentation
    # bookkeeping removed.
    def delete(self, z):
        def transplant(u, v):
            if u.parent is NIL:
                self.root = v
            elif u is u.parent.left:
                u.parent.left = v
            else:
                u.parent.right = v
            v.parent = u.parent

        def minimum(x):
            while x.left is not NIL:
                x = x.left
            return x

        y = z
        y_orig_color = y.color
        if z.left is NIL:
            x = z.right
            transplant(z, z.right)
        elif z.right is NIL:
            x = z.left
            transplant(z, z.left)
        else:
            y = minimum(z.right)
            y_orig_color = y.color
            x = y.right
            if y.parent is z:
                x.parent = y
            else:
                transplant(y, y.right)
                y.right = z.right
                y.right.parent = y
            transplant(z, y)
            y.left = z.left
            y.left.parent = y
            y.color = z.color

        if y_orig_color is BLACK:
            self._delete_fixup(x)

    def _delete_fixup(self, x):
        while x is not self.root and x.color is BLACK:
            if x is x.parent.left:
                w = x.parent.right
                if w.color is RED:
                    w.color = BLACK
                    x.parent.color = RED
                    self.left_rotate(x.parent)
                    w = x.parent.right
                if w.left.color is BLACK and w.right.color is BLACK:
                    w.color = RED
                    x = x.parent
                else:
                    if w.right.color is BLACK:
                        w.left.color = BLACK
                        w.color = RED
                        self.right_rotate(w)
                        w = x.parent.right
                    w.color = x.parent.color
                    x.parent.color = BLACK
                    w.right.color = BLACK
                    self.left_rotate(x.parent)
                    x = self.root
            else:
                w = x.parent.left
                if w.color is RED:
                    w.color = BLACK
                    x.parent.color = RED
                    self.right_rotate(x.parent)
                    w = x.parent.left
                if w.right.color is BLACK and w.left.color is BLACK:
                    w.color = RED
                    x = x.parent
                else:
                    if w.left.color is BLACK:
                        w.right.color = BLACK
                        w.color = RED
                        self.left_rotate(w)
                        w = x.parent.left
                    w.color = x.parent.color
                    x.parent.color = BLACK
                    w.left.color = BLACK
                    self.right_rotate(x.parent)
                    x = self.root
        x.color = BLACK


def trace(insert_keys, delete_keys=None):
    """Yield (label, tree) after each insert/delete operation.

    First inserts every key in `insert_keys` (each yields one frame).
    Then deletes every key in `delete_keys` (each yields one frame).
    """
    t = RBTree()
    for k in insert_keys:
        t.insert(k)
        yield (f"insert({k})", t)
    for k in delete_keys or ():
        node = t.search(k)
        if node is NIL:
            continue
        t.delete(node)
        yield (f"delete({k})", t)
