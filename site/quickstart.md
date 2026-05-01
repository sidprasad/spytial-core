# Quick Start

The smallest possible integration: a self-contained HTML page that renders one diagram. Every host integration is a refinement of this.

---

## End-to-end example

Save the following as `demo.html`, then open it in a browser:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>spytial-core minimal integration</title>
  <script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
</head>
<body>
  <webcola-cnd-graph id="g" width="800" height="500"></webcola-cnd-graph>

  <script>
    const { JSONDataInstance, parseLayoutSpec, SGraphQueryEvaluator, LayoutInstance } = spytialcore;

    // 1. Relational data — produced by the host (here, hand-written)
    const data = {
      atoms: [
        { id: "a", type: "Node", label: "Alice"  },
        { id: "b", type: "Node", label: "Bob"    },
        { id: "c", type: "Node", label: "Carol"  },
      ],
      relations: [
        {
          id: "parent", name: "parent", types: ["Node", "Node"],
          tuples: [
            { atoms: ["a", "b"], types: ["Node", "Node"] },
            { atoms: ["a", "c"], types: ["Node", "Node"] },
          ],
        },
      ],
    };

    // 2. Spec — produced by the host (here, hand-written YAML)
    const spec = `
      constraints:
        - orientation: { selector: parent, directions: [above] }
      directives:
        - atomColor: { selector: Node, value: "#4a90d9" }
        - flag: hideDisconnectedBuiltIns
    `;

    // 3. Wire up the pipeline
    const instance  = new JSONDataInstance(data);
    const layoutSpec = parseLayoutSpec(spec);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: instance });

    const layout = new LayoutInstance(layoutSpec, evaluator).generateLayout(instance);

    // 4. Render
    document.getElementById('g').renderLayout(layout);
  </script>
</body>
</html>
```

The four numbered comments map directly to the [pipeline stages](pipeline.md). In a real integration:

- Step 1 comes from your **relationalizer** (Python reflection, Rust derive macro, Pyret skeleton, …).
- Step 2 comes from your **spec collector** (decorators, attributes, output methods, …).
- Steps 3–4 are identical across every host.

---

## Convenience: `setupLayout`

The three lines that build the evaluator + layout instance are common enough to have a helper:

```javascript
const { setupLayout } = spytialcore;

const layout = setupLayout(spec, instance, evaluator);
```

`setupLayout` parses the spec if you pass a string and returns the same `InstanceLayout` you'd get from `LayoutInstance.generateLayout`.

---

## Accessibility variant

Swap `<webcola-cnd-graph>` for `<spytial-explorer>` to get keyboard navigation, screen-reader announcements, and the must/can spatial REPL out of the box:

```html
<spytial-explorer id="g" width="800" height="500"></spytial-explorer>
<script>
  const explorer = document.getElementById('g');
  explorer.renderLayout(layout);
  explorer.enableAccessibility(layout, /* validator */ null, evaluator);
</script>
```

`SpytialExplorer` extends `WebColaCnDGraph` — same rendering API, plus an `enableAccessibility` call that wires up the [`AccessibleTranslator`](api-reference.md#accessibletranslator).

---

## NPM (instead of CDN)

For non-browser builds (Vite, Webpack, …):

```bash
npm install spytial-core
```

```typescript
import {
  JSONDataInstance,
  parseLayoutSpec,
  SGraphQueryEvaluator,
  LayoutInstance,
  setupLayout,
} from 'spytial-core';
```

The CDN bundle is the same module, exposed as the global `spytialcore`. Either path works for an integration; pick whichever fits your delivery mechanism.

---

## Where to go next

- [The Four Subproblems](integration.md) — the integrator's checklist.
- [Custom Data Instances](custom-data-instance.md) — how to feed your host's data in.
- [YAML Reference](yaml-reference.md) — every constraint and directive.
- [Sequences of States](sequences.md) — when you need to step through traces.
- [API Reference](api-reference.md) — the full export surface.
