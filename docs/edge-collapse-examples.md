# Symmetric Edge Collapse - Visual Examples

## Example 1: Same Label - Edges ARE Collapsed

### Before Collapse:
```
    Alice ---[friend]---> Bob
    Alice <--[friend]---- Bob
```

Two separate edges, both labeled "friend"

### After Collapse:
```
    Alice <--[friend]---> Bob
```

Single bidirectional edge with arrows on both ends

---

## Example 2: Different Labels - Edges are NOT Collapsed

### Before:
```
    Bob ---[manages]-----> Carol
    Bob <--[reports_to]--- Carol
```

Two edges with different labels: "manages" and "reports_to"

### After:
```
    Bob ---[manages]-----> Carol
    Bob <--[reports_to]--- Carol
```

Both edges preserved because labels differ

---

## Example 3: Mixed Scenario

### Input:
```
Node A --[friend]--> Node B
Node B --[friend]--> Node A
Node A --[knows]---> Node C
```

### Output:
```
Node A <--[friend]--> Node B    (bidirectional - collapsed)
Node A ---[knows]----> Node C   (unidirectional - single edge)
```

---

## Visual Indicators in the Graph

- `→` = Unidirectional edge (one arrow)
- `↔` = Bidirectional edge (arrows on both ends)

The bidirectional arrow indicates that the relationship exists in both directions with the same meaning (same label).

---

## Benefits

1. **Cleaner Visualization**: Fewer visual elements on screen
2. **Semantic Clarity**: Bidirectional arrows clearly show mutual relationships
3. **Information Preservation**: Different relationships remain separate
4. **Follows Tufte's Principles**: Maximizes data-ink ratio by removing redundant visual elements
