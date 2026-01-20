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

4. **Layout instance generation**
   - Build a `LayoutInstance` from the `LayoutSpec` + evaluator.
   - Generate a layout using the `DataInstance` and any projections or configuration.

5. **Rendering / visualization**
   - Use the generated layout with WebCola, SVG, Canvas, or a React-based UI.
   - Most demos render through WebCola and provide controls for re-running the pipeline.

### Demos that show the pipeline

The demos are the best references for how to wire everything up end-to-end:

- `webcola-demo/alloy-demo.html`
  - Demonstrates the **Alloy XML → AlloyDataInstance → ForgeEvaluator → Layout → WebCola** pipeline.
- `webcola-demo/json-demo.html`
  - Demonstrates the **JSON → JSONDataInstance → SGraphQueryEvaluator → Layout → WebCola** pipeline.
- `webcola-demo/selector-synthesis-demo.html`
  - Shows the **selector synthesis pipeline**, including initialization and status reporting.
- `webcola-demo/structured-input-demo.html`
  - Full pipeline with structured input and interactive layout.
- `webcola-demo/integrated-demo-components.tsx`
  - Example of how the pipeline can integrate into component-driven UIs.

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
