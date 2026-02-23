# Constraints

Constraints control the **structural layout** of your visualization — where nodes are positioned relative to each other. They affect the geometry of the graph, not its visual appearance (that's what [directives](directives.md) are for).

---

## Orientation

The most commonly used constraint. It defines the spatial relationship between pairs of nodes connected by a selector.

```yaml
- orientation:
    selector: <binary-selector>    # Required
    directions: [<direction>, ...] # Required
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | Yes | string | A binary selector returning (source, target) pairs |
| `directions` | Yes | array | One or more positioning directions |

### Available Directions

| Direction | Meaning |
|-----------|---------|
| `above` | Source is above target (allows horizontal offset) |
| `below` | Source is below target (allows horizontal offset) |
| `left` | Source is left of target (allows vertical offset) |
| `right` | Source is right of target (allows vertical offset) |
| `directlyAbove` | Source is directly above target (strict vertical alignment) |
| `directlyBelow` | Source is directly below target (strict vertical alignment) |
| `directlyLeft` | Source is directly left of target (strict horizontal alignment) |
| `directlyRight` | Source is directly right of target (strict horizontal alignment) |

The **`directly*`** variants are stricter — they enforce axis alignment. For example, `directlyAbove` means the source is above the target **and** horizontally centered with it.

### Direction Restrictions

- Cannot combine `above` with `below`
- Cannot combine `left` with `right`
- `directly*` variants can only combine with their non‑direct counterpart (e.g., `directlyAbove` with `above`)

### Examples

```yaml
# Parents appear above children
- orientation:
    selector: parent
    directions: [above]

# Left-to-right flow with strict horizontal alignment
- orientation:
    selector: next
    directions: [directlyLeft]

# Source is above AND to the left of target
- orientation:
    selector: precedes
    directions: [above, left]
```

> **Tip:** If your selector uses special characters (like `^` or `~`), wrap it in quotes: `selector: "^parent"`.

---

## Cyclic

Arranges nodes along the perimeter of a circle, based on the order defined by a binary selector. Great for state machines, circular workflows, or ring topologies.

```yaml
- cyclic:
    selector: <binary-selector>  # Required
    direction: <rotation>        # Optional (default: clockwise)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | Yes | string | — | Binary selector defining the cycle order |
| `direction` | No | string | `clockwise` | `clockwise` or `counterclockwise` |

### Examples

```yaml
# Arrange states in a clockwise cycle
- cyclic:
    selector: nextState
    direction: clockwise

# Counter-clockwise arrangement
- cyclic:
    selector: follows
    direction: counterclockwise
```

> **How it works:** Spytial tries all valid rotational orderings of the nodes identified by the selector and picks one that satisfies the other constraints. If you have conflicting constraints, Spytial will report the minimal set of conflicts.

---

## Alignment

Ensures pairs of nodes share the same horizontal or vertical position.

```yaml
- align:
    selector: <binary-selector>  # Required
    direction: <alignment>       # Required
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | Yes | string | Binary selector returning (source, target) pairs to align |
| `direction` | Yes | string | `horizontal` or `vertical` |

- **`horizontal`** — Matched node pairs get the same Y coordinate (same row).
- **`vertical`** — Matched node pairs get the same X coordinate (same column).

### Examples

```yaml
# Align all Person pairs horizontally
- align:
    selector: Person->Person
    direction: horizontal

# Align selected nodes vertically
- align:
    selector: Node.selected->Node.selected
    direction: vertical
```

---

## Grouping by Selector

Draws a visual bounding box around nodes matched by a selector.

```yaml
- group:
    selector: <n-ary-selector>   # Required
    name: <group-name>           # Required
    addEdge: <boolean>           # Optional (default: false)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | Yes | string | — | Selector returning atoms to include in the group. This could be a unary or binary selector. If a binary selector, the first element is a group key, while the second element is added to groups associated with that key. |
| `name` | Yes | string | — | Display name shown on the group box |
| `addEdge` | No | boolean | `false` | Whether to add visual edges between group members and the group key |

### Examples

```yaml
# Group all team members
- group:
    selector: Team.members
    name: "Team Members"

# Group with connecting edges
- group:
    selector: Department.employees
    name: "Department"
    addEdge: true
```

---

## Grouping by Field

An alternative grouping mechanism that uses a relational field (tuple) to determine group membership. Useful when the grouping relationship is defined by a relation in your data.

```yaml
- group:
    field: <field-name>          # Required
    groupOn: <index>             # Required
    addToGroup: <index>          # Required
    selector: <unary-selector>   # Optional
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | Yes | string | Name of the relation |
| `groupOn` | Yes | integer | Tuple index (0-based) for the group key |
| `addToGroup` | Yes | integer | Tuple index (0-based) for the element to group |
| `selector` | No | string | Unary selector to filter which atoms apply |

### How Tuple Indices Work

Consider a relation `worksIn` with tuples like `(Employee, Department)`:
- Index `0` is the Employee
- Index `1` is the Department

To group employees by department:

```yaml
- group:
    field: worksIn
    groupOn: 1      # Department is the group key
    addToGroup: 0   # Employee gets added to the group
```

### Examples

```yaml
# Group employees by department
- group:
    field: worksIn
    groupOn: 1
    addToGroup: 0

# Group with selector filter
- group:
    field: owns
    groupOn: 0
    addToGroup: 1
    selector: Person
```

---

## Size

Sets the width and height of nodes matching a selector.

> **Note:** `size` can appear in either the `constraints` or `directives` section — it works the same either way.

```yaml
- size:
    selector: <unary-selector>   # Required
    width: <number>              # Optional (default: 100)
    height: <number>             # Optional (default: 60)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | Yes | string | — | Unary selector for target nodes |
| `width` | No | number | `100` | Width in pixels (must be > 0) |
| `height` | No | number | `60` | Height in pixels (must be > 0) |

### Example

```yaml
- size:
    selector: ImportantNode
    width: 150
    height: 80
```

---

## Hiding Atoms

Removes atoms from the visualization entirely. The atom and all its edges disappear.

> **Note:** `hideAtom` can appear in either the `constraints` or `directives` section.

```yaml
- hideAtom:
    selector: <unary-selector>   # Required
```

### Example

```yaml
- hideAtom:
    selector: InternalNode
```

---

## Combining Constraints

Constraints compose naturally. Spytial solves all of them simultaneously using a constraint solver. When constraints conflict, Spytial identifies the **minimal set of conflicting constraints** (called an Irreducible Inconsistent Subset, or IIS) so you can fix the issue.

```yaml
constraints:
  # Tree layout: parents above, siblings aligned
  - orientation:
      selector: parent
      directions: [above]

  - align:
      selector: "Person.~parent.parent - iden"
      direction: horizontal

  # Group by team
  - group:
      selector: Team.members
      name: "Team"

  # Resize important nodes
  - size:
      selector: RootNode
      width: 200
      height: 100
```
