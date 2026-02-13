# Examples

Complete worked examples showing how to combine constraints and directives.

---

## Family Tree

A classic tree layout: parents above children, siblings aligned, with clean styling.

**Data:** People connected by a `parent` relation, each with an `age` field.

```yaml
constraints:
  # Parents appear above their children
  - orientation:
      selector: parent
      directions: [above]

  # Siblings are horizontally aligned
  - align:
      selector: "~parent.parent - iden"
      direction: horizontal

directives:
  # Blue nodes for all people
  - atomColor:
      selector: Person
      value: "#4a90d9"

  # Show age as a label on the node
  - attribute:
      field: age
      selector: Person

  # Style the parent edges
  - edgeColor:
      field: parent
      value: "#555"
      weight: 2

  # Hide disconnected built-in types (Int, String, etc.)
  - flag: hideDisconnectedBuiltIns
```

**What this produces:**
- A top-down tree with parents above children
- Siblings at the same vertical level
- Ages shown as `age: 35` on each node instead of edges to integers

---

## State Machine

A circular state machine with transitions shown as edges.

**Data:** States connected by a `transition` relation, with a `label` field on each state.

```yaml
constraints:
  # Arrange states in a circle, following transitions
  - cyclic:
      selector: transition
      direction: clockwise

directives:
  # Color states by type
  - atomColor:
      selector: InitialState
      value: "#4CAF50"

  - atomColor:
      selector: FinalState
      value: "#f44336"

  - atomColor:
      selector: State
      value: "#2196F3"

  # Show labels as node attributes
  - attribute:
      field: label

  # Style transitions
  - edgeColor:
      field: transition
      value: "#333"
      style: solid
      weight: 2

  - flag: hideDisconnectedBuiltIns
```

---

## Organization Chart

Departments with grouped employees and a top-down hierarchy.

**Data:** Departments, Employees, a `manages` relation, and a `department` relation.

```yaml
constraints:
  # Managers above their reports
  - orientation:
      selector: manages
      directions: [above]

  # Group employees by department
  - group:
      field: department
      groupOn: 1      # Department is the group key
      addToGroup: 0   # Employee added to the group

  # Same-level reports aligned
  - align:
      selector: "~manages.manages - iden"
      direction: horizontal

directives:
  # Color by role
  - atomColor:
      selector: Manager
      value: "#e74c3c"

  - atomColor:
      selector: Employee
      value: "#3498db"

  # Show title as attribute
  - attribute:
      field: title

  # Thicker management edges
  - edgeColor:
      field: manages
      value: "#2c3e50"
      weight: 3

  # Hide the department edges (grouping makes them redundant)
  - hideField:
      field: department

  - flag: hideDisconnectedBuiltIns
```

---

## Linked List

A left-to-right linked list with head pointer highlighted.

**Data:** Nodes connected by `next`, a `head` pointer, and `value` on each node.

```yaml
constraints:
  # Nodes flow left to right
  - orientation:
      selector: next
      directions: [directlyLeft]

  # Head above the list
  - orientation:
      selector: head
      directions: [above]

directives:
  # Show values as attributes
  - attribute:
      field: value

  # Style the next pointer
  - edgeColor:
      field: next
      value: "#2196F3"
      weight: 2

  # Head pointer in green
  - edgeColor:
      field: head
      value: "#4CAF50"
      style: dashed

  # Consistent node size
  - size:
      selector: Node
      width: 80
      height: 60

  - flag: hideDisconnectedBuiltIns
```

---

## Binary Tree with Computed Edges

A binary tree showing left/right children, with inferred ancestor edges.

**Data:** Nodes with `left` and `right` children, `key` values.

```yaml
constraints:
  # Parents above children
  - orientation:
      selector: left
      directions: [above, right]

  - orientation:
      selector: right
      directions: [above, left]

directives:
  # Show key as attribute
  - attribute:
      field: key

  # Color left edges blue, right edges red
  - edgeColor:
      field: left
      value: "#2196F3"
      weight: 2

  - edgeColor:
      field: right
      value: "#e74c3c"
      weight: 2

  # Show ancestor relationships as faint dotted lines
  - inferredEdge:
      name: "ancestor"
      selector: "^(left + right)"
      color: "#ccc"
      style: dotted

  - flag: hideDisconnectedBuiltIns
```

---

## Temporal Model with Projection

Stepping through a model over time using projection.

**Data:** A `Time` type with a `next` relation, and state that changes over time.

```yaml
constraints:
  - orientation:
      selector: owns
      directions: [above]

directives:
  # Project over Time — step through one time instant at a time
  - projection:
      sig: Time
      orderBy: "next"

  # Color nodes
  - atomColor:
      selector: Person
      value: "#9b59b6"

  # Show properties as attributes
  - attribute:
      field: mood

  - flag: hideDisconnectedBuiltIns
```

**What this produces:**
- Navigation controls (Previous / Next) to step through time
- At each step, only the atoms and edges relevant to that time instant are shown

---

## Graph with Icons and Tags

A file system browser with icons, tags, and hidden internal structure.

```yaml
constraints:
  - orientation:
      selector: contains
      directions: [above]

  - group:
      selector: Folder.contains
      name: "Contents"

directives:
  # Icons for different node types
  - icon:
      selector: Folder
      path: "folder"
      showLabels: true

  - icon:
      selector: File
      path: "file"
      showLabels: true

  # Computed tags showing file count
  - tag:
      toTag: Folder
      name: "files"
      value: "contains & (Folder -> File)"

  # Edge styling  
  - edgeColor:
      field: contains
      value: "#95a5a6"
      showLabel: false

  # Hide internal references
  - hideField:
      field: internalRef

  - hideAtom:
      selector: Metadata

  - flag: hideDisconnected
```

---

## Minimal Config

Sometimes less is more. A very simple spec can go a long way:

```yaml
constraints:
  - orientation:
      selector: parent
      directions: [above]

directives:
  - flag: hideDisconnectedBuiltIns
```

This single orientation constraint plus one flag produces a clean top-down tree for any data with a `parent` relation.
