# The Integration Pipeline

Every Spytial integration does the same five jobs. Some happen in the host; the rest happen in `spytial-core` in the browser. The diagram below is itself rendered with Spytial — `next` orients stages top-to-bottom and `runsOn` groups them by side:

<div class="spytial-diagram" data-height="520" data-caption="The pipeline, drawn with Spytial: five Stage atoms chained by `next` (orientation [below]) and grouped by Side via the `contains` relation.">
<template class="data">
{
  "atoms": [
    {"id": "host",    "type": "Side",  "label": "Host side (you write)"},
    {"id": "browser", "type": "Side",  "label": "spytial-core (browser)"},
    {"id": "s1", "type": "Stage", "label": "1. Relationalize — atoms, tuples, types"},
    {"id": "s2", "type": "Stage", "label": "2. Collect spec — YAML CnD"},
    {"id": "s3", "type": "Stage", "label": "3. Serialize + deliver — JSON + YAML"},
    {"id": "s4", "type": "Stage", "label": "4. Run layout — LayoutInstance.generateLayout"},
    {"id": "s5", "type": "Stage", "label": "5. Render — WebColaCnDGraph / AccessibleTranslator"}
  ],
  "relations": [
    {"id": "next", "name": "next", "types": ["Stage", "Stage"],
     "tuples": [
       {"atoms": ["s1", "s2"], "types": ["Stage", "Stage"]},
       {"atoms": ["s2", "s3"], "types": ["Stage", "Stage"]},
       {"atoms": ["s3", "s4"], "types": ["Stage", "Stage"]},
       {"atoms": ["s4", "s5"], "types": ["Stage", "Stage"]}
     ]},
    {"id": "contains", "name": "contains", "types": ["Side", "Stage"],
     "tuples": [
       {"atoms": ["host", "s1"],    "types": ["Side", "Stage"]},
       {"atoms": ["host", "s2"],    "types": ["Side", "Stage"]},
       {"atoms": ["host", "s3"],    "types": ["Side", "Stage"]},
       {"atoms": ["browser", "s4"], "types": ["Side", "Stage"]},
       {"atoms": ["browser", "s5"], "types": ["Side", "Stage"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: next, directions: [below] }
  - group: { selector: contains, name: "Side" }
  - size: { selector: Stage, width: 340, height: 50 }
directives:
  - atomColor: { selector: Stage, value: "#dbe7f3" }
  - atomColor: { selector: Side,  value: "#f6f8fa" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

## Stage by stage

### 1. Relationalize

Walk your host's value graph and emit:

- **Atoms**: `{ id, type, label }` for every "thing" worth seeing.
- **Tuples**: ordered atom-id sequences for every edge / field / relation. Arity is unrestricted (binary is most common, but ternary+ is fine).
- **Types** (optional): a hierarchy if your host has subtyping. If you skip this, types are inferred from atom `type` fields.

This is where host knowledge lives. Python uses `id()`-keyed reflection, Rust uses procedural macros, and Pyret uses a value-skeleton helper.

→ See [Custom Data Instances](custom-data-instance.md) and the [JSON format](json-data.md).

### 2. Collect the spec

Your host's annotations, decorators, attributes, or DSL become a YAML CnD spec. The spec has two parts:

```yaml
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
```

Constraints control geometry (`orientation`, `align`, `cyclic`, `group`, `size`, `hideAtom`).
Directives control appearance (`atomColor`, `edgeColor`, `icon`, `attribute`, `tag`, `inferredEdge`, `flag`, `hideField`).

→ See [YAML Reference](yaml-reference.md), [Constraints](constraints.md), [Directives](directives.md).

### 3. Deliver the inputs to the browser

The library is browser-side. You decide how to get JSON + YAML there:

- **Local HTTP** (Caraspace): write `rust_viz_data.html` and `rust_viz_data.json` to disk, start `python -m http.server`, open the page.
- **Jupyter widget / inline HTML** (sPyTial): `IPython.display.HTML(...)` with the bundle and JSON inlined.
- **Editor extension** (Spyret IDE): VS Code webview talks to a language server.

There is no required transport. Whatever channel you have, send two strings: the JSON instance and the YAML spec.

### 4. Run the layout

Inside the browser, layout setup looks like this:

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

The layout is just data. Most integrations pass it to the bundled custom element:

```html
<webcola-cnd-graph id="g" width="800" height="600"></webcola-cnd-graph>
<script>
  document.getElementById('g').renderLayout(layout);
</script>
```

For accessibility, use `<spytial-explorer>` (Data Navigator overlay, screen-reader spatial REPL, must/can modal queries) or call `AccessibleTranslator` directly to produce semantic HTML, alt text, and a `SpatialNavigationMap`.

## Sequences

If your host has time or state (Alloy traces, Pyret reactor states, debugger steps), do not treat each frame as an unrelated diagram. Pass a [sequence policy](sequences.md) (`stability`, `changeEmphasis`, `randomPositioning`, ...) so consecutive frames stay visually continuous.

## Where to go next

- [The Four Subproblems](integration.md) — the main design questions for an integration.
- [Quick Start](quickstart.md) — the smallest possible end-to-end integration.
- [Case Studies](case-studies.md) — how Python, Rust, and Pyret each solve the four subproblems.
