# Spytial Layout Specification - YAML Reference

This document describes the YAML structure for defining layout constraints and directives in the Spytial layout system. It is the prose reference, written for people.

> **Generating specs from code?** Read the machine-readable contract instead. It ships with every release, carries its own version, and is tested against the engine parser on every commit — so it cannot drift from the implementation the way this page can.
>
> | Artifact | What it is |
> |---|---|
> | [`docs/spytial-language.json`](./spytial-language.json) | Every constraint and directive, its fields, requiredness, legal values, and engine defaults. Its `deprecations` list is empty as of 6.0.0. |
> | [`docs/spytial-spec.schema.json`](./spytial-spec.schema.json) | A JSON Schema (draft 2020-12) for validating a spec document. |
>
> Both are pinnable per tag over jsDelivr, attached to each GitHub release, and included in the npm package:
>
> ```js
> const url = 'https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@v4.2.0/docs/spytial-language.json';
> const manifest = await fetch(url).then(r => r.json());
> manifest.languageVersion;   // e.g. "2026-07-28" — the date the language last changed
> ```
>
> `languageVersion` is a plain ISO date. If it has not moved since the manifest you generated against, nothing you emit needs revisiting.
>
> This page is mirrored at the same CDN path (`.../docs/YAML_SPECIFICATION.md`) for agents that want the prose.

## Overview

A Spytial layout specification consists of two main sections:

```yaml
constraints:
  - # ... constraint definitions
  
directives:
  - # ... directive definitions
```

Both sections are optional. An empty specification is valid.

### What the parser does with what it doesn't recognize: nothing

Each section must be a **list** of single-key entries. Anything the engine does not recognize is ignored silently — no error, no warning:

- an unknown top-level key (`somethingElse:`)
- an unknown list entry (`- bogusDirective:`) — including `- projection:`, which was removed from the language and is now a [pre-layout data transformation](./DEV_GUIDE.md)
- an unknown field inside a known entry (a misspelled `selctor:`)
- an out-of-range value in a style block (`pattern: squiggly`, `opacity: 5`)
- a section written as a mapping instead of a list — the whole section is dropped

A typo therefore costs you the directive, quietly. Validate against `spytial-spec.schema.json`, which is deliberately stricter than the parser, if you want those to be errors.

`size` and `hideAtom` are **constraints** — they change what the layout has to place, not how a solved layout looks. Writing them among the `directives:` was tolerated through 5.x behind a deprecation warning; since 6.0.0 it is an error. Write them under `constraints:`.

Parsing also returns advisory `warnings` on the spec, each with a machine-readable `code` and the `specType` it concerns — that is how you detect an advisory without matching prose. Nothing is deprecated as of 6.0.0: every form that used to warn is now either current or an error.

---

## Constraints

Constraints control the structural layout of nodes and their spatial relationships.

### Orientation Constraint

Specifies the relative positioning of elements selected by a binary/n-ary selector.

```yaml
- orientation:
    selector: <binary-selector>    # Required: Selector returning pairs (source -> target)
    directions: [<direction>, ...] # Required: Array of positioning directions
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | ✅ Yes | string | Binary selector (e.g., `parent`, `Node->Node`) |
| `directions` | ✅ Yes | array | One or more positioning directions |

**Available Directions:**

Each direction says where the **target** of a `(source, target)` pair ends up relative to the **source**.

- `above` - Target is above source (horizontal offset allowed)
- `below` - Target is below source (horizontal offset allowed)
- `left` - Target is left of source (vertical offset allowed)
- `right` - Target is right of source (vertical offset allowed)
- `directlyAbove` - Target is directly above source (strict vertical alignment)
- `directlyBelow` - Target is directly below source (strict vertical alignment)
- `directlyLeft` - Target is directly left of source (strict horizontal alignment)
- `directlyRight` - Target is directly right of source (strict horizontal alignment)

Getting this backwards is the most common spec bug. If the relation reads the other way round, transpose the selector (`~parent`) rather than flipping the direction.

**Examples:**

```yaml
# For `parent: child -> parent`, each tuple's target (the parent) is placed
# above its source (the child) — so parents sit above their children.
- orientation:
    selector: parent
    directions: [above]

# For `next: node -> successor`, each successor sits directly right of its
# predecessor, on a shared horizontal line — a left-to-right chain.
- orientation:
    selector: next
    directions: [directlyRight]

# Multiple directions: the target is above AND to the left of the source
- orientation:
    selector: precedes
    directions: [above, left]
```

**Restrictions:**
- Cannot combine `above` with `below`
- Cannot combine `left` with `right`
- `directly*` variants can only combine with their non-direct counterpart (e.g., `directlyAbove` with `above`)

---

### Cyclic Constraint

Arranges elements along the perimeter of a circle based on selector order.

```yaml
- cyclic:
    selector: <binary-selector>  # Required: Selector defining circular ordering
    direction: <rotation>        # Optional: Rotation direction (default: clockwise)
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Binary selector defining the cycle order |
| `direction` | ❌ No | string | `clockwise` | `clockwise` or `counterclockwise` |

**Examples:**

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

---

### Align Constraint

Ensures elements are aligned horizontally or vertically.

```yaml
- align:
    selector: <n-ary-selector>   # Required: Selector returning elements to align
    direction: <alignment>       # Required: horizontal or vertical
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | ✅ Yes | string | Selector returning atoms to align |
| `direction` | ✅ Yes | string | `horizontal` or `vertical` |

**Examples:**

```yaml
# Align all Person nodes horizontally (same Y coordinate)
- align:
    selector: Person
    direction: horizontal

# Align selected nodes vertically (same X coordinate)
- align:
    selector: Node.selected
    direction: vertical
```

---

### Group Constraint (by Selector)

Groups elements based on a selector expression.

```yaml
- group:
    selector: <n-ary-selector>   # Required: Selector returning elements to group
    name: <group-name>           # Required: Display name for the group
    addEdge: <direction>         # Optional: none | togroup | fromgroup (default none)
    textStyle:                   # Optional: style the group's own label
      color: <color>
```

A group has two style surfaces: its **own label** (top-level `textStyle`) and — when `addEdge` draws a connector — that **connector**, which is an edge and so takes the shared `lineStyle` / `textStyle` blocks. To style the connector, give `addEdge` in block form:

```yaml
- group:
    selector: <n-ary-selector>
    name: <group-name>
    addEdge:                     # Block form styles the connector edge
      points: <none|togroup|fromgroup>
      lineStyle: { color: <color>, pattern: <solid|dashed|dotted>, weight: <number>, highlight: <color> }
      textStyle: { size: <small|normal|large>, color: <color> }   # the connector's label
    textStyle: { color: <color> }                                 # the group's own label
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Selector returning atoms to include in group |
| `name` | ✅ Yes | string | - | Display name shown on the group box |
| `addEdge` | ❌ No | direction *or* block | `none` | The connector between the group key and the group. As a bare string it is just the direction (`none` / `togroup` / `fromgroup`; legacy `true` = `togroup`). As a **block** it also styles the connector: `points` (the direction) plus `lineStyle` and `textStyle` (same blocks as `edgeStyle`). `togroup` points key → group; `fromgroup` points group → key. |
| `textStyle.color` | ❌ No | string | - | Color of the group's own label |
| `textStyle.size` | ❌ No | enum | - | `small` / `normal` / `large` — *reserved; group labels currently auto-fit their box* |

For a binary selector with tuples `(a, b), (a, c), (a, d)`, the group is keyed by `a` and contains `{b, c, d}`. `addEdge: togroup` draws an edge from `a` into that group; `addEdge: fromgroup` draws it from the group back to `a`.

**Examples:**

```yaml
# Group all Team members together
- group:
    selector: Team.members
    name: "Team Members"

# Group with an edge pointing from the key into the group
- group:
    selector: Department.employees
    name: "Department"
    addEdge: togroup

# Styled: a dashed teal connector with a red label, and a purple group label
- group:
    selector: Department.employees
    name: "Department"
    addEdge:
      points: togroup
      lineStyle: { color: "#0aa", pattern: dashed, weight: 3 }
      textStyle: { color: "#a00" }
    textStyle: { color: "#7c3aed" }
```

---

### Group Constraint (by Field) — *removed*

> **Removed.** `group: { field, groupOn, addToGroup }` no longer parses: writing it is an error, not a silently ignored key, so an old spec fails loudly instead of quietly losing its grouping.
>
> To migrate, give a binary selector whose first column is the group key and whose second is the members, plus the `name` that form requires. Over `worksIn: Employee -> Department`:
>
> | Old | New |
> |---|---|
> | `field: worksIn`, `groupOn: 1`, `addToGroup: 0` | `selector: ~worksIn` (keys on Department) |
> | `field: worksIn`, `groupOn: 0`, `addToGroup: 1` | `selector: worksIn` (keys on Employee) |
>
> A `selector` that used to narrow which atoms the grouping applied to becomes part of the binary selector itself — `selector: Person <: owns` rather than a separate field.

---

### Negation (`hold: never`)

The layout constraints — `orientation`, `cyclic`, `align`, and `group` — can be negated by adding `hold: never`. By default they implicitly have `hold: always`. A negated constraint asserts that the relationship must **never** hold.

Only the exact value `never` negates: `always`, any other string, and an absent `hold` all mean the positive constraint. `size` and `hideAtom` do **not** support negation — the key parses there but is silently ignored.

```yaml
- orientation:
    selector: <binary-selector>
    directions: [<direction>, ...]
    hold: never

- align:
    selector: <binary-selector>
    direction: <alignment>
    hold: never

- cyclic:
    selector: <binary-selector>
    direction: <rotation>
    hold: never

- group:
    selector: <n-ary-selector>   # name is optional for hold: never
    hold: never
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `hold` | No | string | `always` | `always` (constraint must hold) or `never` (constraint must not hold) |

**Semantics:**

| Positive | `hold: never` meaning |
|----------|----------------------|
| `above` | A.y ≤ B.y (at same level or below) |
| `below` | A.y ≥ B.y (at same level or above) |
| `left` | A.x ≥ B.x (at same position or right) |
| `right` | A.x ≤ B.x (at same position or left) |
| `align horizontal` | Must have different Y coordinates (disjunction: one above the other) |
| `align vertical` | Must have different X coordinates (disjunction: one left of the other) |
| `cyclic clockwise` | No valid clockwise rotation holds (De Morgan over rotational alternatives) |
| `group` | No clean bounding rectangle can contain exactly these members |

For groups, `hold: never` asserts that no axis-aligned rectangle can contain exactly the group's members without also containing a non-member. No visual rectangle is drawn. The `name` field is optional (auto-generated if omitted).

**Examples:**

```yaml
# Ensure children NEVER appear above parents
- orientation:
    selector: parent
    directions: [above]
    hold: never

# Nodes must NEVER be horizontally aligned
- align:
    selector: A->B
    direction: horizontal
    hold: never

# Do NOT arrange states clockwise
- cyclic:
    selector: nextState
    direction: clockwise
    hold: never

# No clean rectangle can contain just these nodes
- group:
    selector: Alpha
    hold: never
```

**Restrictions:**
- Double negation is not supported.

---

### Size Constraint

Sets the width and height of nodes matching a selector.

```yaml
- size:
    width: <number>              # Required: Width in pixels
    height: <number>             # Required: Height in pixels
    selector: <unary-selector>   # Optional: Selector for nodes to resize
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `width` | ✅ Yes | number | - | Width in pixels. Must be a number greater than 0 — a missing, zero, negative, or non-numeric width is a parse error. |
| `height` | ✅ Yes | number | - | Height in pixels. Same rule as `width`. |
| `selector` | ❌ No | string | all nodes | Unary selector for target nodes. Omit to resize every node. |

`hold: never` is not supported here; the key parses but is ignored.

**Example:**

```yaml
- size:
    selector: ImportantNode
    width: 150
    height: 80
```

---

### Hide Atom Constraint

Hides atoms matching a selector from the visualization.

```yaml
- hideAtom:
    selector: <unary-selector>   # Required: Selector for atoms to hide
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | ✅ Yes | string | Unary selector for atoms to hide |

**Example:**

```yaml
- hideAtom:
    selector: InternalNode
```

**Conflicts with layout constraints:** an atom cannot be both hidden and placed. If a layout constraint (`orientation`, `align`, `cyclic`) or a `group` contains a hidden atom as a member, the spec is unsatisfiable: the layout reports a hidden-node conflict error, and the diagram shown is a counterfactual in which the conflicting atoms are drawn anyway, outlined with a dashed border. Hiding a keyed group's *key* is fine — the key is not inside the group.

---

## Directives

Directives control visual styling and presentation without affecting layout structure.

### Atom Style Directive (atomStyle)

Styles the atoms (nodes) matching a selector. An atom is a composite of an interior **fill**, an outline **border**, an **icon**, and its **label**, so styling uses the shared `fillStyle`, `borderStyle`, `iconStyle`, and `textStyle` blocks (the same block vocabulary as `edgeStyle`'s `lineStyle`/`textStyle`).

```yaml
- atomStyle:
    selector: <unary-selector>   # Optional: which atoms to style (absent = all atoms)
    fillStyle:                   # Optional: the interior fill (opt-in)
      color: <color>
    borderStyle:                 # Optional: the outline
      color: <color>
      width: <number>
    iconStyle:                   # Optional: an icon drawn on the atom
      path: <icon-path>
      placement: <full|badge>
      opacity: <0..1>
    textStyle:                   # Optional: the atom's own (name) label
      size: <small|normal|large>
      color: <color>
    showLabel: <boolean>         # Optional: whether the atom's label is drawn
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ❌ No | string | all atoms | Unary selector for target atoms |
| `fillStyle.color` | ❌ No | string | — | CSS color of the node's interior fill (opt-in; the default is an unfilled Tufte look where only stroke + label mark the node) |
| `borderStyle.color` | ❌ No | string | — | CSS color of the node's outline |
| `borderStyle.width` | ❌ No | number | — | Outline thickness in pixels (must be > 0) |
| `iconStyle.path` | ❌ No | string | — | Icon path, URL, bundled name (`person`), or icon-pack reference (`bi:person-fill`) |
| `iconStyle.placement` | ❌ No | enum | `full` | `full` — the icon occupies the box; `badge` — a small top-right marker |
| `iconStyle.opacity` | ❌ No | number | `1` | Icon alpha in `[0,1]`; out-of-range values are ignored |
| `textStyle.size` | ❌ No | enum | `normal` | `small`, `normal`, or `large` — *reserved; not yet applied to the node's own label* |
| `textStyle.color` | ❌ No | string | — | CSS color of the atom's label |
| `showLabel` | ❌ No | boolean | `true` | Whether the atom's label is drawn |

**Inheritance & conflicts:** rules match atoms through their selector, and a supertype selector already returns subtype atoms — so a `Node` rule and a `RedNode` rule both apply to a `RedNode` atom, their set properties **composing** (gap-fill inheritance up the type hierarchy). Two rules that set the *same* property to *different* values is an error: styles never silently override. This applies to `iconStyle` like any other block, so a supertype can supply the `path` and a subtype tune only its `opacity`.

**Icons and labels are independent.** `placement` controls the icon's geometry; `showLabel` controls whether the label draws. The three useful combinations:

| Idiom | Spec | Result |
|---|---|---|
| **Glyph** | `placement: full`, `showLabel: false` | The icon *is* the node — the box goes transparent, no label |
| **Badge** | `placement: badge`, `showLabel: true` | Small corner marker beside a normal labelled node |
| **Watermark** | `placement: full`, `opacity: 0.15`, `showLabel: true` | Faded full-size icon behind the label |

A `full` icon leaves the node's box transparent (so a group hull shows through) unless you ask for a `fillStyle.color`, which wins.

**Examples:**

```yaml
# Filled, thick-bordered Person nodes with dark-red labels
- atomStyle:
    selector: Person
    fillStyle: { color: '#e0f2ff' }
    borderStyle: { color: '#0369a1', width: 4 }
    textStyle: { color: '#b91c1c' }

# Just recolor the outline of error atoms (border-preserving)
- atomStyle:
    selector: Error
    borderStyle: { color: red }

# Glyph: the icon replaces the node entirely
- atomStyle:
    selector: XCell
    showLabel: false
    iconStyle: { path: tic-x }

# Badge: a lock marker alongside the label
- atomStyle:
    selector: Locked
    iconStyle: { path: 'bi:lock-fill', placement: badge }

# Watermark: every Person faded behind its label, Admins more strongly
- atomStyle:
    selector: Person
    iconStyle: { path: person, opacity: 0.12 }
- atomStyle:
    selector: Admin
    iconStyle: { opacity: 0.35 }   # inherits `path` from the Person rule
```

**Migrating from `atomColor`:** `atomColor` was removed in 6.0.0 and now fails to parse. Its `value` maps onto `borderStyle.color` (so a rewritten diagram keeps its outlines exactly), and you can add a `fillStyle` for a real interior fill:

| `atomColor` | `atomStyle` |
|---|---|
| `value` | `borderStyle.color` |
| `selector` | `selector` |

**Migrating from `icon`:** the `icon` directive was removed in 6.0.0. Its single `showLabels` boolean drove label visibility *and* icon geometry at once; it splits into the two independent knobs:

| `icon` | `atomStyle` |
|---|---|
| `path` | `iconStyle.path` |
| `selector` | `selector` |
| `showLabels: false` (default) | `showLabel: false` + `iconStyle.placement: full` |
| `showLabels: true` | `showLabel: true` + `iconStyle.placement: badge` |

---

### Edge Style Directive (edgeStyle)

Styles the edges of a field/relation. An edge is a composite of a drawn **line**, a **label**, and behavior flags, so styling is expressed with the shared `lineStyle` and `textStyle` blocks — the same block vocabulary reused by `inferredEdge` and group connectors.

```yaml
- edgeStyle:
    field: <field-name>          # Required: relation/field whose edges this styles
    selector: <unary-selector>   # Optional: match only edges from these source atoms
    filter: <n-ary-selector>     # Optional: match only these (source, target) tuples
    lineStyle:                   # Optional: the drawn line
      color: <color>
      pattern: <solid|dashed|dotted>
      weight: <number>
      highlight: <color>
    textStyle:                   # Optional: the edge label
      size: <small|normal|large>
      color: <color>
    showLabel: <boolean>         # Optional: show the edge label
    hidden: <boolean>            # Optional: hide the edge entirely
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | ✅ Yes | string | Name of the relation |
| `selector` | ❌ No | string | Unary selector — match only edges whose source atom is selected |
| `filter` | ❌ No | string | N-ary selector — match only specific (source, target) tuples |
| `lineStyle.color` | ❌ No | string | CSS color of the line |
| `lineStyle.pattern` | ❌ No | enum | `solid`, `dashed`, or `dotted` |
| `lineStyle.weight` | ❌ No | number | Line thickness in pixels (must be > 0) |
| `lineStyle.highlight` | ❌ No | string | CSS color drawn as a wider, translucent underlay beneath the line |
| `textStyle.size` | ❌ No | enum | `small`, `normal`, or `large` (relative to the node label) |
| `textStyle.color` | ❌ No | string | CSS color of the edge label |
| `showLabel` | ❌ No | boolean | Whether to display the edge label (default `true`) |
| `hidden` | ❌ No | boolean | Hide the edge entirely (default `false`) |

**Composition & conflicts:** when several `edgeStyle` rules match the same edge, their set properties **compose** — a `lineStyle.color` from one rule and a `textStyle.size` from another combine. Two rules that set the *same* property to *different* values is an error: styles never silently override.

**Examples:**

```yaml
# Dashed blue 'parent' edges
- edgeStyle:
    field: parent
    lineStyle: { color: blue, pattern: dashed }

# Thicker red edges from Document sources, with small grey labels
- edgeStyle:
    field: references
    selector: Document
    lineStyle: { color: red, weight: 2 }
    textStyle: { size: small, color: '#666' }

# Yellow highlight glow under black edges
- edgeStyle:
    field: critical_path
    lineStyle: { color: black, highlight: "#ffeb3b" }
```

**Migrating from `edgeColor`:** `edgeColor` was removed in 6.0.0 and now fails to parse. It maps onto `edgeStyle` field-for-field:

| `edgeColor` | `edgeStyle` |
|---|---|
| `value` | `lineStyle.color` |
| `style` | `lineStyle.pattern` |
| `weight` | `lineStyle.weight` |
| `highlight` | `lineStyle.highlight` |
| `showLabel` / `hidden` | `showLabel` / `hidden` |

---

### Attribute Directive

Converts edge relationships into node attributes (displayed as key-value pairs on nodes).

```yaml
- attribute:
    field: <field-name>          # Required: Relation to convert to attribute
    selector: <unary-selector>   # Optional: Filter which source atoms apply
    filter: <n-ary-selector>     # Optional: Filter which tuples to include
    textStyle:                   # Optional: style the attribute line (shared block)
      size: <small|normal|large> #   font size relative to the node label (default: normal)
      color: <color>             #   text color (any CSS color)
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | ✅ Yes | string | Name of the relation to display as attribute |
| `selector` | ❌ No | string | Unary selector to filter source atoms |
| `filter` | ❌ No | string | N-ary selector to filter specific tuples |
| `textStyle.size` | ❌ No | `small` \| `normal` \| `large` | Size of this attribute's text, relative to the node label. Default `normal`. |
| `textStyle.color` | ❌ No | string | Text color of this attribute's line (any CSS color). Default inherits the node label color. |

**Behavior:**
- Removes the edge from the graph
- Displays the target value as an attribute on the source node
- Multiple targets become a list
- `textStyle` is the same shared block edges and atoms use. `size` controls the line's font size: `large` renders **bigger** than the node's label, `normal` is the default (smaller than the label), and `small` is smaller still — the node box grows/shrinks to fit. `color` sets the line's text color (unset = inherit the node's label color, so dark mode still adapts).

**Examples:**

```yaml
# Show 'age' as an attribute instead of an edge
- attribute:
    field: age

# Only for Person nodes
- attribute:
    field: name
    selector: Person

# Filter to only show active relationships
- attribute:
    field: status
    filter: 'status & (univ -> Active)'

# Emphasize a key attribute — larger than the node label, in red
- attribute:
    field: balance
    textStyle: { size: large, color: "#c0392b" }
```

---

### Tag Directive

Adds computed attributes to nodes based on selector evaluation. Unlike `attribute`, this doesn't remove edges.

```yaml
- tag:
    toTag: <unary-selector>      # Required: Selector for atoms to receive the tag
    name: <attribute-name>       # Required: Name of the attribute to display
    value: <n-ary-selector>      # Required: Selector whose result becomes the value
    textStyle:                   # Optional: style the tag line (shared block)
      size: <small|normal|large> #   font size relative to the node label (default: normal)
      color: <color>             #   text color (any CSS color)
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `toTag` | ✅ Yes | string | Unary selector for atoms that receive this tag |
| `name` | ✅ Yes | string | Attribute name to display |
| `value` | ✅ Yes | string | N-ary selector returning the attribute values |
| `textStyle.size` | ❌ No | `small` \| `normal` \| `large` | Size of this tag's text, relative to the node label. Default `normal`. |
| `textStyle.color` | ❌ No | string | Text color of this tag's line (any CSS color). Default inherits the node label color. |

**Behavior:**
- Does NOT remove edges (unlike `attribute`)
- For binary results: displays as `name: value`
- For n-ary results: displays as `name[key1][key2]: value`
- For unary results: displays as `name: <the atom's own label>` — a membership tag, saying only that the atom is in the set
- `textStyle` is the same shared block edges and atoms use. `size` controls the line's font size: `large` renders **bigger** than the node's label, `normal` is the default (smaller than the label), and `small` is smaller still. `color` sets the line's text color (unset = inherit the node's label color).

**Examples:**

```yaml
# Simple binary tag
- tag:
    toTag: Person
    name: age
    value: age

# Ternary selector - shows as score[Math]: 95, score[English]: 87
- tag:
    toTag: Student
    name: score
    value: grades

# De-emphasize a secondary tag — smaller than the default, muted gray
- tag:
    toTag: Person
    name: id
    value: internalId
    textStyle: { size: small, color: "#888" }
```

---

### Hide Field Directive

Hides edges for a specific field/relation.

```yaml
- hideField:
    field: <field-name>          # Required: Relation to hide
    selector: <unary-selector>   # Optional: Filter by source atom
    filter: <n-ary-selector>     # Optional: Filter which tuples to hide
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | ✅ Yes | string | Name of the relation to hide |
| `selector` | ❌ No | string | Unary selector to filter source atoms |
| `filter` | ❌ No | string | N-ary selector to filter specific tuples |

**Examples:**

```yaml
# Hide all 'internal' edges
- hideField:
    field: internal

# Hide only from certain source types
- hideField:
    field: debug
    selector: Production
```

---

### Inferred Edge Directive

Creates visual edges based on a selector expression (edges that don't exist in the data). The structural `name` + `selector` say *which* edge to draw; its appearance uses the shared `lineStyle` / `textStyle` blocks (the same vocabulary as `edgeStyle`).

```yaml
- inferredEdge:
    name: <edge-label>           # Required: label for the inferred edge
    selector: <binary-selector>  # Required: selector returning pairs to connect
    draw: <end> -> <end>         # Optional: what each end attaches to (see below)
    lineStyle:                   # Optional: the drawn line
      color: <color>
      pattern: <solid|dashed|dotted>
      weight: <number>
      highlight: <color>
    textStyle:                   # Optional: the edge label
      size: <small|normal|large>
      color: <color>
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | ✅ Yes | string | Label displayed on the edge |
| `selector` | ✅ Yes | string | Binary selector returning (source, target) pairs (unary allowed when `draw` is given — see below) |
| `draw` | ❌ No | string | Endpoint interpretation: `<end> -> <end>`, each end `_` or a group name (see **Group endpoints**) |
| `lineStyle.color` | ❌ No | string | Line color (default `#000000`) |
| `lineStyle.pattern` | ❌ No | enum | `solid`, `dashed`, or `dotted` |
| `lineStyle.weight` | ❌ No | number | Line thickness in pixels |
| `lineStyle.highlight` | ❌ No | string | CSS color drawn as a wider, translucent underlay beneath the line |
| `textStyle.size` | ❌ No | enum | `small`, `normal`, or `large` |
| `textStyle.color` | ❌ No | string | Edge-label color |

> **Removed in 6.0.0:** the flat inline `color` / `style` / `weight` / `highlight` keys now fail to parse. Use the `lineStyle` block, where `style` is spelled `pattern`.

#### Group endpoints (`draw`)

By default each edge runs between the tuple's first and last **atoms**. The optional `draw` line reinterprets where each end attaches, without changing which pairs get edges or which way they point:

```
draw  ::=  <end> -> <end>
end   ::=  _  |  <group-constraint-name>
```

- `_` — this end attaches to the atom itself (the default behavior).
- A group name — this end attaches to the **hull of that group constraint's group**. A keyed group constraint (binary selector) builds one group per key, named `name[key]`: `draw` names the constraint, and this end's atom picks which of its groups. A unary group constraint builds a **single group**: naming it attaches the end to that group directly (the atom plays no part).

The left end applies to each tuple's first atom, the right end to its last. `draw` never reorders — to flip an edge, transpose the selector (`~connected`). With `draw`, the selector may also be **unary**: the single atom feeds both ends (e.g. `draw: _ -> regions` connects each key to its own group).

Resolution notes:

- If no `group` constraint defines the name, the parse raises a warning (`unresolved-reference`) and the edge is skipped at layout time. It is not an error: a spec fragment may name a group that another fragment defines, so whether one item is valid must not depend on which other items happen to be in the document.
- A name that means both a keyed group and a single group at once (two group constraints sharing the name — one binary, one unary — or two unary ones) is ambiguous and errors at layout time. Rename one of the constraints.
- Keys may be hidden (`hideAtom`) — group ends attach to the hull and don't need the key node drawn.
- If an end's atom doesn't key a group of that name **in this instance**, the edge is skipped with a console warning (data-dependent, not a spec error). Same when the constraint built no groups at all (e.g. its relation is empty in this instance).
- Both ends resolving to the **same group** draw a self-loop on that group's hull, just like a node self-loop.

**Examples:**

```yaml
# Show transitive closure as inferred edges
- inferredEdge:
    name: "reachable"
    selector: "^parent"
    lineStyle: { color: gray, pattern: dotted }

# Highlight computed relationships
- inferredEdge:
    name: "sibling"
    selector: "~parent.parent - iden"
    lineStyle: { color: purple, pattern: dashed, weight: 2 }

# Group-to-group: one edge per `connected` pair, drawn hull to hull.
# (Assumes a group constraint named `regions` keyed by Region atoms.)
- inferredEdge:
    name: "connected"
    selector: connected
    draw: regions -> regions
    lineStyle: { color: steelblue, pattern: dashed }

# Node-to-group: person -> the hull of the region-group they manage
- inferredEdge:
    name: "manages"
    selector: manages
    draw: _ -> regions
```

---

### Flag Directive

Sets global visualization flags.

```yaml
- flag: <flag-name>
```

**Available Flags:**

| Flag | Description |
|------|-------------|
| `hideDisconnected` | Hide all nodes with no edges |
| `hideDisconnectedBuiltIns` | Hide built-in type nodes (Int, String, etc.) with no edges |

**Examples:**

```yaml
- flag: hideDisconnected
- flag: hideDisconnectedBuiltIns
```

---

## Selector Syntax

Selectors are expressions that identify atoms or tuples. The syntax depends on your data format (Forge, Alloy, etc.), but common patterns include:

| Pattern | Description | Example |
|---------|-------------|---------|
| `TypeName` | All atoms of a type | `Person` |
| `fieldName` | All tuples in a relation | `parent` |
| `Type.field` | Field access | `Person.age` |
| `selector1 + selector2` | Union | `Student + Teacher` |
| `selector1 & selector2` | Intersection | `Person & Employee` |
| `selector1 - selector2` | Difference | `Person - Manager` |
| `~selector` | Transpose | `~parent` (child relation) |
| `^selector` | Transitive closure | `^parent` (all ancestors) |
| `*selector` | Reflexive transitive closure | `*parent` |
| `selector1 -> selector2` | Product | `Person -> Int` |
| `selector1.selector2` | Join | `Person.parent` |

---

## Complete Example

```yaml
constraints:
  # Layout structure
  - orientation:
      selector: parent
      directions: [above]
  
  - align:
      selector: siblings
      direction: horizontal
  
  # Grouping
  - group:
      selector: Team.members
      name: "Team"
  
  # Circular layout for state machine
  - cyclic:
      selector: nextState
      direction: clockwise

  # Negation: siblings must NEVER be vertically stacked
  - orientation:
      selector: siblings
      directions: [above]
      hold: never

  # Geometry and visibility are structural, so they live here too
  - size:
      selector: ImportantNode
      width: 150
      height: 80

  - hideAtom:
      selector: HelperNode

directives:
  # Visual styling
  - atomStyle:
      selector: Person
      borderStyle:
        color: "#4a90d9"
  
  - atomStyle:
      selector: Error
      borderStyle:
        color: red
  
  - atomStyle:
      selector: File
      iconStyle:
        path: "file-icon"
        placement: badge
  
  # Edge styling
  - edgeStyle:
      field: error
      lineStyle:
        color: red
        pattern: dashed
        weight: 2
  
  # Convert to attributes
  - attribute:
      field: age
      selector: Person
  
  - tag:
      toTag: Student
      name: grade
      value: currentGrade
  
  # Hide clutter
  - hideField:
      field: internal
  
  - flag: hideDisconnectedBuiltIns
  
  # Show computed relationships
  - inferredEdge:
      name: "ancestor"
      selector: "^parent"
      lineStyle:
        color: gray
        pattern: dotted
```
