# Directives

Directives control the **visual presentation** of your graph — colors, icons, labels, visibility. Unlike [constraints](constraints.md), directives don't change where nodes are positioned; they change how things look.

---

## Atom Styling

Styles the atoms (nodes) matching a selector. An atom has an interior **fill**, an outline **border**, an **icon**, and a **label**, styled with the shared `fillStyle`, `borderStyle`, `iconStyle`, and `textStyle` blocks — the same block vocabulary `edgeStyle` uses for lines and labels. Use `atomStyle` in the directives section.

```yaml
- atomStyle:
    selector: <unary-selector>                        # Optional (absent = all atoms)
    fillStyle:   { color: <color> }                   # the interior fill (opt-in)
    borderStyle: { color: <color>, width: <number> }  # the outline
    iconStyle:   { path: <icon-path>, placement: <full|badge>, opacity: <0..1> }
    textStyle:   { size: <small|normal|large>, color: <color> }  # the atom's label
    showLabel:   <boolean>                            # Optional (default: true)
```

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | No | string | all atoms | Unary selector for target atoms |
| `fillStyle.color` | No | string | — | Interior fill color (opt-in; the default is unfilled) |
| `borderStyle.color` | No | string | — | Outline color |
| `borderStyle.width` | No | number | — | Outline thickness in px (must be > 0) |
| `iconStyle.path` | No | string | — | Icon path, URL, or registered name — see [Icons](#icons) |
| `iconStyle.placement` | No | enum | `full` | `full` (the icon occupies the box) or `badge` (small top-right marker) |
| `iconStyle.opacity` | No | number | `1` | Icon alpha in `[0,1]` |
| `textStyle.color` | No | string | — | Label color |
| `textStyle.size` | No | enum | `normal` | `small`/`normal`/`large` — *reserved; not yet applied to the node's own label* |
| `showLabel` | No | boolean | `true` | Whether the atom's label is drawn |

You can use hex codes, named colors, `rgb()`, `hsl()`, etc.

When several `atomStyle` rules match one atom their set properties **compose**; because a supertype selector already returns subtype atoms, a rule on a supertype and a rule on a subtype both apply (inheritance up the type hierarchy). Setting the *same* property two different ways is an error — no silent override. `iconStyle` composes like any other block, so a supertype can supply the icon and a subtype tune only its opacity.

**Icons and labels are separate knobs.** `placement` sets the icon's geometry, `showLabel` decides whether the label draws — combine them freely:

| Idiom | Spec | Result |
|---|---|---|
| **Glyph** | `placement: full`, `showLabel: false` | The icon *is* the node — transparent box, no label |
| **Badge** | `placement: badge` | Small corner marker beside a normal labelled node |
| **Watermark** | `placement: full`, low `opacity` | Faded full-size icon behind the label |

A `full` icon leaves the box transparent (a group hull shows through it) unless you ask for a `fillStyle.color`, which wins.

> **`atomColor` was removed in 6.0.0** and now fails to parse. Rewrite it as `atomStyle` with `value`→`borderStyle.color`, which keeps a node outlined exactly as before. Add a `fillStyle` to give it a real interior fill.
>
> **`icon` was removed in 6.0.0** as well. Its one `showLabels` boolean drove both label visibility and icon geometry, so it splits in two: `showLabels: false` becomes `showLabel: false` + `placement: full`; `showLabels: true` becomes `showLabel: true` + `placement: badge`.

### Examples

```yaml
# Filled, thick-bordered Person nodes with dark-red labels
- atomStyle:
    selector: Person
    fillStyle:   { color: "#e0f2ff" }
    borderStyle: { color: "#0369a1", width: 4 }
    textStyle:   { color: "#b91c1c" }

# Recolor just the outline (border-preserving)
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

> **`edgeColor` was removed in 6.0.0** and now fails to parse. Rewrite it as `edgeStyle`: `value`→`lineStyle.color`, `style`→`lineStyle.pattern`, `weight`→`lineStyle.weight`, `highlight`→`lineStyle.highlight`.

### Scoping with `selector` and `filter`

When multiple types share the same field name (e.g., both `Person` and `Car` have a `name` field), use `selector` to scope the directive:

```yaml
# Color Person.name edges red
- edgeStyle:
    field: name
    selector: Person
    lineStyle: { color: red }

# Color Car.name edges blue
- edgeStyle:
    field: name
    selector: Car
    lineStyle: { color: blue }
```

Use `filter` for finer control over which tuples are affected:

```yaml
# Only style edges where the target is Active
- edgeStyle:
    field: status
    filter: "status & (univ -> Active)"
    lineStyle: { color: green }
```

### Examples

```yaml
# Color all 'parent' edges blue
- edgeStyle:
    field: parent
    lineStyle: { color: blue }

# Dashed red edges with thicker lines
- edgeStyle:
    field: references
    selector: Document
    lineStyle: { color: red, pattern: dashed, weight: 2 }

# Hide edges but keep the relationship in the data
- edgeStyle:
    field: internal
    hidden: true

# Remove edge labels for cleaner look
- edgeStyle:
    field: owns
    lineStyle: { color: "#666" }
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
  - edgeStyle: { field: parent,     lineStyle: { color: "blue" } }
  - edgeStyle: { field: references, selector: Document, lineStyle: { color: "red", pattern: dashed, weight: 2 } }
</template>
</div>

---

## Icons

Icons are part of [atom styling](#atom-styling) — set them with an `iconStyle` block:

```yaml
- atomStyle:
    selector: <unary-selector>
    iconStyle:
      path: <icon-path>            # bundled name, pack reference, URL, or path
      placement: <full|badge>      # Optional (default: full)
      opacity: <0..1>              # Optional (default: 1)
    showLabel: <boolean>           # Optional (default: true)
```

> The standalone `- icon:` directive was removed in 6.0.0. See the [atom styling](#atom-styling) section for how its `showLabels` flag maps onto `showLabel` + `placement`.

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
# Bundled icon as a corner badge, label kept
- atomStyle:
    selector: Person
    iconStyle: { path: "person", placement: badge }

# Bootstrap Icons pack
- atomStyle:
    selector: Folder
    iconStyle: { path: "bi:folder2-open", placement: badge }

# External URL
- atomStyle:
    selector: File
    iconStyle: { path: "https://example.com/icons/file.svg" }

# Shapes for game boards — the icon replaces the node entirely
- atomStyle:
    selector: XPlayer
    showLabel: false
    iconStyle: { path: "tic-x" }
- atomStyle:
    selector: OPlayer
    showLabel: false
    iconStyle: { path: "tic-o" }

# Watermark: a faded icon behind the label, stronger for admins
- atomStyle:
    selector: Person
    iconStyle: { path: "person", opacity: 0.12 }
- atomStyle:
    selector: Admin
    iconStyle: { opacity: 0.35 }   # path inherited from the Person rule
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
  - atomStyle: { selector: Person, iconStyle: { path: "person", placement: badge } }
  - atomStyle: { selector: Folder, iconStyle: { path: "folder", placement: badge } }
</template>
</div>

---

## Size — *a constraint, not a directive*

`size` fixes a node's geometry, which is what the layout solves over — not presentation layered on a solved layout. It belongs in `constraints:`. See [Size](constraints.md#size).

Writing it under `directives:` was tolerated through 5.x; since 6.0.0 it is an **error**. Move it; nothing else changes.

```yaml
# Deprecated
directives:
  - size: { selector: LargeNode, width: 200, height: 100 }

# Supported
constraints:
  - size: { selector: LargeNode, width: 200, height: 100 }
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
constraints:
  - size: { selector: LargeNode, width: 200, height: 100 }
</template>
</div>

---

## Projection — *not a directive*

Projection is **not** part of the spec language. A `- projection:` entry in a `directives:` block parses without complaint and then does nothing — the engine ignores it.

Projections are a **pre-layout data transformation**: you rewrite the data instance before handing it to the layout, rather than asking the layout to do it.

```typescript
import { applyProjectionTransform } from 'spytial-core';

const { instance, choices } = applyProjectionTransform(
  originalInstance,
  [{ sig: 'Time', orderBy: 'next' }],
  selections,                       // type → chosen atom id
  { evaluateOrderBy: (sel) => evaluator.evaluate(sel) },
);
```

Without `orderBy`, atoms are ordered alphabetically by id; with it, the selector returns pairs `(a, b)` meaning "a comes before b" and atoms are topologically sorted, breaking cycles lexicographically. `evaluateOrderBy` is required for `orderBy` to have any effect.

For an interactive version — a type/atom picker plus navigation — drive `applyProjectionTransform` from your own UI: it returns the projected instance along with the choices available for each projected type. See the [API Reference](api-reference.md#projection-transform).

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
- For unary results: displays as `name: <the atom's own label>` — a membership tag, saying only that the atom is in the set
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

## Hiding Atoms — *a constraint, not a directive*

`hideAtom` changes what the layout has to place, and can make a spec unsatisfiable against the other constraints — hiding an atom that a layout constraint references (or that a group contains) is a conflict, and the diagram draws the atom anyway with a dashed outline alongside the error. It belongs in `constraints:`. See [Hiding Atoms](constraints.md#hiding-atoms).

Writing it under `directives:` was tolerated through 5.x; since 6.0.0 it is an **error**. Move it; nothing else changes.

```yaml
# Deprecated
directives:
  - hideAtom: { selector: HelperNode }

# Supported
constraints:
  - hideAtom: { selector: HelperNode }
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
constraints:
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
    lineStyle:                   # Optional: the drawn line
      color: <color>
      pattern: <solid|dashed|dotted>
      weight: <number>
      highlight: <color>
    textStyle:                   # Optional: the edge label
      size: <small|normal|large>
      color: <color>
```

> **The flat inline `color` / `style` / `weight` / `highlight` were removed in 6.0.0** and now fail to parse. Use the `lineStyle` block — the same one `edgeStyle` and group connectors take. Note `style` is spelled `pattern` there.

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | Yes | string | — | Label displayed on the edge |
| `selector` | Yes | string | — | Binary selector returning (source, target) pairs (unary allowed with `draw`) |
| `draw` | No | string | — | `<end> -> <end>`, each end `_` (the atom, the default) or a group-constraint name (attach to the hull of that constraint's group keyed by this end's atom) |
| `lineStyle.color` | No | string | `#000000` | CSS color of the line |
| `lineStyle.pattern` | No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `lineStyle.weight` | No | number | — | Line thickness in pixels |
| `lineStyle.highlight` | No | string | — | CSS color drawn as a wider, translucent underlay beneath the line |
| `textStyle.size` | No | string | — | `small`, `normal`, or `large` |
| `textStyle.color` | No | string | — | CSS color of the edge label |

### Group endpoints (`draw`)

By default each selected pair gets an arrow between its two **atoms**. `draw` reinterprets the ends — it never changes which pairs get arrows or their direction (transpose the selector, e.g. `~connected`, to flip):

- `draw: regions -> regions` — hull to hull: each end attaches to the `regions` group keyed by that end's atom.
- `draw: _ -> regions` — atom to hull.
- With `draw`, a **unary** selector is allowed: the single atom feeds both ends, so `draw: _ -> regions` connects each key to its own group.

A keyed group constraint (binary selector) builds one group per key, and the end's atom picks which; a unary group constraint builds a single group, and the end attaches to it directly. A name meaning both at once (two constraints sharing it) is an error. If no `group` constraint defines the name, the parse warns and the edge is skipped — not an error, so a fragment can name a group that another fragment defines. If an atom doesn't key a group of that name in the current instance, that edge is skipped with a console warning. Both ends landing on the same group draw a self-loop on its hull. Keys hidden with `hideAtom` are fine — group ends attach to the hull, not the key node.

### Examples

```yaml
# Show transitive closure as dotted gray edges
- inferredEdge:
    name: "reachable"
    selector: "^parent"
    lineStyle: { color: gray, pattern: dotted }

# Highlight computed relationships
- inferredEdge:
    name: "sibling"
    selector: "~parent.parent - iden"
    lineStyle: { color: purple, pattern: dashed, weight: 2 }

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
  - inferredEdge: { name: "reachable", selector: "^parent", lineStyle: { color: gray, pattern: dotted } }
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
