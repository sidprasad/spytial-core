---
name: integrate-language
description: Use this skill when the user wants to integrate a new host language with Spytial — phrases like "integrate <X> with Spytial", "make Spytial work with <X>", "build a Spytial frontend/binding/adapter for <X>", "port spytial/caraspace to <X>", "Spytial bindings for <X>". Walks the user through the four subproblems (recover structure, attach specs, present diagrams, handle gaps) and produces a concrete integration design before any code is written. Fetches canonical recipe and contract from the spytial-core docs over HTTP.
version: 0.2.0
---

# Integrate a host language with Spytial

You are guiding a developer through designing and building an integration of a new host language (Haskell, Clojure, Smalltalk, OCaml, …) with Spytial. Spytial already has working integrations for Python (sPyTial), Rust (Caraspace), Pyret (Spyret), and Lean 4 (spytial-lean). Each one solved the same four subproblems with very different mechanisms. Your job is to help the user solve those four subproblems for their host before writing any code.

**Internet access is required.** This skill does not bundle the recipe — it fetches the canonical docs over HTTP so it stays in sync with spytial-core. If `WebFetch` is unavailable, tell the user and stop.

---

## Phase 0 — What this skill does, and what it doesn't

**Does:**
- Walks the user through a phased design for a new Spytial host integration.
- Produces a written design document covering all four subproblems before any code.
- Optionally scaffolds a minimum-viable JSON-emitting integration (Phase 4).

**Doesn't:**
- Modify `spytial-core` itself. The integration is a *new* repo or package that consumes `spytial-core` from npm or via the CDN bundle.
- Scaffold a host-specific framework. Host languages are too different (Rust macros vs. Lean elaborator vs. Python reflection share no implementation). The four-subproblem frame is what's invariant.
- Implement `IDataInstance` directly. Default to emitting the canonical JSON shape and wrapping it in `JSONDataInstance` (Path A in the docs). Only override that default if Phase 1 surfaces a measured reason.
- Cover sequence / state-machine integration. The skill targets a single-frame port (one value, one diagram). Multi-frame work — Alloy traces, debugger-frame stepping, proof-state evolution — uses the `SequencePolicy` mechanism in `sequences.md` and is the next port of call once a single-frame integration is rendering.

---

## Phase 0.5 — Load the canonical recipe

Before asking the user any questions, `WebFetch` these three load-bearing sources. Read them so your guidance reflects what the docs actually say, not what training data remembers.

- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/integration.md` — the four subproblems, contract rules, pre-flight checklist
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/case-studies.md` — Python/Rust/Pyret/Lean worked examples
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/src/data-instance/interfaces.ts` — `IDataInstance`, `IAtom`, `ITuple`, `IType`, `IRelation`

The other three sources (listed at the bottom) are reference material for specific Phase 2 subsections. The rule: **fetch each one before entering the subsection it serves, never from memory.** Mid-subsection fetches are fine — pause, fetch, resume. Citing what training data remembers about YAML or the README in place of fetching is a defect.

**The implementations are the ground truth, not the case studies.** `case-studies.md` flattens the surface — load-bearing patterns (Caraspace's singleton dedup, sPyTial's `identity_resolver`, Spyret's `_cndspec` runtime evaluation, Lean's elaborator hooks) live in the code, not the summary tables. When the host you're integrating is adjacent to one of the existing four, browse the actual repo:

- Python — `github.com/sidprasad/spytial`
- Rust — `github.com/sidprasad/caraspace`
- Pyret — `github.com/sidprasad/spyret-lang` + `github.com/sidprasad/spyret-ide`
- Lean — `github.com/sidprasad/spytial-lean`

Skim the entry-point file (`diagram(...)`, `caraspace::diagram(...)`, `genlayout(...)`) and the relationalizer / spec-collection code. Five minutes of source reading per analogous host saves a wrong design decision.

---

## Phase 1 — Read the room, then interrogate

**First, choose the mode.** Beginner cues in the user's prompt — "never integrated", "first time", "just prototyping", "how do I hook this up", "i'm just trying" — should pivot you out of the questionnaire. A wall of design questions is wrong for someone who wants a runnable starting point. Instead:

- **Skip the questions below.** Make plausible defaults from what the user already said: host language, example shape, likely surface (REPL/notebook/file). State your assumptions in one short paragraph and invite pushback.
- **Lead with a runnable 30–40 line example.** A host-side relationalizer that emits canonical JSON for the user's classical structure, plus an HTML harness wired to the core pipeline (§2.3) and a *pinned* CDN bundle. Code first, narrative second.
- **Frame as postscript, not preamble.** Close with a short paragraph that names the four invariants (Recover, Attach, Present, Gaps) in one sentence each, identifies which assumptions in your example map to which invariant (especially the identity model — it's the #1 bug in new integrations), and offers to walk the design when the user is ready. The full phased walkthrough below is then **opt-in**.

**Otherwise — designer cues** ("design a Spytial integration for X", "what's the right shape", "how should I structure this", or any prompt that already names mechanisms) — ask these six questions in **one batched message**, not one at a time. Adapt wording to what the user has already told you. Each question maps to one of the four subproblems.

1. **Host language and runtime.** What language? Compiled, interpreted, or staged? Is there a REPL, a notebook protocol, an IDE infoview, or just a library? *(Maps to Subproblem 3 — Present.)*

2. **Identity model.** This is the load-bearing decision and the #1 source of broken integrations. Two branches:

   - **The runtime supplies stable identity** — Python `id()`, JS object references, JVM `System.identityHashCode`, Lean `Expr` hash-cons. Use it directly. State the function from value to atom ID concretely (e.g. *"`id(v)` for objects, `(type_name, value)` for primitives"*, not *"object identity"*).
   - **Identity must be supplied** — covers both pure-FP hosts where equal values are indistinguishable (Haskell, Clojure, OCaml, Elm, Idris) **and value-semantic hosts where the language's identity primitive is too fragile for diagrams** (Rust by-value moves: a freshly destructured `Person` and the original have different addresses; OCaml without `ref`s; any host where the same logical value reappears at multiple addresses). Pick **one** strategy before continuing:
     - **Hash-cons** — structural hash + cycle-breaking memo. Default for ASTs and lambda-calculus terms where two equal sub-trees *should* collapse.
     - **Path-from-root** — every occurrence is its own atom; sharing is invisible. Default for "show me every position" diagrams.
     - **Counter + singleton dedup** — fresh sequential ID per traversed value, with a small `(type, label) → atom_id` cache so zero-sized or value-equal singletons (`None`, `true`, `false`, unit variants, `()`) share one atom. **This is what Caraspace actually does for Rust** (not pointer addresses, despite case-studies's terse summary). Cheap, deterministic, avoids mass duplication of primitives.
     - **Explicit ID field** the user adds to their type. Cleanest when the user controls the type.
     - **`StableName` / observable sharing** (GHC-only, brittle, GC-sensitive). Last resort.

   State which branch and, if supplied, which strategy and why. *(Maps to Subproblem 1 — Recover.)*

3. **Spec-attachment idiom.** What's the natural way users in this language attach metadata to types/values? The seam is host-specific. Pick the most idiomatic — users will attach specs hundreds of times; awkward syntax compounds:

   - **Class decorators / function annotations** — Python `@spytial.orientation(...)`, Java/Kotlin annotations.
   - **Type-level metadata** — Python `typing.Annotated[T, Orientation(...)]` (the modern Python path; works alongside decorators), Scala phantom types, TypeScript branded types.
   - **Object-level annotation calls** — `spytial.annotate_orientation(obj, ...)` for ad-hoc instances without modifying the class.
   - **Procedural / derive macros** — Rust `#[orientation(...)]` + `#[derive(SpytialDecorators)]`.
   - **Type-class / trait instances** — Haskell `class Spytial a where spec :: a -> Spec`, OCaml functors, Scala typeclasses.
   - **Value-instance method returning a spec** — Pyret's `_cndspec()`, where the spec is **computed at render time**, not statically attached. Genuinely different from decorator-shaped attachment: spec can vary per-instance, depend on runtime state, can't be inlined statically.
   - **Tactic / elaborator hooks** — Lean's elaborator + ProofWidgets4 layer.

   *(Maps to Subproblem 2 — Attach.)*

4. **Surface.** Where will the diagram physically appear? Browser tab, Jupyter notebook cell, IDE infoview widget, file written to disk, embedded in a docs site? List all that apply. *(Maps to Subproblem 3 — Present.)*

5. **Trigger.** How does the diagram get *invoked*? Explicit call (`diagram(x)`), ambient via the host's normal display protocol, IDE command, or always-on widget? Some hosts want multiple — Lean is IDE-infoview *and* ambient; Jupyter Python supports both inline `_repr_html_` *and* explicit `spytial.diagram(...)`. List all that apply, then pick the default. *(Also Subproblem 3 — Present. Surface and trigger are independent — don't conflate them.)*

6. **Target user and one classical example.** Library authors who want to instrument their own types? End developers debugging unknown values? Both? Pick one classical structure (BST, linked list, AST, DAG with sharing) you want working end-to-end first. *(Maps to Subproblem 4 — Gaps.)*

Do not move to Phase 2 until you have answers. Make reasonable inferences if the user gives partial answers; reflect them back for confirmation.

---

## Phase 2 — Design the four subproblems

For each subproblem, produce a concrete artifact. Reference the case studies (already fetched in Phase 0.5) for analogues.

### 2.1 Recover

Fetch (before deciding) for the JSON-vs-`IDataInstance` decision and the built-in-adapter table:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/custom-data-instance.md`

Decide:
- **Relationalizer technique.** Run-time reflection? Type-directed serialization (compile-time)? Value-skeleton traversal? Elaborated-term walk? Pick one and justify it against the host's identity model from Q2.
- **Identity strategy.** What's the function from host value to atom ID? Be precise — "`id(v)` for objects, hash for value types" is concrete; "we'll use object identity" is not. Hosts in Q2's "supplied" branch must restate the strategy (hash-cons / path / counter+singleton / explicit ID / `StableName`) and show how it appears in code.
- **Identity override hook.** Even hosts with stable runtime identity need a user-supplied override — when each frame of a sequence rebuilds the value (immutable redux-style, deepcopied snapshots, recomputed AST passes), `id()`-based identity breaks across frames. sPyTial exposes `diagram(value, identity=lambda v: v.id)` and a precedence chain (object-level `__spytial_object_id__` > `identity_resolver` > `id()`). Plan for this hook from day one — sequence/snapshot workflows always need it.
- **Singleton deduplication.** Zero-sized or value-equal scalars (`None`, `true`, `false`, unit variants, repeated `Int 0`s) should share one atom. Maintain a `(type, label) → atom_id` cache during the walk and reuse on hit. **Without this, a tree of integers becomes thousands of duplicate `42` atoms.** Caraspace's singleton dedup is what makes its counter-based identity tractable.
- **Container unwrapping (compile-time hosts).** Macro / type-directed walks must recurse through generic containers — `Vec<T>` → `T`, `Option<T>` → `T`, `Box<T>` → `T`, `Arc<T>` → `T`, `Map<K, V>` → `(K, V)` — with a fixed precedence and a graceful handling of types that don't carry specs (Caraspace uses a probe pattern: inherent vs. trait method resolution to detect `HasSpytialDecorators` without compile errors). Document the unwrap order; users will hit `Vec<Option<Box<T>>>` quickly.
- **Sketch.** For the classical structure from Q6, write out the resulting `IAtom`s and `ITuple`s by hand. Confirm the contract from `interfaces.ts` (already fetched in Phase 0.5):
  - Every atom: `{ id, type, label }`, plus an optional `labels?: Record<string, string[]>` for host-specific metadata that should render *prominently on the node* (Skolems in Alloy, type-class instances or refinement types in Haskell, scope info in a debugger). Don't reach for `labels` for ordinary fields — those are relations. Caraspace and sPyTial currently ship without `labels?` populated; it's optional.
  - Every relation: `{ id, name, types, tuples: [{ atoms, types }] }`.
- **`isBuiltin` linkage.** Primitive types (Int, String, Bool, …) should ship in an `IType` with `isBuiltin: true`. That's what the layout-level `flag: hideDisconnectedBuiltIns` keys off of — without it, every literal you've ever atomised litters the diagram. (`JSONDataInstance` will infer types if you don't ship them, but you lose the builtin flag — wire it through if your relationalizer knows which types are primitives.)
- **Existing adapter as a template.** If your host's runtime already produces a Graphviz-DOT, Pyret-skeleton, TLA+-trace, or rkt-graphable shape, look at the matching `IDataInstance` subclass before writing your own — `DotDataInstance`, `PyretDataInstance`, `TlaDataInstance`, `RacketGDataInstance` (all listed in `custom-data-instance.md`'s built-in-adapter table). Spyret skips the JSON layer entirely and uses `PyretDataInstance` directly because Pyret values are already structured value-skeletons; that's a legitimate "Path B" choice when the host's runtime form is close to relational.

### 2.2 Attach

Fetch (before deciding) for the YAML spec surface area:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/yaml-reference.md`

Decide:
- **Seam.** The mechanism users will use to attach specs (already chosen in Q3). Justify against the host's idioms.
- **Constraint vs. directive vocabulary.** `spytial-core` separates two kinds of spec entries — your typed DSL should mirror the split or users will collide on naming:
  - **Constraints** (`orientation`, `align`, `group`, `cyclic`) — rules the layout must satisfy. Take a `selector` + parameters + an optional `negated`/`hold` modifier.
  - **Directives** (`atomColor`, `size`, `icon`, `edgeColor`, `attribute`, `hideField`, `hideAtom`, `inferredEdge`, `tag`, `flag`, `projection`) — appearance, metadata, projection. Take a target + rendering hint.
- **Signatures.** Draft signatures for at least `orientation`, `align`, `group` (constraints) plus `attribute` and `atomColor` (directives). Don't ship a typed DSL that only covers constraints — `attribute` and `atomColor` are the most-used directives and the typed surface should include them.
- **Two escape hatches, not one.** Typed DSLs always miss cases. Most working integrations end up with both:
  - **Raw-YAML escape** — `diagram_with_spec(value, raw_yaml)` (Caraspace) or equivalent. Pass-through for whatever the typed DSL doesn't cover.
  - **Type-override escape** — sPyTial's `diagram(value, as_type=AnnotatedType(...))` re-routes a value's spec to a different annotation set without raw YAML. Useful when one call site needs a different rendering than the type's static decoration.
- **Composition.** How do specs on a container type and on its element type merge? Caraspace's macro recursively unwraps `Vec<Person>` to `Person`, collects decorators on both, and merges. Walk through one example end-to-end (e.g. `Company { employees: Vec<Person> }` with attributes on both `Company.name` and `Person.age`) and confirm the merged spec is what users would expect.

### 2.3 Present

Fetch (before deciding) for the exact pipeline code and CDN URL:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/README.md`

The surface and trigger choices are already locked from Q4 / Q5. Here, decide the technical platform.

Decide:
- **Bundle source.** NPM (`spytial-core`) or CDN? **If CDN, pin a version** — `spytial-core@2.5.2` over bare `spytial-core`. Papers, locked notebooks, and reproducibility-sensitive workflows depend on this; bare CDN URLs silently shift under users. The README has the canonical pinned URL.
- **Renderer element.** `<webcola-cnd-graph>` is the visual default. `<spytial-explorer>` wraps it and adds an a11y / spatial-REPL surface — pick it when accessibility is a first-class requirement for your host's audience (academic tooling, classroom use, IDE plugins). Both expose the same `renderLayout(layout)` method, so swapping is a one-line change.
- **Core pipeline.** The browser-side payload is identical across hosts and runs in **five stages**: `JSONDataInstance` → `parseLayoutSpec` → `SGraphQueryEvaluator.initialize` → `LayoutInstance.generateLayout` → element `renderLayout`. (The README markets this as a "five-line integration"; the actual snippet is six or seven physical lines depending on import style — same five stages either way. Quote stages, not lines.) Confirm you understand each stage and what it produces.

### 2.4 Gaps

For the classical example from Q6, decide:
- **Ordering.** How is the order of children/elements expressed? Three layered options, in order of preference:
  1. **Insertion order from the relationalizer** — preserve field declaration order (Rust), constructor argument position (Lean), dictionary insertion order (Python 3.7+).
  2. **`orderBy` directive** on a relation — when there's a "next" pointer or similar.
  3. **`evaluateOrderBy` callback** — when the `orderBy` relation has a cycle and lexicographic tiebreak isn't good enough. Pyret uses source position. Hosts with richer position data (line/column, time of evaluation) can supply something more meaningful here. See `integration.md` §4 for the hook.
- **One derived metric.** Pick something not in the data (BST height, linked-list length, DAG topological depth, RB-tree black-height). Compute it in the relationalizer and emit as extra atoms/tuples (e.g. a `height: Node → Int` relation), OR compute in JS via a `tag` directive. State which and why.
- **Sharing/cycles.** What's the default? "Faithful (one atom referenced twice)" is the right default; "duplicate-on-share" is opt-in for diagrams where the visual blow-up is too painful.

---

## Phase 3 — Pre-flight checklist

Open `integration.md` (already fetched) and walk the user through the four-checkbox pre-flight list at the bottom of the page. Do not skip — each item is load-bearing. If any answer is "no" or "not yet," return to the relevant Phase 2 section.

---

## Phase 4 — Build the minimum viable integration

Only after Phases 1–3 are signed off.

1. **Emit JSON.** Implement the relationalizer to produce JSON matching the `JSONDataInstance` shape (atoms + relations). Do not implement `IDataInstance` directly unless Phase 1 surfaced a measured reason (huge data, existing graph structure, fine-grained control over `applyProjections`/`generateGraph`).

2. **Wire to a minimal HTML harness.** Use the core pipeline from `README.md` (the five-stage `JSONDataInstance` → `parseLayoutSpec` → `SGraphQueryEvaluator` → `LayoutInstance` → `renderLayout` flow). Load the bundle from a *pinned* CDN version (e.g. `spytial-core@2.5.2`) for the prototype.

3. **Round-trip the classical example from Q6.** Confirm the diagram renders. Confirm the derived metric from §2.4 appears. Confirm shared references render as one atom.

4. **Stop.** The user has a working integration. Polish, packaging, and host-idiomatic ergonomics come next, but those are the user's design space, not this skill's.

---

## Anti-patterns

From the "patterns across all" section of `case-studies.md` — three things every previous integration got bitten by:

- **Don't fake order.** Sets are unordered. If your relationalizer invents an order, downstream `orderBy` directives lie. Preserve insertion order or attach an explicit `orderBy`.
- **Don't silently dedupe shared references.** If `(a, b)` and `(c, b)` both point to the same `b`, render it as one atom referenced twice. Two independent atoms is a different graph.
- **Don't skip identity-aware reflection.** Without it, sharing and cycles produce wrong diagrams or infinite loops. This is the most common bug in new integrations.

---

## Source URLs

The skill fetches these from spytial-core. The recipe and contract live in those files, not here — update the docs and the skill picks up the change. (The Anti-patterns section above is a deliberate exception: it's a short, load-bearing safety reminder repeated verbatim from `case-studies.md` so an agent can't skip it.)

- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/integration.md` — the four subproblems and pre-flight checklist
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/case-studies.md` — Python, Rust, Pyret, Lean worked examples
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/custom-data-instance.md` — JSON-vs-`IDataInstance` decision
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/src/data-instance/interfaces.ts` — `IDataInstance`/`IAtom`/`ITuple`/`IType`/`IRelation` contract
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/yaml-reference.md` — YAML spec language reference (Phase 2.2 only)
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/README.md` — core pipeline + pinned CDN URL (Phase 2.3, Phase 4)
