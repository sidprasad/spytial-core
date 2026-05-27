# Spytial

We have automated huge amounts of programming work over the last decade. Compilers do vectorization no one types by hand. Editors finish your sentences. Agents take a one-line prompt and edit ten files. None of that has touched the REPL: when you ask your program to *show you the value it just produced*, you still get back a string and you read the string. Here's Python on a binary decision diagram:

```python
Node(15, 'x1', Node(14, 'x2', Node(8, 'x3', TRUE, FALSE), Node(4, 'x3', FALSE, TRUE)), Node(3, 'x2', FALSE, TRUE))
```

That string *is* the BDD — same information, same structure, no loss. It is also useless. The next thing anyone who has actually debugged one of these will do is pick up a pen and sketch it on the back of an envelope, because BDDs (and trees, and graphs, and traces) are spatial. The "diagram" in *binary decision diagram* is the part that matters.

What you wanted on screen was this:

<div class="spytial-diagram" data-height="440" data-caption="The same BDD, drawn from rules. Same-variable nodes share a row; lo edges dashed orange, hi edges solid green; terminals colored. Drag the nodes — the constraints keep holding.">
<template class="data">
{
  "atoms": [
    {"id": "n15", "type": "Node", "label": "15"},
    {"id": "n14", "type": "Node", "label": "14"},
    {"id": "n8",  "type": "Node", "label": "8"},
    {"id": "n4",  "type": "Node", "label": "4"},
    {"id": "n3",  "type": "Node", "label": "3"},
    {"id": "vx1", "type": "Variable", "label": "x1"},
    {"id": "vx2", "type": "Variable", "label": "x2"},
    {"id": "vx3", "type": "Variable", "label": "x3"},
    {"id": "tT",  "type": "Terminal", "label": "TRUE"},
    {"id": "tF",  "type": "Terminal", "label": "FALSE"}
  ],
  "relations": [
    {"id": "v", "name": "v", "types": ["Node", "Variable"],
     "tuples": [
       {"atoms": ["n15", "vx1"], "types": ["Node", "Variable"]},
       {"atoms": ["n14", "vx2"], "types": ["Node", "Variable"]},
       {"atoms": ["n8",  "vx3"], "types": ["Node", "Variable"]},
       {"atoms": ["n4",  "vx3"], "types": ["Node", "Variable"]},
       {"atoms": ["n3",  "vx2"], "types": ["Node", "Variable"]}
     ]},
    {"id": "lo", "name": "lo", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n15", "n14"], "types": ["Node", "Node"]},
       {"atoms": ["n14", "n8"],  "types": ["Node", "Node"]},
       {"atoms": ["n8",  "tT"],  "types": ["Node", "Terminal"]},
       {"atoms": ["n4",  "tF"],  "types": ["Node", "Terminal"]},
       {"atoms": ["n3",  "tF"],  "types": ["Node", "Terminal"]}
     ]},
    {"id": "hi", "name": "hi", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n15", "n3"],  "types": ["Node", "Node"]},
       {"atoms": ["n14", "n4"],  "types": ["Node", "Node"]},
       {"atoms": ["n8",  "tF"],  "types": ["Node", "Terminal"]},
       {"atoms": ["n4",  "tT"],  "types": ["Node", "Terminal"]},
       {"atoms": ["n3",  "tT"],  "types": ["Node", "Terminal"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: "lo + hi", directions: [below] }
  - align:       { selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}", direction: horizontal }
directives:
  - edgeColor: { field: hi, value: "#1f7a1f" }
  - edgeColor: { field: lo, value: "#cc6600", style: dashed }
  - atomColor: { selector: Node,     value: "#dbe7f3" }
  - atomColor: { selector: Terminal, value: "#f6d6c5" }
  - hideField: { field: v }
  - hideAtom:  { selector: Variable }
</template>
</div>

This is readable because it follows the conventions BDD people already use: layered top-to-bottom, same-variable nodes on the same row, lo and hi edges distinguished, terminals visually distinct from internal nodes.

So why not draw values like this whenever we want to look at them? Because the usual route is to write drawing code — choose marks, compute positions, handle every update, own a small rendering project per value type. Some of that scaffolding captures the conventions that actually matter for *this* value; most of it does not transfer to the next.

Here is the load-bearing observation: **the runtime already walks your value to print it.** Introspection, serialization, `__repr__`, `Show`, reflection — every "show me this thing" goes through a traversal that visits records, atoms, fields, and references. Turn records into nodes and fields into edges and you have a faithful diagram for free. It will not be pretty, but it is the right shape. Everything after is refinement.

**Spytial** is the refinement layer. Starting from the runtime's walk of your value, you add rules — one at a time — that narrow the layout until the picture is the one you wanted. The BDD above was produced by exactly five:

```yaml
constraints:
  - orientation: { selector: "lo + hi", directions: [below] }                                  # layers go top-down
  - align:       { selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}", direction: horizontal }  # same var, same row
directives:
  - edgeColor: { field: hi, value: "#1f7a1f" }                                                  # hi edges green
  - edgeColor: { field: lo, value: "#cc6600", style: dashed }                                   # lo edges dashed orange
  - hideAtom:  { selector: Variable }                                                            # variable atoms out of the picture
```

The selector `{x, y : Node | (x != y) and (x.v) = (y.v)}` picks out a *structural pattern* — every pair of distinct nodes that test the same variable. It will match on the BDD above and on every other BDD; it is a property of the data, not a hand-written list. Because each rule is a property like that and not a step in a pipeline, the rules don't have an order, can't conflict with themselves, and don't need to be re-derived when the value changes. The layout solver re-runs; the rules don't.

---

## Counterfactual diagrams

The biggest reason to write layout as a specification rather than imperative drawing code: when the rules don't all fit, Spytial can tell you which ones. Drawing code can't — it picks a layout or crashes.

Suppose you reach for the natural tree rules — left-child below-*left* of parent, right-child below-*right* — and apply them to a graph that isn't a tree: a diamond DAG where `L` and `R` both point to the same `B`. `B` would have to sit below-*left* of `L` *and* below-*right* of `R`, while `L` is already left of `R`. No x-coordinate satisfies both.

<div class="spytial-diagram" data-height="380" data-caption="Tree rules applied to a diamond DAG. Spytial lays out what it can; the dashed borders mark the nodes caught in the unsatisfiable subset, and the rules underneath spell out the conflict.">
<template class="data">
{
  "atoms": [
    {"id": "t", "type": "Node", "label": "T"},
    {"id": "l", "type": "Node", "label": "L"},
    {"id": "r", "type": "Node", "label": "R"},
    {"id": "b", "type": "Node", "label": "B"}
  ],
  "relations": [
    {"id": "left", "name": "left", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["t", "l"], "types": ["Node", "Node"]},
       {"atoms": ["l", "b"], "types": ["Node", "Node"]}
     ]},
    {"id": "right", "name": "right", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["t", "r"], "types": ["Node", "Node"]},
       {"atoms": ["r", "b"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: left,  directions: [below, left]  }
  - orientation: { selector: right, directions: [below, right] }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
</template>
</div>

Spytial isolates the minimal conflicting subset of constraints, relaxes it to produce a *counterfactual* layout, and points you at the rules that caused the inconsistency. You decide which one to weaken.

---

## Where to go from here

This site has three audiences. Pick yours:

- **You want to use Spytial.** → **[Integrations](integrations.md)** — Python, Rust, Pyret. Install, badges, docs links.
- **You want to add Spytial to a new language.** → **[The Four Subproblems](integration.md)** — the integrator's design checklist, plus the [pipeline](pipeline.md), [data format](json-data.md), and a [quick start](quickstart.md).
- **You want to hack on `spytial-core` itself.** → **[Contributing](contributing.md)** — build, test, code layout, how to add a constraint or directive.

Every constraint and directive in the spec language is documented [by example](constraints.md), with a live diagram you can read off the page.
