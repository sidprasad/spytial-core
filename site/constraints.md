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

<div class="spytial-diagram" data-height="260" data-caption="Live: parent selector with directions [above] — Alice ends up above Bob and Carol.">
<template class="data">
{
  "atoms": [
    {"id": "a", "type": "Node", "label": "Alice"},
    {"id": "b", "type": "Node", "label": "Bob"},
    {"id": "c", "type": "Node", "label": "Carol"}
  ],
  "relations": [
    {"id": "parent", "name": "parent", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["a", "b"], "types": ["Node", "Node"]},
       {"atoms": ["a", "c"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="320" data-caption="Live: four states s0→s1→s2→s3→s0 arranged in a clockwise cycle.">
<template class="data">
{
  "atoms": [
    {"id": "s0", "type": "State", "label": "s0"},
    {"id": "s1", "type": "State", "label": "s1"},
    {"id": "s2", "type": "State", "label": "s2"},
    {"id": "s3", "type": "State", "label": "s3"}
  ],
  "relations": [
    {"id": "nextState", "name": "nextState", "types": ["State", "State"],
     "tuples": [
       {"atoms": ["s0", "s1"], "types": ["State", "State"]},
       {"atoms": ["s1", "s2"], "types": ["State", "State"]},
       {"atoms": ["s2", "s3"], "types": ["State", "State"]},
       {"atoms": ["s3", "s0"], "types": ["State", "State"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - cyclic: { selector: nextState, direction: clockwise }
directives:
  - atomColor: { selector: State, value: "#7eb77f" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="220" data-caption="Live: align horizontal forces both Persons onto the same row.">
<template class="data">
{
  "atoms": [
    {"id": "p1", "type": "Person", "label": "Ada"},
    {"id": "p2", "type": "Person", "label": "Bea"},
    {"id": "p3", "type": "Person", "label": "Cay"}
  ],
  "relations": [
    {"id": "pair", "name": "pair", "types": ["Person", "Person"],
     "tuples": [
       {"atoms": ["p1", "p2"], "types": ["Person", "Person"]},
       {"atoms": ["p2", "p3"], "types": ["Person", "Person"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - align: { selector: pair, direction: horizontal }
directives:
  - atomColor: { selector: Person, value: "#d98c4a" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="280" data-caption="Live: Team.members draws a bounding box around the three members.">
<template class="data">
{
  "atoms": [
    {"id": "t",  "type": "Team",   "label": "Team Alpha"},
    {"id": "m1", "type": "Member", "label": "Ada"},
    {"id": "m2", "type": "Member", "label": "Bea"},
    {"id": "m3", "type": "Member", "label": "Cay"}
  ],
  "relations": [
    {"id": "members", "name": "members", "types": ["Team", "Member"],
     "tuples": [
       {"atoms": ["t", "m1"], "types": ["Team", "Member"]},
       {"atoms": ["t", "m2"], "types": ["Team", "Member"]},
       {"atoms": ["t", "m3"], "types": ["Team", "Member"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - group: { selector: Team.members, name: "Team Members" }
directives:
  - atomColor: { selector: Team,   value: "#4a90d9" }
  - atomColor: { selector: Member, value: "#7eb77f" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="320" data-caption="Live: worksIn groups employees by their department (groupOn:1, addToGroup:0).">
<template class="data">
{
  "atoms": [
    {"id": "d1", "type": "Department", "label": "Eng"},
    {"id": "d2", "type": "Department", "label": "Design"},
    {"id": "e1", "type": "Employee",   "label": "Ada"},
    {"id": "e2", "type": "Employee",   "label": "Bea"},
    {"id": "e3", "type": "Employee",   "label": "Cay"},
    {"id": "e4", "type": "Employee",   "label": "Dee"}
  ],
  "relations": [
    {"id": "worksIn", "name": "worksIn", "types": ["Employee", "Department"],
     "tuples": [
       {"atoms": ["e1", "d1"], "types": ["Employee", "Department"]},
       {"atoms": ["e2", "d1"], "types": ["Employee", "Department"]},
       {"atoms": ["e3", "d2"], "types": ["Employee", "Department"]},
       {"atoms": ["e4", "d2"], "types": ["Employee", "Department"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - group: { field: worksIn, groupOn: 1, addToGroup: 0 }
directives:
  - atomColor: { selector: Department, value: "#4a90d9" }
  - atomColor: { selector: Employee,   value: "#7eb77f" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="240" data-caption="Live: the ImportantNode is sized 150×80 while ordinary Nodes use the default.">
<template class="data">
{
  "atoms": [
    {"id": "big", "type": "ImportantNode", "label": "Important"},
    {"id": "n1",  "type": "Node",          "label": "n1"},
    {"id": "n2",  "type": "Node",          "label": "n2"}
  ],
  "relations": [
    {"id": "link", "name": "link", "types": ["ImportantNode", "Node"],
     "tuples": [
       {"atoms": ["big", "n1"], "types": ["ImportantNode", "Node"]},
       {"atoms": ["big", "n2"], "types": ["ImportantNode", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - size: { selector: ImportantNode, width: 150, height: 80 }
directives:
  - atomColor: { selector: ImportantNode, value: "#d98c4a" }
  - atomColor: { selector: Node,          value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="240" data-caption="Live: the two InternalNodes (and their edges) are removed; only Node atoms remain.">
<template class="data">
{
  "atoms": [
    {"id": "n1", "type": "Node",         "label": "Visible 1"},
    {"id": "n2", "type": "Node",         "label": "Visible 2"},
    {"id": "i1", "type": "InternalNode", "label": "hidden 1"},
    {"id": "i2", "type": "InternalNode", "label": "hidden 2"}
  ],
  "relations": [
    {"id": "uses", "name": "uses", "types": ["Node", "InternalNode"],
     "tuples": [
       {"atoms": ["n1", "i1"], "types": ["Node", "InternalNode"]},
       {"atoms": ["n2", "i2"], "types": ["Node", "InternalNode"]}
     ]},
    {"id": "link", "name": "link", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n1", "n2"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - hideAtom: { selector: InternalNode }
directives:
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Negation (`hold: never`)

Any constraint can be negated by adding `hold: never`. By default, all constraints have `hold: always` (implicit). A negated constraint says "this relationship must **never** hold."

```yaml
- <constraint-type>:
    # ... same fields as the positive version
    hold: never
```

### Semantics

| Positive constraint | Meaning | `hold: never` meaning |
|---|---|---|
| `above` | A.y > B.y (A strictly above B) | A.y ≤ B.y (A at same level or below B) |
| `below` | A.y < B.y | A.y ≥ B.y |
| `left` | A.x < B.x | A.x ≥ B.x |
| `right` | A.x > B.x | A.x ≤ B.x |
| `align horizontal` | Same Y coordinate | Different Y coordinates |
| `cyclic clockwise` | Clockwise arrangement | No valid clockwise rotation holds |
| `group` | Clean bounding rectangle exists | No clean rectangle possible |

For orientation, `hold: never` on `above` does **not** mean "below or left or right." It means the weaker claim: "A's y-coordinate is less than or equal to B's y-coordinate." This allows A and B to be at the same level (aligned) or for B to be above A.

For alignment, negation requires a disjunction — `hold: never` on horizontal means "one must be above the other."

For cyclic constraints, negation uses **De Morgan's law**: if the positive cyclic constraint is a disjunction of rotational alternatives, `hold: never` becomes a conjunction where each rotation has at least one violated ordering.

For groups, `hold: never` asserts that no axis-aligned rectangle can contain exactly the group's members without also containing a non-member. No visual rectangle is drawn. The `name` field is optional for negated groups.

### Examples

```yaml
# Children must NEVER appear above parents
- orientation:
    selector: parent
    directions: [above]
    hold: never

# These two nodes must NEVER be horizontally aligned
- align:
    selector: A->B
    direction: horizontal
    hold: never

# Do NOT arrange states in a clockwise cycle
- cyclic:
    selector: nextState
    direction: clockwise
    hold: never

# No clean rectangle can contain just these nodes
- group:
    selector: Alpha
    hold: never
```

### Combining with Positive Constraints

Positive and negated constraints compose naturally. For example, you can say "A is left of B but NEVER above B":

```yaml
constraints:
  - orientation:
      selector: r
      directions: [left]
  - orientation:
      selector: r
      directions: [above]
      hold: never
```

<div class="spytial-diagram" data-height="240" data-caption="Live: A is left of B but never above B — so A ends up at the same level or below B.">
<template class="data">
{
  "atoms": [
    {"id": "a", "type": "Node", "label": "A"},
    {"id": "b", "type": "Node", "label": "B"}
  ],
  "relations": [
    {"id": "r", "name": "r", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["a", "b"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: r, directions: [left] }
  - orientation: { selector: r, directions: [above], hold: never }
directives:
  - atomColor: { selector: Node, value: "#a060d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

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

<div class="spytial-diagram" data-height="380" data-caption="Live: orientation + align + group composing together. Root is above the two children, the children are aligned horizontally, and the Team contains its members.">
<template class="data">
{
  "atoms": [
    {"id": "root", "type": "RootNode", "label": "Root"},
    {"id": "p1",   "type": "Person",   "label": "Ada"},
    {"id": "p2",   "type": "Person",   "label": "Bea"},
    {"id": "team", "type": "Team",     "label": "Team Alpha"},
    {"id": "m1",   "type": "Person",   "label": "Cay"},
    {"id": "m2",   "type": "Person",   "label": "Dee"}
  ],
  "relations": [
    {"id": "parent", "name": "parent", "types": ["RootNode", "Person"],
     "tuples": [
       {"atoms": ["root", "p1"], "types": ["RootNode", "Person"]},
       {"atoms": ["root", "p2"], "types": ["RootNode", "Person"]}
     ]},
    {"id": "siblings", "name": "siblings", "types": ["Person", "Person"],
     "tuples": [
       {"atoms": ["p1", "p2"], "types": ["Person", "Person"]}
     ]},
    {"id": "members", "name": "members", "types": ["Team", "Person"],
     "tuples": [
       {"atoms": ["team", "m1"], "types": ["Team", "Person"]},
       {"atoms": ["team", "m2"], "types": ["Team", "Person"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent,   directions: [above] }
  - align:       { selector: siblings, direction: horizontal }
  - group:       { selector: Team.members, name: "Team" }
  - size:        { selector: RootNode, width: 180, height: 80 }
directives:
  - atomColor: { selector: RootNode, value: "#d98c4a" }
  - atomColor: { selector: Person,   value: "#4a90d9" }
  - atomColor: { selector: Team,     value: "#7eb77f" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>
