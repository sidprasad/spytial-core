# The Integration Pipeline

Complete presentational demo: [`webcola-demo/json-demo.html`](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/json-demo.html).

This page pulls out the browser-side calls from that demo. It starts at the browser boundary, where the host has already produced two values:

- serialized data, usually JSON
- a layout spec

The browser-side code turns those into a rendered diagram.

## 1. Put a renderer on the page

Add the custom element that will receive the final layout:

```html
<webcola-cnd-graph
  id="graph-container"
  width="800"
  height="600"
  layoutFormat="default">
</webcola-cnd-graph>
```

Load the browser bundle:

```html
<script src="../dist/browser/spytial-core-complete.global.js"></script>
```

In a published integration, the script can come from a CDN instead of `../dist`.

## 2. Build an `IDataInstance`

If the host emits JSON, adapt it into the data interface:

```javascript
const dataInstance = new CndCore.JSONDataInstance(jsonText);
```

`JSONDataInstance` is the adapter. The rest of the pipeline only needs the `IDataInstance` interface.

## 3. Parse the layout spec

Turn the Spytial spec into a `LayoutSpec`:

```javascript
const layoutSpec = CndCore.parseLayoutSpec(cndSpec);
```

The `cndSpec` string can come from decorators, attributes, macros, a method on the value, a config file, or a textarea.

## 4. Initialize an `IEvaluator`

Selectors in the layout spec are evaluated against the data instance:

```javascript
const evaluator = new CndCore.SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });
```

The concrete evaluator can vary. The layout step only needs an `IEvaluator`.

## 5. Generate an `InstanceLayout`

The data, spec, and evaluator meet in `LayoutInstance`:

```javascript
const layoutResult = new CndCore.LayoutInstance(layoutSpec, evaluator)
  .generateLayout(dataInstance);

const instanceLayout = layoutResult.layout;
```

`instanceLayout` contains the nodes, edges, groups, constraints, and metadata needed by the renderer.

## 6. Render

Pass the layout to the custom element:

```javascript
const graph = document.getElementById("graph-container");
await graph.renderLayout(instanceLayout);
```

That is the browser-side path.

## Complete Browser Path

Put together:

```javascript
async function loadGraph(jsonText, cndSpec) {
  const dataInstance = new CndCore.JSONDataInstance(jsonText); // IDataInstance

  const evaluator = new CndCore.SGraphQueryEvaluator();        // IEvaluator
  evaluator.initialize({ sourceData: dataInstance });

  const layoutSpec = CndCore.parseLayoutSpec(cndSpec);         // LayoutSpec
  const layoutResult = new CndCore.LayoutInstance(layoutSpec, evaluator)
    .generateLayout(dataInstance);

  const graph = document.getElementById("graph-container");
  await graph.renderLayout(layoutResult.layout);               // InstanceLayout
}
```

For a complete presentational demo around these calls, see [`webcola-demo/json-demo.html`](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/json-demo.html).

## Alloy Variant

The Alloy demo uses the same interface-level path. Only the data-adapter step changes:

```javascript
const parsed = CndCore.AlloyInstance.parseAlloyXML(alloyXml);
const dataInstance = new CndCore.AlloyDataInstance(
  parsed.instances[currentInstanceIndex]
);
```

After that, `dataInstance` is still an `IDataInstance`, so the evaluator, layout, and render steps are the same. The complete Alloy version is [`webcola-demo/alloy-demo.html`](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/alloy-demo.html).

## Where to go next

- [Quick Start](quickstart.md) — a smaller browser-only page using the same calls.
- [New Language Integration](new-language-integration.md) — what a host has to decide before it can produce `jsonText` and `cndSpec`.
