# System Architecture

## Overview

Spytial-Core is a constraint-based graph layout system that takes a data instance (nodes and edges) and applies spatial constraints to generate valid layouts.

## Pipeline Flow

```
┌─────────────────┐
│  Data Instance  │  (atoms, relations, types)
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Layout Spec     │  (constraints + directives)
│  - Constraints  │
│  - Directives   │
└────────┬────────┘
         │
         v
┌───────────────── ┐
│ Query Evaluator  │  Evaluates selectors against data
│(e.g. SGraphQuery)│  Returns matching node/edge pairs
└────────┬──────── ┘
         │
         v
┌─────────────────┐
│ Constraint Gen  │  Converts selectors to layout constraints
│ LayoutInstance  │  (LeftConstraint, TopConstraint, etc.)
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Validator       │  Solves constraints using Cassowary
│ (Kiwi.js)       │  Detects conflicts, reports minimal IIS
└────────┬────────┘
         │
         ├─[Valid]─────> Layout with positions
         │
         └─[Conflict]──> PositionalConstraintError
                         with minimal conflicting set
```

## Core Components

### 1. Data Layer

**IDataInstance** - Abstract interface for data sources
- `JSONDataInstance` - In-memory JSON data
- `AlloyInstance` - Alloy model instances

**Structure:**
```typescript
{
  atoms: [{ id, type, label, attributes }],
  relations: [{ name, tuples: [[atomId1, atomId2]] }],
  types: [{ id, atoms, isBuiltin }]
}
```

### 2. Layout Specification

**LayoutSpec** - Declarative constraint definition
```typescript
{
  constraints: {
    orientation: RelativeOrientationConstraint[],
    alignment: AlignConstraint[],
    cyclic: CyclicOrientationConstraint[],
    groupBy: GroupByField[] | GroupBySelector[]
  },
  directives: {
    icons: IconDirective[],
    colors: ColorDirective[],
    sizes: SizeDirective[],
    flags: string[]
  }
}
```

### 3. Query Evaluation

**SGraphQueryEvaluator** - Evaluates selectors
- Uses a graph query language similar to Alloy
- Returns tuples of matching atoms
- Supports relational operations: `.field`, `field1.field2`, `some`, `all`

**Example:**
```
{x, y : Node | x.edge = y}  // All nodes connected by edge
```

### 4. Constraint Generation

**LayoutInstance** - Converts specs to constraints
- Evaluates selectors to get node pairs
- Generates typed constraints (Left, Top, Alignment, etc.)
- Handles cycles with disjunctive constraints
- Deduplicates and applies transitive reduction

### 5. Constraint Solving

**ConstraintValidator** - Validates feasibility
- Uses Kiwi.js (Cassowary algorithm) for solving
- Handles disjunctive constraints via backtracking
- Detects conflicts and extracts minimal IIS
- Reports structured errors with source constraints

**Constraint Types:**
```typescript
LeftConstraint   // left.x + left.width <= right.x
TopConstraint    // top.y + top.height <= bottom.y
AlignmentConstraint  // node1.axis === node2.axis
BoundingBoxConstraint // node outside/inside group
GroupBoundaryConstraint // group-to-group separation
```

### 6. Visual Rendering

**WebColaCnDGraph** - Custom element for rendering
- Uses WebCola for force-directed layout
- Applies constraint solutions as fixed positions
- Renders SVG with icons, labels, edges

## Data Flow Example

```javascript
// 1. Create data instance
const data = new JSONDataInstance({
  atoms: [
    { id: 'A', type: 'Node' },
    { id: 'B', type: 'Node' }
  ],
  relations: [{
    name: 'edge',
    tuples: [['A', 'B']]
  }]
});

// 2. Define layout spec
const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: "{x, y : Node | x.edge = y}"
      directions: [directlyLeft]
`);

// 3. Create evaluator
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: data });

// 4. Generate layout
const layoutInstance = new LayoutInstance(spec, evaluator);
const result = layoutInstance.generateLayout(data, {});

// 5. Check result
if (result.error) {
  console.error(result.error.message);
  // Access minimal conflicting set for debugging
} else {
  // result.layout has nodes with x, y positions
}
```

## Key Design Decisions

### Constraint Satisfaction over Force Direction
- Constraints are **hard requirements**, not suggestions
- Layout fails if constraints are unsatisfiable
- Provides structured error messages with minimal conflict

### Separation of Concerns
- **Data** (what to show) is separate from **Layout** (how to arrange)
- Constraints are declarative, not imperative
- Visual styling (directives) applied after layout

### Error Reporting
- **Minimal conflicting set** helps debugging
- Errors reference original constraints, not internal variables
- Structured errors can be displayed in UI

### Alignment Handling
- Nodes in same alignment group need ordering to prevent overlap
- Implicit constraints added to separate aligned nodes
- Transitive closure computed for alignment groups

## Memory Optimization

The validator uses several optimizations:
1. **Expression caching** - Reuse `variable + constant` expressions
2. **Constraint caching** - Cache kiwi constraint conversions
3. **Group deduplication** - Collapse identical member groups
4. **Solver cloning** - Efficient backtracking state management

## Extension Points

### Custom Data Sources
Implement `IDataInstance` interface:
```typescript
class CustomDataInstance implements IDataInstance {
  getAtoms(): IAtom[];
  getRelations(): IRelation[];
  generateGraph(hideDisconnected, hideBuiltins): Graph;
}
```

### Custom Evaluators
Implement `IEvaluator` interface for custom query languages

### Custom Constraints
Add new constraint types by:
1. Defining interface in `interfaces.ts`
2. Adding conversion in `ConstraintValidator.convertConstraintToKiwi()`
3. Adding string formatter in `orientationConstraintToString()`
