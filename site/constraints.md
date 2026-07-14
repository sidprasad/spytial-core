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

Each direction describes where the **target** of a `(source, target)` pair ends up relative to the **source**.

| Direction | Meaning |
|-----------|---------|
| `above` | Target is above source (allows horizontal offset) |
| `below` | Target is below source (allows horizontal offset) |
| `left` | Target is left of source (allows vertical offset) |
| `right` | Target is right of source (allows vertical offset) |
| `directlyAbove` | Target is directly above source (strict vertical alignment) |
| `directlyBelow` | Target is directly below source (strict vertical alignment) |
| `directlyLeft` | Target is directly left of source (strict horizontal alignment) |
| `directlyRight` | Target is directly right of source (strict horizontal alignment) |

The **`directly*`** variants are stricter — they enforce axis alignment. For example, `directlyAbove` means the target is above the source **and** horizontally centered with it.

### Direction Restrictions

- Cannot combine `above` with `below`
- Cannot combine `left` with `right`
- `directly*` variants can only combine with their non‑direct counterpart (e.g., `directlyAbove` with `above`)

### Examples

```yaml
- orientation:
    selector: parent
    directions: [above]
```

<div class="spytial-diagram" data-height="360" data-caption="Live: parent selector with directions [above] — Alice ends up above Bob and Carol. (Here `parent: child → parent`, so Bob's parent is Alice.)">
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
       {"atoms": ["b", "a"], "types": ["Node", "Node"]},
       {"atoms": ["c", "a"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent, directions: [above] }
</template>
</div>

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
```

<div class="spytial-diagram" data-height="400" data-caption="Live: four states s0→s1→s2→s3→s0 arranged in a clockwise cycle.">
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
# Align all Person's horizontally.
- align:
    selector: Person->Person
    direction: horizontal
```

<div class="spytial-diagram" data-height="280" data-caption="Live: align horizontal forces both Persons onto the same row.">
<template class="data">
{
  "atoms": [
    {"id": "p1", "type": "Person", "label": "Ada"},
    {"id": "p2", "type": "Person", "label": "Bea"},
    {"id": "p3", "type": "Person", "label": "Cay"}
  ],
  "relations": [
  ]
}
</template>
<template class="spec">
constraints:
  - align: { selector: Person->Person, direction: horizontal }
</template>
</div>

---

## Grouping by Selector

Draws a visual bounding box around nodes matched by a selector.

```yaml
- group:
    selector: <n-ary-selector>   # Required
    name: <group-name>           # Required
    addEdge: <direction>         # Optional: none | togroup | fromgroup (default: none)
    textStyle: { color: <color> }  # Optional: style the group's own label
```

A group has two style surfaces: its **own label** (top-level `textStyle`) and — when `addEdge` draws a connector — that **connector**, which is an edge and takes the shared `lineStyle` / `textStyle` blocks. Give `addEdge` in block form to style the connector:

```yaml
- group:
    selector: <n-ary-selector>
    name: <group-name>
    addEdge:
      points: togroup
      lineStyle: { color: <color>, pattern: <solid|dashed|dotted>, weight: <number> }
      textStyle: { color: <color> }   # the connector's label
    textStyle: { color: <color> }      # the group's own label
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | Yes | string | — | Selector returning atoms to include in the group. This could be a unary or binary selector. If a binary selector, the first element is a group key, while the second element is added to groups associated with that key. |
| `name` | Yes | string | — | Display name shown on the group box |
| `addEdge` | No | direction *or* block | `none` | The connector between the group key and the group. As a bare string, just the direction (`none` / `togroup` / `fromgroup`; legacy `true` = `togroup`). As a block, also styles the connector (`points` + `lineStyle` + `textStyle`). For tuples `(a, b), (a, c), (a, d)` the group is keyed by `a`: `togroup` draws `a` → group, `fromgroup` draws group → `a`. |
| `textStyle.color` | No | string | — | Color of the group's own label (`size` is reserved — group labels auto-fit) |

### Examples

```yaml
# Group all team members
- group:
    selector: Team.members
    name: "Team Members"

# Styled: dashed teal connector with a red label, purple group label
- group:
    selector: Team.members
    name: "Team Members"
    addEdge:
      points: togroup
      lineStyle: { color: "#0aa", pattern: dashed, weight: 3 }
      textStyle: { color: "#a00" }
    textStyle: { color: "#7c3aed" }
```

<div class="spytial-diagram" data-height="360" data-caption="Live: Team.members draws a bounding box around the three members.">
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

<div class="spytial-diagram" data-height="320" data-caption="Live: the ImportantNode is sized 150×80 while ordinary Nodes use the default.">
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

<div class="spytial-diagram" data-height="320" data-caption="Live: the two InternalNodes (and their edges) are removed; only Node atoms remain.">
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

For an `orientation` constraint with a selector returning `(source, target)` pairs:

| Positive constraint | Meaning | `hold: never` meaning |
|---|---|---|
| `above` | target strictly above source | target may be at the same level or below source |
| `below` | target strictly below source | target may be at the same level or above source |
| `left` | target strictly left of source | target may be at the same column or right of source |
| `right` | target strictly right of source | target may be at the same column or left of source |
| `align horizontal` | source and target share a Y coordinate | source and target differ in Y |
| `cyclic clockwise` | Clockwise arrangement | No valid clockwise rotation holds |
| `group` | Clean bounding rectangle exists | No clean rectangle possible |

For orientation, `hold: never` on `above` does **not** mean "below or left or right." It means the weaker claim: "the target is **not** strictly above the source." The target may be at the same y-coordinate or below.

For alignment, negation requires a disjunction — `hold: never` on horizontal means "one must be above the other."

For cyclic constraints, negation uses **De Morgan's law**: if the positive cyclic constraint is a disjunction of rotational alternatives, `hold: never` becomes a conjunction where each rotation has at least one violated ordering.

For groups, `hold: never` asserts that no axis-aligned rectangle can contain exactly the group's members without also containing a non-member. No visual rectangle is drawn. The `name` field is optional for negated groups.

### Examples

```yaml
# Children must NEVER appear above their parents
# (Assumes `parent: child → parent`. `[below] hold: never` says target = parent
#  is never strictly below source = child, i.e. parent stays on top or aligned.)
- orientation:
    selector: parent
    directions: [below]
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

<div class="spytial-diagram" data-height="300" data-caption="Live: A is left of B but never above B — so A ends up at the same level or below B.">
<template class="data">
{
  "atoms": [
    {"id": "a", "type": "Node", "label": "A"},
    {"id": "b", "type": "Node", "label": "B"}
  ],
  "relations": [
    {"id": "r", "name": "r", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["b", "a"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: r, directions: [left] }
  - orientation: { selector: r, directions: [above], hold: never }
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

<div class="spytial-diagram" data-height="480" data-caption="Live: orientation + align + group composing together. Root is above the two children, the children are aligned horizontally, and the Team contains its members.">
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
    {"id": "parent", "name": "parent", "types": ["Person", "RootNode"],
     "tuples": [
       {"atoms": ["p1", "root"], "types": ["Person", "RootNode"]},
       {"atoms": ["p2", "root"], "types": ["Person", "RootNode"]}
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
</template>
</div>
