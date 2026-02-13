# What is Spytial?

Spytial is a **declarative, constraint-based graph visualization** system. Instead of manually placing nodes and drawing edges, you describe *what you want* — and Spytial figures out *how to draw it*.

You write a short **YAML specification** that says things like:

- "Parents should appear **above** their children"
- "Sibling nodes should be **aligned horizontally**"
- "Color all `Error` nodes **red**"
- "Show the `age` field as a **label on the node** instead of an edge"

Spytial takes your data and your spec, and produces a clean, readable layout.

## Who is this guide for?

This guide is for people who want to **use** Spytial to visualize structured data. You might be:

- Writing YAML layout specs by hand
- Using the NoCode visual editor to build specs interactively
- Providing JSON data to visualize

You don't need to know how Spytial works internally. You just need to know what you can tell it to do.

## Core Concepts

### Data

Your data consists of **atoms** (nodes) and **relations** (edges between them). For example, a family tree has atoms like `Alice`, `Bob`, `Carol` and a relation `parent` connecting them.

Spytial accepts data in several formats including [JSON](json-data.md), Alloy XML, and others.

### Specs

A **spec** is a YAML file with two optional sections:

```yaml
constraints:
  - # ... structural layout rules

directives:
  - # ... visual styling rules
```

**Constraints** control *where* things go — which nodes are above, below, left, or right of others; which nodes are grouped or aligned.

**Directives** control *how* things look — colors, icons, labels, hidden elements.

### Selectors

Both constraints and directives use **selectors** to pick which atoms or relations they apply to. Selectors use [Forge relational syntax](selectors.md), so if you've used Forge or Alloy, you already know the basics:

```yaml
# All Person atoms
selector: Person

# The parent relation (source -> target pairs)
selector: parent

# Transitive closure — all ancestors
selector: "^parent"
```

## Next Steps

- [**Quick Start**](quickstart.md) — Write your first spec in 2 minutes
- [**Constraints**](constraints.md) — Learn about layout constraints
- [**Directives**](directives.md) — Learn about visual directives
- [**Selector Syntax**](selectors.md) — Master the selector language
- [**Examples**](examples.md) — Full worked examples
