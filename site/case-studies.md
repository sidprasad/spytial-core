# Case Studies

Three (and a half) integrations, framed as their answers to [the four subproblems](integration.md).

---

## sPyTial — Python

Repo: [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Run-time reflection. Walks `__dict__` / `__slots__`, uses `id()` for identity, recognises lists/tuples/sets/dicts, scalars become typed atoms (`Int`, `String`, …). |
| Attaching specs       | Decorators (`@spytial.orientation(...)`, `@spytial.atom_color(...)`) on classes; module-level `spytial.spec(...)` for ad-hoc specs. Decorators read at `diagram(value)` time. |
| Presenting diagrams   | `spytial.diagram(data)` opens a browser tab; in Jupyter it returns an `IPython.display.HTML` so the diagram inlines under the cell. |
| Representation gaps   | Identity hook: `diagram(value, identity=lambda v: v.id)` lets users override `id()`-based identity when each step rebuilds objects. Attribute-style decorators (`@attribute(field='age')`) collapse fields-as-edges into labels. |

**Sequence support:** `spytial.diagramSequence(states, sequence_policy='stability')` maps directly to the `stability` [sequence policy](sequences.md) inside `renderLayout`.

---

## Caraspace — Rust

Repo: [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Type-directed serialization. The `SpytialDecorators` `derive` macro walks the type tree at compile time — through `Vec<T>`, `Option<T>`, `Box<T>`, nested combinations — and emits a runtime traversal. `export_json_instance::<T>(value)` produces the [JSON data instance format](json-data.md). |
| Attaching specs       | Procedural macros: `#[orientation(selector = "...", directions = [...])]`, `#[align(...)]`, `#[group(...)]`, `#[atom_color(...)]`, etc. Decorators on a type are collected through the entire reachable type tree, so you don't have to repeat them on container types. Escape hatch: `diagram_with_spec(value, raw_yaml)`. |
| Presenting diagrams   | `cargo run` produces an HTML page + JSON; a small HTTP server serves them at `http://localhost:8080`. |
| Representation gaps   | Field declaration order is preserved by the macro, so `left` always comes before `right`. The red-black tree example computes balance metadata in the relationalizer and emits it as additional atoms/relations. |

---

## Spyret — Pyret

Repos: [spyret-lang](https://github.com/sidprasad/spyret-lang), [spyret-ide](https://github.com/sidprasad/spyret-ide)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Pyret's value-skeleton machinery — constructor name, arity, field labels — reflects a value into atoms + relations. Built-in support for variants and singletons. |
| Attaching specs       | Output-method attachment: a function declares its visualization spec the way it would declare any other output method. The IDE (a fork of CPO) recognises the attachment and renders. |
| Presenting diagrams   | Ambient — Pyret's existing display protocol surfaces the diagram automatically next to the value, without an explicit `diagram(...)` call. The Spyret IDE hosts `spytial-core` in the existing CPO output panel. |
| Representation gaps   | Constructor argument order is the natural ordering. Adapter layers handle the few cases (e.g. unordered `Set`s) where ordering is genuinely absent. |

---

## Spytial-Lean — Lean 4

Repo: [github.com/sidprasad/spytial-lean](https://github.com/sidprasad/spytial-lean)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | A *Relationalizer* walks the elaborated `Expr` tree after WHNF reduction. Constructors → atoms; data arguments → tuples in named relations. Hash-cons identity from Lean's `Expr` gives sharing for free. |
| Attaching specs       | A typed Spec layer in Lean compiles to YAML for `spytial-core`. Users write Lean operations; the layer translates. Raw-YAML escape hatch is also exposed. |
| Presenting diagrams   | A ProofWidgets4 widget loads `spytial-core` and renders inside VS Code's infoview, alongside the proof state. |
| Representation gaps   | Implicit arguments and types can be hidden via directives. Derived structure (e.g. tree height in inductive types) is computed in the Spec layer and attached as `tag` directives. |


---

## Patterns across all five

A few things every working integration ends up doing:


1. **A small "diagram one value, fast" entry point.** `spytial.diagram(x)`, `caraspace::diagram(&x)`. Optimise the common case to a single line.

2. **Identity-aware reflection.** Without it, sharing and cycles produce duplicated nodes or stack overflows. This is the single most common bug in new integrations.

3. **An honest treatment of the gap problem.** Don't fake order, don't silently dedupe shared structure. When the runtime doesn't know, say so — and let users supply an adapter.
