# What is spytial-core?

`spytial-core` is the **host-agnostic engine** behind Spytial. It is the piece that:

1. Takes a relational view of your data — atoms (nodes), labeled tuples (edges), types.
2. Takes a YAML *spec* of spatial constraints and visual directives.
3. Produces a layout — positions, groups, edge styling, accessibility metadata — that any frontend (WebCola, SVG, screen reader, …) can render.

It runs entirely in the browser. It has no knowledge of your source language. Everything language-specific — Python objects, Rust values, Pyret data, Lean terms — lives in a thin **host integration layer** that you write (or reuse).

## Who is this guide for?

This documentation is for **language and tool integrators**. You're writing the bridge between a host (Python, Rust, Pyret, Lean, your custom debugger, your notebook kernel, …) and `spytial-core`.

Existing integrations you can study:

| Host                  | Repo                                                                                   | Bridge mechanism                                       |
|-----------------------|----------------------------------------------------------------------------------------|--------------------------------------------------------|
| Python (sPyTial)      | [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial)                  | Runtime reflection → JSON → browser/notebook           |
| Rust (Caraspace)      | [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)              | `derive` + procedural macros → JSON → local HTTP       |
| Pyret (Spyret)        | [github.com/sidprasad/spyret-lang](https://github.com/sidprasad/spyret-lang) · [spyret-ide](https://github.com/sidprasad/spyret-ide) | Value-skeleton output method → spytial-core in browser |
| Lean 4 (Spytial-Lean) | [github.com/sidprasad/spytial-lean](https://github.com/sidprasad/spytial-lean)        | Relationalize `Expr` → ProofWidgets4 → spytial-core    |
| Racket                | [github.com/sidprasad/rkt-graphable](https://github.com/sidprasad/rkt-graphable)      | `#lang` integration                                    |

If you are *using* one of those bindings, read its README — not this guide.

## What `spytial-core` gives you

- **A canonical data model** — `IDataInstance` (atoms, tuples, types). [JSON serialization](json-data.md) is the lingua franca.
- **A YAML spec language** — orientation, alignment, grouping, color, icons, projection. See the [YAML Reference](yaml-reference.md).
- **A query/selector engine** — Forge-style relational expressions (`^parent`, `Node - left.Node`, …) plus optional AlaSQL.
- **A constraint solver** — qualitative spatial constraints (above/below/left/right, alignment, cyclic) compiled to a linear system; conflicts are reported as an Irreducible Inconsistent Subset (IIS).
- **A WebCola renderer** as a custom element (`<webcola-cnd-graph>`) plus an accessible parallel renderer.
- **Sequence support** — pairwise [policies](sequences.md) for stepping through traces / states with continuity.

## What `spytial-core` does *not* give you

- Anything host-specific. **You write the relationalizer.**
- A way to capture annotations from your source language. **You write the spec collector.**
- A delivery mechanism. The library is browser-side; you must get the data + spec there yourself (HTTP server, Jupyter widget, IDE webview, language-server message, …).

The next page is the only mental model you need: [the integration pipeline](pipeline.md).
