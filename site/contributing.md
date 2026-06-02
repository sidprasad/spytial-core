# Contributing to spytial-core

`spytial-core` is the browser-side engine that powers every Spytial integration. If you want to fix a bug in the layout solver, add a new constraint or directive, improve the renderer, or extend the selector language — this page is the starting point.

> Working on a **host integration** (Python, Rust, Pyret, or a new language)? You probably don't need to touch `spytial-core`. See [Integrations](integrations.md) for end-user docs or [New Language Integration](new-language-integration.md) to add a new host.

---

## Quick start

```bash
git clone https://github.com/sidprasad/spytial-core
cd spytial-core
npm install
npm run build:all      # parser + browser bundle + components
npm run test:run       # full test suite (vitest, headless)
npm run serve          # python http.server on :8080 (browse site/, demos)
```

Common loops:

| Task | Command |
|------|---------|
| Type check | `npm run typecheck` |
| Lint | `npm run lint` (or `npm run lint:fix`) |
| Format | `npm run format` |
| Watch build | `npm run dev` (tsup --watch) |
| Run a single test file | `npm run test:run -- path/to/file.test.ts` |
| Browse the docs site | `npm run serve`, then open `http://localhost:8080/site/` |

---

## Code layout

```
src/
  layout/              Constraint types, the layout solver, conflict reporting
    layoutinstance.ts    The orchestrator: spec + data → InstanceLayout
    constraint-types.ts  Shared types for ConstraintError, IConstraintValidator, etc.
    layoutspec.ts        Source-side spec data structures (RelativeOrientation, …)
    qualitative-constraint-validator.ts
                         Modal must/can/cannot validator (the default)
  data-instance/       JSONDataInstance, DataInstanceNormalizer, projection-transform
  evaluators/          Selector evaluation (Forge/Alloy + AlaSQL)
  translators/
    webcola/             Default visual renderer (<webcola-cnd-graph>)
    accessible/          Data Navigator + screen-reader spatial REPL
  evaluation/          Headless layout, consistency metrics — benchmark utilities
  synthesis/           Spec synthesis from examples (experimental)
  components/          React components (NoCodeView, ErrorMessageModal)
  index.ts             Public entry; re-exports the integrator-facing API
  browser.ts           Browser-bundle entry; registers custom elements
  cdn-globals.ts       CDN-bundle entry (window.spytialcore)
tests/                 vitest suite
site/                  Docsify integrator guide (this site)
```

---

## Adding a new constraint or directive

1. Add the source-side shape in [src/layout/layoutspec.ts](https://github.com/sidprasad/spytial-core/blob/main/src/layout/layoutspec.ts) — a new class that parses from YAML.
2. In [src/layout/layoutinstance.ts](https://github.com/sidprasad/spytial-core/blob/main/src/layout/layoutinstance.ts), translate the source-side shape into the engine's internal `LayoutConstraint` representation (a `topConstraint`, `leftConstraint`, alignment, group, bounding box, etc.).
3. For a new directive that changes appearance, hook into the directives pipeline in `layoutinstance.ts` (look for `generateAttributesAndRemoveEdges`, `addinferredEdges`, etc.).
4. Add tests in `tests/` matching the pattern of existing constraint/directive tests (`tests/align-constraint-examples.test.ts` is a good template).
5. Document the new constraint or directive **by example** in `site/constraints.md` or `site/directives.md` — every constraint there has a live diagram next to it, and yours should too. See `site/index.html` for the `<div class="spytial-diagram">` pattern.

---

## Layout solver

The default constraint validator is `QualitativeConstraintValidator` ([src/layout/qualitative-constraint-validator.ts](https://github.com/sidprasad/spytial-core/blob/main/src/layout/qualitative-constraint-validator.ts)). It computes a qualitative must/can/cannot relation over node positions, finds an irreducible inconsistent subset (IIS) when unsatisfiable, and exposes a `validate()` entrypoint that returns `{ layout, error, selectorErrors, validator }`.

A Z3-WASM oracle exists for test-only validation of the qualitative solver. It is not loaded at runtime in production — see [`project_minizinc_oracle`](#) for context.

---

## Renderers

The default visual renderer is `<webcola-cnd-graph>` (Web Component, [src/translators/webcola/webcola-cnd-graph.ts](https://github.com/sidprasad/spytial-core/blob/main/src/translators/webcola/webcola-cnd-graph.ts)). It accepts an `InstanceLayout` via `renderLayout(layout)` and emits `'constraint-error'` events when the spec is unsatisfiable.

The accessibility renderer (`<spytial-explorer>`, [src/translators/accessible/](https://github.com/sidprasad/spytial-core/blob/main/src/translators/accessible/)) extends the visual one with a Data Navigator overlay and the modal (must/can/cannot) spatial REPL. See [Custom Data Instances](custom-data-instance.md) and the [API Reference](api-reference.md).

---

## Sequence policies

Inter-frame continuity (stability, change-emphasis, random) lives in the same translator package; the public interface is documented in [Sequence Layouts](sequences.md). To add a new policy: implement `SequencePolicy`, call `registerSequencePolicy(policy)`, and it becomes available via `getSequencePolicy('your-name')`.

---

## PRs, issues, releases

- File issues at [github.com/sidprasad/spytial-core/issues](https://github.com/sidprasad/spytial-core/issues).
- PRs should include tests and a docs update (especially if you change the spec language).
- Releases are tagged from `main` and published via `npm run prepublishOnly` (clean + build:all).
