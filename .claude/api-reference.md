# API Reference

## TypeScript API for Programmatic Usage

### Core Classes

#### 1. JSONDataInstance

Create a data instance from JSON.

```typescript
import { JSONDataInstance, IJsonDataInstance } from 'spytial-core';

const data: IJsonDataInstance = {
  atoms: [
    { id: 'node1', type: 'Node', label: 'First' },
    { id: 'node2', type: 'Node', label: 'Second' }
  ],
  relations: [
    {
      id: 'edge',
      name: 'connects',
      types: ['Node', 'Node'],
      tuples: [{ atoms: ['node1', 'node2'], types: ['Node', 'Node'] }]
    }
  ]
};

const instance = new JSONDataInstance(data);
```

**Methods:**
- `getAtoms(): IAtom[]` - Get all atoms
- `getRelations(): IRelation[]` - Get all relations
- `getTypes(): IType[]` - Get all types
- `generateGraph(hideDisconnected, hideBuiltins): Graph` - Generate graphlib graph

---

#### 2. parseLayoutSpec

Parse YAML layout specification.

```typescript
import { parseLayoutSpec } from 'spytial-core/layout';

const spec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: "{x, y : Node | x.edge = y}"
      directions: [directlyLeft]
directives:
  - color: {selector: Node, color: blue}
`);

// Returns: LayoutSpec
console.log(spec.constraints.orientation);
console.log(spec.directives.colors);
```

**Returns:** `LayoutSpec`
- `constraints: LayoutConstraintSpec`
- `directives: LayoutDirectiveSpec`

---

#### 3. SGraphQueryEvaluator

Evaluate selectors against data.

```typescript
import { SGraphQueryEvaluator } from 'spytial-core';

const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

// Evaluate a selector
const result = evaluator.evaluateSGraphQuery(
  "{x, y : Node | x.edge = y}",
  dataInstance
);

// Returns: TupleSet with matching pairs
console.log(result.tuples); // [[node1, node2], ...]
```

**Methods:**
- `initialize(config)` - Setup evaluator with data
- `evaluateSGraphQuery(selector, instance): TupleSet` - Run query

---

#### 4. LayoutInstance

Generate layout from spec and data.

```typescript
import { LayoutInstance } from 'spytial-core/layout';

const layoutInstance = new LayoutInstance(
  layoutSpec,
  evaluator,
  defaultHeight,  // default node height (optional)
  skipAssertions  // skip validation (optional)
);

const result = layoutInstance.generateLayout(dataInstance, {});

if (result.error) {
  console.error(result.error.message);
  if (isPositionalConstraintError(result.error)) {
    console.log('Minimal conflicting set:', result.error.minimalConflictingSet);
  }
} else {
  console.log('Layout generated:', result.layout);
  // result.layout.nodes has x, y positions
}
```

**Methods:**
- `generateLayout(data, projections): { layout, error, projectionData }`

---

#### 5. ConstraintValidator

Validate and solve constraints (usually internal).

```typescript
import { ConstraintValidator } from 'spytial-core/layout';

const validator = new ConstraintValidator(layout);
const error = validator.validateConstraints();

if (error) {
  console.error(error.message);
} else {
  console.log('All constraints satisfied');
}
```

**Methods:**
- `validateConstraints(): ConstraintError | null`
- `validatePositionalConstraints(): PositionalConstraintError | null`
- `validateGroupConstraints(): GroupOverlapError | null`

---

### Type Interfaces

#### IJsonDataInstance

```typescript
interface IJsonDataInstance {
  atoms: Array<{
    id: string;
    type: string;
    label?: string;
    attributes?: Record<string, string[]>;
    labels?: Record<string, string[]>;
  }>;
  
  relations: Array<{
    id: string;
    name: string;
    types: string[];
    tuples: Array<{
      atoms: string[];
      types: string[];
    }>;
  }>;
}
```

#### LayoutSpec

```typescript
interface LayoutSpec {
  constraints: {
    orientation: RelativeOrientationConstraint[];
    alignment: AlignConstraint[];
    cyclic: CyclicOrientationConstraint[];
    groupBy: (GroupByField | GroupBySelector)[];
  };
  
  directives: {
    icons: IconDirective[];
    colors: ColorDirective[];
    sizes: SizeDirective[];
    hideFields: HideFieldDirective[];
    hideAtoms: HideAtomDirective[];
    edgeLabels: EdgeLabelDirective[];
    flags: string[];
  };
}
```

#### InstanceLayout

```typescript
interface InstanceLayout {
  nodes: LayoutNode[];  // with x, y positions
  edges: LayoutEdge[];
  constraints: LayoutConstraint[];
  groups: LayoutGroup[];
  disjunctiveConstraints?: DisjunctiveConstraint[];
  overlappingNodes?: LayoutNode[];  // if error
}
```

#### LayoutNode

```typescript
interface LayoutNode {
  id: string;
  name: string;
  label: string;
  color: string;
  icon?: string;
  width: number;
  height: number;
  x?: number;  // set after constraint solving
  y?: number;
  groups: string[];
  attributes: Record<string, string[]>;
  labels?: Record<string, string[]>;
  mostSpecificType: string;
  types: string[];
  showLabels: boolean;
}
```

#### Error Types

```typescript
interface ConstraintError extends Error {
  type: 'positional-conflict' | 'group-overlap' | 'unknown-constraint';
  message: string;
}

interface PositionalConstraintError extends ConstraintError {
  type: 'positional-conflict';
  conflictingConstraint: LayoutConstraint;
  conflictingSourceConstraint: SourceConstraint;
  minimalConflictingSet: Map<SourceConstraint, LayoutConstraint[]>;
  errorMessages?: ErrorMessages;
}

interface GroupOverlapError extends ConstraintError {
  type: 'group-overlap';
  group1: LayoutGroup;
  group2: LayoutGroup;
  overlappingNodes: LayoutNode[];
}
```

---

### Usage Examples

#### Example 1: Basic Pipeline

```typescript
import { 
  JSONDataInstance, 
  parseLayoutSpec, 
  SGraphQueryEvaluator, 
  LayoutInstance 
} from 'spytial-core';

// 1. Create data
const data = new JSONDataInstance({
  atoms: [/* ... */],
  relations: [/* ... */]
});

// 2. Parse spec
const spec = parseLayoutSpec(`
constraints:
  - orientation: {selector: "{x, y : Node | x.edge = y}", directions: [directlyLeft]}
`);

// 3. Create evaluator
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: data });

// 4. Generate layout
const layoutInstance = new LayoutInstance(spec, evaluator);
const result = layoutInstance.generateLayout(data, {});

// 5. Handle result
if (result.error) {
  console.error('Layout failed:', result.error.message);
} else {
  console.log('Success! Nodes:', result.layout.nodes);
}
```

#### Example 2: Error Handling

```typescript
import { isPositionalConstraintError, isGroupOverlapError } from 'spytial-core/layout';

const result = layoutInstance.generateLayout(data, {});

if (result.error) {
  if (isPositionalConstraintError(result.error)) {
    console.log('Constraint conflict:');
    console.log('  Message:', result.error.message);
    console.log('  Conflicting constraint:', result.error.conflictingConstraint);
    
    // Show minimal conflicting set
    for (const [source, constraints] of result.error.minimalConflictingSet) {
      console.log(`  From ${source.toHTML()}:`);
      constraints.forEach(c => console.log(`    - ${c}`));
    }
  } else if (isGroupOverlapError(result.error)) {
    console.log('Group overlap:');
    console.log('  Groups:', result.error.group1.name, result.error.group2.name);
    console.log('  Overlapping nodes:', result.error.overlappingNodes);
  }
}
```

#### Example 3: Programmatic Constraint Creation

```typescript
import { RelativeOrientationConstraint } from 'spytial-core/layout';

// Create constraint object directly
const constraint = new RelativeOrientationConstraint(
  ['directlyLeft'],  // directions
  "{x, y : Node | x.edge = y}"  // selector
);

const spec: LayoutSpec = {
  constraints: {
    orientation: [constraint],
    alignment: [],
    cyclic: [],
    groupBy: []
  },
  directives: {
    icons: [],
    colors: [],
    sizes: [],
    hideFields: [],
    hideAtoms: [],
    edgeLabels: [],
    flags: []
  }
};
```

#### Example 4: Custom Data Source

```typescript
import { IDataInstance, IAtom, IRelation } from 'spytial-core';
import { Graph } from 'graphlib';

class CustomDataSource implements IDataInstance {
  getAtoms(): IAtom[] {
    // Return atoms from your data source
    return [];
  }
  
  getRelations(): IRelation[] {
    // Return relations
    return [];
  }
  
  generateGraph(hideDisconnected: boolean, hideBuiltins: boolean): Graph {
    const g = new Graph({ directed: true });
    // Build graph from your data
    return g;
  }
}

const customData = new CustomDataSource();
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: customData });
```

---

### Browser Usage (Web Components)

```html
<script type="module">
  import 'spytial-core/browser';
</script>

<webcola-cnd-graph
  id="graph"
  data-instance='{"atoms":[...],"relations":[...]}'
  layout-spec='constraints:
    - orientation: {selector: "...", directions: [directlyLeft]}'
>
</webcola-cnd-graph>

<script>
  const graph = document.getElementById('graph');
  
  // Listen for errors
  graph.addEventListener('constraint-error', (e) => {
    console.error('Constraint error:', e.detail);
  });
  
  // Listen for success
  graph.addEventListener('layout-generated', (e) => {
    console.log('Layout generated:', e.detail.layout);
  });
</script>
```

---

### Utilities

#### Type Guards

```typescript
import {
  isPositionalConstraintError,
  isGroupOverlapError,
  isLeftConstraint,
  isTopConstraint,
  isAlignmentConstraint
} from 'spytial-core/layout';

if (isPositionalConstraintError(error)) {
  // TypeScript knows it's PositionalConstraintError
  console.log(error.minimalConflictingSet);
}
```

#### Constraint Formatters

```typescript
import { orientationConstraintToString } from 'spytial-core/layout';

const constraintStr = orientationConstraintToString(layoutConstraint);
// Returns: "NodeA must be to the left of NodeB"
```

---

### Performance Tips

1. **Reuse Evaluators** - Don't recreate evaluator for each layout
2. **Cache Specs** - Parse layout spec once, reuse multiple times
3. **Limit Groups** - Large groups create many disjunctions (O(n²))
4. **Use Field Grouping** - Field-based groups are more efficient
5. **Monitor Memory** - Call `validator.dispose()` when done
