# spytial-core

A tree-shakable TypeScript implementation of `spytial`, usable for language integration.
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps
- **Selector Synthesis**: Auto-generate CnD selector expressions from examples

---

## Features

### Core Layout Engine
- **CnD (Constraint & Directive) Layout System**: Declarative constraint-based graph layouts
- **WebCola Integration**: Physics-based constraint solver with overlap avoidance
- **Multi-format Support**: Alloy/Forge, JSON, DOT, Racket, Pyret, TLA+
- **Interactive Input Graphs**: Built-in components for constraint-aware graph editing

### Selector Synthesis 🆕
Automatically generate selector expressions from examples without writing complex queries:

**Note:** Synthesis requires `SGraphQueryEvaluator`. Not available with `ForgeEvaluator`.

```typescript
import { synthesizeAtomSelector, synthesizeBinarySelector, 
         isSynthesisSupported, SGraphQueryEvaluator } from 'spytial-core';

// Check if synthesis is available for your evaluator
const evaluator = new SGraphQueryEvaluator();
if (!isSynthesisSupported(evaluator)) {
  console.warn('Synthesis not supported for this evaluator');
}

// Select some atoms and generate the selector
const selector = synthesizeAtomSelector([{
  atoms: [alice, bob, charlie],
  dataInstance: myInstance
}]);
// Returns e.g., "Student & Adult"

// Generate binary relation selectors for pairs
const pairSelector = synthesizeBinarySelector([{
  pairs: [[alice, bob], [charlie, diana]],
  dataInstance: myInstance
}]);
// Returns e.g., "friend" or "coworker & SameOffice"
```

Use synthesis to build authoring tools where users select nodes visually and constraints are generated automatically. See [Selector Synthesis Documentation](./docs/SELECTOR_SYNTHESIS.md) for details.

---

## Installation

```bash
npm install spytial-core
```

- [View on npm](https://www.npmjs.com/package/spytial-core)

---

## Quick Start

### Basic Layout

```typescript
import { LayoutInstance, parseLayoutSpec, SGraphQueryEvaluator } from 'spytial-core';

// Your CnD spec
const spec = `
  right(friend)
  align left(Student)
  color blue(Professor)
`;

const layoutSpec = parseLayoutSpec(spec);
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: myDataInstance });

const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
const result = layoutInstance.generateLayout(myDataInstance, {});
// Use result.layout with your visualization library
```

### Selector Synthesis

```typescript
import { 
  synthesizeAtomSelector, 
  synthesizeBinarySelector,
  createOrientationConstraint,
  createColorDirective
} from 'spytial-core';

// User selects nodes in your UI
const selectedAtoms = [aliceAtom, bobAtom, charlieAtom];

// Synthesize a selector that matches these atoms
const selector = synthesizeAtomSelector([{
  atoms: selectedAtoms,
  dataInstance: myInstance
}]);

// Generate CnD directives
const colorDirective = createColorDirective(selector, '#ff0000');
const orientationConstraint = createOrientationConstraint(selector, ['right']);

// Full spec
const cndSpec = `
  ${orientationConstraint}
  ${colorDirective}
`;
```

See the [full documentation](./docs/SELECTOR_SYNTHESIS.md) for advanced synthesis features.

---

## CDN

You can use the browser bundle directly from a CDN:

- **jsDelivr:**  
  [`https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`](https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js)
- **unpkg:**  
  [`https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`](https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js)

Once loaded, use via the global `CndCore` object:

```html
<script src="https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js"></script>
<script>
  const { synthesizeAtomSelector, synthesizeBinarySelector } = CndCore;
  
  // Your code here
  const selector = synthesizeAtomSelector([...]);
</script>
```

---

## API Reference

### Synthesis Functions

- **`synthesizeAtomSelector(examples, maxDepth?)`** - Generate unary selectors (for atoms)
- **`synthesizeBinarySelector(examples, maxDepth?)`** - Generate binary selectors (for pairs)
- **`synthesizeAtomSelectorWithExplanation(examples, maxDepth?)`** - With provenance tree
- **`synthesizeBinarySelectorWithExplanation(examples, maxDepth?)`** - With provenance tree

### Helper Functions

- **`createOrientationConstraint(selector, directions)`** - Generate orientation constraint strings
- **`createAlignmentConstraint(selector, alignment)`** - Generate alignment constraint strings
- **`createColorDirective(selector, color)`** - Generate color directive strings

### Core Classes

- **`LayoutInstance`** - Generate layouts from CnD specs
- **`SGraphQueryEvaluator`** - Evaluate selector expressions
- **`AlloyDataInstance`**, **`JSONDataInstance`**, etc. - Data format adapters

See [docs/](./docs/) for detailed documentation.

---

MIT

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---
