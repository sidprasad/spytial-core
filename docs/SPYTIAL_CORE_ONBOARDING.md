# Spytial Core Onboarding Guide

This guide explains how to run the core Spytial pipeline without modifying the WebCola demo. It covers installation, the Alloy → evaluator → layout flow showcased in `webcola-demo/webcola-demo.html`, and practical snippets you can reuse in your own tooling or gh-pages content.

## Installation options

Choose the option that matches your environment:

- **npm (recommended for bundlers):**
  ```bash
  npm install spytial-core
  ```
- **CDN (for static sites and quick embeds):**
  - jsDelivr: `https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`
  - unpkg: `https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`

The CDN bundle registers the `<webcola-cnd-graph>` custom element automatically and exposes the same API surface as the npm package.

## Core pipeline at a glance

These are the exact stages the WebCola demo executes when you click **Apply Layout**. Use the same sequence when wiring Spytial into your own UI or evaluator experiments.

1. **Parse Alloy XML** → `AlloyInstance.parseAlloyXML` turns Alloy XML into an `AlloyInstance` object.
2. **Wrap as a data instance** → `new AlloyDataInstance(alloy)` exposes the `IDataInstance` interface the layout engine expects.
3. **Select an evaluator** → Construct a `ForgeEvaluator` (an `IEvaluator`) and call `initialize({ sourceData: alloyXml })`. Swap in your own `IEvaluator` implementation if you need different semantics.
4. **Compile the layout spec** → `parseLayoutSpec(layoutYaml)` converts YAML into a `LayoutSpec`, reporting parse errors immediately.
5. **Build a layout executor** → `new LayoutInstance(layoutSpec, evaluator)` prepares the engine that will evaluate selectors and constraints.
6. **Generate a layout** → `layoutInstance.generateLayout(dataInstance, projections)` returns an `InstanceLayout` (nodes, edges, groups, constraints) plus projection metadata.
7. **Render however you like** → Feed the `InstanceLayout` to your renderer (e.g., WebCola, React, or another graph component). The demo passes it to `<webcola-cnd-graph>`.

## Minimal TypeScript example

The snippet below mirrors the demo logic while remaining framework-agnostic. Replace `alloyXml` and `layoutYaml` with your own content.

```ts
import {
  AlloyInstance,
  AlloyDataInstance,
  ForgeEvaluator,
  parseLayoutSpec,
  LayoutInstance,
} from 'spytial-core';

// 1) Parse Alloy XML
const alloy = AlloyInstance.parseAlloyXML(alloyXml);
const dataInstance = new AlloyDataInstance(alloy);

// 2) Prepare an evaluator (you can inject a different IEvaluator here)
const evaluator = new ForgeEvaluator();
evaluator.initialize({ sourceData: alloyXml });

// 3) Parse the CND YAML layout
const layoutSpec = parseLayoutSpec(layoutYaml);

// 4) Generate the layout (projections map can be empty if unused)
const layoutRunner = new LayoutInstance(layoutSpec, evaluator);
const { layout } = layoutRunner.generateLayout(dataInstance, {});

// 5) Send `layout` to your renderer of choice
console.log(layout.nodes, layout.edges);
```

## Using the WebCola custom element

If you are authoring static docs or gh-pages, you can render the result directly in the browser bundle without a build step:

```html
<!-- Include the browser bundle (auto-registers the custom element) -->
<script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>

<div id="mount">
  <webcola-cnd-graph></webcola-cnd-graph>
</div>

<script>
  // Assume `layout` is the InstanceLayout returned by LayoutInstance.generateLayout
  const graphEl = document.querySelector('webcola-cnd-graph');
  graphEl.data = layout; // triggers a rerender
</script>
```

The browser bundle also exposes React helpers (e.g., `CombinedInputComponent`, `ReplInterface`) if you prefer to compose the layout editor UI seen in the demo without touching its HTML.

## Tips for adapting the demo flow

- Keep the demo unchanged; instead, copy its pipeline into your own markdown or gh-pages content using the steps above.
- For evaluator experiments, implement the `IEvaluator` interface and swap it into step 3 without changing the rest of the pipeline.
- Use projections sparingly at first (`projections` argument in `generateLayout`) to validate your data before layering more constraints.
- If a constraint fails, catch the thrown error and surface it in your UI before retrying with adjusted YAML or projections.
