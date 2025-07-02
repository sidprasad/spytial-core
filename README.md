# cnd-core

A fully-typed, tree-shakable TypeScript implementation of `Cope and Drag`.
Supports multiple languages (e.g. Alloy, Forge, DOT, Racket), 
with pluggable evaluators and layouts for extensibility.

---

## Features
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps

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
</script>
```

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