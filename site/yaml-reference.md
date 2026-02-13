# YAML Reference

This is a compact reference for the full Spytial YAML specification. For detailed explanations and examples, see the [Constraints](constraints.md) and [Directives](directives.md) guides.

## Structure

```yaml
constraints:
  - # ... constraint definitions

directives:
  - # ... directive definitions
```

Both sections are optional. An empty specification is valid.

---

## Constraints at a Glance

| Constraint | Purpose | Required Fields |
|------------|---------|-----------------|
| [`orientation`](constraints.md#orientation) | Position elements relative to each other | `selector`, `directions` |
| [`cyclic`](constraints.md#cyclic) | Arrange elements in a circle | `selector` |
| [`align`](constraints.md#alignment) | Align elements on an axis | `selector`, `direction` |
| [`group`](constraints.md#grouping-by-selector) | Group elements visually | `selector`, `name` |
| [`group` (by field)](constraints.md#grouping-by-field) | Group by relational field | `field`, `groupOn`, `addToGroup` |
| [`size`](constraints.md#size) | Set node dimensions | `selector` |
| [`hideAtom`](constraints.md#hiding-atoms) | Remove atoms from view | `selector` |

---

## Directives at a Glance

| Directive | Purpose | Required Fields |
|-----------|---------|-----------------|
| [`atomColor`](directives.md#atom-color) | Color nodes | `selector`, `value` |
| [`edgeColor`](directives.md#edge-styling) | Style edges | `field`, `value` |
| [`icon`](directives.md#icons) | Assign icons to nodes | `selector`, `path` |
| [`size`](directives.md#size-directive) | Set node dimensions | `selector` |
| [`projection`](directives.md#projection) | Project over a type | `sig` |
| [`attribute`](directives.md#attributes) | Show edge data as node labels | `field` |
| [`tag`](directives.md#tags) | Add computed labels to nodes | `toTag`, `name`, `value` |
| [`hideField`](directives.md#hiding-fields) | Hide edges for a relation | `field` |
| [`hideAtom`](directives.md#hiding-atoms-directive) | Hide matching atoms | `selector` |
| [`inferredEdge`](directives.md#inferred-edges) | Create edges from computed selectors | `name`, `selector` |
| [`flag`](directives.md#flags) | Global display flags | flag value |

---

## Selector Quick Reference

Selectors use [Forge](https://forge-fm.org/docs/building-models/constraints/formulas-and-expressions/) relational syntax. [AlaSQL](https://alasql.org/) is also supported as an alternative. See the full [Selector Syntax](selectors.md) guide.

**Unary selectors** return a set of atoms — used by `atomColor`, `align`, `hideAtom`, `icon`, `group`, `size`:

```yaml
selector: Node                        # All Node atoms
selector: "Node - left.Node"          # Leaf nodes (no left child)
```

**Binary selectors** return pairs of atoms — used by `orientation`, `cyclic`, `inferredEdge`:

```yaml
selector: left                        # The left relation
selector: "^(left + right)"           # All descendants
```

---

## Complete Skeleton

```yaml
constraints:
  # Structural layout
  - orientation:
      selector: parent
      directions: [above]

  - align:
      selector: siblings
      direction: horizontal

  - group:
      selector: Team.members
      name: "Team"

  - cyclic:
      selector: nextState
      direction: clockwise

directives:
  # Visual styling
  - atomColor:
      selector: Person
      value: "#4a90d9"

  - edgeColor:
      field: error
      value: red
      style: dashed

  - attribute:
      field: age
      selector: Person

  - tag:
      toTag: Student
      name: grade
      value: currentGrade

  - icon:
      selector: File
      path: "file-icon"
      showLabels: true

  - hideField:
      field: internal

  - hideAtom:
      selector: HelperNode

  - inferredEdge:
      name: "ancestor"
      selector: "^parent"
      color: gray
      style: dotted

  - projection:
      sig: Time
      orderBy: "next"

  - flag: hideDisconnectedBuiltIns
```
