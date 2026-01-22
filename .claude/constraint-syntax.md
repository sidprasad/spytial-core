# Constraint Syntax Reference

## Overview

Constraints define spatial relationships between nodes. They are **hard requirements** - the layout fails if constraints cannot be satisfied.

## Constraint Types

### 1. Orientation Constraints

Define directional relationships between node pairs.

**Syntax:**
```yaml
- orientation:
    selector: "{x, y : Type | condition}"
    directions: [direction1, direction2, ...]
```

**Available Directions:**
- `directlyLeft` - x is directly to the left of y
- `directlyRight` - x is directly to the right of y
- `directlyAbove` - x is directly above y
- `directlyBelow` - x is directly below y

**Examples:**

```yaml
# All edges go left-to-right
- orientation:
    selector: "{x, y : Node | x.edge = y}"
    directions: [directlyLeft]

# Boss above employee
- orientation:
    selector: "{boss, emp : Person | emp.reportsTo = boss}"
    directions: [directlyAbove]

# Cyclic: all adjacent pairs in cycle order
- orientation:
    selector: "{x, y : State | x.next = y}"
    directions: [directlyBelow]
```

**Important:**
- Selector must return pairs of nodes `{x, y : ...}`
- Multiple directions create alternatives (disjunctive)
- Cycles are detected and handled with backtracking

### 2. Alignment Constraints

Force nodes to share the same x or y coordinate.

**Syntax:**
```yaml
- align:
    selector: "{x, y : Type | condition}"
    direction: horizontal | vertical
```

**Directions:**
- `horizontal` - nodes share same y (aligned horizontally)
- `vertical` - nodes share same x (aligned vertically)

**Examples:**

```yaml
# All nodes of same type horizontally aligned
- align:
    selector: "{x, y : Node | x.type = y.type}"
    direction: horizontal

# Vertically align all items in a list
- align:
    selector: "{x, y : Item | x in List and y in List}"
    direction: vertical
```

**⚠️ Important:**
- If two nodes are BOTH horizontally AND vertically aligned, they overlap!
- This creates a constraint conflict
- Example of conflict:
  ```yaml
  - align: {selector: "{x, y : Node | ...}", direction: horizontal}
  - align: {selector: "{x, y : Node | ...}", direction: vertical}
  # If x and y match both selectors, this is unsatisfiable
  ```

### 3. Grouping Constraints

Create visual groups around nodes, with non-members outside.

**Syntax:**
```yaml
- group:
    selector: "expr"  # or field name
    name: "Group Name"
    addEdge: true|false  # optional, adds edges within group
```

**Two forms:**

**A. Field-based grouping:**
```yaml
- group:
    selector: fieldName
    name: "By Field"
```
Groups atoms by the value of `fieldName`.

**B. Selector-based grouping:**
```yaml
- group:
    selector: "{x : Type | condition}"
    name: "Custom Group"
```
Groups all atoms matching the selector.

**Examples:**

```yaml
# Group by department field
- group:
    selector: department
    name: "Departments"

# Group all managers
- group:
    selector: "{m : Person | some m.manages}"
    name: "Managers"
    addEdge: true
```

**Behavior:**
- Members are inside group boundary
- Non-members are outside (left, right, top, or bottom)
- Groups cannot overlap (except via subsumption)
- Singleton groups created for disconnected nodes

### 4. Cyclic Orientation Constraints

Handle circular dependencies with backtracking.

**Syntax:**
```yaml
- orientation:
    selector: "{x, y : Type | x.next = y}"
    directions: [directlyBelow]
    # System auto-detects cycles
```

**Handling:**
- Cycles detected via graph analysis
- Creates N disjunctive alternatives (N = cycle size)
- One node in cycle is "perturbed" (rule doesn't apply)
- Backtracking finds valid perturbation

**Example:**
```yaml
# State machine with loop
- orientation:
    selector: "{s, t : State | s.transition = t}"
    directions: [directlyRight]
# If states form a cycle, one transition will be broken
```

## Selector Language

Selectors use a graph query language (subset of Alloy).

### Basic Syntax

**Node pairs:**
```
{x, y : Type | condition}
```

**Single nodes:**
```
{x : Type | condition}
```

### Field Access

```
x.field          // Direct field access
x.field1.field2  // Chained access
```

### Quantifiers

```
some x.field     // Field is non-empty
all x.field      // Universal quantification
no x.field       // Field is empty
```

### Operations

```
x.edge = y       // x's edge field contains y
x in Group       // x is member of Group
x != y           // x and y are different
```

### Examples

```yaml
# All connected pairs
"{x, y : Node | x.edge = y}"

# All nodes with outgoing edges
"{x : Node | some x.edge}"

# Pairs where both have property
"{x, y : Node | some x.prop and some y.prop}"

# Transitive closure
"{x, y : Node | x.edge.edge = y}"

# Excluding self
"{x, y : Node | x.edge = y and x != y}"
```

## Constraint Priorities

All constraints are **required** (hard). There is no soft constraint syntax.

However, the system adds implicit constraints for alignment groups:
- Aligned nodes are ordered to prevent overlap
- These use `ImplicitConstraint` internally

## Common Patterns

### Pattern 1: Hierarchical Layout
```yaml
constraints:
  - orientation:
      selector: "{parent, child : Node | child.parent = parent}"
      directions: [directlyAbove]
  - align:
      selector: "{x, y : Node | x.parent = y.parent}"
      direction: horizontal
```

### Pattern 2: Linear Flow
```yaml
constraints:
  - orientation:
      selector: "{x, y : Step | x.next = y}"
      directions: [directlyRight]
  - align:
      selector: "{x, y : Step | true}"
      direction: horizontal
```

### Pattern 3: Grouped by Category
```yaml
constraints:
  - group:
      selector: category
      name: "By Category"
  - align:
      selector: "{x, y : Item | x.category = y.category}"
      direction: vertical
```

## Error Messages

### Constraint Conflict
```
PositionalConstraintError: Alignment constraints force NodeA and NodeB to occupy the same position

Minimal conflicting set:
  - NodeA must be horizontally aligned with NodeB
  - NodeA must be vertically aligned with NodeB
```

**Fix:** Remove one alignment or change selector to avoid overlap.

### Cyclic Conflict
```
PositionalConstraintError: Constraint "A must be left of B" conflicts with existing constraints

Minimal conflicting set:
  - A must be left of B
  - B must be left of C
  - C must be left of A
```

**Fix:** System auto-perturbs cycles if directions allow, but may fail if cycle is unsatisfiable.

### Group Overlap
```
GroupOverlapError: Groups "GroupA" and "GroupB" overlap with nodes: NodeX, NodeY
```

**Fix:** Groups cannot overlap. Use subsumption or separate groups.

## Best Practices

1. **Start Simple** - Add constraints incrementally
2. **Test Selectors** - Verify selector returns expected pairs
3. **Check Conflicts** - Look for contradictory constraints
4. **Use Alignment Carefully** - Don't align in both directions
5. **Group Wisely** - Large groups can create many disjunctions
6. **Handle Cycles** - Orientation on cycles may need perturbation

## Advanced: Disjunctive Constraints

Some constraints generate disjunctions (alternatives):

```yaml
- group:
    selector: members
    name: "Group"
# For each non-member node:
#   (node left of group) OR
#   (node right of group) OR
#   (node above group) OR
#   (node below group)
```

The system uses **backtracking** to find valid assignment.

**Performance:** O(N^D) where N = alternatives per disjunction, D = disjunction count
- Keep group sizes reasonable
- Minimize non-member nodes
- Use field-based grouping when possible
