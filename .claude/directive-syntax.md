# Directive Syntax Reference

## Overview

Directives control **visual appearance** of nodes and edges. Unlike constraints, directives do not affect layout positions - they are applied after constraint solving.

## Directive Types

### 1. Icon Directive

Replace node rendering with an image.

**Syntax:**
```yaml
- icon:
    selector: "Type" | "{x : Type | condition}"
    path: "url"
```

**Examples:**
```yaml
# All Person nodes show avatar
- icon:
    selector: Person
    path: https://example.com/avatar.png

# Only managers show special icon
- icon:
    selector: "{m : Person | some m.manages}"
    path: https://example.com/manager-icon.png
```

**Notes:**
- Icons replace default node rectangles
- Image loaded from URL
- Size controlled by `size` directive

### 2. Color Directive

Set node background color.

**Syntax:**
```yaml
- color:
    selector: "Type" | "{x : Type | condition}"
    color: "colorValue"
```

**Color Formats:**
- Named: `red`, `blue`, `green`
- Hex: `#FF5733`
- RGB: `rgb(255, 87, 51)`
- HSL: `hsl(9, 100%, 60%)`

**Examples:**
```yaml
# Color by type
- color:
    selector: Employee
    color: blue

- color:
    selector: Manager
    color: red

# Conditional coloring
- color:
    selector: "{p : Person | some p.errors}"
    color: "#FF0000"
```

### 3. Size Directive

Control node dimensions.

**Syntax:**
```yaml
- size:
    selector: "Type" | "{x : Type | condition}"
    width: number
    height: number
```

**Examples:**
```yaml
# Large header nodes
- size:
    selector: Header
    width: 400
    height: 80

# Small icons
- size:
    selector: Icon
    width: 50
    height: 50
```

**Notes:**
- Affects bounding box constraints
- Default: 150x75 pixels
- Width/height used in layout calculations

### 4. Hide Field Directive

Remove field from node attribute display.

**Syntax:**
```yaml
- hideField:
    field: "fieldName"
```

**Examples:**
```yaml
# Don't show internal IDs
- hideField:
    field: internalId

- hideField:
    field: debugInfo
```

### 5. Hide Atom Directive

Completely hide nodes from display.

**Syntax:**
```yaml
- hideatom:
    selector: "Type" | "{x : Type | condition}"
```

**Examples:**
```yaml
# Hide utility nodes
- hideatom:
    selector: Internal

# Hide nodes without connections
- hideatom:
    selector: "{x : Node | no x.edge and no edge.x}"
```

**Notes:**
- Nodes are removed from display
- Edges to/from hidden nodes are also hidden
- Hidden nodes still participate in constraints

### 6. Edge Label Directive

Add labels to edges.

**Syntax:**
```yaml
- edgeLabel:
    relation: "relationName"
    label: "labelText"
```

**Examples:**
```yaml
- edgeLabel:
    relation: manages
    label: "supervises"

- edgeLabel:
    relation: next
    label: "→"
```

## Flags

Boolean directives controlled by flags.

**Syntax:**
```yaml
- flag: flagName
```

**Available Flags:**

### hideDisconnectedBuiltIns
Hide nodes with no edges (only for builtin types).

```yaml
- flag: hideDisconnectedBuiltIns
```

### hideDisconnected
Hide ALL nodes with no edges.

```yaml
- flag: hideDisconnected
```

### showLabels
Show node labels (default: true with icons, false without).

```yaml
- flag: showLabels
```

## Selector Patterns

Directives use the same selector language as constraints.

### Type Selectors
```yaml
- color:
    selector: Person  # All Person nodes
    color: blue
```

### Condition Selectors
```yaml
- icon:
    selector: "{x : Node | some x.critical}"  # Nodes with critical flag
    path: warning.png
```

### Field-based Selection
```yaml
- color:
    selector: "{x : Item | x.status = 'active'}"
    color: green
```

## Combining Directives

Multiple directives can target the same node:

```yaml
# Manager nodes: red, large, with special icon
- color:
    selector: Manager
    color: red

- size:
    selector: Manager
    width: 200
    height: 100

- icon:
    selector: Manager
    path: manager-icon.png
```

**Priority:** Last matching directive wins (for same property).

## Common Patterns

### Pattern 1: Status-based Coloring
```yaml
- color: {selector: "{x : Task | x.status = 'done'}", color: green}
- color: {selector: "{x : Task | x.status = 'pending'}", color: yellow}
- color: {selector: "{x : Task | x.status = 'blocked'}", color: red}
```

### Pattern 2: Role-based Icons
```yaml
- icon: {selector: Admin, path: admin.png}
- icon: {selector: User, path: user.png}
- icon: {selector: Guest, path: guest.png}
```

### Pattern 3: Size by Importance
```yaml
- size: {selector: Critical, width: 300, height: 100}
- size: {selector: Normal, width: 200, height: 75}
- size: {selector: Minor, width: 150, height: 50}
```

### Pattern 4: Minimal Display
```yaml
# Hide utility elements
- hideatom: {selector: Internal}
- hideField: {field: debugInfo}
- hideField: {field: tempData}
- flag: hideDisconnectedBuiltIns
```

## Directive vs Constraint

| Aspect | Constraint | Directive |
|--------|-----------|-----------|
| **Purpose** | Spatial layout | Visual style |
| **Timing** | Before layout | After layout |
| **Required** | Yes (hard) | No (optional) |
| **Can Fail** | Yes, with error | No |
| **Affects** | Positions | Appearance |

**Example:**
```yaml
# Constraint: WHERE to place
constraints:
  - orientation:
      selector: "{x, y : Node | x.edge = y}"
      directions: [directlyLeft]

# Directive: HOW to display
directives:
  - icon:
      selector: Node
      path: icon.png
  - color:
      selector: Node
      color: blue
```

## Best Practices

1. **Separate Concerns** - Use constraints for layout, directives for style
2. **Consistent Styling** - Use types for consistent appearance
3. **Test Visibility** - Ensure hideAtom doesn't hide critical nodes
4. **Readable Colors** - Ensure text contrast on colored backgrounds
5. **Icon Size** - Match icon directive with size directive
6. **Field Filtering** - Hide internal fields to reduce clutter

## Advanced: Projection-based Directives

When using projections, directives apply to projected atoms:

```yaml
# Project Person through department
projections:
  department: "{p : Person | p.dept}"

# Directive applies to departments (projected)
directives:
  - color:
      selector: Department
      color: blue
```
