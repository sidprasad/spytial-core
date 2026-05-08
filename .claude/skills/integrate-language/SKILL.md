---
name: integrate-language
description: Use this skill when the user wants to integrate a new host language with Spytial — phrases like "integrate <X> with Spytial", "make Spytial work with <X>", "build a Spytial frontend/binding/adapter for <X>", "port spytial/caraspace to <X>", "Spytial bindings for <X>". Walks the user through the four subproblems (recover structure, attach specs, present diagrams, handle gaps) and produces a concrete integration design before any code is written. Fetches canonical recipe and contract from the spytial-core docs over HTTP.
version: 0.1.0
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

---

## Phase 0.5 — Load the canonical recipe

Before asking the user any questions, `WebFetch` these three sources. Read them so your subsequent guidance reflects what the docs actually say, not what you remember.

- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/integration.md` — the four subproblems, contract rules, pre-flight checklist
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/case-studies.md` — Python/Rust/Pyret/Lean worked examples
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/src/data-instance/interfaces.ts` — `IDataInstance`, `IAtom`, `ITuple`, `IType`, `IRelation`

The other three sources (listed at the bottom) are fetched on demand during later phases.

---

## Phase 1 — Interrogate the host

Ask these five questions in **one batched message**, not one at a time. Adapt wording to what the user has already told you. Each question maps to one of the four subproblems.

1. **Host language and runtime.** What language? Compiled, interpreted, or staged? Is there a REPL, a notebook protocol, an IDE infoview, or just a library? *(Maps to Subproblem 3 — Present.)*

2. **Identity model.** When two pieces of code reference "the same value," how does the runtime know? Stable object identity (`id()` in Python, references in Rust)? Hash-consing? Pure value semantics with no sharing? Be specific — getting this wrong is the #1 bug in new integrations. *(Maps to Subproblem 1 — Recover.)*

3. **Spec-attachment idiom.** What's the natural way users in this language attach metadata to types/values? Decorators, attributes, type-class instances, procedural macros, derive macros, output methods, tactic hooks, something else? *(Maps to Subproblem 2 — Attach.)*

4. **Surface.** Where will the diagram appear? Browser tab, Jupyter-style notebook output, IDE infoview widget, terminal-launched HTML file? Explicit `diagram(x)` call, or ambient (auto-rendered as part of the host's normal display)? *(Maps to Subproblem 3 — Present.)*

5. **Target user and one classical example.** Library authors who want to instrument their own types? End developers debugging unknown values? Both? Pick one classical structure (BST, linked list, AST, DAG) you want working end-to-end first. *(Maps to Subproblem 4 — Gaps.)*

Do not move to Phase 2 until you have answers. Make reasonable inferences if the user gives partial answers; reflect them back for confirmation.

---

## Phase 2 — Design the four subproblems

For each subproblem, produce a concrete artifact. Reference the case studies (already fetched in Phase 0.5) for analogues.

### 2.1 Recover

Decide:
- **Relationalizer technique.** Run-time reflection? Type-directed serialization (compile-time)? Value-skeleton traversal? Elaborated-term walk? Pick one and justify it against the host's identity model from Q2.
- **Identity strategy.** What's the function from host value to atom ID? Be precise — "`id(v)` for objects, hash for value types" is concrete; "we'll use object identity" is not.
- **Sketch.** For one example value (the classical structure from Q5), write out the resulting `IAtom`s and `ITuple`s by hand. Confirm the contract: every atom has `id`/`type`/`label`; every relation has `id`/`name`/`types`/`tuples`. Mark primitives `isBuiltin: true`.

If you need the exact interface shapes, you already have `interfaces.ts` from Phase 0.5. If you need details on the JSON path vs. implementing `IDataInstance` directly, fetch:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/custom-data-instance.md`

### 2.2 Attach

Decide:
- **Seam.** The mechanism users will use to attach specs: decorator, macro, attribute, output method, type-class instance, etc. Justify against the host's idioms from Q3.
- **Signatures.** Draft signatures for at least `orientation`, `align`, `group`, plus a raw-YAML escape hatch (`diagram_with_spec(value, raw_yaml)` or equivalent). The escape hatch is non-negotiable — typed DSLs always miss cases.
- **Composition.** How do specs on a container type and on its element type merge? (Look at how Caraspace handles `Vec<Person>` and `Person` independently.)

If you need details on what the YAML spec language can express, fetch:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/yaml-reference.md`

### 2.3 Present

Decide:
- **Pattern.** Explicit call (`spytial.diagram(x)`) or ambient output (display protocol)?
- **Bundle source.** NPM (`spytial-core`) or CDN? Where is the JS loaded from?
- **Five-line skeleton.** The browser-side payload is identical across hosts: `JSONDataInstance` → `parseLayoutSpec` → `SGraphQueryEvaluator` → `LayoutInstance` → `renderLayout`. Confirm you understand it.

If you need the exact five-line skeleton, fetch:
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/README.md`

### 2.4 Gaps

For the classical example from Q5, decide:
- **Ordering.** How is the order of children/elements expressed? Insertion order from the relationalizer, an `orderBy` directive, or a runtime callback?
- **One derived metric.** Pick something not in the data (BST height, linked-list length, DAG topological depth). Compute it in the relationalizer and emit as extra atoms/tuples, OR compute in JS via a `tag` directive. State which.
- **Sharing/cycles.** What's the default? "Faithful (one atom referenced twice)" is the right default; "duplicate-on-share" is opt-in.

---

## Phase 3 — Pre-flight checklist

Open `integration.md` (already fetched) and walk the user through the four-checkbox pre-flight list at the bottom of the page. Do not skip — each item is load-bearing. If any answer is "no" or "not yet," return to the relevant Phase 2 section.

---

## Phase 4 — Build the minimum viable integration

Only after Phases 1–3 are signed off.

1. **Emit JSON.** Implement the relationalizer to produce JSON matching the `JSONDataInstance` shape (atoms + relations). Do not implement `IDataInstance` directly unless Phase 1 surfaced a measured reason (huge data, existing graph structure, fine-grained control over `applyProjections`/`generateGraph`).

2. **Wire to a minimal HTML harness.** Use the five-line skeleton from `README.md`. Load the bundle from CDN for the prototype.

3. **Round-trip the classical example from Q5.** Confirm the diagram renders. Confirm the derived metric from §2.4 appears. Confirm shared references render as one atom.

4. **Stop.** The user has a working integration. Polish, packaging, and host-idiomatic ergonomics come next, but those are the user's design space, not this skill's.

---

## Anti-patterns

From the "patterns across all" section of `case-studies.md` — three things every previous integration got bitten by:

- **Don't fake order.** Sets are unordered. If your relationalizer invents an order, downstream `orderBy` directives lie. Preserve insertion order or attach an explicit `orderBy`.
- **Don't silently dedupe shared references.** If `(a, b)` and `(c, b)` both point to the same `b`, render it as one atom referenced twice. Two independent atoms is a different graph.
- **Don't skip identity-aware reflection.** Without it, sharing and cycles produce wrong diagrams or infinite loops. This is the most common bug in new integrations.

---

## Source URLs

The skill fetches these on demand. Update the spytial-core docs and the skill updates with them — there is no inlined copy.

- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/integration.md` — the four subproblems and pre-flight checklist
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/case-studies.md` — Python, Rust, Pyret, Lean worked examples
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/custom-data-instance.md` — JSON-vs-`IDataInstance` decision
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/src/data-instance/interfaces.ts` — `IDataInstance`/`IAtom`/`ITuple`/`IType`/`IRelation` contract
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/site/yaml-reference.md` — YAML spec language reference (Phase 2.2 only)
- `https://raw.githubusercontent.com/sidprasad/spytial-core/main/README.md` — five-line consumer skeleton (Phase 2.3, Phase 4)
