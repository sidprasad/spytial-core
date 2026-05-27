# Integrations

Spytial ships as a host-agnostic browser engine ([`spytial-core`](https://github.com/sidprasad/spytial-core)) plus a per-language integration. Pick your language; each integration has its own install, its own docs, and a host-friendly API for emitting atoms, relations, and layout specs.

| Host       | Install                                                                                                | Badge                                                                                                                                              | Docs & Repo                                                                                                                                  |
|------------|--------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **Python** (sPyTial)        | `pip install spytial-diagramming`                                                                       | [![PyPI](https://img.shields.io/pypi/v/spytial-diagramming.svg?label=pypi%3A%20spytial-diagramming)](https://pypi.org/project/spytial-diagramming/) | [sidprasad.github.io/spytial](https://sidprasad.github.io/spytial/) · [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial) |
| **Rust** (Caraspace)        | `caraspace = { git = "https://github.com/sidprasad/caraspace" }` in `Cargo.toml` (not yet on crates.io) | —                                                                                                                                                  | [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)                                                                     |
| **Pyret** (Spyret)          | Use the [Spyret IDE](https://github.com/sidprasad/spyret-ide)                                          | —                                                                                                                                                  | [github.com/sidprasad/spyret-lang](https://github.com/sidprasad/spyret-lang) · [spyret-ide](https://github.com/sidprasad/spyret-ide)         |

## What each integration gives you

The host integration is responsible for three things:

- **Walking your values** into atoms and relations. Python uses runtime reflection; Rust uses a `derive` macro; Pyret uses its value-skeleton machinery.
- **Collecting layout specs** from host-native annotations. Python decorators, Rust attribute macros, Pyret output methods — they all compile to the same YAML.
- **Surfacing the diagram** in your host's usual workflow. A function call, a notebook cell, an editor panel.

`spytial-core` handles the rest in the browser: selector evaluation, constraint solving, rendering, conflict reports, sequence continuity, accessibility.

## Cookbook

Worked examples (BSTs, heaps, BDDs, DAG construction, Huffman trees, hash tables, more) live in the [spytial-clrs](https://github.com/sidprasad/spytial-clrs) repo as Jupyter notebooks. Each notebook is small enough to read in one sitting and shows a real algorithm visualized with Spytial.

## Don't see your favorite language?

A new integration is mostly an exercise in answering four design questions. See **[The Four Subproblems](integration.md)** for the integrator's checklist.
