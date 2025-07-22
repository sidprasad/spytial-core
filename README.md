# cnd-core

A fully-typed, tree-shakable TypeScript implementation of `Cope and Drag`.
Supports multiple languages (e.g. Alloy, Forge, DOT, Racket), 
with pluggable evaluators and layouts for extensibility.

## 🚀 New: Combined Input Component

The **Combined Input Component** provides a simplified API that eliminates the need to write complex synchronization logic between REPL, layout interface, and visualization components.

```javascript
// Simple setup - just one function call!
CndCore.mountCombinedInput('my-container', {
  cndSpec: 'nodes:\n  - { id: node, type: atom }',
  dataInstance: myPyretDataInstance,
  pyretEvaluator: window.__internalRepl,
  projections: {}
});
```

This replaces the complex setup shown in the Pyret REPL demo with a single, easy-to-use component.

---

## Features
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps
- **Combined Input Component**: Simplified API for complete data visualization setups
- **Real-time Synchronization**: Automatic sync between REPL, layout, and visualization

---

## Installation

```bash
npm install cnd-core
```

- [View on npm](https://www.npmjs.com/package/cnd-core)

---

## CDN

You can use the browser bundle directly from a CDN:

- **jsDelivr:**  
  [`https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js`](https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js)
- **unpkg:**  
  [`https://unpkg.com/cnd-core/dist/browser/cnd-core-complete.global.js`](https://unpkg.com/cnd-core/dist/browser/cnd-core-complete.global.js)

**Example usage:**
```html
<script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
<script>
  // CndCore is now available as a global variable
  // Example: const evaluator = new CndCore.SimpleGraphQueryEvaluator();
</script>
```

---

## Usage

### Importing

```typescript
// Import the main API and types
import { AlloyDataInstance, ForgeEvaluator, LayoutInstance, parseAlloyXML, parseLayoutSpec } from 'cnd-core';

// Or import only what you need for tree-shaking
import { RacketGDataInstance } from 'cnd-core/racket';
import { SimpleGraphQueryEvaluator } from 'cnd-core/evaluators';
```

---

### Example: Forge/Alloy XML → Layout → Render

```typescript
import { AlloyDataInstance, ForgeEvaluator, LayoutInstance, parseAlloyXML, parseLayoutSpec } from 'cnd-core';

// Parse Alloy XML
const alloyDatum = parseAlloyXML(alloyXmlString);
const dataInstance = new AlloyDataInstance(alloyDatum.instances[0]);

// Create evaluator
const evaluator = new ForgeEvaluator();
evaluator.initialize({ sourceData: alloyXmlString });

// Parse CnD Layout Spec
const layoutSpec = parseLayoutSpec(layoutSpecString);

// Create layout instance and generate layout
const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
const { layout } = layoutInstance.generateLayout(dataInstance, {});

// Use layout with your renderer or <webcola-cnd-graph> custom element
```

---

### Example: Racket JSON → Layout

```typescript
import { RacketGDataInstance, SimpleGraphQueryEvaluator, LayoutInstance, parseLayoutSpec } from 'cnd-core';

// Parse Racket JSON
const datum = JSON.parse(racketJsonString);
const dataInstance = new RacketGDataInstance(datum);

// Create evaluator
const evaluator = new SimpleGraphQueryEvaluator();
evaluator.initialize({ dataInstance });

// Parse layout spec
const layoutSpec = parseLayoutSpec(layoutSpecString);

// Create layout instance and generate layout
const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
const { layout } = layoutInstance.generateLayout(dataInstance, {});
```

---

### Web Component Usage

```html
<webcola-cnd-graph id="graph" width="800" height="600"></webcola-cnd-graph>
<script>
  // Assuming CndCore is loaded globally
  const graphElement = document.getElementById('graph');
  graphElement.renderLayout(layout); // layout from the pipeline above
  // Listen for drag events
  graphElement.addEventListener('node-drag-start', (e) => {
    console.log('drag start', e.detail);
  });
  graphElement.addEventListener('node-drag-end', (e) => {
    console.log('drag end', e.detail);
  });
  // Read positions programmatically
  const positions = graphElement.getNodePositions();
  console.log('node positions', positions);
</script>
```

---

### Combined Input Component (Simplified API)

The **Combined Input Component** provides a single, easy-to-use interface that combines REPL, layout interface, and graph visualization with automatic synchronization.

#### Basic Usage

```javascript
// Load the component bundle
<script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/components/react-component-integration.global.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/cnd-core/dist/components/react-component-integration.css">

// Simple setup
CndCore.mountCombinedInput('my-container', {
  cndSpec: 'nodes:\n  - { id: node, type: atom }',
  dataInstance: myPyretDataInstance,
  pyretEvaluator: window.__internalRepl,
  projections: {}
});
```

#### Advanced Configuration

```javascript
CndCore.mountCombinedInput('container-id', {
  // Initial data and evaluator
  cndSpec: 'nodes:\n  - { id: Person, type: atom, color: "#FF6B35" }',
  dataInstance: new CndCore.PyretDataInstance(myData),
  pyretEvaluator: window.__internalRepl,
  projections: { people: 'Person' },
  
  // Layout and behavior
  height: '800px',
  showLayoutInterface: true,
  autoApplyLayout: true,
  
  // Event callbacks
  onInstanceChange: (instance) => console.log('Data updated:', instance),
  onSpecChange: (spec) => console.log('Layout updated:', spec),
  onLayoutApplied: (layout) => console.log('Layout applied:', layout)
});
```

#### Alternative Usage Patterns

```javascript
// Create a div and append to document
const div = CndCore.createCombinedInputSetup(
  'nodes:\n  - { id: node, type: atom }',
  dataInstance,
  pyretREPLInternal,
  projections
);
document.body.appendChild(div);

// Direct setup function
CndCore.setupCombinedInput(
  'container-id',
  'nodes:\n  - { id: node, type: atom }',
  dataInstance,
  pyretREPLInternal,
  projections
);
```

#### What You Get

- **Pyret REPL Interface**: Command-line style data entry and manipulation
- **CnD Layout Interface**: Visual constraint specification with No-Code and Code views
- **Graph Visualization**: Real-time webcola-cnd-graph rendering
- **Automatic Synchronization**: All components stay in sync without manual event handling
- **Layout Management**: Automatic layout application with staleness indicators

---

## Quick Start: Visualizing Graphs with CnD Core (No React Required)

This guide shows how to use CnD Core in a plain HTML page to visualize Alloy or DOT graphs with a CND layout, using the CDN bundle and the `<webcola-cnd-graph>` custom element.

### 1. Include the CDN Bundle and Dependencies

```html
<!-- D3 and WebCola (required for layout/visualization) -->
<script src="https://d3js.org/d3.v4.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cnd-core/vendor/cola.js"></script>
<!-- CnD Core browser bundle -->
<script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
```

### 2. Add the Custom Element to Your HTML

```html
<webcola-cnd-graph id="graph" width="800" height="600"></webcola-cnd-graph>
```

### 3. Prepare Your Data and Layout Spec

- **Alloy XML:** Paste or load your Alloy XML instance as a string.
- **DOT:** Paste or load your DOT graph as a string.
- **CND Layout Spec:** Write your layout in YAML (as a string).

### 4. Run the Pipeline in JavaScript

```html
<script>
// For Alloy XML:
const alloyXml = `...your Alloy XML string...`;
const cndSpec = `...your CND YAML string...`;

// Parse Alloy XML and create data instance
const alloyDatum = CndCore.parseAlloyXML(alloyXml);
const dataInstance = new CndCore.AlloyDataInstance(alloyDatum.instances[0]);

// Create evaluator
const evaluator = new CndCore.ForgeEvaluator();
evaluator.initialize({ sourceData: alloyXml });

// Parse layout spec
const layoutSpec = CndCore.parseLayoutSpec(cndSpec);

// Create layout instance and generate layout
const layoutInstance = new CndCore.LayoutInstance(layoutSpec, evaluator, 0, true);
const { layout } = layoutInstance.generateLayout(dataInstance, {});

// Render in the custom element
const graphElement = document.getElementById('graph');
graphElement.renderLayout(layout);
</script>
```

#### For DOT graphs, use:
```html
<script>
const dotString = `...your DOT string...`;
const cndSpec = `...your CND YAML string...`;

const dataInstance = new CndCore.DotDataInstance(dotString);
const evaluator = new CndCore.SimpleGraphQueryEvaluator();
evaluator.initialize({ dataInstance });
const layoutSpec = CndCore.parseLayoutSpec(cndSpec);
const layoutInstance = new CndCore.LayoutInstance(layoutSpec, evaluator, 0, true);
const { layout } = layoutInstance.generateLayout(dataInstance, {});
document.getElementById('graph').renderLayout(layout);
</script>
```

---

### Minimal Example (Alloy)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script src="https://d3js.org/d3.v4.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/cnd-core/vendor/cola.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
</head>
<body>
  <webcola-cnd-graph id="graph" width="800" height="600"></webcola-cnd-graph>
  <script>
    // ...see above for pipeline code...
  </script>
</body>
</html>
```

---

**You do not need React or any build tools.**
Just include the scripts, use the custom element, and run the pipeline in plain JavaScript.

For more advanced usage, see the demo HTML files in the repo.

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---


## For Input

What I really envision is an extension to `IDataInstance` that allows atoms / relations to be ADDED in.