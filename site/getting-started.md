# Spytial

> The diagram is already in the value graph. Spytial just refines it.

A binary search tree is a tree. A region graph is a graph. An Alloy trace is a state machine. But the REPL prints them all the same way — nested parentheses you reconstruct in your head.

So why not generate a diagram every time? Because the usual route is to write drawing code. Before the picture can tell you anything you have chosen marks, computed positions, wired up updates, and bought into a small rendering project. Some of that scaffolding captures the conventions that actually matter for *this* value (BDD nodes layered by variable, AST bindings above their use sites, trace states clockwise); most of it is plumbing that does not transfer to the next value type.

Here is the load-bearing observation: **the runtime already walks your value to print it.** Introspection, serialization, reflection — every REPL traversal visits records, atoms, fields, and references. Turn records into nodes and fields into edges, and you have a faithful diagram of the value, paid for by a traversal you were already doing. It will not be pretty, but it is the right shape. Everything else is refinement.

Spytial is built around that refinement. Starting from the faithful value graph, you add **rules** — *parents above children*, *same-variable nodes aligned*, *implementation atoms hidden*, *trace states cyclic* — and a constraint solver delivers any picture that satisfies them. Because the rules describe relationships rather than drawing steps, you are writing a specification of the diagram you want, not a rendering pipeline. When rules contradict, Spytial returns a minimal explanation of the conflict instead of a quietly-wrong picture.

<div class="spytial-diagram" data-height="440" data-caption="Five `Node` atoms with `left`/`right` relations, plus two rules: left-children below-left, right-children below-right. No pixel positions, no drawing code — and the tree obeys both rules simultaneously.">
<template class="data">
{
  "atoms": [
    {"id": "n0", "type": "Node", "label": "5"},
    {"id": "n1", "type": "Node", "label": "3"},
    {"id": "n2", "type": "Node", "label": "8"},
    {"id": "n3", "type": "Node", "label": "1"},
    {"id": "n4", "type": "Node", "label": "9"}
  ],
  "relations": [
    {"id": "left", "name": "left", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n0", "n1"], "types": ["Node", "Node"]},
       {"atoms": ["n1", "n3"], "types": ["Node", "Node"]}
     ]},
    {"id": "right", "name": "right", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n0", "n2"], "types": ["Node", "Node"]},
       {"atoms": ["n2", "n4"], "types": ["Node", "Node"]}
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

---

## When rules conflict, you find out

Drawing code can't be wrong about itself: if it draws something misleading, it draws it confidently. A specification can — the rules can contradict, and Spytial can tell you exactly which ones.

Take the previous tree and add one more edge: now node `L` and node `R` both point to the same child `B`. As a graph it is well-formed (a diamond DAG). As a *tree* it isn't — and the moment you ask Spytial to lay it out with the natural tree rules (left-child below-*left* of parent, right-child below-*right*), the rules contradict at `B`. It would have to sit below-left of `L` *and* below-right of `R`, while `L` itself is constrained to be left of `R`. There is no x-coordinate that satisfies both.

<div class="spytial-diagram" data-height="380" data-caption="Same two rules as the tree above, on a diamond DAG. Spytial places what it can and reports the minimal conflicting subset — the smallest set of rules that can't hold together — instead of choosing one to silently violate.">
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

This is what "spec over construction" buys you. Drawing code that hit the same contradiction would either silently pick a layout (and you'd never know which rule it violated) or just crash. Spytial returns an *actionable* failure: a short list of constraints whose conjunction is unsatisfiable, plus a degraded layout that respects everything it could. You read the report, decide which rule to drop or weaken — *the tree assumption was the lie; B has two parents* — and try again.

---

## What an integration gets from the core

The host-specific work is deliberately small: recover structure, collect layout annotations, and deliver both to the browser. Once you have done that, `spytial-core` handles the parts that should not be reimplemented for each language:

- **Rendering from host values.** A host API can be as small as `diagram(value)`, returning inline HTML, opening a browser tab, or writing a file.
- **One layout vocabulary.** Python decorators, Rust derive attributes, and Pyret output methods can all compile to the same YAML spec.
- **Conflict reports.** If the constraints cannot all hold, Spytial reports the inconsistent subset instead of quietly drawing something else.
- **Sequences.** Ordered states can keep visual continuity across frames, which matters for traces and stepping debuggers.
- **Accessible output.** The visual rendering can be paired with a Data Navigator and spatial REPL for screen-reader users.

The dividing line is simple: the host explains the program value; `spytial-core` evaluates selectors, solves layout constraints, and renders.

---

## Languages with Spytial integrations

Each row links to that language's own user-facing documentation — install, examples, host-specific API.

| Host       | Install                                              | Badge                                                                                                                       | Docs & Repo                                                                                                                                  |
|------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **Python** (sPyTial)        | `pip install spytial-diagramming`                    | [![PyPI](https://img.shields.io/pypi/v/spytial-diagramming.svg?label=pypi%3A%20spytial-diagramming)](https://pypi.org/project/spytial-diagramming/) | [sidprasad.github.io/spytial](https://sidprasad.github.io/spytial/) · [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial) |
| **Rust** (Caraspace)        | `caraspace = { git = "https://github.com/sidprasad/caraspace" }` in `Cargo.toml` (not yet on crates.io) | —                                                                                                                           | [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)                                                                     |
| **Pyret** (Spyret)          | Use the [Spyret IDE](https://github.com/sidprasad/spyret-ide) | —                                                                                                                           | [github.com/sidprasad/spyret-lang](https://github.com/sidprasad/spyret-lang) · [spyret-ide](https://github.com/sidprasad/spyret-ide)         |

---

## Integrate Spytial into another language

Do not see your host above? A new integration is mostly an exercise in answering four questions. The answers are language-specific, but the questions are stable.

Start with **[The Four Subproblems](integration.md)**. It is the design checklist for a new host.

Then in order:

- **[The Integration Pipeline](pipeline.md)** — where data, specs, layout, and rendering meet.
- **[Custom Data Instances](custom-data-instance.md)** — the relational view your host needs to produce.
- **[Quick Start](quickstart.md)** — minimal end-to-end demo in the browser.

---

## Under the hood: `spytial-core`

[`spytial-core`](https://github.com/sidprasad/spytial-core) is the browser-side part of Spytial. It consumes a relational data instance plus a YAML spec and produces a rendered diagram. The rest of this site documents that interface: the [data model](json-data.md), the [YAML spec language](yaml-reference.md), the [selector engine](selectors.md), the [constraint solver](constraints.md), the [renderers](api-reference.md), and [sequence support](sequences.md).

What `spytial-core` does *not* give you on its own:

- Anything host-specific. **The integrator writes the relationalizer.**
- A way to capture annotations from the source language. **The integrator writes the spec collector.**
- A delivery mechanism. The library is browser-side; the integrator decides how data + spec get there.

Those three pieces are the work of a host integration.
