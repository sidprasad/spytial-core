# Flipping arrow direction in sPyTial

Short version: in sPyTial, an arrow's direction is determined by **which side holds the reference**, not by a "direction" flag. If your arrows are rendering child -> parent, it's almost certainly because each child node holds a `parent` reference. There are two clean ways to flip it.

## What's actually going on

sPyTial draws an edge for each field reference, going **from the holder of the field to the value of the field**. So:

- If `Child.parent = parent_node`, the edge goes `child -> parent`.
- If `Parent.children = [child1, child2]`, the edges go `parent -> child1`, `parent -> child2`.

There's no `flip=True` or `reverse=True` argument on the field/edge annotations. You have to either change which object owns the reference, or synthesize a reverse edge.

## Option 1 (cleanest): store the reference on the parent

If you can change your data model, give the parent a `children` collection instead of (or in addition to) the child's `parent` pointer:

```python
class Node:
    def __init__(self, name):
        self.name = name
        self.children = []   # <-- arrows will flow parent -> children
```

Then `spytial.diagram(root)` will draw `parent -> child` arrows naturally. If you want children laid out below their parent, add an `orientation` constraint:

```python
import spytial

@spytial.orientation(selector="children", directions=["below"])
class Node:
    def __init__(self, name):
        self.name = name
        self.children = []
```

`directions` accepts entries like `"below"`, `"above"`, `"left"`, `"right"` to control where the target ends up relative to the source.

## Option 2: keep `parent` field, hide it, and add an inferred reverse edge

If you can't restructure your model (e.g. the `parent` pointer is needed by your code), you can:

1. Hide the existing `parent` field so its arrow doesn't render.
2. Use `inferredEdge` to declare a synthetic edge that walks the relationship the other way.

```python
import spytial

@spytial.hideField(field="parent")
@spytial.inferredEdge(
    name="child",
    selector="{p, c | c.parent = p}",   # for each c, draw p -> c
    style="solid",
)
class Node:
    def __init__(self, name, parent=None):
        self.name = name
        self.parent = parent
```

The exact selector syntax for `inferredEdge` is documented in the Operations / API Reference pages of the sPyTial docs — check there for the precise form your version expects, since the selector grammar has evolved.

## What I would NOT reach for

- There is no `orientation(..., reverse=True)` — `orientation` controls **layout position** (where nodes sit relative to each other), not arrowhead direction.
- `edgeColor` / `style` only restyle the existing arrow; they don't flip it.

## Quick checklist

1. Look at your class — which side holds the reference (`parent` on child, or `children` on parent)?
2. If you can flip the model, do that and add `@spytial.orientation(selector="children", directions=["below"])` for a top-down tree look.
3. If you can't, combine `@spytial.hideField` on the existing field with `@spytial.inferredEdge` to draw the reverse direction.

Sources:
- [sPyTial documentation home](https://www.siddharthaprasad.com/spytial/)
- [sPyTial Operations docs (constraints & directives)](https://www.siddharthaprasad.com/spytial/operations/)
- [sPyTial GitHub repo](https://github.com/sidprasad/spytial)
