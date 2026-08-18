# Developer Guide

This guide explains how to work on **spytial-core**, with a focus on the pipeline-driven flow that powers demos and UI integrations. Use this as a map for where to plug in new functionality and how to reason about data moving through the system.

## Core mental model: the pipeline

Everything in this repo revolves around a **pipelined flow** from input data → evaluation → layout → rendering. You can see the full flow in the HTML demos inside `webcola-demo/`, which stitch together the core TypeScript APIs and visualize the output.

### Pipeline stages

1. **Data instance ingestion**
   - Parse or normalize input data (Alloy XML, JSON, Forge, etc.) into a `DataInstance`.
   - This is the canonical format that the rest of the system consumes.

2. **Evaluator initialization**
   - Pick a query evaluator (e.g., Forge-based, SGraph-based) that can interpret selectors.
   - Initialize the evaluator with the `DataInstance` so selectors and constraints can be resolved.

3. **Layout specification (CnD)**
   - Parse a CnD spec (constraints + directives) into a `LayoutSpec`.
   - This spec defines *what* the layout engine must satisfy (alignment, ordering, spacing, color, etc.).
   - **Note:** Projections are not part of the layout spec, and not part of spytial-core. Hand the engine an instance you already projected.

4. **Layout instance generation**
   - Build a `LayoutInstance` from the `LayoutSpec` + evaluator.
   - Generate a layout using the `DataInstance` (after any projection transform has been applied).

5. **Rendering / visualization**
   - Use the generated layout with WebCola, SVG, Canvas, or a React-based UI.
   - Most demos render through WebCola and provide controls for re-running the pipeline.

6. **Sequence continuity** *(optional)*
   - For ordered sequences of instances (e.g., Alloy traces), pass a `policy`, `prevInstance`, and `currInstance` to `renderLayout()`.
   - A **`SequencePolicy`** (e.g., `stability`, `changeEmphasis`, `randomPositioning`) is applied pairwise inside `renderLayout` to resolve prior positions for the solver.
   - See [docs/SEQUENCE_LAYOUT_API.md](./SEQUENCE_LAYOUT_API.md) for the full API reference.

### Demos that show the pipeline

The demos are the best references for how to wire everything up end-to-end:

- `webcola-demo/alloy-demo.html`
  - Demonstrates the **Alloy XML → AlloyDataInstance → ForgeEvaluator → Layout → WebCola** pipeline.
- `webcola-demo/json-demo.html`
  - Demonstrates the **JSON → JSONDataInstance → SGraphQueryEvaluator → Layout → WebCola** pipeline.
- `webcola-demo/dot-demo.html`
  - Demonstrates the **DOT → DotDataInstance → Evaluator → Layout → WebCola** pipeline, including the type hierarchy system.
- `webcola-demo/selector-synthesis-demo.html`
  - Shows the **selector synthesis pipeline**, including initialization and status reporting.
- `webcola-demo/structured-input-demo.html`
  - Full pipeline with structured input and interactive layout.
- `src/react-component-integration.tsx`
  - Example of how the pipeline can integrate into component-driven UIs; also the
    source of the components CDN bundle and its `window.mount*` API.

When adding new features, start by deciding **which stage of the pipeline** your change belongs to, then check the corresponding demo or component for patterns you can copy.

## Repository orientation

A quick map of the most relevant folders:

- `src/`
  - Core library code: parsers, evaluators, layout logic, and components.
- `webcola-demo/`
  - Interactive HTML/TSX demos showing complete pipeline usage.
- `docs/`
  - Deeper explanations of features, algorithms, and optimization work.
- `tests/`
  - Vitest-based unit/integration tests.

## Typical development workflow

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run a local file server for demos**
   ```bash
   npm run serve
   ```
   Then open `http://localhost:8080/webcola-demo/` and choose a demo HTML file.

3. **Build or watch**
   ```bash
   npm run build
   # or
   npm run dev
   ```

4. **Run tests**
   ```bash
   npm run test:run
   ```

## Adding a new pipeline stage or capability

When extending the system, use this checklist:

1. **Decide the stage**
   - Does it change input parsing? Evaluator behavior? Layout spec parsing? Rendering?
2. **Add or update a demo**
   - Most behavior is easiest to validate visually. Add a demo or extend an existing one.
3. **Document the behavior**
   - Add a short note in `docs/` so the next developer knows where your change lives.
4. **Add tests**
   - For pure logic changes, add unit tests under `tests/`.

## Glossary

- **CnD**: “Constraint & Directive” language for layout rules.
- **DataInstance**: Normalized, canonical graph data structure.
- **Evaluator**: Resolves selectors (queries) against a data instance.
- **LayoutSpec**: Parsed CnD specification.
- **LayoutInstance**: The runtime pipeline state (spec + evaluator) used to generate layouts.
## Projections

spytial-core has no projection API. It removed `applyProjectionTransform()` and
`IDataInstance.applyProjections()` in 6.0.0.

Projection is a transform on **data**, not a layout concern: it changes what is
diagrammed, not how the diagram is arranged. The engine lays out exactly the
instance it is handed, so a host that wants a projected view builds the projected
instance itself and passes that:

```
your data  ──►  your projection  ──►  IDataInstance  ──►  LayoutInstance.generateLayout()
```

This is how hosts already worked in practice — Cope and Drag, for one, projects
with its own Alloy instance package rather than calling ours.
