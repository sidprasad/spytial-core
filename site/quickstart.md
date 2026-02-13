# Quick Start

This page walks through writing a simple Spytial spec from scratch.

## The Scenario

Imagine you have a family tree with these relationships:

| Parent | Child |
|--------|-------|
| Alice  | Bob   |
| Alice  | Carol |
| Bob    | Dave  |

You want parents to appear **above** their children, and siblings to be **aligned horizontally**.

## Step 1: Write the Spec

Create a YAML file:

```yaml
constraints:
  - orientation:
      selector: parent
      directions: [above]

  - align:
      selector: "Person.~parent.parent - iden"
      direction: horizontal
```

That's it. Two constraints:

1. **Orientation**: For every `parent` edge, the source (parent) appears above the target (child).
2. **Align**: Siblings (nodes sharing the same parent) are aligned horizontally.

## Step 2: Add Some Style

Let's color the nodes and show ages as labels:

```yaml
constraints:
  - orientation:
      selector: parent
      directions: [above]

directives:
  - atomColor:
      selector: Person
      value: "#4a90d9"

  - attribute:
      field: age
      selector: Person

  - flag: hideDisconnectedBuiltIns
```

Now every `Person` node is blue, ages appear as labels on the node instead of edges, and disconnected built-in type nodes (like `Int`) are hidden.

## Step 3: Iterate

The power of Spytial is that you can keep adding constraints and directives to refine your layout. Some ideas:

```yaml
# Group family branches
- group:
    selector: Person.~parent
    name: "Family"

# Add icons
- icon:
    selector: Person
    path: "user"
    showLabels: true

# Style specific edges
- edgeColor:
    field: parent
    value: "#666"
    style: solid
    weight: 2
```

## What's Next?

- [**Constraints**](constraints.md) — Full reference for all constraint types
- [**Directives**](directives.md) — Full reference for all directive types
- [**Selector Syntax**](selectors.md) — How to write selectors
- [**Examples**](examples.md) — More complete worked examples
