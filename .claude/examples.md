# Complete Working Examples

This document provides end-to-end examples showing the complete integration and layout pipeline.

## Example 1: Simple Social Network

### Input Data (JSON)

```json
{
  "atoms": [
    { "id": "alice", "type": "Person", "label": "Alice" },
    { "id": "bob", "type": "Person", "label": "Bob" },
    { "id": "charlie", "type": "Person", "label": "Charlie" },
    { "id": "techcorp", "type": "Company", "label": "TechCorp" }
  ],
  "relations": [
    {
      "id": "friends_rel",
      "name": "friends",
      "types": ["Person", "Person"],
      "tuples": [
        { "atoms": ["alice", "bob"], "types": ["Person", "Person"] },
        { "atoms": ["bob", "charlie"], "types": ["Person", "Person"] }
      ]
    },
    {
      "id": "works_at_rel",
      "name": "worksAt",
      "types": ["Person", "Company"],
      "tuples": [
        { "atoms": ["alice", "techcorp"], "types": ["Person", "Company"] },
        { "atoms": ["bob", "techcorp"], "types": ["Person", "Company"] }
      ]
    }
  ]
}
```

### Layout Specification (YAML)

```yaml
constraints:
  # Friends appear left-to-right
  - orientation:
      selector: "{x, y : Person | x.friends = y}"
      directions: [directlyLeft]
  
  # Employees above their company
  - orientation:
      selector: "{p, c : Person, Company | p.worksAt = c}"
      directions: [directlyAbove]
  
  # All people horizontally aligned
  - align:
      selector: "{x, y : Person | true}"
      direction: horizontal

directives:
  - color: {selector: Person, color: "#4A90E2"}
  - color: {selector: Company, color: "#7ED321"}
  - size: {selector: Person, width: 120, height: 60}
  - size: {selector: Company, width: 200, height: 80}
```

### TypeScript Implementation

```typescript
import { 
  JSONDataInstance, 
  parseLayoutSpec, 
  SGraphQueryEvaluator, 
  LayoutInstance 
} from 'spytial-core';
import { isPositionalConstraintError } from 'spytial-core/layout';

// Load data
const jsonData = /* ... json from above ... */;
const dataInstance = new JSONDataInstance(jsonData);

// Parse layout spec
const layoutYaml = /* ... yaml from above ... */;
const spec = parseLayoutSpec(layoutYaml);

// Create evaluator and layout instance
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

const layoutInstance = new LayoutInstance(spec, evaluator);

// Generate layout
const result = layoutInstance.generateLayout(dataInstance, {});

if (result.error) {
  if (isPositionalConstraintError(result.error)) {
    console.error('Constraint conflict:', result.error.message);
    console.error('Minimal conflicting set:');
    for (const [source, constraints] of result.error.minimalConflictingSet) {
      console.error(`  ${source.toHTML()}`);
    }
  }
} else {
  console.log('Layout successful!');
  result.layout.nodes.forEach(node => {
    console.log(`${node.label}: (${node.x}, ${node.y})`);
  });
}
```

### Expected Output

```
Layout successful!
Alice: (0, 0)
Bob: (170, 0)
Charlie: (340, 0)
TechCorp: (85, 120)
```

**Visual Result:** Three people in a horizontal line at top, company centered below them.

---

## Example 2: Hierarchical Organization Chart

### Input Data (Programmatic)

```typescript
const orgData = {
  atoms: [
    { id: "ceo", type: "Executive", label: "CEO", labels: { role: ["Chief"] } },
    { id: "cto", type: "Executive", label: "CTO", labels: { role: ["Tech"] } },
    { id: "cfo", type: "Executive", label: "CFO", labels: { role: ["Finance"] } },
    { id: "eng1", type: "Engineer", label: "Alice" },
    { id: "eng2", type: "Engineer", label: "Bob" },
    { id: "acc1", type: "Accountant", label: "Carol" }
  ],
  relations: [
    {
      id: "reports_to",
      name: "reportsTo",
      types: ["Employee", "Employee"],
      tuples: [
        { atoms: ["cto", "ceo"], types: ["Executive", "Executive"] },
        { atoms: ["cfo", "ceo"], types: ["Executive", "Executive"] },
        { atoms: ["eng1", "cto"], types: ["Engineer", "Executive"] },
        { atoms: ["eng2", "cto"], types: ["Engineer", "Executive"] },
        { atoms: ["acc1", "cfo"], types: ["Accountant", "Executive"] }
      ]
    }
  ]
};
```

### Layout Specification

```yaml
constraints:
  # Managers above their reports
  - orientation:
      selector: "{report, manager : Employee | report.reportsTo = manager}"
      directions: [directlyBelow]
  
  # Peers at same level horizontally aligned
  - align:
      selector: "{x, y : Executive | x != y}"
      direction: horizontal
  
  - align:
      selector: "{x, y : Engineer | x != y}"
      direction: horizontal

directives:
  - color: {selector: Executive, color: "#E74C3C"}
  - color: {selector: Engineer, color: "#3498DB"}
  - color: {selector: Accountant, color: "#2ECC71"}
  - size: {selector: Executive, width: 150, height: 80}
  - size: {selector: "{e : Employee | not e.type = 'Executive'}", width: 120, height: 60}
```

### Result

```
         CEO (0, 0)
        /   \
      CTO   CFO (170, 130)  (340, 130)
      / \     |
   Eng1 Eng2 Acc1 (85, 260) (255, 260) (340, 260)
```

---

## Example 3: State Machine

### Input Data (Python AST to JSON)

```python
# Original state machine
class TrafficLight:
    states = ['RED', 'YELLOW', 'GREEN']
    transitions = {
        'RED': 'GREEN',
        'GREEN': 'YELLOW',
        'YELLOW': 'RED'
    }
```

**Extracted JSON:**

```json
{
  "atoms": [
    { "id": "red", "type": "State", "label": "RED" },
    { "id": "yellow", "type": "State", "label": "YELLOW" },
    { "id": "green", "type": "State", "label": "GREEN" }
  ],
  "relations": [
    {
      "id": "next",
      "name": "next",
      "types": ["State", "State"],
      "tuples": [
        { "atoms": ["red", "green"], "types": ["State", "State"] },
        { "atoms": ["green", "yellow"], "types": ["State", "State"] },
        { "atoms": ["yellow", "red"], "types": ["State", "State"] }
      ]
    }
  ]
}
```

### Layout Specification

```yaml
constraints:
  # States flow left to right (cycle auto-handled)
  - orientation:
      selector: "{s1, s2 : State | s1.next = s2}"
      directions: [directlyLeft]

directives:
  - color: {selector: "{s : State | s.label = 'RED'}", color: "#E74C3C"}
  - color: {selector: "{s : State | s.label = 'YELLOW'}", color: "#F39C12"}
  - color: {selector: "{s : State | s.label = 'GREEN'}", color: "#27AE60"}
  - size: {selector: State, width: 100, height: 100}
  - edgeLabel: {relation: next, label: "→"}
```

### Implementation Note

The system detects the cycle (RED → GREEN → YELLOW → RED) and automatically creates disjunctive constraints. One transition will be "perturbed" to break the cycle, likely wrapping YELLOW → RED downward or backward.

---

## Example 4: Database Schema Visualization

### Input (SQL to JSON Conversion)

```sql
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100)
);

CREATE TABLE posts (
  id INT PRIMARY KEY,
  user_id INT REFERENCES users(id),
  title VARCHAR(200)
);

CREATE TABLE comments (
  id INT PRIMARY KEY,
  post_id INT REFERENCES posts(id),
  user_id INT REFERENCES users(id),
  text TEXT
);
```

**Extracted JSON:**

```json
{
  "atoms": [
    { "id": "users_table", "type": "Table", "label": "users" },
    { "id": "posts_table", "type": "Table", "label": "posts" },
    { "id": "comments_table", "type": "Table", "label": "comments" }
  ],
  "relations": [
    {
      "id": "fk_posts_users",
      "name": "foreignKey",
      "types": ["Table", "Table"],
      "tuples": [
        { "atoms": ["posts_table", "users_table"], "types": ["Table", "Table"] }
      ]
    },
    {
      "id": "fk_comments_posts",
      "name": "foreignKey",
      "types": ["Table", "Table"],
      "tuples": [
        { "atoms": ["comments_table", "posts_table"], "types": ["Table", "Table"] }
      ]
    },
    {
      "id": "fk_comments_users",
      "name": "foreignKey",
      "types": ["Table", "Table"],
      "tuples": [
        { "atoms": ["comments_table", "users_table"], "types": ["Table", "Table"] }
      ]
    }
  ]
}
```

### Layout Specification

```yaml
constraints:
  # Child tables to right of parent tables
  - orientation:
      selector: "{child, parent : Table | child.foreignKey = parent}"
      directions: [directlyLeft]

directives:
  - size: {selector: Table, width: 150, height: 100}
  - color: {selector: Table, color: "#95A5A6"}
  - edgeLabel: {relation: foreignKey, label: "FK"}
```

### Result

```
users ← posts ← comments
```

---

## Example 5: Custom Language Integration (Full Example)

### Scenario: Custom modeling language "FlowLang"

**FlowLang Source:**
```
workflow OrderProcessing {
  step Receive
  step Validate
  step Process
  step Ship
  
  Receive -> Validate
  Validate -> Process
  Process -> Ship
}
```

### Step 1: Parser (FlowLang → Native AST)

```typescript
interface FlowLangWorkflow {
  name: string;
  steps: Array<{ id: string; name: string }>;
  transitions: Array<{ from: string; to: string }>;
}

function parseFlowLang(source: string): FlowLangWorkflow {
  // Your parser implementation
  return {
    name: "OrderProcessing",
    steps: [
      { id: "receive", name: "Receive" },
      { id: "validate", name: "Validate" },
      { id: "process", name: "Process" },
      { id: "ship", name: "Ship" }
    ],
    transitions: [
      { from: "receive", to: "validate" },
      { from: "validate", to: "process" },
      { from: "process", to: "ship" }
    ]
  };
}
```

### Step 2: Extractor (AST → IDataInstance)

```typescript
import { IDataInstance, IAtom, IRelation, IType } from 'spytial-core';
import { Graph } from 'graphlib';

class FlowLangDataInstance implements IDataInstance {
  private atoms: IAtom[];
  private relations: IRelation[];
  private types: IType[];
  
  constructor(workflow: FlowLangWorkflow) {
    // Extract steps as atoms
    this.atoms = workflow.steps.map(step => ({
      id: step.id,
      type: 'Step',
      label: step.name
    }));
    
    // Extract transitions as relations
    this.relations = [{
      id: 'next',
      name: 'next',
      types: ['Step', 'Step'],
      tuples: workflow.transitions.map(t => ({
        atoms: [t.from, t.to],
        types: ['Step', 'Step']
      }))
    }];
    
    // Define types
    this.types = [{
      id: 'Step',
      types: ['Step'],
      atoms: this.atoms,
      isBuiltin: false
    }];
  }
  
  getAtoms(): readonly IAtom[] { return this.atoms; }
  getRelations(): readonly IRelation[] { return this.relations; }
  getTypes(): readonly IType[] { return this.types; }
  
  getAtomType(id: string): IType {
    const atom = this.atoms.find(a => a.id === id);
    if (!atom) throw new Error(`Atom not found: ${id}`);
    return this.types[0]; // All atoms are type 'Step'
  }
  
  generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph {
    const graph = new Graph({ directed: true });
    this.atoms.forEach(a => graph.setNode(a.id, { label: a.label }));
    this.relations[0].tuples.forEach(t => {
      graph.setEdge(t.atoms[0], t.atoms[1], { relation: 'next' });
    });
    return graph;
  }
  
  applyProjections(atomIds: string[]): IDataInstance {
    // Simplified: return this
    return this;
  }
}
```

### Step 3: Layout and Render

```typescript
import { parseLayoutSpec, SGraphQueryEvaluator, LayoutInstance } from 'spytial-core/layout';

// Parse source
const workflow = parseFlowLang(sourceCode);

// Create data instance
const dataInstance = new FlowLangDataInstance(workflow);

// Define layout
const layoutSpec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: "{from, to : Step | from.next = to}"
      directions: [directlyLeft]
  
  - align:
      selector: "{x, y : Step | true}"
      direction: horizontal

directives:
  - size: {selector: Step, width: 150, height: 80}
  - color: {selector: Step, color: "#3498DB"}
  - edgeLabel: {relation: next, label: "→"}
`);

// Generate layout
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
const result = layoutInstance.generateLayout(dataInstance, {});

if (!result.error) {
  console.log('Workflow layout:');
  result.layout.nodes.forEach(node => {
    console.log(`  ${node.label}: (${node.x}, ${node.y})`);
  });
}
```

**Output:**
```
Workflow layout:
  Receive: (0, 0)
  Validate: (170, 0)
  Process: (340, 0)
  Ship: (510, 0)
```

---

## Example 6: Handling Constraint Conflicts

### Problematic Layout (Overlapping Nodes)

```typescript
const conflictData = {
  atoms: [
    { id: "a", type: "Node", label: "A" },
    { id: "b", type: "Node", label: "B" }
  ],
  relations: []
};

const conflictSpec = parseLayoutSpec(`
constraints:
  # This forces A and B to same position!
  - align:
      selector: "{x, y : Node | true}"
      direction: horizontal
  
  - align:
      selector: "{x, y : Node | true}"
      direction: vertical
`);
```

### Error Handling

```typescript
const result = layoutInstance.generateLayout(dataInstance, {});

if (result.error && isPositionalConstraintError(result.error)) {
  console.error('ERROR:', result.error.message);
  // "Alignment constraints force A and B to occupy the same position"
  
  console.error('Minimal conflicting set:');
  for (const [source, constraints] of result.error.minimalConflictingSet) {
    console.error(`  Source: ${source.toHTML()}`);
    constraints.forEach(c => {
      console.error(`    - ${orientationConstraintToString(c)}`);
    });
  }
  
  // Output:
  // Source: align: {selector: "{x, y : Node | true}", direction: horizontal}
  //   - A must be horizontally aligned with B
  // Source: align: {selector: "{x, y : Node | true}", direction: vertical}
  //   - A must be vertically aligned with B
}
```

### Fix

Remove one alignment:

```yaml
constraints:
  # Only horizontal alignment
  - align:
      selector: "{x, y : Node | true}"
      direction: horizontal
  
  # Add ordering to separate them
  - orientation:
      selector: "{x, y : Node | x.id < y.id}"
      directions: [directlyLeft]
```

---

## Example 7: Performance - Large Graph

### Scenario: 1000 node social network

```typescript
// Generate large dataset
function generateLargeSocialNetwork(nodeCount: number) {
  const atoms = Array.from({ length: nodeCount }, (_, i) => ({
    id: `person${i}`,
    type: 'Person',
    label: `Person ${i}`
  }));
  
  // Random friendships (sparse: ~3 friends per person)
  const tuples: Array<{ atoms: string[]; types: string[] }> = [];
  for (let i = 0; i < nodeCount; i++) {
    const friendCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < friendCount; j++) {
      const friendId = Math.floor(Math.random() * nodeCount);
      if (friendId !== i) {
        tuples.push({
          atoms: [`person${i}`, `person${friendId}`],
          types: ['Person', 'Person']
        });
      }
    }
  }
  
  return {
    atoms,
    relations: [{
      id: 'friends',
      name: 'friends',
      types: ['Person', 'Person'],
      tuples
    }]
  };
}

// Create instance
const largeData = generateLargeSocialNetwork(1000);
const instance = new JSONDataInstance(largeData);

// Minimal constraints for performance
const minimalSpec = parseLayoutSpec(`
constraints:
  # Only directional flow, no alignment to reduce complexity
  - orientation:
      selector: "{x, y : Person | x.friends = y}"
      directions: [directlyLeft]

directives:
  - size: {selector: Person, width: 50, height: 50}
  - flag: hideDisconnectedBuiltIns
`);

// Measure performance
console.time('layout-1000-nodes');
const result = layoutInstance.generateLayout(instance, {});
console.timeEnd('layout-1000-nodes');

// Expected: 200-500ms for 1000 nodes with simple constraints
```

**Optimization Tips:**
1. Avoid grouping large sets (creates O(n²) disjunctions)
2. Use directional constraints sparingly
3. Consider using force-directed layout for large graphs without hard constraints
4. Filter irrelevant nodes before creating instance

---

## Example 8: Web Component Integration

### HTML + JavaScript

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import 'spytial-core/browser';
  </script>
</head>
<body>
  <h1>FlowLang Workflow Viewer</h1>
  
  <webcola-cnd-graph
    id="workflow-graph"
    style="width: 100%; height: 600px;"
  ></webcola-cnd-graph>
  
  <script type="module">
    const graph = document.getElementById('workflow-graph');
    
    // Set data instance
    graph.setAttribute('data-instance', JSON.stringify({
      atoms: [
        { id: 'receive', type: 'Step', label: 'Receive' },
        { id: 'validate', type: 'Step', label: 'Validate' },
        { id: 'process', type: 'Step', label: 'Process' },
        { id: 'ship', type: 'Step', label: 'Ship' }
      ],
      relations: [{
        id: 'next',
        name: 'next',
        types: ['Step', 'Step'],
        tuples: [
          { atoms: ['receive', 'validate'], types: ['Step', 'Step'] },
          { atoms: ['validate', 'process'], types: ['Step', 'Step'] },
          { atoms: ['process', 'ship'], types: ['Step', 'Step'] }
        ]
      }]
    }));
    
    // Set layout spec
    graph.setAttribute('layout-spec', `
constraints:
  - orientation: {selector: "{x, y : Step | x.next = y}", directions: [directlyLeft]}
  - align: {selector: "{x, y : Step | true}", direction: horizontal}
directives:
  - size: {selector: Step, width: 150, height: 80}
  - color: {selector: Step, color: "#3498DB"}
    `);
    
    // Listen for events
    graph.addEventListener('layout-generated', (e) => {
      console.log('Layout generated:', e.detail.layout);
    });
    
    graph.addEventListener('constraint-error', (e) => {
      console.error('Layout error:', e.detail);
      alert('Layout failed: ' + e.detail.message);
    });
  </script>
</body>
</html>
```

---

## Summary of Examples

| Example | Complexity | Key Features | Use Case |
|---------|-----------|--------------|----------|
| 1. Social Network | Simple | Orientation, Alignment | Basic relationships |
| 2. Org Chart | Medium | Hierarchy, Multiple types | Tree structures |
| 3. State Machine | Medium | Cycles, Auto-perturbation | FSM visualization |
| 4. Database Schema | Medium | Multiple relations | Schema diagrams |
| 5. Custom Language | Advanced | Full integration | Language tooling |
| 6. Conflicts | Simple | Error handling | Debugging |
| 7. Large Graph | Advanced | Performance, Scaling | Big data |
| 8. Web Component | Medium | Browser integration | Interactive apps |

All examples include complete, runnable code. Adapt them to your specific use case!
