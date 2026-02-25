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
   - **Note:** Projections are not part of the layout spec. They are applied as a pre-layout data transform via `applyProjectionTransform()`.

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
## Projection Transform (pre-layout data rewriting)

Projections are a **pre-layout data transformation**, not a layout directive. They operate on an `IDataInstance` and produce a new `IDataInstance` with projected types/atoms removed and relation arities collapsed. This is a form of metaprogramming: projections rewrite the datum itself before any layout logic runs.

### Why projections are not directives

Directives (color, size, alignment, etc.) describe how to **display** a given data instance. Projections change **what data** is displayed — they are a semantic transformation on the model. By decoupling projections from the layout engine:

- The layout engine has a simpler API: `generateLayout(instance)` takes one argument
- Projected instances can be reused for export, analysis, or rendering without going through the layout engine
- The projection logic is testable in isolation

### Architecture

```
IDataInstance  ──►  applyProjectionTransform()  ──►  projected IDataInstance  ──►  LayoutInstance.generateLayout()
                         ▲                                                              
                    Projection[]                                           
                    selections: Record<string, string>                                
```

### API

```typescript
import { applyProjectionTransform, Projection } from 'spytial-core';

const projections: Projection[] = [
  { sig: 'State', orderBy: 'next' }
];
const selections: Record<string, string> = {}; // type → chosen atom

const result = applyProjectionTransform(
  dataInstance,
  projections,
  selections,
  {
    // Optional: evaluator for orderBy sorting
    evaluateOrderBy: (sel) => evaluator.evaluate(sel).selectedTwoples(),
    // Optional: error handler
    onOrderByError: (sel, err) => console.warn(`orderBy error for ${sel}:`, err),
  }
);

// result.instance  — the projected IDataInstance (pass to layout)
// result.choices   — ProjectionChoice[] for populating UI controls
```

### Key types

| Type | Description |
|------|-------------|
| `Projection` | `{ sig: string; orderBy?: string }` — which type to project over |
| `ProjectionChoice` | `{ type, projectedAtom, atoms }` — UI dropdown metadata |
| `ProjectionTransformOptions` | `{ evaluateOrderBy?, onOrderByError? }` — optional callbacks |
| `ProjectionTransformResult` | `{ instance, choices }` — transform output |

### Ordering behavior

- Without `orderBy`: atoms are sorted lexicographically by ID
- With `orderBy` + `evaluateOrderBy` callback: atoms are topologically sorted based on the binary relation
- Cycles in the relation are broken by choosing the lexicographically smallest atom
- Atoms not in the relation are interleaved when their in-degree reaches 0

### Evaluation-order dependency (`orderBy` and the evaluator)

The `evaluateOrderBy` callback inside `applyProjectionTransform` is invoked **before** `instance.applyProjections()`. This means it evaluates against the **original, un-projected** data instance. This is intentional:

- The ordering relation (e.g., `next: Time → Time`) involves atoms of the projected type. After projection removes all but one atom, those relation tuples are gone.
- Layout selectors that run later (inside `generateLayout`) still work: atom IDs returned by the evaluator that don't exist in the projected graph are silently filtered out during node matching.

Consequence for callers:

```
evaluator.initialize({ sourceData: originalInstance })   // ① evaluator sees full data
applyProjectionTransform(originalInstance, ...)           // ② orderBy evaluated here
layoutInstance.generateLayout(projectedInstance)          // ③ layout on projected data
```

Do **not** re-initialise the evaluator with the projected instance between steps ② and ③ — the evaluator's role at step ③ is to resolve layout selectors, and IDs that were projected away are harmlessly ignored.

### Integration pattern

In demos and applications, projections are specified separately from the CnD layout spec:

```javascript
// 1. Initialise evaluator with the original (un-projected) instance
evaluator.initialize({ sourceData: originalInstance });

// 2. Define projections
const projections = [{ sig: 'Time', orderBy: 'next' }];
const selections = {};

// 3. Apply projection (pre-layout step) — orderBy evaluated here
const projResult = applyProjectionTransform(originalInstance, projections, selections, {
  evaluateOrderBy: (sel) => evaluator.evaluate(sel).selectedTwoples(),
});

// 4. Generate layout on the projected instance
const layoutResult = layoutInstance.generateLayout(projResult.instance);

// 5. Populate projection controls with choices
updateProjectionControls(projResult.choices);
```