# The Integration Pipeline

The best integration example in this repo is the JSON demo:

[`webcola-demo/json-demo.html`](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/json-demo.html)

It is not a toy separate from the real path. It is the path: data comes in, a layout spec comes in, `spytial-core` produces an `InstanceLayout`, and the web component renders it.

The sections below break that demo into the parts an integration needs.

## 1. Put a renderer on the page

The demo page has a custom element where the diagram will appear:

```html
<webcola-cnd-graph
  id="graph-container"
  width="800"
  height="600"
  layoutFormat="default">
</webcola-cnd-graph>
```

It also loads the browser bundle:

```html
<script src="../dist/browser/spytial-core-complete.global.js"></script>
```

In a published integration, that script can come from a CDN instead of `../dist`.

## 2. Build the data instance

The demo reads JSON from a textarea. A language integration would usually generate the same JSON from a host value.

```javascript
const jsonText = getCurrentJsonText();
const dataInstance = new CndCore.JSONDataInstance(jsonText);
```

Interface-wise, the important thing is that `dataInstance` is an `IDataInstance`. `JSONDataInstance` is just the usual adapter for getting there.

## 3. Parse the layout spec

The demo also reads a CnD spec from the UI:

```javascript
const cndSpec = getCurrentCNDSpec() || "";
const layoutSpec = CndCore.parseLayoutSpec(cndSpec);
```

`layoutSpec` is the parsed `LayoutSpec`. In a host integration, `cndSpec` might come from decorators, attributes, macros, a method on the value, or plain YAML supplied by the user.

## 4. Create an evaluator

Selectors in the layout spec need to be evaluated against the data instance. The demo creates an evaluator and initializes it with the data:

```javascript
const evaluator = new CndCore.SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });
```

Interface-wise, `evaluator` is an `IEvaluator`. The concrete evaluator can vary; the rest of the layout path only needs the interface.

## 5. Generate the layout

Now the data, spec, and evaluator meet:

```javascript
const layoutResult = new CndCore.LayoutInstance(layoutSpec, evaluator)
  .generateLayout(dataInstance);

const instanceLayout = layoutResult.layout;
```

`instanceLayout` is the `InstanceLayout`: nodes, edges, groups, constraints, and metadata in the form the renderer expects.

## 6. Render it

The demo hands the layout to the custom element:

```javascript
const graph = document.getElementById("graph-container");
await graph.renderLayout(instanceLayout);
```

That is the browser side of the integration.

## The whole browser path

Stripped down, the demo's core path is:

```javascript
async function loadGraph() {
  const jsonText = getCurrentJsonText();
  const cndSpec = getCurrentCNDSpec() || "";

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

For a new host, the main question is not how to rewrite this browser path. It is how the host produces `jsonText` and `cndSpec`.

## Swapping in Alloy

The Alloy demo follows the same path:

[`webcola-demo/alloy-demo.html`](https://github.com/sidprasad/spytial-core/blob/main/webcola-demo/alloy-demo.html)

Only the data-instance step changes. Instead of JSON:

```javascript
const parsed = CndCore.AlloyInstance.parseAlloyXML(alloyXml);
const dataInstance = new CndCore.AlloyDataInstance(
  parsed.instances[currentInstanceIndex]
);
```

After that, the same interface-level path resumes:

- `IDataInstance` feeds an `IEvaluator`
- CnD text becomes a `LayoutSpec`
- `LayoutInstance.generateLayout(...)` returns an `InstanceLayout`
- the graph element renders that layout

## Where to go next

- [Quick Start](quickstart.md) — a smaller browser-only page using the same calls.
- [The Four Subproblems](integration.md) — what a host has to decide before it can produce `jsonText` and `cndSpec`.
