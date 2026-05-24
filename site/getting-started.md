# spytial-core

> The host-agnostic engine behind Spytial. Turn a relational view of your data plus a YAML spec into a diagram — in any language.

This site is for **language and tool integrators**: people building the bridge between a host (Python, Rust, Pyret, your editor, your debugger, your notebook kernel, …) and `spytial-core`.

- **Using Spytial?** Jump to your language in [Existing integrations](#existing-integrations) below — each binding has its own user-facing docs.
- **Integrating Spytial into a new host?** Read [The Four Subproblems](integration.md) — the contract every integration resolves.

---

## Existing integrations

Each row is a working Spytial integration. The package and docs links are the right starting point if you just want to diagram values in that language — this site only covers material *integrators* need.

| Host       | Install                                              | Badge                                                                                                                       | Docs & Repo                                                                                                                                  |
|------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **Python** (sPyTial)        | `pip install spytial-diagramming`                    | [![PyPI](https://img.shields.io/pypi/v/spytial-diagramming.svg?label=pypi%3A%20spytial-diagramming)](https://pypi.org/project/spytial-diagramming/) | [sidprasad.github.io/spytial](https://sidprasad.github.io/spytial/) · [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial) |
| **Rust** (Caraspace)        | `cargo add caraspace`                                | [![Crates.io](https://img.shields.io/crates/v/caraspace.svg?label=crates%3A%20caraspace)](https://crates.io/crates/caraspace) | [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)                                                                     |
| **Pyret** (Spyret)          | Use the [Spyret IDE](https://github.com/sidprasad/spyret-ide) | —                                                                                                                           | [github.com/sidprasad/spyret-lang](https://github.com/sidprasad/spyret-lang) · [spyret-ide](https://github.com/sidprasad/spyret-ide)         |

The integration's own README/docs are authoritative for that language. For *how each one solves the four subproblems*, see [Case Studies](case-studies.md).

---

## Integrate Spytial into your language

Don't see your host above? Spytial is designed to integrate with any host. Every integration resolves the **same four subproblems** — the mechanisms differ, the questions don't.

➡ **[The Four Subproblems](integration.md)** — the integrator's contract. Read this first.

Then in order:

- **[The Integration Pipeline](pipeline.md)** — the one diagram every integration instantiates.
- **[Case Studies](case-studies.md)** — how Python, Rust, and Pyret each answer the four.
- **[Custom Data Instances](custom-data-instance.md)** — the relational view your host needs to produce.
- **[Quick Start](quickstart.md)** — minimal end-to-end demo in the browser.
- **[Claude Code Skill](skill.md)** — `/integrate-language` walks you through the recipe and produces an integration design before you write any code.

---

## What `spytial-core` gives you

- **A canonical data model** — `IDataInstance` (atoms, tuples, types). [JSON serialization](json-data.md) is the lingua franca between your host and the browser.
- **A YAML spec language** — orientation, alignment, grouping, color, icons, projection. See the [YAML Reference](yaml-reference.md).
- **A query / selector engine** — Forge-style relational expressions (`^parent`, `Node - left.Node`, …) plus optional AlaSQL.
- **A constraint solver** — qualitative spatial constraints (above/below/left/right, alignment, cyclic) compiled to a linear system; conflicts surface as an Irreducible Inconsistent Subset (IIS).
- **A WebCola renderer** as a custom element (`<webcola-cnd-graph>`) plus an accessible parallel renderer (`<spytial-explorer>`).
- **Sequence support** — pairwise [policies](sequences.md) for stepping through traces and states with continuity.

## What `spytial-core` does *not* give you

- Anything host-specific. **You write the relationalizer.**
- A way to capture annotations from your source language. **You write the spec collector.**
- A delivery mechanism. The library is browser-side; you decide how the data + spec get there (HTTP server, Jupyter widget, IDE webview, language-server message, …).

---

Ready? **[The Integration Pipeline →](pipeline.md)**
