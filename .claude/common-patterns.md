# Common Patterns

## Pattern Library

### 1. Hierarchical Tree Layout

**Use Case:** Org charts, file systems, class hierarchies

```yaml
constraints:
  # Parent above children
  - orientation:
      selector: "{parent, child : Node | child.parent = parent}"
      directions: [directlyAbove]
  
  # Siblings aligned horizontally
  - align:
      selector: "{x, y : Node | x.parent = y.parent and x != y}"
      direction: horizontal

directives:
  - size: {selector: Node, width: 200, height: 80}
  - flag: hideDisconnectedBuiltIns
```

**Result:** Classic tree layout with aligned levels.

---

### 2. Linear Flow Diagram

**Use Case:** Pipelines, workflows, sequences

```yaml
constraints:
  # Left-to-right flow
  - orientation:
      selector: "{x, y : Step | x.next = y}"
      directions: [directlyLeft]
  
  # All steps on same horizontal line
  - align:
      selector: "{x, y : Step | true}"
      direction: horizontal

directives:
  - size: {selector: Step, width: 150, height: 60}
  - color: {selector: "{s : Step | s.status = 'complete'}", color: green}
  - color: {selector: "{s : Step | s.status = 'pending'}", color: gray}
```

**Result:** Horizontal process flow with status colors.

---

### 3. Grouped Visualization

**Use Case:** Categorized data, departmental views

```yaml
constraints:
  # Group by category
  - group:
      selector: category
      name: "Categories"
  
  # Items in same category are vertically aligned
  - align:
      selector: "{x, y : Item | x.category = y.category}"
      direction: vertical
  
  # Vertical ordering within category
  - orientation:
      selector: "{x, y : Item | x.category = y.category and x.order < y.order}"
      directions: [directlyAbove]

directives:
  - color: {selector: Item, color: blue}
  - size: {selector: Item, width: 180, height: 70}
```

**Result:** Items grouped by category with ordered layout.

---

### 4. State Machine Diagram

**Use Case:** FSM, protocol states, game states

```yaml
constraints:
  # State transitions flow right
  - orientation:
      selector: "{from, to : State | from.transition = to}"
      directions: [directlyRight]

directives:
  - icon: {selector: "{s : State | s.isStart}", path: start-icon.png}
  - icon: {selector: "{s : State | s.isEnd}", path: end-icon.png}
  - color: {selector: "{s : State | s.isActive}", color: green}
  - edgeLabel: {relation: transition, label: "→"}
```

**Result:** Left-to-right state machine with special icons.

**Note:** Cycles auto-handled via perturbation.

---

### 5. Grid Layout

**Use Case:** Spreadsheets, game boards, matrices

```yaml
constraints:
  # Horizontal alignment by row
  - align:
      selector: "{x, y : Cell | x.row = y.row}"
      direction: horizontal
  
  # Vertical alignment by column
  - align:
      selector: "{x, y : Cell | x.col = y.col}"
      direction: vertical
  
  # Left-to-right ordering
  - orientation:
      selector: "{x, y : Cell | x.row = y.row and x.col + 1 = y.col}"
      directions: [directlyLeft]
  
  # Top-to-bottom ordering
  - orientation:
      selector: "{x, y : Cell | x.col = y.col and x.row + 1 = y.row}"
      directions: [directlyAbove]

directives:
  - size: {selector: Cell, width: 100, height: 100}
```

**Result:** Strict grid layout.

---

### 6. Layered Network

**Use Case:** Neural networks, network layers, OSI model

```yaml
constraints:
  # Layers arranged vertically
  - orientation:
      selector: "{x, y : Layer | x.index + 1 = y.index}"
      directions: [directlyBelow]
  
  # Nodes in same layer aligned horizontally
  - align:
      selector: "{x, y : Node | x.layer = y.layer}"
      direction: horizontal
  
  # Connections go downward
  - orientation:
      selector: "{x, y : Node | x.connects = y}"
      directions: [directlyAbove]

directives:
  - size: {selector: Node, width: 80, height: 80}
  - icon: {selector: Node, path: neuron-icon.png}
```

**Result:** Layered architecture view.

---

### 7. Timeline Visualization

**Use Case:** Gantt charts, historical events

```yaml
constraints:
  # Chronological ordering
  - orientation:
      selector: "{x, y : Event | x.date < y.date}"
      directions: [directlyLeft]
  
  # All events on same horizontal line
  - align:
      selector: "{x, y : Event | true}"
      direction: horizontal

directives:
  - size: {selector: Event, width: 120, height: 60}
  - color: {selector: "{e : Event | e.isPast}", color: gray}
  - color: {selector: "{e : Event | e.isFuture}", color: blue}
```

**Result:** Left-to-right timeline.

---

### 8. Comparison Layout

**Use Case:** Before/after, A/B testing, diff views

```yaml
constraints:
  # Group by version
  - group:
      selector: version
      name: "Versions"
  
  # Same elements aligned vertically across versions
  - align:
      selector: "{x, y : Item | x.id = y.id}"
      direction: vertical

directives:
  - color: {selector: "{x : Item | x.version = 'A'}", color: blue}
  - color: {selector: "{x : Item | x.version = 'B'}", color: green}
  - size: {selector: Item, width: 150, height: 75}
```

**Result:** Side-by-side comparison with aligned elements.

---

### 9. Minimal Layout (No Constraints)

**Use Case:** Free-form graphs, exploratory views

```yaml
constraints: []

directives:
  - icon: {selector: Node, path: default-icon.png}
  - color: {selector: Node, color: blue}
  - flag: hideDisconnectedBuiltIns
```

**Result:** Force-directed layout only, no constraints.

---

### 10. Face/Parts Example (Complex)

**Use Case:** Complex hierarchical structures

```yaml
constraints:
  # Horizontal alignment of facial features
  - align:
      selector: aligned  # {x, y : Part | x.alignsWith = y}
      direction: horizontal
  
  # Vertical ordering (hair above eyes above nose, etc.)
  - orientation:
      selector: below  # {x, y : Part | x.isBelow = y}
      directions: [directlyBelow]
  
  # Group all parts together
  - group:
      selector: parts
      name: " parts"
      addEdge: true

directives:
  - size: {selector: Mouth, width: 300, height: 70}
  - size: {selector: Hair, width: 300, height: 100}
  - icon: {selector: Eye, path: eye.jpg}
  - icon: {selector: Nose, path: nose.jpg}
  - icon: {selector: Mouth, path: mouth.png}
  - icon: {selector: EyeBrow, path: eyebrow.png}
  - icon: {selector: Hair, path: hair.png}
  - icon: {selector: Chin, path: chin.png}
  - hideField: {field: parts}
  - hideatom: {selector: Face}
  - flag: hideDisconnectedBuiltIns
```

**Result:** Assembled face with proper part alignment.

---

## Anti-Patterns (What NOT to Do)

### ❌ Conflicting Alignments

```yaml
# DON'T: Align nodes both horizontally AND vertically
- align: {selector: "{x, y : Node | x.edge = y}", direction: horizontal}
- align: {selector: "{x, y : Node | x.edge = y}", direction: vertical}
# Results in: "nodes forced to occupy same position"
```

**Fix:** Choose one alignment direction.

---

### ❌ Circular Constraints

```yaml
# DON'T: Create impossible cycles
- orientation: {selector: "{x, y : A | x.r1 = y}", directions: [directlyLeft]}
- orientation: {selector: "{x, y : A | x.r2 = y}", directions: [directlyLeft]}
# If r1 and r2 form a cycle, this fails
```

**Fix:** Let system handle cycles or break cycle explicitly.

---

### ❌ Over-Constrained Groups

```yaml
# DON'T: Create too many disjunctions
- group: {selector: "{x : Type | condition}", name: "Group"}
# For 100 nodes, 99 non-members = 99 × 4 alternatives = 4^99 possibilities
```

**Fix:** Use field-based grouping or filter non-members.

---

### ❌ Contradictory Directions

```yaml
# DON'T: Require opposite directions
- orientation: {selector: "{x, y : Node | x.r = y}", directions: [directlyLeft]}
- orientation: {selector: "{x, y : Node | y.r = x}", directions: [directlyLeft]}
# Requires x left of y AND y left of x
```

**Fix:** Make directions consistent with data structure.

---

## Recipe Generator

To create a new pattern:

1. **Identify relationships** - What connects your nodes?
2. **Choose main direction** - Horizontal or vertical flow?
3. **Add alignment** - What should line up?
4. **Handle groups** - Are there categories/containers?
5. **Style with directives** - Icons, colors, sizes

**Template:**
```yaml
constraints:
  # Main flow direction
  - orientation:
      selector: "{x, y : Type | <relationship>}"
      directions: [<direction>]
  
  # Optional: Alignment
  - align:
      selector: "{x, y : Type | <same-group>}"
      direction: <horizontal|vertical>
  
  # Optional: Grouping
  - group:
      selector: <field-or-selector>
      name: "Group Name"

directives:
  - size: {selector: Type, width: X, height: Y}
  - color: {selector: Type, color: <color>}
  # Add icons, flags, etc.
```
