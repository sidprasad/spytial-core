# CnD Layout Specification - YAML Reference

> Note: This file is available via CDN at https://cdn.jsdelivr.net/gh/sidprasad/cnd-core@main/docs/YAML_SPECIFICATION.md. For immutability, pin to a tag or commit, e.g., `@v1.8.0` or `@<commit-sha>`. Agents can fetch it directly, for example:
>
> ```js
> const url = 'https://cdn.jsdelivr.net/gh/sidprasad/cnd-core@v1.8.0/docs/YAML_SPECIFICATION.md';
> const text = await fetch(url).then(r => r.text());
> ```
>
This document describes the YAML structure for defining layout constraints and directives in the CnD (Cope and Drag) layout system.

## Overview

A CnD layout specification consists of two main sections:

```yaml
constraints:
  - # ... constraint definitions
  
directives:
  - # ... directive definitions
```

Both sections are optional. An empty specification is valid.

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
- `above` - Source is above target (with flexibility)
- `below` - Source is below target (with flexibility)
- `left` - Source is left of target (with flexibility)
- `right` - Source is right of target (with flexibility)
- `directlyAbove` - Source is directly above target (strict vertical alignment)
- `directlyBelow` - Source is directly below target (strict vertical alignment)
- `directlyLeft` - Source is directly left of target (strict horizontal alignment)
- `directlyRight` - Source is directly right of target (strict horizontal alignment)

**Examples:**

```yaml
# Parent nodes appear above child nodes
- orientation:
    selector: parent
    directions: [above]

# Nodes flow left to right with strict horizontal alignment
- orientation:
    selector: next
    directions: [directlyLeft]

# Multiple directions: source is above and to the left
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
    addEdge: <boolean>           # Optional: Add visual edge to group members
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Selector returning atoms to include in group |
| `name` | ✅ Yes | string | - | Display name shown on the group box |
| `addEdge` | ❌ No | boolean | `false` | Whether to add visual edges between group members |

**Examples:**

```yaml
# Group all Team members together
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

### Group Constraint (by Field)

Groups elements based on a relational field (tuple-based grouping).

```yaml
- group:
    field: <field-name>          # Required: Relation field name
    groupOn: <index>             # Required: Tuple index for the group key (0-based)
    addToGroup: <index>          # Required: Tuple index for grouped element (0-based)
    selector: <unary-selector>   # Optional: Filter which source atoms apply
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | ✅ Yes | string | Name of the relation/field |
| `groupOn` | ✅ Yes | integer | Index of the tuple element to use as group key |
| `addToGroup` | ✅ Yes | integer | Index of the tuple element to add to the group |
| `selector` | ❌ No | string | Unary selector to filter which atoms this applies to |

**Examples:**

```yaml
# Group employees by their department
# For relation: worksIn: Employee -> Department
- group:
    field: worksIn
    groupOn: 1      # Department is the group key
    addToGroup: 0   # Employee gets added to the group

# Group with selector filter
- group:
    field: owns
    groupOn: 0
    addToGroup: 1
    selector: Person
```

---

### Size Constraint

Sets the width and height of nodes matching a selector. (Can also be used as a directive.)

```yaml
- size:
    selector: <unary-selector>   # Required: Selector for nodes to resize
    width: <number>              # Optional: Width in pixels
    height: <number>             # Optional: Height in pixels
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Unary selector for target nodes |
| `width` | ❌ No | number | `100` | Width in pixels (must be > 0) |
| `height` | ❌ No | number | `60` | Height in pixels (must be > 0) |

**Example:**

```yaml
- size:
    selector: ImportantNode
    width: 150
    height: 80
```

---

### Hide Atom Constraint

Hides atoms matching a selector from the visualization. (Can also be used as a directive.)

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

---

## Directives

Directives control visual styling and presentation without affecting layout structure.

### Atom Color Directive

Sets the color of atoms matching a selector.

```yaml
- atomColor:
    selector: <unary-selector>   # Required: Selector for atoms to color
    value: <color>               # Required: Color value
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `selector` | ✅ Yes | string | Unary selector for target atoms |
| `value` | ✅ Yes | string | CSS color value (hex, named, rgb, etc.) |

**Examples:**

```yaml
- atomColor:
    selector: Person
    value: "#ff5733"

- atomColor:
    selector: Error
    value: red
```

---

### Edge Style Directive (edgeColor)

Customizes the appearance of edges for a specific field/relation.

```yaml
- edgeColor:
    field: <field-name>          # Required: Relation/field name
    value: <color>               # Required: Edge color
    selector: <unary-selector>   # Optional: Filter by source atom
    filter: <n-ary-selector>     # Optional: Filter which tuples apply
    style: <line-style>          # Optional: Line style
    weight: <number>             # Optional: Line thickness
    showLabel: <boolean>         # Optional: Show edge label
    hidden: <boolean>            # Optional: Hide the edge entirely
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `field` | ✅ Yes | string | - | Name of the relation |
| `value` | ✅ Yes | string | - | CSS color value |
| `selector` | ❌ No | string | - | Unary selector to filter source atoms |
| `filter` | ❌ No | string | - | N-ary selector to filter specific tuples |
| `style` | ❌ No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `weight` | ❌ No | number | - | Line thickness in pixels |
| `showLabel` | ❌ No | boolean | `true` | Whether to display the edge label |
| `hidden` | ❌ No | boolean | `false` | Hide the edge from display |

**Examples:**

```yaml
# Color all 'parent' edges blue
- edgeColor:
    field: parent
    value: blue

# Dashed red edges for specific source type
- edgeColor:
    field: references
    value: red
    selector: Document
    style: dashed
    weight: 2

# Hide edges but keep the relationship
- edgeColor:
    field: internal
    value: gray
    hidden: true
```

---

### Icon Directive

Assigns an icon to atoms matching a selector.

```yaml
- icon:
    selector: <unary-selector>   # Required: Selector for atoms to style
    path: <icon-path>            # Required: Path or name of the icon
    showLabels: <boolean>        # Optional: Show text labels alongside icon
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Unary selector for target atoms |
| `path` | ✅ Yes | string | - | Icon path, URL, or registered icon name |
| `showLabels` | ❌ No | boolean | `false` | Display text labels with the icon |

**Examples:**

```yaml
- icon:
    selector: Person
    path: "user"
    showLabels: true

- icon:
    selector: File
    path: "/icons/file.svg"
```

---

### Size Directive

Sets node dimensions for atoms matching a selector.

```yaml
- size:
    selector: <unary-selector>   # Required: Selector for nodes
    width: <number>              # Optional: Width in pixels
    height: <number>             # Optional: Height in pixels
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `selector` | ✅ Yes | string | - | Unary selector for target nodes |
| `width` | ❌ No | number | `100` | Width in pixels |
| `height` | ❌ No | number | `60` | Height in pixels |

**Example:**

```yaml
- size:
    selector: LargeNode
    width: 200
    height: 100
```

---

### Projection Directive

Projects over a signature, showing one atom at a time with navigation controls.

```yaml
- projection:
    sig: <signature-name>        # Required: Signature/type to project over
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `sig` | ✅ Yes | string | Name of the signature/type to project |

**Example:**

```yaml
- projection:
    sig: Time
```

---

### Attribute Directive

Converts edge relationships into node attributes (displayed as key-value pairs on nodes).

```yaml
- attribute:
    field: <field-name>          # Required: Relation to convert to attribute
    selector: <unary-selector>   # Optional: Filter which source atoms apply
    filter: <n-ary-selector>     # Optional: Filter which tuples to include
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `field` | ✅ Yes | string | Name of the relation to display as attribute |
| `selector` | ❌ No | string | Unary selector to filter source atoms |
| `filter` | ❌ No | string | N-ary selector to filter specific tuples |

**Behavior:**
- Removes the edge from the graph
- Displays the target value as an attribute on the source node
- Multiple targets become a list

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
```

---

### Tag Directive

Adds computed attributes to nodes based on selector evaluation. Unlike `attribute`, this doesn't remove edges.

```yaml
- tag:
    toTag: <unary-selector>      # Required: Selector for atoms to receive the tag
    name: <attribute-name>       # Required: Name of the attribute to display
    value: <n-ary-selector>      # Required: Selector whose result becomes the value
```

**Fields:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `toTag` | ✅ Yes | string | Unary selector for atoms that receive this tag |
| `name` | ✅ Yes | string | Attribute name to display |
| `value` | ✅ Yes | string | N-ary selector returning the attribute values |

**Behavior:**
- Does NOT remove edges (unlike `attribute`)
- For binary results: displays as `name: value`
- For n-ary results: displays as `name[key1][key2]: value`

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

### Hide Atom Directive

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
    selector: HelperNode
```

---

### Inferred Edge Directive

Creates visual edges based on a selector expression (edges that don't exist in the data).

```yaml
- inferredEdge:
    name: <edge-label>           # Required: Label for the inferred edge
    selector: <binary-selector>  # Required: Selector returning pairs to connect
    color: <color>               # Optional: Edge color
    style: <line-style>          # Optional: Line style
    weight: <number>             # Optional: Line thickness
```

**Fields:**

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | ✅ Yes | string | - | Label displayed on the edge |
| `selector` | ✅ Yes | string | - | Binary selector returning (source, target) pairs |
| `color` | ❌ No | string | `#000000` | CSS color value |
| `style` | ❌ No | string | `solid` | `solid`, `dashed`, or `dotted` |
| `weight` | ❌ No | number | - | Line thickness in pixels |

**Examples:**

```yaml
# Show transitive closure as inferred edges
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

directives:
  # Visual styling
  - atomColor:
      selector: Person
      value: "#4a90d9"
  
  - atomColor:
      selector: Error
      value: red
  
  - icon:
      selector: File
      path: "file-icon"
      showLabels: true
  
  # Edge styling
  - edgeColor:
      field: error
      value: red
      style: dashed
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
  
  - hideAtom:
      selector: HelperNode
  
  - flag: hideDisconnectedBuiltIns
  
  # Show computed relationships
  - inferredEdge:
      name: "ancestor"
      selector: "^parent"
      color: gray
      style: dotted
```
