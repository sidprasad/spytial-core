# Case Studies

Three (and a half) integrations, framed as their answers to [the four subproblems](integration.md).

---

## sPyTial — Python

Repo: [github.com/sidprasad/spytial](https://github.com/sidprasad/spytial)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Run-time reflection via a relationalizer registry that dispatches on type — dataclasses, lists/tuples/sets/dicts, generic objects, primitives each have their own walker. Identity is `id()` by default, with overrides (see Gaps). Scalars become typed atoms (`Int`, `String`, …) marked `isBuiltin: true`. |
| Attaching specs       | Three paths, all read at `diagram(value)` time: (1) class decorators (`@spytial.orientation(...)`, `@spytial.atom_color(...)`), (2) `typing.Annotated[T, Orientation(...)]` for type-level specs (Python 3.9+, the modern path), (3) object-level annotation calls (`spytial.annotate_orientation(obj, ...)`) for ad-hoc instances. The `spytial-core` spec vocabulary splits into **constraints** (orientation, align, group, cyclic) and **directives** (atomColor, size, icon, attribute, hideField, hideAtom, inferredEdge, tag, flag, projection). |
| Presenting diagrams   | `spytial.diagram(data)` auto-detects environment — `"inline"` in Jupyter (returns `IPython.display.HTML`), `"browser"` otherwise (opens a tab via `webbrowser`). Also `"file"` (writes HTML to disk) and `"headless"` (Selenium for benchmarking). Type-override escape hatch: `diagram(value, as_type=AnnotatedType(...))` re-routes a value's spec at the call site. |
| Representation gaps   | `diagram(value, identity=lambda v: v.id)` overrides `id()`-based identity for snapshot/deepcopy workflows; matching keys collapse to a single atom across frames. Attribute-style decorators (`@attribute(field='age')`) collapse fields-as-edges into labels. Sequence support via `spytial.sequence()` with `label_strategy='persist'` or `'back_construct'` (the latter resolves labels after all frames record, fixing snapshot-during-construction patterns). |

**Sequence support:** `spytial.diagramSequence(states, sequence_policy='stability')` maps directly to the `stability` [sequence policy](sequences.md) inside `renderLayout`.

---

## Caraspace — Rust

Repo: [github.com/sidprasad/caraspace](https://github.com/sidprasad/caraspace)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Type-directed serialization. The `SpytialDecorators` `derive` macro walks the type tree at compile time — recursively unwrapping `Vec<T>` → `Option<T>` → `Box<T>` → `T` with a fixed precedence — and emits a runtime traversal. Identity is **counter-based with singleton dedup**: each traversed value gets a fresh sequential ID (`atom0`, `atom1`, …), but zero-sized values (`None`, `true`, `false`, unit variants) are deduped via a `(type, label) → id` cache so the same `None` doesn't appear thousands of times. *(Note: not pointer addresses — pointer identity is fragile under Rust's move semantics.)* `export_json_instance::<T>(value)` produces the [JSON data instance format](json-data.md). |
| Attaching specs       | Procedural macros: `#[orientation(selector = "...", directions = [...], negated = false)]`, `#[align(...)]`, `#[group(...)]`, `#[atom_color(...)]`, `#[cyclic(...)]`, `#[size(...)]`, `#[icon(...)]`, `#[edge_style(...)]`, `#[hide_field(...)]`, `#[hide_atom(...)]`, `#[inferred_edge(...)]`, `#[tag(...)]`, `#[attribute(...)]`, `#[flag(...)]` — full constraint + directive coverage. Decorators on a type are collected through the entire reachable type tree (via a `DecoProbe` pattern that gracefully handles types without a `HasSpytialDecorators` impl), so you don't repeat them on container types. Escape hatch: `diagram_with_spec(value, raw_yaml)`. |
| Presenting diagrams   | `caraspace::diagram(value)` writes an HTML file to `/tmp/rust_viz_data.html` (template inlines JSON + YAML) and opens it via `open` / `xdg-open` / `start`. CDN-pinned `spytial-core@<version>` bundle, `<webcola-cnd-graph>` element. `SPYTIAL_NO_OPEN=1` suppresses auto-open for headless use. |
| Representation gaps   | Field declaration order is preserved by the macro, so `left` always comes before `right`. The red-black tree example computes balance metadata in the relationalizer and emits it as additional atoms/relations. Negation in the YAML wire format is `hold: never`, not a boolean — keep the mapping consistent if you build a parallel macro layer. |

---

## Spyret — Pyret

Repos: [spyret-lang](https://github.com/sidprasad/spyret-lang), [spyret-ide](https://github.com/sidprasad/spyret-ide)

| Subproblem            | Answer                                                                                                |
|-----------------------|-------------------------------------------------------------------------------------------------------|
| Recovering structure  | Pyret's value-skeleton machinery — constructor name, arity, field labels — reflects a value into atoms + relations. Spyret skips the JSON layer entirely and uses `PyretDataInstance` directly (a Path-B integration where the host runtime form is already close to relational). Built-in support for variants and singletons. |
| Attaching specs       | A **`_cndspec()` instance method** on the constructor returns a YAML string at render time. Spec retrieval is **runtime evaluation**, not static metadata — the spec can vary per-instance and depend on runtime state. Genuinely different from the decorator-shaped attachment in Python/Rust. Raw-YAML escape hatch via `genlayout(value, rawYamlString)`. |
| Presenting diagrams   | The Spyret IDE (a fork of CPO) provides a `Ctrl-Alt-I` keybinding and a `genlayout(value, cndSpec)` Pyret function. Either invocation evaluates the value's `_cndspec()` and renders into the existing CPO output panel — `<webcola-cnd-graph>` from a CDN-pinned `spytial-core` bundle. **Not strictly ambient**: invocation is explicit, but lives next to the existing display panel so the friction is low. Bidirectional `geninput` feature also exists (interactive diagram → Pyret value). |
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
