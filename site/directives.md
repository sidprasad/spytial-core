# Directives

Directives control the **visual presentation** of your graph — colors, icons, labels, visibility. Unlike [constraints](constraints.md), directives don't change where nodes are positioned; they change how things look.

---

## Atom Styling

Styles the atoms (nodes) matching a selector. An atom has an interior **fill**, an outline **border**, and a **label**, styled with the shared `fillStyle`, `borderStyle`, and `textStyle` blocks — the same block vocabulary `edgeStyle` uses for lines and labels. Use `atomStyle` in the directives section.

```yaml
- atomStyle:
    selector: <unary-selector>                        # Optional (absent = all atoms)
    fillStyle:   { color: <color> }                   # the interior fill (opt-in)
    borderStyle: { color: <color>, width: <number> }  # the outline
    textStyle:   { size: <small|normal|large>, color: <color> }  # the atom's label
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | No | string | Unary selector for target atoms; absent styles every atom |
| `fillStyle.color` | No | string | Interior fill color (opt-in; the default is unfilled) |
| `borderStyle.color` | No | string | Outline color |
| `borderStyle.width` | No | number | Outline thickness in px (must be > 0) |
| `textStyle.color` | No | string | Label color |
| `textStyle.size` | No | enum | `small`/`normal`/`large` — *reserved; not yet applied to the node's own label* |

You can use hex codes, named colors, `rgb()`, `hsl()`, etc.

When several `atomStyle` rules match one atom their set properties **compose**; because a supertype selector already returns subtype atoms, a rule on a supertype and a rule on a subtype both apply (inheritance up the type hierarchy). Setting the *same* property two different ways is an error — no silent override.

> **`atomColor` is the legacy form** and still works: `value`→`borderStyle.color`, so a node keeps its outline exactly as before. It desugars to `atomStyle` with a deprecation warning. Add a `fillStyle` to give a node a real interior fill.

### Examples

```yaml
# Filled, thick-bordered Person nodes with dark-red labels
- atomStyle:
    selector: Person
    fillStyle:   { color: "#e0f2ff" }
    borderStyle: { color: "#0369a1", width: 4 }
    textStyle:   { color: "#b91c1c" }

# Recolor just the outline (border-preserving, like atomColor)
- atomStyle:
    selector: Error
    borderStyle: { color: red }
```

<div class="spytial-diagram" data-height="320" data-caption="Live: each type gets its own atomStyle — Person filled blue, Error red-bordered, Warning amber fill.">
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
  - atomStyle: { selector: Person,  fillStyle: { color: "#e0f2ff" }, borderStyle: { color: "#4a90d9", width: 3 } }
  - atomStyle: { selector: Error,   borderStyle: { color: "red", width: 3 } }
  - atomStyle: { selector: Warning, fillStyle: { color: "rgb(255, 236, 179)" } }
</template>
</div>

---

## Edge Styling

Customizes the appearance of edges for a specific field (relation). Use `edgeStyle` in the directives section. An edge has a **line** and a **label**, styled with the shared `lineStyle` and `textStyle` blocks — the same blocks `inferredEdge` and group connectors reuse.

```yaml
- edgeStyle:
    field: <field-name>          # Required
    selector: <unary-selector>   # Optional: match edges from these source atoms
    filter: <n-ary-selector>     # Optional: match specific tuples
    lineStyle:                   # Optional: the drawn line
      color: <color>
      pattern: <solid|dashed|dotted>
      weight: <number>
      highlight: <color>
    textStyle:                   # Optional: the edge label
      size: <small|normal|large>
      color: <color>
    showLabel: <boolean>         # Optional (default: true)
    hidden: <boolean>            # Optional (default: false)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `field` | Yes | string | — | Name of the relation |
| `selector` | No | string | — | Match by source atom |
| `filter` | No | string | — | Match specific tuples |
| `lineStyle.color` | No | string | — | Line color |
| `lineStyle.pattern` | No | enum | `solid` | `solid`, `dashed`, or `dotted` |
| `lineStyle.weight` | No | number | — | Line thickness in pixels (> 0) |
| `lineStyle.highlight` | No | string | — | Translucent underlay color |
| `textStyle.size` | No | enum | `normal` | `small`, `normal`, or `large` |
| `textStyle.color` | No | string | — | Edge-label color |
| `showLabel` | No | boolean | `true` | Whether to display the edge label |
| `hidden` | No | boolean | `false` | Hide the edge entirely |

When several `edgeStyle` rules match one edge their set properties **compose**; setting the *same* property two different ways is an error — no silent override.

> **`edgeColor` is the legacy form** and still works: `value`→`lineStyle.color`, `style`→`lineStyle.pattern`, `weight`→`lineStyle.weight`, `highlight`→`lineStyle.highlight`. It will desugar to `edgeStyle` with a deprecation warning. The scoping and example snippets below use `edgeColor`; swap the flat keys for the blocks above to get the `edgeStyle` form.

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

<div class="spytial-diagram" data-height="380" data-caption="Live: parent edges are solid blue, references edges are dashed red and thicker.">
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
       {"atoms": ["d2", "d1"], "types": ["Document", "Document"]},
       {"atoms": ["d3", "d1"], "types": ["Document", "Document"]}
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

<div class="spytial-diagram" data-height="340" data-caption="Live: bundled icons replace the default rectangles — Person uses person, Folder uses folder.">
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

<div class="spytial-diagram" data-height="300" data-caption="Live: LargeNode is sized 200×100 next to a default-sized Node.">
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
  - size: { selector: LargeNode, width: 200, height: 100 }
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

<div class="spytial-diagram" data-height="380" data-caption="Live: Time is projected (orderBy: next). Use the navigation controls to step T0 → T1 → T2.">
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
    textStyle:                   # Optional: shared text-style block
      size: <small|normal|large> #   font size relative to the node label
      color: <color>             #   text color (any CSS color)
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | Yes | string | Relation to display as an attribute |
| `selector` | No | string | Filter by source atom type |
| `filter` | No | string | Filter specific tuples |
| `textStyle.size` | No | `small` \| `normal` \| `large` | Size of the attribute text relative to the node label (default `normal`) |
| `textStyle.color` | No | string | Text color of the attribute line (default inherits the node label color) |

### What Happens

- The edge for this field is **removed** from the graph
- The target value appears as `field: value` on the source node
- Multiple targets become a comma-separated list
- `textStyle` is the same shared block edges and atoms use. `size` scales the line's font (`large` bigger than the node label, `normal` default, `small` smaller still; the node box resizes to fit); `color` sets its text color (unset = inherit the node label color)

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

<div class="spytial-diagram" data-height="300" data-caption="Live: the age edge becomes an inline attribute on each Person node — no edge drawn.">
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
    textStyle:                   # Optional: shared text-style block
      size: <small|normal|large> #   font size relative to the node label
      color: <color>             #   text color (any CSS color)
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `toTag` | Yes | string | Selector for atoms that receive the tag |
| `name` | Yes | string | Label name to display |
| `value` | Yes | string | Selector whose result becomes the value |
| `textStyle.size` | No | `small` \| `normal` \| `large` | Size of the tag text relative to the node label (default `normal`) |
| `textStyle.color` | No | string | Text color of the tag line (default inherits the node label color) |

### Behavior

- Does **NOT** remove edges (unlike `attribute`)
- For binary results: displays as `name: value`
- For higher-arity results: displays as `name[key1][key2]: value`
- `textStyle` is the same shared block edges and atoms use. `size` scales the line's font (`large` bigger than the node label, `normal` default, `small` smaller still); `color` sets its text color (unset = inherit the node label color)

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

<div class="spytial-diagram" data-height="320" data-caption="Live: age shown as a tag on each Person — and the original age edge is still drawn.">
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
  - tag: { toTag: Person, name: age, value: age }
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

<div class="spytial-diagram" data-height="340" data-caption="Live: the internal edges are removed from the picture; the public edges remain.">
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

<div class="spytial-diagram" data-height="300" data-caption="Live: HelperNode atoms (and their edges) disappear; only Nodes remain.">
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
  - hideAtom: { selector: HelperNode }
</template>
</div>

---

## Inferred Edges

Creates edges that don't exist in your data but are **computed from a selector expression**. Useful for showing transitive relationships, derived connections, or computed paths.

```yaml
- inferredEdge:
    name: <edge-label>           # Required
    selector: <binary-selector>  # Required
    draw: <end> -> <end>         # Optional: what each end attaches to
    color: <color>               # Optional (default: #000000)
    style: <line-style>          # Optional (default: solid)
    weight: <number>             # Optional
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | Yes | string | — | Label displayed on the edge |
| `selector` | Yes | string | — | Binary selector returning (source, target) pairs (unary allowed with `draw`) |
| `draw` | No | string | — | `<end> -> <end>`, each end `_` (the atom, the default) or a group-constraint name (attach to the hull of that constraint's group keyed by this end's atom) |
| `color` | No | string | `#000000` | CSS color |
| `style` | No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `weight` | No | number | — | Line thickness in pixels |

### Group endpoints (`draw`)

By default each selected pair gets an arrow between its two **atoms**. `draw` reinterprets the ends — it never changes which pairs get arrows or their direction (transpose the selector, e.g. `~connected`, to flip):

- `draw: regions -> regions` — hull to hull: each end attaches to the `regions` group keyed by that end's atom.
- `draw: _ -> regions` — atom to hull.
- With `draw`, a **unary** selector is allowed: the single atom feeds both ends, so `draw: _ -> regions` connects each key to its own group.

The group name must match a `group` constraint (checked at parse time). A keyed group constraint (binary selector) builds one group per key, and the end's atom picks which; a unary group constraint builds a single group, and the end attaches to it directly. A name meaning both at once (two constraints sharing it) is an error. If an atom doesn't key a group of that name in the current instance, that edge is skipped with a console warning. Both ends landing on the same group draw a self-loop on its hull. Keys hidden with `hideAtom` are fine — group ends attach to the hull, not the key node.

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

# Group-to-group: one dashed edge per `connected` pair, drawn hull to hull
# (assumes a group constraint named regions keyed by Region atoms)
- inferredEdge:
    name: "connected"
    selector: connected
    draw: regions -> regions
    lineStyle: { color: steelblue, pattern: dashed }
```

<div class="spytial-diagram" data-height="440" data-caption="Live: parent edges drawn normally; transitive reachable edges drawn as dotted gray.">
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
       {"atoms": ["b", "a"], "types": ["Node", "Node"]},
       {"atoms": ["c", "b"], "types": ["Node", "Node"]},
       {"atoms": ["d", "c"], "types": ["Node", "Node"]}
     ]}
  ]
}
</template>
<template class="spec">
constraints:
  - orientation: { selector: parent, directions: [above] }
directives:
  - inferredEdge: { name: "reachable", selector: "^parent", color: gray, style: dotted }
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

<div class="spytial-diagram" data-height="300" data-caption="Live: only two Nodes are connected; the disconnected Node is hidden by the flag.">
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
</template>
</div>

> **Tip:** `hideDisconnectedBuiltIns` is almost always a good idea — it removes clutter from Forge/Alloy models that include integer and string atoms.
