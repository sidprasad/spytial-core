# Flipping arrow direction in a Spytial diagram

Short answer: Spytial draws an edge for each tuple in a relation, and the arrow goes **from the first field to the second field** of that tuple. So if your edges are pointing child → parent today, the relation Spytial is reading puts the child first and the parent second. You have two ways to fix it — pick whichever matches what you control.

---

## Option 1 (recommended): make the underlying relation parent → child

This is the right fix if you own the data model. Spytial recovers structure from your Python objects via attributes / fields / dict entries, so the edge direction is whatever your object graph already encodes.

If your node looks like this today:

```python
class Node:
    def __init__(self, name):
        self.name = name
        self.parent = None   # child -> parent edge
```

…then Spytial sees a `parent` field on each child pointing at the parent, and draws child → parent. Flip it by storing children on the parent instead:

```python
class Node:
    def __init__(self, name):
        self.name = name
        self.children = []   # parent -> children edges
```

Now each parent has a `children` list, Spytial unfolds that into (parent, child) tuples, and the arrow points parent → child. This is also generally a nicer model for "graph of dependencies" because the parent is the natural owner.

If you need both directions in the data but only one in the diagram, keep both fields and use Option 2 to hide the one you don't want drawn.

## Option 2: tell Spytial to hide / re-orient the relation visually

If you can't change the data model (e.g. it's coming from a library), use Spytial's spec annotations to control what gets drawn. The two you want are:

- **`@hide_field("parent")`** on the class — suppresses the child→parent edge so it's not drawn at all. Combine with a derived `children` accessor that Spytial *can* see, and you'll only get parent→child arrows.
- **`@orientation(...)`** — Spytial's directive for telling the layout engine which way a relation should flow (e.g. "left-to-right along this field", "top-down along that one"). This controls layout direction (where the child node is *placed* relative to the parent), which in a tree-like diagram is usually what people actually mean when they say "the arrow is pointing the wrong way" — they want the parent on top and children below.

A typical fix looks like:

```python
import spytial

@spytial.orientation(field="children", direction="below")
class Node:
    def __init__(self, name):
        self.name = name
        self.children = []
```

If you only have a `parent` field and don't want to add `children`, you can apply orientation to `parent` with the inverse direction (`"above"`) so the parent renders above the child even though the underlying edge is child→parent. The arrowhead will still follow the tuple, but visually the tree will read top-down the way you expect.

## Quick diagnostic

Before changing anything, render the diagram and look at one edge:

1. Is the arrowhead on the *parent* end (child → parent) or the *child* end (parent → child)?
2. Which Python attribute is producing that edge — `self.parent`, `self.children`, a dict, an external adjacency list?

Whichever attribute it is, that's the relation Spytial is drawing. Either reverse who stores the reference (Option 1) or annotate the class to hide / re-orient that relation (Option 2).

---

If you can paste the class definition (or whatever you're handing to `spytial.diagram(...)`), I can point at the exact field that's producing the backwards edge and give you the one-line annotation to fix it.
