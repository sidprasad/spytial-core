# Hooking up your Haskell recipe-AST to sPyTial

Short answer up front: **sPyTial is a Python library** (`pip install spytial`, `import spytial; spytial.diagram(obj)`). It doesn't have a native Haskell binding that I can find. To use it from Haskell you'll need to bridge — i.e. dump your AST from Haskell in a format Python can read, then call `spytial.diagram` on the Python side. There are a couple of ways to do that, ordered from least to most effort.

## What sPyTial actually is

sPyTial ("Lightweight Diagrams for Structured Python Data") generates box-and-arrow diagrams from arbitrary Python objects. It's the engine behind [Cope and Drag](https://www.siddharthaprasad.com/copeanddrag/), and it's especially good at recursive things — the docs explicitly call out "a tree, a graph, a recursive object — maybe an AST, a neural network, or a symbolic term." So your use case is right in its wheelhouse, you just need to get the data across the language boundary.

The core API (from the [sPyTial docs](https://www.siddharthaprasad.com/spytial/)) is:

```python
import spytial
spytial.diagram(obj)            # render any Python object
spytial.evaluate(obj)           # sanity-check serialization first
```

Plus a system of decorators / `typing.Annotated` wrappers (`InferredEdge`, `Orientation`, `Tag`, `AtomColor`, `HideField`, etc.) for shaping layout.

## Option 1 (recommended): JSON bridge

This is the lightest-weight path and the one I'd start with.

**On the Haskell side**, give your AST node type a JSON encoding. With `aeson`:

```haskell
{-# LANGUAGE DeriveGeneric #-}
import GHC.Generics
import Data.Aeson
import qualified Data.ByteString.Lazy as BL

data Node = Node
  { ctor     :: String
  , children :: [Node]
  } deriving (Generic, Show)

instance ToJSON Node

-- in your REPL / main:
BL.writeFile "ast.json" (encode myAst)
```

If your real AST is a richer sum type (e.g. `data Recipe = Ingredient Text Qty | Step Text [Recipe] | ...`), derive `ToJSON` for it directly — aeson's default sum-type encoding tags each constructor, which is exactly what you want for visualization.

**On the Python side**, load the JSON and hand the resulting nested dict to sPyTial. Per the docs, dicts and lists work as input, with optional `AnnotatedType` for layout hints:

```python
import json, spytial
from typing import Dict, List, Any
from spytial import AnnotatedType, InferredEdge, Orientation

ast = json.load(open("ast.json"))

# Optional: tell spytial that "children" is the edge to follow,
# and lay children out below their parent.
AstType = AnnotatedType(
    Dict[str, Any],
    InferredEdge(name="child", selector="children"),
    Orientation(selector="children", directions=["below"]),
)

spytial.diagram(ast, as_type=AstType)
```

For a tight inner loop while you're prototyping, run the Python side in a Jupyter notebook and re-run that cell each time you re-emit `ast.json` from `ghci`.

## Option 2: Reconstruct as Python classes

If you want nicer-looking diagrams (constructor names as the atom labels rather than `"ctor": "Step"` fields), define a tiny mirror of your AST in Python as dataclasses, with one class per constructor, and translate the JSON into those. sPyTial uses class names as atom labels by default, so `Step(...)` and `Ingredient(...)` will show up naturally in the diagram. This is a few extra lines of glue but pays off in readability.

```python
from dataclasses import dataclass
from typing import List

@dataclass
class Ingredient:
    name: str
    qty: str

@dataclass
class Step:
    text: str
    children: List["Recipe"]

Recipe = Ingredient | Step

def from_json(j):
    if j["ctor"] == "Ingredient":
        return Ingredient(j["name"], j["qty"])
    if j["ctor"] == "Step":
        return Step(j["text"], [from_json(c) for c in j["children"]])
    raise ValueError(j["ctor"])

spytial.diagram(from_json(json.load(open("ast.json"))))
```

## Option 3: Shell out from Haskell

Once the Python script works, you can wrap it so the visualization is one Haskell call away:

```haskell
import System.Process
visualize :: Node -> IO ()
visualize n = do
  BL.writeFile "ast.json" (encode n)
  callCommand "python visualize.py ast.json"
```

That gets you a `visualize myAst` you can drop into ghci.

## A few practical tips

- **Start with `spytial.evaluate(obj)`** before `diagram` — the docs recommend this to check that your data serializes the way you expect before you start fiddling with layout.
- **Layout annotations are optional.** Just `spytial.diagram(ast)` will give you something reasonable; only reach for `Orientation`, `InferredEdge`, etc. once the default starts feeling cramped.
- **For a parser, you probably want a `sequence`.** sPyTial has `spytial.sequence()` / `diagramSequence(...)` for showing a series of states — handy if you want to watch the AST grow as you parse, rather than just see the final tree.
- I couldn't find an official Haskell package or a documented non-Python entry point into sPyTial's TypeScript core (`spytial-core`) that you could target directly. If that exists, it isn't surfaced in the public docs I could reach. The JSON bridge above is the path that's actually documented to work.

## Sources

- [sPyTial documentation](https://www.siddharthaprasad.com/spytial/)
- [sPyTial diagramming guide](https://www.siddharthaprasad.com/spytial/usage/diagramming/)
- [sPyTial API reference](https://www.siddharthaprasad.com/spytial/reference/api/)
- [Cope and Drag (the diagramming language sPyTial powers)](https://www.siddharthaprasad.com/copeanddrag/)
- [sidprasad's GitHub profile](https://github.com/sidprasad) (sPyTial author, Brown PL)
- [aeson on Hackage](https://hackage.haskell.org/package/aeson) for the Haskell JSON side
