# Spytial

<!-- Shared BDD data + cumulative stage specs. The hero diagram and the
     refinement carousel below all reference these templates by id, so the
     instance JSON only appears once on the page. -->
<template id="bdd-data">
{"atoms":[{"id":"15","type":"int","label":"15"},{"id":"\"x1\"","type":"str","label":"x1"},{"id":"14","type":"int","label":"14"},{"id":"\"x2\"","type":"str","label":"x2"},{"id":"8","type":"int","label":"8"},{"id":"\"x3\"","type":"str","label":"x3"},{"id":"1","type":"int","label":"1"},{"id":"None","type":"NoneType","label":"None"},{"id":"n3","type":"Node","label":"TRUE"},{"id":"0","type":"int","label":"0"},{"id":"n4","type":"Node","label":"FALSE"},{"id":"n2","type":"Node","label":"Node2"},{"id":"4","type":"int","label":"4"},{"id":"n5","type":"Node","label":"Node3"},{"id":"n1","type":"Node","label":"Node1"},{"id":"3","type":"int","label":"3"},{"id":"n6","type":"Node","label":"Node4"},{"id":"n0","type":"Node","label":"Node0"}],"relations":[{"id":"nid","name":"nid","types":["object","object"],"tuples":[{"atoms":["n3","1"],"types":["Node","int"]},{"atoms":["n4","0"],"types":["Node","int"]},{"atoms":["n2","8"],"types":["Node","int"]},{"atoms":["n5","4"],"types":["Node","int"]},{"atoms":["n1","14"],"types":["Node","int"]},{"atoms":["n6","3"],"types":["Node","int"]},{"atoms":["n0","15"],"types":["Node","int"]}]},{"id":"v","name":"v","types":["object","object"],"tuples":[{"atoms":["n3","None"],"types":["Node","NoneType"]},{"atoms":["n4","None"],"types":["Node","NoneType"]},{"atoms":["n2","\"x3\""],"types":["Node","str"]},{"atoms":["n5","\"x3\""],"types":["Node","str"]},{"atoms":["n1","\"x2\""],"types":["Node","str"]},{"atoms":["n6","\"x2\""],"types":["Node","str"]},{"atoms":["n0","\"x1\""],"types":["Node","str"]}]},{"id":"lo","name":"lo","types":["object","object"],"tuples":[{"atoms":["n3","None"],"types":["Node","NoneType"]},{"atoms":["n4","None"],"types":["Node","NoneType"]},{"atoms":["n2","n3"],"types":["Node","Node"]},{"atoms":["n5","n4"],"types":["Node","Node"]},{"atoms":["n1","n2"],"types":["Node","Node"]},{"atoms":["n6","n4"],"types":["Node","Node"]},{"atoms":["n0","n1"],"types":["Node","Node"]}]},{"id":"hi","name":"hi","types":["object","object"],"tuples":[{"atoms":["n3","None"],"types":["Node","NoneType"]},{"atoms":["n4","None"],"types":["Node","NoneType"]},{"atoms":["n2","n4"],"types":["Node","Node"]},{"atoms":["n5","n3"],"types":["Node","Node"]},{"atoms":["n1","n5"],"types":["Node","Node"]},{"atoms":["n6","n3"],"types":["Node","Node"]},{"atoms":["n0","n6"],"types":["Node","Node"]}]}],"types":[{"id":"int","types":["int","object"],"atoms":[{"id":"15","type":"int","label":"15"},{"id":"14","type":"int","label":"14"},{"id":"8","type":"int","label":"8"},{"id":"1","type":"int","label":"1"},{"id":"0","type":"int","label":"0"},{"id":"4","type":"int","label":"4"},{"id":"3","type":"int","label":"3"}],"isBuiltin":true},{"id":"str","types":["str","object"],"atoms":[{"id":"\"x1\"","type":"str","label":"x1"},{"id":"\"x2\"","type":"str","label":"x2"},{"id":"\"x3\"","type":"str","label":"x3"}],"isBuiltin":true},{"id":"NoneType","types":["NoneType","object"],"atoms":[{"id":"None","type":"NoneType","label":"None"}],"isBuiltin":true},{"id":"Node","types":["Node","object"],"atoms":[{"id":"n3","type":"Node","label":"TRUE"},{"id":"n4","type":"Node","label":"FALSE"},{"id":"n2","type":"Node","label":"Node2"},{"id":"n5","type":"Node","label":"Node3"},{"id":"n1","type":"Node","label":"Node1"},{"id":"n6","type":"Node","label":"Node4"},{"id":"n0","type":"Node","label":"Node0"}],"isBuiltin":false}],"rootId":"n0"}
</template>
<template id="bdd-spec-0">
constraints: []
directives: []
</template>
<template id="bdd-spec-1">
constraints: []
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
</template>
<template id="bdd-spec-2">
constraints:
- align:
    selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}"
    direction: horizontal
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
</template>
<template id="bdd-spec-3">
constraints:
- align:
    selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}"
    direction: horizontal
- orientation:
    selector: "{x, y : Node | x->y in (lo + hi)}"
    directions: [below]
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
</template>
<template id="bdd-spec-4">
constraints:
- align:
    selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}"
    direction: horizontal
- orientation:
    selector: "{x, y : Node | x->y in (lo + hi)}"
    directions: [below]
- group:
    selector: "{vr : str, y : Node | @:(vr) = @:(y.v)}"
    name: nodes
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
- hideAtom:  { selector: str }
</template>
<template id="bdd-spec-5">
constraints:
- align:
    selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}"
    direction: horizontal
- orientation:
    selector: "{x, y : Node | x->y in (lo + hi)}"
    directions: [below]
- group:
    selector: "{vr : str, y : Node | @:(vr) = @:(y.v)}"
    name: nodes
- orientation:
    selector: "{x, y : Node | x->y in lo and (@num:(y.nid) > 1)}"
    directions: [left]
- orientation:
    selector: "{x, y : Node | x->y in hi and (@num:(y.nid) > 1)}"
    directions: [right]
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
- hideAtom:  { selector: str }
- atomColor: { selector: "{x: Node | @num:(x.nid) = 0}", value: red }
- atomColor: { selector: "{x: Node | @num:(x.nid) = 1}", value: blue }
- atomColor: { selector: "{x: Node | (@num:(x.nid) > 1)}", value: black }
- edgeColor: { field: hi, value: green }
- edgeColor: { field: lo, value: orange }
</template>

Compilers can vectorize loops you never wrote. IDEs can finish functions before you do. Agents can refactor your codebase from a sentence. And yet, when you want to inspect the value your program just produced, you still use the REPL as if nothing has changed in fifty years: type a variable name, get text back, squint. Here is Python showing you a binary decision diagram:

```
Node(15, 'x1', Node(14, 'x2', Node(8, 'x3', TRUE, FALSE), Node(4, 'x3', FALSE, TRUE)), Node(3, 'x2', FALSE, TRUE))
```

That is, technically, the value you wanted to inspect. The way it is shown is also not super *useful*. Anyone who has ever debugged a BDD knows the move that comes next: you reach for paper and pen and *draw* the thing, because we reason about these data structures spatially. (They are called binary decision **diagrams**, after all.)

What you want to see (and what you might draw by hand) is something like *this*:

<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-5" data-height="460" data-caption="The same Python value, shown diagrammatically. Spatial conventions are enforced in real time; try dragging nodes around!"></div>

This diagram is useful because it embodies the spatial conventions we use when talking about BDDs: top-down variable layers, nodes grouped by variable, visually distinct high and low edges, and shared terminals. These conventions are how the data structure becomes readable.

So why not generate diagrams like this whenever we need them? Because the usual way is to write drawing code. Before the picture can tell you anything, you have to choose marks, compute positions, handle updates, and own a pile of rendering details. Some of that captures the BDD conventions that matter; much of it is scaffolding.

Here's the thing: the language already gives us enough structure to draw a faithful diagram of the instance. To show you a value at the REPL, the runtime has to use mechanisms like introspection, printing, or serialization: ways of walking records, atoms, fields, and references. Turn records and atoms into nodes, fields and references into edges, and you get a diagram that preserves the value's structure without asking the programmer to write drawing code. It may not be pretty, but it is faithful to the underlying value. The remaining diagramming work, then, is just of *refinement*. To abuse a line attributed to Michelangelo: David was already in the marble; the BDD was already in the value graph.

**Spytial** is a language built for this kind of diagramming of program values. It starts with the faithful value graph, then lets rules add the [constraints](constraints.md) that matter: same-variable nodes align, children sit below parents, high and low edges differ, implementation details disappear. Each rule makes the picture more like the diagram you wanted. Because the rules describe relationships rather than drawing steps, you are writing a specification, not a rendering pipeline.

The example below shows that process in stages: starting from the raw value structure, each stage adds more of the BDD convention until the diagram becomes recognizable. Each card shows the rule(s) added in that stage with the before/after pair below.

<div class="spytial-carousel-wrap">
<div class="spytial-carousel">

<section class="step-card">
<h3>1. Hide implementation noise</h3>

```yaml
directives:
- attribute: { field: nid }
- hideAtom:  { selector: NoneType + int }
```

<div class="step-pair">
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-0" data-height="240"></div>
<div class="step-arrow" aria-hidden="true">→</div>
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-1" data-height="240"></div>
</div>
</section>

<section class="step-card">
<h3>2. Align nodes that test the same variable</h3>

```yaml
constraints:
- align:
    selector: "{x, y : Node | (x != y) and (x.v) = (y.v)}"
    direction: horizontal
```

<div class="step-pair">
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-1" data-height="240"></div>
<div class="step-arrow" aria-hidden="true">→</div>
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-2" data-height="240"></div>
</div>
</section>

<section class="step-card">
<h3>3. Order layers top-to-bottom along the edges</h3>

```yaml
constraints:
- orientation:
    selector: "{x, y : Node | x->y in (lo + hi)}"
    directions: [below]
```

<div class="step-pair">
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-2" data-height="240"></div>
<div class="step-arrow" aria-hidden="true">→</div>
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-3" data-height="240"></div>
</div>
</section>

<section class="step-card">
<h3>4. Group nodes that share a variable</h3>

```yaml
constraints:
- group:
    selector: "{vr : str, y : Node | @:(vr) = @:(y.v)}"
    name: nodes
directives:
- hideAtom: { selector: str }
```

<div class="step-pair">
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-3" data-height="240"></div>
<div class="step-arrow" aria-hidden="true">→</div>
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-4" data-height="240"></div>
</div>
</section>

<section class="step-card">
<h3>5. Apply visual conventions</h3>

```yaml
constraints:
- orientation: { selector: "{x, y : Node | x->y in lo and (@num:(y.nid) > 1)}", directions: [left] }
- orientation: { selector: "{x, y : Node | x->y in hi and (@num:(y.nid) > 1)}", directions: [right] }
directives:
- atomColor: { selector: "{x: Node | @num:(x.nid) = 0}", value: red }
- atomColor: { selector: "{x: Node | @num:(x.nid) = 1}", value: blue }
- atomColor: { selector: "{x: Node | (@num:(x.nid) > 1)}", value: black }
- edgeColor: { field: hi, value: green }
- edgeColor: { field: lo, value: orange }
```

<div class="step-pair">
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-4" data-height="240"></div>
<div class="step-arrow" aria-hidden="true">→</div>
<div class="spytial-diagram" data-data-ref="bdd-data" data-spec-ref="bdd-spec-5" data-height="240"></div>
</div>
</section>

</div>
<div class="spytial-nav">
<button type="button" data-dir="-1" aria-label="Previous refinement step">←</button>
<span class="spytial-nav-pos">1 / 5</span>
<button type="button" data-dir="1" aria-label="Next refinement step">→</button>
</div>
</div>

More precisely, a Spytial program *denotes* a set of acceptable 2D layouts, and each rule narrows that set by selecting the atoms and edges it constrains. A `selector` such as `{x, y : Node | (x != y) and (x.v) = (y.v)}` matches every pair of distinct nodes that test the same variable — on *any* BDD, not just this one. Because selectors describe structural patterns rather than rendering steps, rules are declarative and order-independent. There is no `if`, no callback, no rendering pipeline to maintain. You are writing a *specification*, not coding a visualizer.

By making spatial description a programming-languages problem, Spytial can do more than draw pictures. When rules conflict, the diagnostic can itself be spatial: Spytial isolates a minimal conflicting subset of constraints, relaxes it to produce a **counterfactual diagram**, and ties the offending elements back to the rules that caused the inconsistency. And because a specification describes a *space* of acceptable pictures rather than a single one, the same specifications can also run *backward*, enabling value construction through the diagram.

Spytial is designed to work across programming paradigms: we have integrated it with Python, Rust, and Pyret, and want to see it in your favorite language too. We think [this recipe is what you need to cook up an integration](new-language-integration.md), but reach out if you want help.

---

## Error messages

Sometimes, your data doesn't match your rules. Specifications can catch that — drawing code can't, because drawing code either picks a layout and renders it or crashes; it doesn't know that any of *the rules you meant* were violated.

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

Spytial returns the minimal conflicting subset of rules above, with each constraint linked to the diagram element that can't be placed.

---

## Where to go from here

This site has three audiences. Pick yours:

- **You want to use Spytial.** → **[Integrations](integrations.md)** — Python, Rust, Pyret. Install, badges, docs links.
- **You want to add Spytial to a new language.** → **[New Language Integration](new-language-integration.md)** — the integrator's design checklist, plus the [pipeline](pipeline.md), [data format](json-data.md), and a [quick start](quickstart.md).
- **You want to hack on `spytial-core` itself.** → **[Contributing](contributing.md)** — build, test, code layout, how to add a [constraint](constraints.md) or [directive](directives.md).

To learn more, **[read our upcoming PLDI paper](https://www.siddharthaprasad.com/papers/ptkns-spytial.pdf)**. Spytial is related to our **Cope and Drag** system for formal-methods visualization — [read the related blog post](https://blog.brownplt.org/2025/06/09/copeanddrag.html).

Every [constraint](constraints.md) and [directive](directives.md) in the spec language is documented by example, with a live diagram you can read off the page.
