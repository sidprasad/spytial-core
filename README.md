# spytial-core

> The host-agnostic engine behind Spytial. Integrate spatial diagramming into your language.

`spytial-core` is the browser-side engine that turns relational data + a YAML spec of spatial constraints into a rendered diagram. It is **not** a tool for end users — it is the piece you embed when you want Spytial in a new host (a language, an IDE, a notebook, a debugger).

If you want to render Python objects, use **[sPyTial](https://github.com/sidprasad/spytial)**.
If you want to render Rust values, use **[Caraspace](https://github.com/sidprasad/caraspace)**.
If you want to render Pyret values, use **[Spyret](https://github.com/sidprasad/spyret-lang)**.
If you want to render Lean terms, use **[spytial-lean](https://github.com/sidprasad/spytial-lean)**.
If you want to add a new host to that list — read on.

---

## The integration guide

The full guide is published from [`site/`](./site/) and rendered with Docsify.

The structure mirrors the integrator's job:

- **Overview** — [What is spytial-core?](./site/getting-started.md) · [The Integration Pipeline](./site/pipeline.md) · [Quick Start](./site/quickstart.md)
- **Integrating Spytial Into a Language** — [The Four Subproblems](./site/integration.md) · [Case Studies](./site/case-studies.md) · [Custom Data Instances](./site/custom-data-instance.md)
- **Data** — [JSON Data Format](./site/json-data.md) · [Built-in Adapters](./site/data-adapters.md)
- **The YAML Spec Language** — [YAML Reference](./site/yaml-reference.md) · [Constraints](./site/constraints.md) · [Directives](./site/directives.md) · [Selector Syntax](./site/selectors.md)
- **Sequences of States** — [Sequence Layouts](./site/sequences.md)
- **API Reference** — [Exported API](./site/api-reference.md)
- **Cookbook** — [Examples](./site/examples.md)

To browse the guide locally:

```bash
npm run serve   # python3 -m http.server 8080
# open http://localhost:8080/site/
```

---

## Installation

NPM:

```bash
npm install spytial-core
```

CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
```

For reproducibility, pin a version (e.g. `spytial-core@2.5.2`).

---

## The five-line integration

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

const layout = new LayoutInstance(spec, evaluator).generateLayout(instance);
document.querySelector('webcola-cnd-graph').renderLayout(layout);
```

That's the entire core pipeline. Where `jsonPayload` and `yamlSpec` come from is the host integrator's job — see the [Quick Start](./site/quickstart.md) for a self-contained HTML example, and [The Four Subproblems](./site/integration.md) for the principled framing.

---

## What `spytial-core` ships

| Layer                | Highlights                                                                            |
|----------------------|---------------------------------------------------------------------------------------|
| **Data instances**   | `JSONDataInstance`, `AlloyDataInstance`, `DotDataInstance`, `RacketGDataInstance`, `PyretDataInstance`, `TlaDataInstance`, plus the `IDataInstance` interface for custom adapters. |
| **Spec language**    | YAML constraints (`orientation`, `align`, `cyclic`, `group`, `size`, `hideAtom`) and directives (`atomColor`, `edgeColor`, `icon`, `attribute`, `tag`, `inferredEdge`, `flag`, …). |
| **Selector engine**  | `SGraphQueryEvaluator` (Forge-style relational expressions) plus optional Forge / SQL evaluators. |
| **Layout solver**    | `LayoutInstance` + `QualitativeConstraintValidator` — qualitative spatial constraints with IIS reporting. |
| **Renderers**        | `<webcola-cnd-graph>` (visual), `<spytial-explorer>` (a11y + spatial REPL), `AccessibleTranslator` (semantic HTML / alt-text). |
| **Sequence support** | Pairwise policies (`stability`, `changeEmphasis`, `randomPositioning`, …) for inter-frame continuity. Custom policies via `registerSequencePolicy`. |
| **Selector synthesis** | Generate CnD selectors from positive/negative atom or pair examples. |
| **React components** | `InstanceBuilder`, `ReplInterface`, `ProjectionControls`, `ProjectionOrchestrator`, `ErrorMessageContainer`, `ReplWithVisualization`. |

Full export surface: [API Reference](./site/api-reference.md).

---

## Stable references

The YAML spec is mirrored to a CDN-stable URL for use by integrators / agents that want to pin a copy:

```
https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@<tag-or-sha>/docs/YAML_SPECIFICATION.md
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/...`)
3. Run `npm run build:all` and `npm run test:run`
4. Open a Pull Request

The dev-loop reference is in [`docs/DEV_GUIDE.md`](./docs/DEV_GUIDE.md).

---

MIT
