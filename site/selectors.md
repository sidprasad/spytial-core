# Selector Syntax

Selectors are expressions that identify which **atoms** (nodes) or **tuples** (edges) a constraint or directive applies to. Every constraint and directive in Spytial uses a selector.

By default, Spytial uses **[Forge](https://forge-fm.org/) relational syntax** (equivalent to [Alloy](https://alloytools.org/)). If you've used either, you already know how to write selectors. For the full language reference, see the [Forge documentation](https://forge-fm.github.io/forge-documentation/5.0/building-models/constraints/constraints/).

> **Other selector languages:** Spytial also supports [AlaSQL](https://alasql.org/) as an alternative selector language for users who prefer writing SQL queries.

---

## Running Example

Throughout this page we'll use a simple binary tree model:

```forge
sig Node {
  key: one Int,       -- every node has some key
  left: lone Node,    -- every node has at most one left-child
  right: lone Node    -- every node has at most one right-child
}
```

With an instance containing nodes `Node0` through `Node4`, fields `left`, `right`, and `key`.

---

## Unary vs. Binary Selectors

The key concept to understand is **arity** — how many "columns" a selector returns.

### Unary Selectors

A **unary selector** returns a *set of atoms*. It answers the question: **"which nodes?"**

Used by: `atomColor`, `align`, `hideAtom`, `icon`, `size`, `group` (by selector)

```yaml
# All Node atoms
selector: Node

# A specific atom
selector: Node0

# Nodes that have a left child (set comprehension style: {x : Node | some x.left})
selector: "left.Node"

# All descendants of Node3 — i.e. {x : Node | x in Node3.^(left + right)}
selector: "Node3.^(left + right)"
```

### Binary Selectors

A **binary selector** returns *pairs of atoms* — `(source, target)`. It answers: **"which edges?"**

Used by: `orientation`, `cyclic`, `inferredEdge`, `projection` (`orderBy`)

```yaml
# The left relation — pairs like (Node3, Node1), (Node4, Node2)
selector: left

# The right relation — pairs like (Node1, Node4), (Node3, Node0)
selector: right

# All children (left or right) — {x, y : Node | y in x.left + x.right}
selector: "left + right"

# All descendants — {x, y : Node | y in x.^(left + right)}
selector: "^(left + right)"
```

---

## Using Selectors in Specs

Here's how unary and binary selectors map to spec entries, using our binary tree:

```yaml
constraints:
  # Binary selector: left-children appear below-right of parent
  - orientation:
      selector: left
      directions: [above, right]

  # Binary selector: right-children appear below-left of parent
  - orientation:
      selector: right
      directions: [above, left]

  # Unary selector: align all leaf nodes horizontally
  - align:
      selector: "Node - left.Node - right.Node"
      direction: horizontal

directives:
  # Unary selector: color all nodes
  - atomColor:
      selector: Node
      value: "#4a90d9"

  # Show key as attribute instead of edge
  - attribute:
      field: key

  # Binary selector: show ancestor edges as dotted lines
  - inferredEdge:
      name: "descendant"
      selector: "^(left + right)"
      color: gray
      style: dotted

  - flag: hideDisconnectedBuiltIns
```

---

## Quoting

When a selector contains special characters (`^`, `~`, `*`, `&`, `+`, `-`, `.`, `>`), wrap it in quotes:

```yaml
selector: "^(left + right)"    # ✅ Quoted
selector: ^(left + right)      # ❌ YAML parsing error
```

Simple names don't need quotes:

```yaml
selector: Node                 # ✅ Fine
selector: left                 # ✅ Fine
```

---

## Tips

- **Check which arity a constraint expects.** If you pass a unary selector where a binary one is needed (or vice versa), Spytial will report an error.
- **Test incrementally.** Start with a simple selector, verify it highlights the nodes you expect, then build up complexity.
- For the full operator reference (join, transpose, transitive closure, set operations, etc.), see the [Forge docs](https://forge-fm.org/docs/building-models/constraints/formulas-and-expressions/).
