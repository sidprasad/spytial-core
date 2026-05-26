# Directives

Directives control the **visual presentation** of your graph — colors, icons, labels, visibility. Unlike [constraints](constraints.md), directives don't change where nodes are positioned; they change how things look.

---

## Atom Color

Sets the background color of nodes matching a selector.

```yaml
- atomColor:
    selector: <unary-selector>   # Required
    value: <color>               # Required
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | Yes | string | Unary selector for target atoms |
| `value` | Yes | string | Any CSS color value |

You can use hex codes, named colors, `rgb()`, `hsl()`, etc.

### Examples

```yaml
- atomColor:
    selector: Person
    value: "#4a90d9"

- atomColor:
    selector: Error
    value: red

- atomColor:
    selector: Warning
    value: "rgb(255, 165, 0)"
```

<div class="spytial-diagram" data-height="240" data-caption="Live: each type gets its own atomColor — Person blue, Error red, Warning orange.">
<template class="data">
{
  "atoms": [
    {"id": "p",  "type": "Person",  "label": "Ada"},
    {"id": "e",  "type": "Error",   "label": "E42"},
    {"id": "w",  "type": "Warning", "label": "W7"}
  ],
  "relations": [
    {"id": "noticed", "name": "noticed", "types": ["Person", "Error"],
     "tuples": [
       {"atoms": ["p", "e"], "types": ["Person", "Error"]}
     ]},
    {"id": "raised", "name": "raised", "types": ["Person", "Warning"],
     "tuples": [
       {"atoms": ["p", "w"], "types": ["Person", "Warning"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - atomColor: { selector: Person,  value: "#4a90d9" }
  - atomColor: { selector: Error,   value: "red" }
  - atomColor: { selector: Warning, value: "rgb(255, 165, 0)" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Edge Styling

Customizes the appearance of edges for a specific field (relation). Use `edgeColor` in the directives section.

```yaml
- edgeColor:
    field: <field-name>          # Required
    value: <color>               # Required
    selector: <unary-selector>   # Optional
    filter: <n-ary-selector>     # Optional
    style: <line-style>          # Optional (default: solid)
    weight: <number>             # Optional
    showLabel: <boolean>         # Optional (default: true)
    hidden: <boolean>            # Optional (default: false)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `field` | Yes | string | — | Name of the relation |
| `value` | Yes | string | — | CSS color value |
| `selector` | No | string | — | Filter by source atom type |
| `filter` | No | string | — | Filter specific tuples |
| `style` | No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `weight` | No | number | — | Line thickness in pixels |
| `showLabel` | No | boolean | `true` | Whether to display the edge label |
| `hidden` | No | boolean | `false` | Hide the edge entirely |

### Scoping with `selector` and `filter`

When multiple types share the same field name (e.g., both `Person` and `Car` have a `name` field), use `selector` to scope the directive:

```yaml
# Color Person.name edges red
- edgeColor:
    field: name
    value: red
    selector: Person

# Color Car.name edges blue
- edgeColor:
    field: name
    value: blue
    selector: Car
```

Use `filter` for finer control over which tuples are affected:

```yaml
# Only style edges where the target is Active
- edgeColor:
    field: status
    value: green
    filter: "status & (univ -> Active)"
```

### Examples

```yaml
# Color all 'parent' edges blue
- edgeColor:
    field: parent
    value: blue

# Dashed red edges with thicker lines
- edgeColor:
    field: references
    value: red
    selector: Document
    style: dashed
    weight: 2

# Hide edges but keep the relationship in the data
- edgeColor:
    field: internal
    value: gray
    hidden: true

# Remove edge labels for cleaner look
- edgeColor:
    field: owns
    value: "#666"
    showLabel: false
```

<div class="spytial-diagram" data-height="280" data-caption="Live: parent edges are solid blue, references edges are dashed red and thicker.">
<template class="data">
{
  "atoms": [
    {"id": "d1", "type": "Document", "label": "Doc A"},
    {"id": "d2", "type": "Document", "label": "Doc B"},
    {"id": "d3", "type": "Document", "label": "Doc C"}
  ],
  "relations": [
    {"id": "parent", "name": "parent", "types": ["Document", "Document"],
     "tuples": [
       {"atoms": ["d1", "d2"], "types": ["Document", "Document"]},
       {"atoms": ["d1", "d3"], "types": ["Document", "Document"]}
     ]},
    {"id": "references", "name": "references", "types": ["Document", "Document"],
     "tuples": [
       {"atoms": ["d2", "d3"], "types": ["Document", "Document"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - edgeColor: { field: parent,     value: "blue" }
  - edgeColor: { field: references, value: "red", selector: Document, style: dashed, weight: 2 }
  - atomColor: { selector: Document, value: "#f0eada" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Icons

Assigns an icon to nodes matching a selector. Replaces the default rectangular node appearance.

```yaml
- icon:
    selector: <unary-selector>   # Required
    path: <icon-path>            # Required
    showLabels: <boolean>        # Optional (default: false)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | Yes | string | — | Unary selector for target atoms |
| `path` | Yes | string | — | Icon path, URL, or registered icon name |
| `showLabels` | No | boolean | `false` | Show text labels alongside the icon |

### Icon Sources

The `path` field supports several formats:

| Format | Example | Description |
|--------|---------|-------------|
| Bundled name | `"person"` | Built-in icon (no network needed) |
| Icon pack | `"bi:person-fill"` | CDN-hosted icon from an icon pack |
| URL | `"https://example.com/icon.svg"` | Any external URL |
| Relative path | `"/icons/custom.png"` | Relative path to a local asset |

#### Bundled Icons

These are available out of the box with no network request:

| Category | Icons |
|----------|-------|
| People | `person`, `person-fill`, `people` |
| Shapes | `circle`, `square`, `triangle` |
| Objects | `star`, `star-fill`, `heart`, `heart-fill` |
| Places | `home`, `house`, `building` |
| Files | `file`, `folder` |
| Arrows | `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right` |
| Status | `check`, `x`, `plus`, `minus`, `warning`, `info` |
| Game | `tic-x`, `tic-o` |
| Tech | `gear`, `database` |
| Nature | `tree`, `flower` |
| Misc | `flag`, `lock`, `key`, `car`, `envelope`, `phone` |

#### Icon Packs (CDN)

Use a prefix to pull icons from popular icon libraries:

| Prefix | Library | Example |
|--------|---------|---------|
| `bi:` | [Bootstrap Icons](https://icons.getbootstrap.com/) | `"bi:person-fill"` |
| `fa:` | [FontAwesome (solid)](https://fontawesome.com/icons) | `"fa:user"` |
| `fa-regular:` | FontAwesome (regular) | `"fa-regular:user"` |
| `fa-brands:` | FontAwesome (brands) | `"fa-brands:github"` |
| `lucide:` | [Lucide](https://lucide.dev/) | `"lucide:home"` |
| `heroicons:` | [Heroicons (outline)](https://heroicons.com/) | `"heroicons:user"` |
| `heroicons-solid:` | Heroicons (solid) | `"heroicons-solid:user"` |
| `tabler:` | [Tabler Icons](https://tabler-icons.io/) | `"tabler:home"` |
| `simple:` | [Simple Icons (brands)](https://simpleicons.org/) | `"simple:github"` |

> **Note:** Icon pack icons are loaded from a CDN at runtime, so they require an internet connection.

### Examples

```yaml
# Bundled icon
- icon:
    selector: Person
    path: "person"
    showLabels: true

# Bootstrap Icons pack
- icon:
    selector: Folder
    path: "bi:folder2-open"
    showLabels: true

# Lucide pack
- icon:
    selector: Settings
    path: "lucide:settings"

# External URL
- icon:
    selector: File
    path: "https://example.com/icons/file.svg"

# Shapes for game boards
- icon:
    selector: XPlayer
    path: "tic-x"
- icon:
    selector: OPlayer
    path: "tic-o"
```

<div class="spytial-diagram" data-height="280" data-caption="Live: bundled icons replace the default rectangles — Person uses person, Folder uses folder.">
<template class="data">
{
  "atoms": [
    {"id": "p1", "type": "Person", "label": "Ada"},
    {"id": "p2", "type": "Person", "label": "Bea"},
    {"id": "f",  "type": "Folder", "label": "Docs"}
  ],
  "relations": [
    {"id": "owns", "name": "owns", "types": ["Person", "Folder"],
     "tuples": [
       {"atoms": ["p1", "f"], "types": ["Person", "Folder"]},
       {"atoms": ["p2", "f"], "types": ["Person", "Folder"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - icon: { selector: Person, path: "person", showLabels: true }
  - icon: { selector: Folder, path: "folder", showLabels: true }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Size Directive

Sets node dimensions. Identical to the [size constraint](constraints.md#size) — can appear in either section.

```yaml
- size:
    selector: <unary-selector>   # Required
    width: <number>              # Optional (default: 100)
    height: <number>             # Optional (default: 60)
```

### Example

```yaml
- size:
    selector: LargeNode
    width: 200
    height: 100
```

<div class="spytial-diagram" data-height="240" data-caption="Live: LargeNode is sized 200×100 next to a default-sized Node.">
<template class="data">
{
  "atoms": [
    {"id": "big", "type": "LargeNode", "label": "Large"},
    {"id": "n",   "type": "Node",      "label": "n"}
  ],
  "relations": [
    {"id": "link", "name": "link", "types": ["LargeNode", "Node"],
     "tuples": [
       {"atoms": ["big", "n"], "types": ["LargeNode", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - size:      { selector: LargeNode, width: 200, height: 100 }
  - atomColor: { selector: LargeNode, value: "#d98c4a" }
  - atomColor: { selector: Node,      value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Projection

Projects over a type (signature), showing **one atom at a time** with navigation controls. This is commonly used to step through time steps, states, or other sequential structures.

```yaml
- projection:
    sig: <signature-name>        # Required
    orderBy: <binary-selector>   # Optional
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `sig` | Yes | string | Name of the type to project over |
| `orderBy` | No | string | Binary selector defining ordering between atoms |

### Ordering

- **Without `orderBy`**: Atoms are sorted alphabetically by their ID.
- **With `orderBy`**: The selector should return pairs `(a, b)` meaning "a comes before b". Atoms are sorted using topological sort. Cycles are broken by lexicographic order.

### Examples

```yaml
# Step through Time atoms alphabetically
- projection:
    sig: Time

# Step through Time atoms in order defined by 'next'
# If next = {(T0, T1), (T1, T2)}, order is: T0 → T1 → T2
- projection:
    sig: Time
    orderBy: "next"

# Use transitive closure for derived ordering
- projection:
    sig: State
    orderBy: "^next"
```

<div class="spytial-diagram" data-height="320" data-caption="Live: Time is projected (orderBy: next). Use the navigation controls to step T0 → T1 → T2.">
<template class="data">
{
  "atoms": [
    {"id": "t0", "type": "Time",  "label": "T0"},
    {"id": "t1", "type": "Time",  "label": "T1"},
    {"id": "t2", "type": "Time",  "label": "T2"},
    {"id": "a",  "type": "Light", "label": "Light"}
  ],
  "relations": [
    {"id": "next", "name": "next", "types": ["Time", "Time"],
     "tuples": [
       {"atoms": ["t0", "t1"], "types": ["Time", "Time"]},
       {"atoms": ["t1", "t2"], "types": ["Time", "Time"]}
     ]},
    {"id": "state", "name": "state", "types": ["Time", "Light"],
     "tuples": [
       {"atoms": ["t0", "a"], "types": ["Time", "Light"]},
       {"atoms": ["t2", "a"], "types": ["Time", "Light"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - projection: { sig: Time, orderBy: "next" }
  - atomColor:  { selector: Light, value: "#d98c4a" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

> **How it works:** When a type is projected, Spytial hides all atoms of that type and removes edges involving atoms not currently selected. The navigation controls let you step forward and backward through the atoms.

---

## Attributes

Converts an edge relationship into a **label on the source node**. The edge is removed from the graph and the target value is displayed as a key‑value pair on the node.

```yaml
- attribute:
    field: <field-name>          # Required
    selector: <unary-selector>   # Optional
    filter: <n-ary-selector>     # Optional
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | Yes | string | Relation to display as an attribute |
| `selector` | No | string | Filter by source atom type |
| `filter` | No | string | Filter specific tuples |

### What Happens

- The edge for this field is **removed** from the graph
- The target value appears as `field: value` on the source node
- Multiple targets become a comma-separated list

### Examples

```yaml
# Show 'age' as a label instead of an edge
- attribute:
    field: age

# Only for Person nodes
- attribute:
    field: name
    selector: Person

# Filter to show only active relationships
- attribute:
    field: status
    filter: "status & (univ -> Active)"
```

<div class="spytial-diagram" data-height="240" data-caption="Live: the age edge becomes an inline attribute on each Person node — no edge drawn.">
<template class="data">
{
  "atoms": [
    {"id": "p1", "type": "Person", "label": "Ada"},
    {"id": "p2", "type": "Person", "label": "Bea"},
    {"id": "a1", "type": "Int",    "label": "30"},
    {"id": "a2", "type": "Int",    "label": "27"}
  ],
  "relations": [
    {"id": "age", "name": "age", "types": ["Person", "Int"],
     "tuples": [
       {"atoms": ["p1", "a1"], "types": ["Person", "Int"]},
       {"atoms": ["p2", "a2"], "types": ["Person", "Int"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - attribute: { field: age }
  - atomColor: { selector: Person, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Tags

Adds computed labels to nodes **without** removing edges. Unlike `attribute`, the original edges remain visible.

```yaml
- tag:
    toTag: <unary-selector>      # Required
    name: <attribute-name>       # Required
    value: <n-ary-selector>      # Required
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `toTag` | Yes | string | Selector for atoms that receive the tag |
| `name` | Yes | string | Label name to display |
| `value` | Yes | string | Selector whose result becomes the value |

### Behavior

- Does **NOT** remove edges (unlike `attribute`)
- For binary results: displays as `name: value`
- For higher-arity results: displays as `name[key1][key2]: value`

### Examples

```yaml
# Show age on Person nodes (edges stay)
- tag:
    toTag: Person
    name: age
    value: age

# Ternary: shows as score[Math]: 95, score[English]: 87
- tag:
    toTag: Student
    name: score
    value: grades
```

<div class="spytial-diagram" data-height="240" data-caption="Live: age shown as a tag on each Person — and the original age edge is still drawn.">
<template class="data">
{
  "atoms": [
    {"id": "p1", "type": "Person", "label": "Ada"},
    {"id": "p2", "type": "Person", "label": "Bea"},
    {"id": "a1", "type": "Int",    "label": "30"},
    {"id": "a2", "type": "Int",    "label": "27"}
  ],
  "relations": [
    {"id": "age", "name": "age", "types": ["Person", "Int"],
     "tuples": [
       {"atoms": ["p1", "a1"], "types": ["Person", "Int"]},
       {"atoms": ["p2", "a2"], "types": ["Person", "Int"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - tag:       { toTag: Person, name: age, value: age }
  - atomColor: { selector: Person, value: "#4a90d9" }
</template>
</div>

---

## Hiding Fields

Hides all edges for a specific relation. The edges disappear but the data remains.

```yaml
- hideField:
    field: <field-name>          # Required
    selector: <unary-selector>   # Optional
    filter: <n-ary-selector>     # Optional
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | Yes | string | Relation to hide |
| `selector` | No | string | Filter by source atom type |
| `filter` | No | string | Filter specific tuples |

### Examples

```yaml
# Hide all 'internal' edges
- hideField:
    field: internal

# Hide only from certain source types
- hideField:
    field: debug
    selector: Production
```

<div class="spytial-diagram" data-height="280" data-caption="Live: the internal edges are removed from the picture; the public edges remain.">
<template class="data">
{
  "atoms": [
    {"id": "n1", "type": "Node", "label": "A"},
    {"id": "n2", "type": "Node", "label": "B"},
    {"id": "n3", "type": "Node", "label": "C"}
  ],
  "relations": [
    {"id": "public", "name": "public", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n1", "n2"], "types": ["Node", "Node"]}
     ]},
    {"id": "internal", "name": "internal", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n2", "n3"], "types": ["Node", "Node"]},
       {"atoms": ["n1", "n3"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - hideField: { field: internal }
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Hiding Atoms (Directive)

Hides atoms matching a selector. Identical to the [hideAtom constraint](constraints.md#hiding-atoms).

```yaml
- hideAtom:
    selector: <unary-selector>   # Required
```

### Example

```yaml
- hideAtom:
    selector: HelperNode
```

<div class="spytial-diagram" data-height="240" data-caption="Live: HelperNode atoms (and their edges) disappear; only Nodes remain.">
<template class="data">
{
  "atoms": [
    {"id": "n1", "type": "Node",       "label": "n1"},
    {"id": "n2", "type": "Node",       "label": "n2"},
    {"id": "h1", "type": "HelperNode", "label": "hidden"},
    {"id": "h2", "type": "HelperNode", "label": "hidden"}
  ],
  "relations": [
    {"id": "uses", "name": "uses", "types": ["Node", "HelperNode"],
     "tuples": [
       {"atoms": ["n1", "h1"], "types": ["Node", "HelperNode"]},
       {"atoms": ["n2", "h2"], "types": ["Node", "HelperNode"]}
     ]},
    {"id": "link", "name": "link", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["n1", "n2"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - hideAtom:  { selector: HelperNode }
  - atomColor: { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Inferred Edges

Creates edges that don't exist in your data but are **computed from a selector expression**. Useful for showing transitive relationships, derived connections, or computed paths.

```yaml
- inferredEdge:
    name: <edge-label>           # Required
    selector: <binary-selector>  # Required
    color: <color>               # Optional (default: #000000)
    style: <line-style>          # Optional (default: solid)
    weight: <number>             # Optional
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | Yes | string | — | Label displayed on the edge |
| `selector` | Yes | string | — | Binary selector returning (source, target) pairs |
| `color` | No | string | `#000000` | CSS color |
| `style` | No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `weight` | No | number | — | Line thickness in pixels |

### Examples

```yaml
# Show transitive closure as dotted gray edges
- inferredEdge:
    name: "reachable"
    selector: "^parent"
    color: gray
    style: dotted

# Highlight computed relationships
- inferredEdge:
    name: "sibling"
    selector: "~parent.parent - iden"
    color: purple
    style: dashed
    weight: 2
```

<div class="spytial-diagram" data-height="320" data-caption="Live: parent edges drawn normally; transitive reachable edges drawn as dotted gray.">
<template class="data">
{
  "atoms": [
    {"id": "a", "type": "Node", "label": "A"},
    {"id": "b", "type": "Node", "label": "B"},
    {"id": "c", "type": "Node", "label": "C"},
    {"id": "d", "type": "Node", "label": "D"}
  ],
  "relations": [
    {"id": "parent", "name": "parent", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["a", "b"], "types": ["Node", "Node"]},
       {"atoms": ["b", "c"], "types": ["Node", "Node"]},
       {"atoms": ["c", "d"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - inferredEdge: { name: "reachable", selector: "^parent", color: gray, style: dotted }
  - atomColor:    { selector: Node, value: "#4a90d9" }
  - flag: hideDisconnectedBuiltIns
</template>
</div>

---

## Flags

Global flags that affect the entire visualization.

```yaml
- flag: <flag-name>
```

| Flag | Description |
|------|-------------|
| `hideDisconnected` | Hide all nodes that have no edges |
| `hideDisconnectedBuiltIns` | Hide built-in type nodes (`Int`, `String`, etc.) that have no edges |

### Examples

```yaml
directives:
  - flag: hideDisconnected
  - flag: hideDisconnectedBuiltIns
```

<div class="spytial-diagram" data-height="240" data-caption="Live: only two Nodes are connected; the disconnected Node is hidden by the flag.">
<template class="data">
{
  "atoms": [
    {"id": "a", "type": "Node", "label": "A"},
    {"id": "b", "type": "Node", "label": "B"},
    {"id": "z", "type": "Node", "label": "Loner"}
  ],
  "relations": [
    {"id": "link", "name": "link", "types": ["Node", "Node"],
     "tuples": [
       {"atoms": ["a", "b"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
directives:
  - flag: hideDisconnected
  - atomColor: { selector: Node, value: "#4a90d9" }
</template>
</div>

> **Tip:** `hideDisconnectedBuiltIns` is almost always a good idea — it removes clutter from Forge/Alloy models that include integer and string atoms.
