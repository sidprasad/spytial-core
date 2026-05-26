# Spytial

> Diagrams for structured data, with layout rules written down instead of baked into drawing code.

**Spytial** is for values whose shape matters: trees, graphs, ASTs, heap snapshots, trace states. It asks the host language to describe two things:

- the value as atoms and relations
- the intended layout as constraints such as `orientation`, `align`, `group`, and `cyclic`

The result is a box-and-arrow diagram whose geometry follows those constraints. The point is not to guess a pretty drawing; the point is to make the structure visible without hand-positioning nodes.

<div class="spytial-diagram" data-height="320" data-caption="A binary tree, drawn with Spytial. The data: 5 Node atoms + left/right relations. The spec: orientation [above, right] for left-children, [above, left] for right-children. Nothing in this page hand-positions a node.">
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
  - orientation: { selector: left,  directions: [above, right] }
  - orientation: { selector: right, directions: [above, left]  }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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
- **[Case Studies](case-studies.md)** — how Python, Rust, and Pyret each answer the four.
- **[Custom Data Instances](custom-data-instance.md)** — the relational view your host needs to produce.
- **[Quick Start](quickstart.md)** — minimal end-to-end demo in the browser.
- **[Claude Code Skill](skill.md)** — `/integrate-language` turns the four questions into a design checklist.

---

## Under the hood: `spytial-core`

[`spytial-core`](https://github.com/sidprasad/spytial-core) is the browser-side part of Spytial. It consumes a relational data instance plus a YAML spec and produces a rendered diagram. The rest of this site documents that interface: the [data model](json-data.md), the [YAML spec language](yaml-reference.md), the [selector engine](selectors.md), the [constraint solver](constraints.md), the [renderers](api-reference.md), and [sequence support](sequences.md).

What `spytial-core` does *not* give you on its own:

- Anything host-specific. **The integrator writes the relationalizer.**
- A way to capture annotations from the source language. **The integrator writes the spec collector.**
- A delivery mechanism. The library is browser-side; the integrator decides how data + spec get there.

Those three pieces are the work of a host integration.
