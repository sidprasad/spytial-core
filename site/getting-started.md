# Spytial

> Spatial diagrams of structured data — declarative, lightweight, available across many languages.

**Spytial** turns your code's data — a tree, a graph, an AST, a state snapshot — into a box-and-arrow diagram whose layout is driven by declarative spatial constraints. The diagram reflects how the parts are *connected*, not how they happen to be stored.

You write data in your host language (Python, Rust, Pyret, …), attach lightweight constraint annotations (`orientation`, `align`, `group`, `cyclic`), and call one function. A diagram appears — inline in your notebook, in a browser tab, in your IDE — laid out the way you said.

---

## What every Spytial integration gives you

Every Spytial host shares the same core capabilities, because they share the same engine. Whatever your language, you get:

- **One-call rendering.** Pass a value, get a diagram — inline in a notebook, in a browser tab, or saved as HTML.
- **Declarative spatial constraints.** `orientation`, `align`, `group`, `cyclic` — applied via decorators (Python), derive macros (Rust), output methods (Pyret), or whichever idiom is natural to your host. The same spec vocabulary applies everywhere.
- **Honest layout feedback.** When the constraints you wrote conflict, Spytial reports *exactly which subset is unsatisfiable* — no silently mangled diagrams.
- **Sequences of states.** Step through traces, reactor state streams, or any ordered sequence with visual continuity between frames, so things don't jump when the data barely changes.
- **Accessible by default.** Every diagram has a parallel screen-reader view (Data Navigator + spatial REPL) alongside the visual rendering.
- **Same engine everywhere.** All integrations share the browser-side `spytial-core` engine — YAML spec language, selector syntax, constraint solver, renderer — so a diagram looks and behaves the same across hosts.

What *changes* per host is how you reflect your data into Spytial's relational view and how you attach the spec. Everything downstream of that is shared.

---

## Languages with Spytial integrations

Each row links to that language's own user-facing documentation — install, examples, host-specific API.

| Host       | Install                                              | Badge                                                                                                                       | Docs & Repo                                                                                                                                  |
|------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **Python** (sPyTial)        | `pip install spytial-diagramming`                    | [![PyPI](https://img.shields.io/pypi/v/spytial-diagramming.svg?label=pypi%3A%20spytial-diagramming)](https://pypi.org/project/spytial-diagramming/) | [sidprasad.github.io/spytial](https://sidprasad.github.io/spytial/) · [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial) |
| **Rust** (Caraspace)        | `caraspace = { git = "https://github.com/sidprasad/caraspace" }` in `Cargo.toml` (not yet on crates.io) | —                                                                                                                           | [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)                                                                     |
| **Pyret** (Spyret)          | Use the [Spyret IDE](https://github.com/sidprasad/spyret-ide) | —                                                                                                                           | [github.com/sidprasad/spyret-lang](https://github.com/sidprasad/spyret-lang) · [spyret-ide](https://github.com/sidprasad/spyret-ide)         |

---

## Integrate Spytial into your favourite language

Don't see your host above? Spytial is designed to integrate with any host. Every integration resolves the **same four subproblems** — the mechanisms differ, the questions don't.

➡ **[The Four Subproblems](integration.md)** — the integrator's contract. Read this first.

Then in order:

- **[The Integration Pipeline](pipeline.md)** — the one diagram every integration instantiates.
- **[Case Studies](case-studies.md)** — how Python, Rust, and Pyret each answer the four.
- **[Custom Data Instances](custom-data-instance.md)** — the relational view your host needs to produce.
- **[Quick Start](quickstart.md)** — minimal end-to-end demo in the browser.
- **[Claude Code Skill](skill.md)** — `/integrate-language` walks you through the recipe and produces an integration design before you write any code.

---

## Under the hood: `spytial-core`

Every Spytial integration is built on the same browser-side engine, [`spytial-core`](https://github.com/sidprasad/spytial-core) — the piece that consumes a relational data instance plus a YAML spec and produces a rendered diagram. The rest of this site is the engine's integrator reference: the [data model](json-data.md), the [YAML spec language](yaml-reference.md), the [selector engine](selectors.md), the [constraint solver](constraints.md), the [renderers](api-reference.md), and [sequence support](sequences.md).

What `spytial-core` does *not* give you on its own:

- Anything host-specific. **The integrator writes the relationalizer.**
- A way to capture annotations from the source language. **The integrator writes the spec collector.**
- A delivery mechanism. The library is browser-side; the integrator decides how data + spec get there.

Those three pieces are what the integration recipe above walks you through.
