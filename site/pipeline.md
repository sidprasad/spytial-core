# The Integration Pipeline

Every Spytial integration — Python, Rust, Pyret, Lean, your future host — funnels through the same five-stage pipeline. Internalising this picture is the single most useful thing for an integrator.

```
   ┌─── HOST SIDE (you write) ────┐   ┌──────── spytial-core (browser) ────────┐
   │                              │   │                                        │
   │   host value                 │   │                                        │
   │      │                       │   │                                        │
   │      ▼                       │   │                                        │
   │   1. Relationalize           │   │                                        │
   │      → atoms, tuples, types  │   │                                        │
   │                              │   │                                        │
   │   2. Collect spec            │   │                                        │
   │      → YAML CnD              │   │                                        │
   │                              │   │                                        │
   │   3. Serialize + deliver     │   │                                        │
   │      → JSON over HTTP /      │   │                                        │
   │        webview / widget      │──▶│  4. JSONDataInstance + parseLayoutSpec │
   │                              │   │     → SGraphQueryEvaluator             │
   │                              │   │     → LayoutInstance.generateLayout()  │
   │                              │   │                                        │
   │                              │   │  5. Translator                         │
   │                              │   │     → WebColaCnDGraph (visual)         │
   │                              │   │     → AccessibleTranslator (a11y)      │
   └──────────────────────────────┘   └────────────────────────────────────────┘
```

## Stage-by-stage

### 1. Relationalize

Walk your host's value graph and emit:

- **Atoms**: `{ id, type, label }` for every "thing" worth seeing.
- **Tuples**: ordered atom-id sequences for every edge / field / relation. Arity is unrestricted (binary is most common, but ternary+ is fine).
- **Types** (optional): a hierarchy if your host has subtyping. If you skip this, types are inferred from atom `type` fields.

This is where host knowledge lives. Python uses `id()`-keyed reflection, Rust uses procedural macros, Pyret uses a value-skeleton helper, Lean walks the elaborated `Expr` tree.

→ See [Custom Data Instances](custom-data-instance.md) and the [JSON format](json-data.md).

### 2. Collect spec

Your host's annotations / decorators / attributes / DSL → a YAML CnD spec. Two parts:

```yaml
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
```

Constraints control geometry (`orientation`, `align`, `cyclic`, `group`, `size`, `hideAtom`).
Directives control appearance (`atomColor`, `edgeColor`, `icon`, `attribute`, `tag`, `inferredEdge`, `flag`, `hideField`).

→ See [YAML Reference](yaml-reference.md), [Constraints](constraints.md), [Directives](directives.md).

### 3. Deliver to the browser

The library is browser-side. You decide how to get JSON + YAML there:

- **Local HTTP** (Caraspace): write `rust_viz_data.html` and `rust_viz_data.json` to disk, start `python -m http.server`, open the page.
- **Jupyter widget / inline HTML** (sPyTial): `IPython.display.HTML(...)` with the bundle and JSON inlined.
- **IDE webview** (Spytial-Lean): ProofWidgets4 message-passes data into a webview that imports `spytial-core`.
- **Editor extension** (Spyret IDE): VS Code webview talks to a language server.

There's no required transport. Whatever channel you have, push two strings: the JSON instance and the YAML spec.

### 4. Run the layout

Inside the browser, the canonical recipe is:

```typescript
import {
  JSONDataInstance,
  parseLayoutSpec,
  SGraphQueryEvaluator,
  LayoutInstance,
} from 'spytial-core';

const instance  = new JSONDataInstance(jsonPayload);
const spec      = parseLayoutSpec(yamlSpec);
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: instance });

const layoutInstance = new LayoutInstance(spec, evaluator);
const layout         = layoutInstance.generateLayout(instance);
```

The convenience helper `setupLayout(spec, instance, evaluator)` does the last three lines.

→ See the [API Reference](api-reference.md).

### 5. Render

The layout is just data. Most integrations hand it to the bundled custom element:

```html
<webcola-cnd-graph id="g" width="800" height="600"></webcola-cnd-graph>
<script>
  document.getElementById('g').renderLayout(layout);
</script>
```

For accessibility, swap in `<spytial-explorer>` (Data Navigator overlay, screen-reader spatial REPL, must/can modal queries) or call `AccessibleTranslator` directly to produce semantic HTML / alt-text / a `SpatialNavigationMap`.

## Sequences

If your host has time/state — Alloy traces, Pyret reactor states, debugger steps — you don't loop through stage 4 blindly. You pass a [sequence policy](sequences.md) (`stability`, `changeEmphasis`, `randomPositioning`, …) so consecutive frames stay visually continuous.

## Where to go next

- [The Four Subproblems](integration.md) — the principled framing of the integrator's job.
- [Quick Start](quickstart.md) — the smallest possible end-to-end integration.
- [Case Studies](case-studies.md) — how Python, Rust, Pyret, and Lean each solve the four subproblems.
