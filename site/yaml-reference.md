# YAML Reference

This is a compact reference for the full Spytial YAML specification. For detailed explanations and examples, see the [Constraints](constraints.md) and [Directives](directives.md) guides.

**Generating specs from a host language?** Read the machine-readable contract instead of this page — it ships with every release, carries its own version, and is tested against the engine parser:

```
https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@<tag>/docs/spytial-language.json
https://cdn.jsdelivr.net/gh/sidprasad/spytial-core@<tag>/docs/spytial-spec.schema.json
```

## Structure

```yaml
constraints:
  - # ... constraint definitions

directives:
  - # ... directive definitions
```

Both sections are optional. An empty specification is valid.

Each section must be a **list** of single-key entries. The parser ignores anything it does not recognize — an unknown directive, a misspelled field, or a section written as a mapping instead of a list all pass silently and then do nothing. Validate against `spytial-spec.schema.json` if you want a typo to be an error.

---

## Constraints at a Glance

| Constraint | Purpose | Required Fields |
|------------|---------|-----------------|
| [`orientation`](constraints.md#orientation) | Position elements relative to each other | `selector`, `directions` |
| [`cyclic`](constraints.md#cyclic) | Arrange elements in a circle | `selector` |
| [`align`](constraints.md#alignment) | Align elements on an axis | `selector`, `direction` |
| [`hold: never`](constraints.md#negation-hold-never) | Negate any constraint | Add `hold: never` to any constraint |
| [`group`](constraints.md#grouping-by-selector) | Group elements visually | `selector`, `name` |
| [`size`](constraints.md#size) | Set node dimensions | `width`, `height` |
| [`hideAtom`](constraints.md#hiding-atoms) | Remove atoms from view | `selector` |

---

## Directives at a Glance

| Directive | Purpose | Required Fields |
|-----------|---------|-----------------|
| [`atomStyle`](directives.md#atom-styling) | Style nodes (fill, border, icon, label) | — (no `selector` = every atom) |
| [`edgeStyle`](directives.md#edge-styling) | Style edges (line, label) | `field` |
| [`attribute`](directives.md#attributes) | Show edge data as node labels | `field` |
| [`tag`](directives.md#tags) | Add computed labels to nodes | `toTag`, `name`, `value` |
| [`hideField`](directives.md#hiding-fields) | Hide edges for a relation | `field` |
| [`inferredEdge`](directives.md#inferred-edges) | Create edges from computed selectors | `name`, `selector` |
| [`flag`](directives.md#flags) | Global display flags | flag value |

`size` and `hideAtom` are **constraints** — they change what the layout has to place, not how a solved layout looks. Writing them here still parses, identically, but is deprecated and warns.

Deprecated, still parsed: [`icon`](directives.md#icons) → `atomStyle.iconStyle`, `atomColor` → `atomStyle.borderStyle`, `edgeColor` → `edgeStyle.lineStyle`. Each raises a deprecation warning on the parsed spec.

Removed: `group`'s `field`/`groupOn`/`addToGroup`. Write a binary `selector` instead — its first column is the group key, its second the members. This one is a parse error, not a warning.

`projection` is **not** a directive — it is a [pre-layout data transformation](directives.md#projection--not-a-directive). A `projection:` entry in a spec is silently ignored.

---

## Selector Quick Reference

Selectors use [Forge](https://forge-fm.org/docs/building-models/constraints/formulas-and-expressions/) relational syntax. [AlaSQL](https://alasql.org/) is also supported as an alternative. See the full [Selector Syntax](selectors.md) guide.

**Unary selectors** return a set of atoms — used by `atomStyle`, `align`, `hideAtom`, `group`, `size`:

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

  - orientation:
      selector: siblings
      directions: [above]
      hold: never

  # Geometry and visibility are structural too
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
      borderStyle: { color: "#4a90d9" }

  - edgeStyle:
      field: error
      lineStyle: { color: red, pattern: dashed }

  - attribute:
      field: age
      selector: Person
      textStyle: { size: large, color: "#c0392b" }  # optional: shared size + color block

  - tag:
      toTag: Student
      name: grade
      value: currentGrade
      textStyle: { size: small, color: "#2980b9" }

  - atomStyle:
      selector: File
      iconStyle:
        path: "file-icon"
        placement: badge

  - hideField:
      field: internal

  - inferredEdge:
      name: "ancestor"
      selector: "^parent"
      lineStyle: { color: gray, pattern: dotted }

  - flag: hideDisconnectedBuiltIns
```
