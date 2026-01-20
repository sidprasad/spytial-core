# spytial-core

A tree-shakable TypeScript implementation of `spytial`, usable for language integration.
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps
- **Selector Synthesis**: Auto-generate CnD selector expressions from examples
- **Schema Descriptions**: Generate LLM-friendly descriptions of data structures

---

## Features

### Schema Descriptions 🆕

Generate schema-level descriptions of data instances in multiple formats for LLM consumption, documentation, or analysis. Describes the **shape** of the data (types, relations, arities) rather than instance-level data.

```typescript
import { generateAlloySchema, generateSQLSchema, generateTextDescription } from 'spytial-core';

// Generate Alloy-style schema (sig-based)
const alloySchema = generateAlloySchema(dataInstance);
// Output:
// sig Node {
//   left: Node
//   right: Node
//   key: Int
// }

// Generate SQL-style schema (table-based)
const sqlSchema = generateSQLSchema(dataInstance);
// Output:
// CREATE TABLE Node (
//   id VARCHAR PRIMARY KEY
// );
// CREATE TABLE left (
//   source_Node VARCHAR REFERENCES Node(id),
//   target_Node VARCHAR REFERENCES Node(id)
// );

// Generate human-readable description
const textSchema = generateTextDescription(dataInstance);
// Output:
// Types:
// - Node (3 atoms)
// Relations:
// - left: Node -> Node (2 tuples)
// - right: Node -> Node (1 tuple)
// - key: Node -> Int (3 tuples)
```

**Use cases:**
- **LLM Integration**: Provide context to language models for generating selectors or constraints
- **Documentation**: Auto-generate schema documentation for data instances
- **Analysis**: Understand the structure of complex data models

See [Schema Descriptor API](#schema-descriptor-api) for full options and examples.

### Core Layout Engine
- **CnD (Constraint & Directive) Layout System**: Declarative constraint-based graph layouts
- **WebCola Integration**: Physics-based constraint solver with overlap avoidance
- **Multi-format Support**: Alloy/Forge, JSON, DOT, Racket, Pyret, TLA+
- **Interactive Input Graphs**: Built-in components for constraint-aware graph editing
- **Projection Support**: Dynamic UI controls for Forge/Alloy projection atom selection

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
- [Developer Guide](./docs/DEV_GUIDE.md)

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

### Projection Controls

For Forge/Alloy instances with projections, use the `ProjectionControls` component to let users dynamically select which atoms to project:

```typescript
import { ProjectionControls, LayoutInstance } from 'spytial-core';

// Generate layout with projections
const layoutResult = layoutInstance.generateLayout(dataInstance, projections);

// Render projection controls with the projection data
<ProjectionControls
  projectionData={layoutResult.projectionData}
  onProjectionChange={(type, atomId) => {
    // Update projection for this type
    projections[type] = atomId;
    // Regenerate layout with new projections
    const newLayout = layoutInstance.generateLayout(dataInstance, projections);
  }}
/>
```

The `projectionData` returned from `generateLayout()` includes:
- `type`: The signature being projected
- `projectedAtom`: The currently selected atom
- `atoms`: All available atoms for this type

See [webcola-demo/projection-controls-demo-vanilla.html](./webcola-demo/projection-controls-demo-vanilla.html) for a working example.

---

## Node Highlighting

Visualize selector and evaluator results by highlighting nodes directly in the graph. This feature allows you to examine selector results in context without triggering a layout refresh.

### Unary Selectors (Single Nodes)

```typescript
// Evaluate a unary selector
const result = evaluator.evaluate('Student');
const nodeIds = result.selectedAtoms();

// Highlight the nodes
const graph = document.querySelector('webcola-cnd-graph');
graph.highlightNodes(nodeIds);
```

### Binary Selectors (Node Pairs)

```typescript
// Evaluate a binary selector
const result = evaluator.evaluate('friend');
const pairs = result.selectedTwoples(); // [["Alice", "Bob"], ["Charlie", "Diana"]]

// Highlight with visual correspondence
graph.highlightNodePairs(pairs);

// Or with badges showing 1/2 correspondence
graph.highlightNodePairs(pairs, { showBadges: true });
```

### Clear Highlights

```typescript
// Remove all node highlights
graph.clearNodeHighlights();
```

### Visual Styling

- **Unary selectors**: Orange border with glow effect
- **Binary selectors**: 
  - First elements: Blue border (e.g., the source of a relation)
  - Second elements: Red border (e.g., the target of a relation)
  - Optional badges: Shows "1" and "2" to indicate correspondence

See [webcola-demo/node-highlighter-demo.html](./webcola-demo/node-highlighter-demo.html) for an interactive demo.

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

### Schema Descriptor API

Generate schema-level descriptions of data instances for LLM consumption or documentation.

#### `generateAlloySchema(dataInstance, options?)`

Generate an Alloy-style schema with signatures and fields.

```typescript
import { generateAlloySchema } from 'spytial-core';

const schema = generateAlloySchema(dataInstance, {
  includeBuiltInTypes: false,    // Exclude built-in types like Int, String
  includeTypeHierarchy: true,    // Include 'extends' clauses
  includeArityHints: false       // Add multiplicity hints (one, lone, some, set)
});

// Example output:
// sig Node {
//   left: Node
//   right: Node
//   key: Int
// }
```

**Options:**
- `includeBuiltInTypes` (default: `false`) - Include built-in types (Int, String, etc.)
- `includeTypeHierarchy` (default: `true`) - Show type inheritance with `extends`
- `includeArityHints` (default: `false`) - Add multiplicity keywords (experimental)

#### `generateSQLSchema(dataInstance, options?)`

Generate SQL CREATE TABLE statements for types and relations.

```typescript
import { generateSQLSchema } from 'spytial-core';

const schema = generateSQLSchema(dataInstance, {
  includeBuiltInTypes: false,
  includeTypeHierarchy: true
});

// Example output:
// CREATE TABLE Node (
//   id VARCHAR PRIMARY KEY
// );
// 
// CREATE TABLE left (
//   source_Node VARCHAR REFERENCES Node(id),
//   target_Node VARCHAR REFERENCES Node(id)
// );
```

**Options:**
- `includeBuiltInTypes` (default: `false`) - Include built-in types
- `includeTypeHierarchy` (default: `true`) - Add comments showing type inheritance

#### `generateTextDescription(dataInstance, options?)`

Generate a human-readable plain text description.

```typescript
import { generateTextDescription } from 'spytial-core';

const description = generateTextDescription(dataInstance, {
  includeBuiltInTypes: false
});

// Example output:
// Types:
// - Node (5 atoms)
// - Person (3 atoms)
// 
// Relations:
// - left: Node -> Node (2 tuples)
// - friend: Person -> Person (4 tuples)
```

**Options:**
- `includeBuiltInTypes` (default: `false`) - Include built-in types

---

### Synthesis Functions

- **`synthesizeAtomSelector(examples, maxDepth?)`** - Generate unary selectors (for atoms)
- **`synthesizeBinarySelector(examples, maxDepth?)`** - Generate binary selectors (for pairs)
- **`synthesizeAtomSelectorWithExplanation(examples, maxDepth?)`** - With provenance tree
- **`synthesizeBinarySelectorWithExplanation(examples, maxDepth?)`** - With provenance tree

### Helper Functions

- **`createOrientationConstraint(selector, directions)`** - Generate orientation constraint strings
- **`createAlignmentConstraint(selector, alignment)`** - Generate alignment constraint strings
- **`createColorDirective(selector, color)`** - Generate color directive strings

### React Components

- **`ProjectionControls`** - Interactive UI for selecting projection atoms (Forge/Alloy)
- **`CombinedInputComponent`** - Complete data visualization with REPL and layout interface
- **`InstanceBuilder`** - Visual graph editor for building data instances
- **`ReplInterface`** / **`PyretReplInterface`** - REPL components for interactive evaluation

### Core Classes

- **`LayoutInstance`** - Generate layouts from CnD specs
- **`SGraphQueryEvaluator`** - Evaluate selector expressions
- **`AlloyDataInstance`**, **`JSONDataInstance`**, etc. - Data format adapters

### WebCola Graph API

The `<webcola-cnd-graph>` custom element provides methods for interacting with the rendered graph:

#### Node Highlighting
- **`highlightNodes(nodeIds: string[])`** - Highlight nodes by ID (unary selectors)
- **`highlightNodePairs(pairs: string[][], options?)`** - Highlight node pairs with first/second correspondence (binary selectors)
- **`clearNodeHighlights()`** - Remove all node highlights

#### Relation Highlighting
- **`getAllRelations()`** - Get all unique relation names
- **`highlightRelation(relName: string)`** - Highlight edges by relation name
- **`clearHighlightRelation(relName: string)`** - Clear relation highlighting

#### Layout Management
- **`renderLayout(instanceLayout, options?)`** - Render a layout with optional prior positions
- **`clear()`** - Clear the graph and reset state
- **`getNodePositions()`** - Get current positions of all nodes

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
