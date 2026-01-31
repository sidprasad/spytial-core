# Field-Based Directives with Selectors

This document demonstrates the new selector support for field-based directives, which solves the specificity issue where multiple different types may have relations of the same name that are semantically distinct.

## Problem Statement

Previously, field-based rules like `edgeColor`, `attribute`, `hideField`, and `group` applied globally to any relation with a matching field name. This was problematic in programming contexts where you might have:

- `Person -> name` relations
- `Car -> name` relations  
- `Company -> name` relations

If you wanted to color only Person names red, you couldn't do that - setting a color for the "name" field would color ALL name relations.

## Solution

Field-based directives now support an optional `selector` parameter that specifies which atoms the directive applies to.

## Usage Examples

### Edge Colors with Selectors

```yaml
directives:
  # Color name relations red, but only for Person atoms
  - edgeColor:
      field: 'name'
      value: 'red'
      selector: 'Person'
      style: 'dashed'
      weight: 2
      
  # Color name relations blue, but only for Car atoms
  - edgeColor:
      field: 'name'
      value: 'blue'
      selector: 'Car'
      
  # Company name relations will remain default color (black)
```

You can also apply the same style/weight options to inferred edges:

```yaml
directives:
  - inferredEdge:
      name: 'transitive'
      selector: 'Person->Person'
      color: 'gray'
      style: 'dotted'
      weight: 1.5
```

### Attributes with Selectors

```yaml
directives:
  # Convert name relations to attributes, but only for Person atoms
  - attribute:
      field: 'name'
      selector: 'Person'
      
  # Car and Company name relations remain as edges
```

### Attributes with Value Filters

For relations with arity > 2 (e.g., `rel: X -> Y -> Bool`), you can filter which attribute values to show using the `filter` parameter:

```yaml
directives:
  # Show 'likes' as an attribute, but only for tuples where the value is True
  - attribute:
      field: 'likes'
      filter: 'likes & (univ -> univ -> True)'
      
  # Show 'active' only for atoms where active=True
  - attribute:
      field: 'active'
      selector: 'Student'              # Only for Student atoms (source filter)
      filter: 'active & (univ -> True)' # Only show where value is True
```

The `selector` and `filter` parameters work together:
- **selector**: Unary selector that filters which source atoms show the attribute
- **filter**: Tuple selector that filters which specific attribute tuples to display

### Hide Fields with Selectors

```yaml
directives:
  # Hide name relations, but only for Car atoms
  - hideField:
      field: 'name'
      selector: 'Car'
      
  # Person and Company name relations remain visible
```

### Group By Field with Selectors

```yaml
constraints:
  # Group by owns relation, but only for relations involving Person atoms
  - group:
      field: 'owns'
      groupOn: 0
      addToGroup: 1
      selector: 'Person'
```

## Backward Compatibility

Directives without selectors continue to work as before:

```yaml
directives:
  # This still applies to ALL name relations (legacy behavior)
  - edgeColor:
      field: 'name'
      value: 'green'
```

## How It Works

When evaluating field-based directives:

1. The system first filters by field name (as before)
2. If a selector is specified, it evaluates the selector to get a set of matching atoms
3. The directive only applies to relations where the source atom is in the selected set
4. If a filter is specified (for attribute directives), it evaluates the filter to get matching tuples
5. The attribute only applies to tuples that match both the selector (source) and filter (tuple)
6. If no selector or filter is specified, the directive applies to all relations with that field name (legacy behavior)

This allows precise control over which relations are affected by field-based rules while maintaining full backward compatibility.
