# Symmetric Edge Collapse - Implementation Summary

## Issue Resolution

**Issue**: [Webcola Controller] Symmetric edge collapse

**Requirement**: If two nodes have edges between them with the **same label**, they should be collapsed into a single bi-directional edge. However, do NOT do this if they have different labels.

## Solution

Implemented automatic edge collapsing in the WebColaLayout translator that:

1. Identifies pairs of edges going in opposite directions between the same nodes
2. Checks if both edges have the **same label**
3. Collapses matching pairs into a single bidirectional edge
4. Preserves edges with different labels as separate unidirectional edges

## Files Modified

### 1. `src/translators/webcola/webcolatranslator.ts`
- Added `bidirectional?: boolean` property to `EdgeWithMetadata` type
- Added `collapseSymmetricEdges()` method to detect and collapse symmetric edge pairs
- Integrated edge collapsing into the WebColaLayout constructor

### 2. `src/translators/webcola/webcola-spytial-graph.ts`
- Added SVG marker definitions for reverse arrows (`start-arrow`, `hand-drawn-arrow-reverse`)
- Updated `setupLinkPaths()` to set `marker-start` attribute for bidirectional edges
- Updated edge rendering in `updatePositions()` to include marker-start

## Test Coverage

Created comprehensive test suite: `tests/symmetric-edge-collapse.test.ts`

5 test cases covering:
- ✓ Collapsing symmetric edges with same label
- ✓ NOT collapsing edges with different labels
- ✓ Preserving unidirectional edges
- ✓ Handling multiple pairs of symmetric edges
- ✓ Mixed symmetric and asymmetric edges

All tests pass (5/5) ✓

## Documentation

- `docs/symmetric-edge-collapse.md` - Detailed feature documentation
- `docs/edge-collapse-examples.md` - Visual examples and use cases
- `webcola-demo/symmetric-edge-collapse-demo.html` - Interactive demo

## Key Implementation Details

### Edge Collapsing Algorithm

```typescript
private collapseSymmetricEdges(edges: EdgeWithMetadata[]): EdgeWithMetadata[] {
  const edgeMap = new Map<string, EdgeWithMetadata>();
  const processed = new Set<string>();

  for (const edge of edges) {
    if (processed.has(edge.id)) continue;

    // Look for reverse edge with SAME label
    const reverseEdge = edges.find(e => 
      e.source === edge.target && 
      e.target === edge.source && 
      e.label === edge.label &&  // <-- KEY: Same label check
      !processed.has(e.id)
    );

    if (reverseEdge) {
      // Collapse into bidirectional edge
      const canonicalEdge = edge.source < edge.target ? edge : reverseEdge;
      edgeMap.set(pairKey, { ...canonicalEdge, bidirectional: true });
      processed.add(edge.id);
      processed.add(reverseEdge.id);
    } else {
      // Keep as unidirectional
      edgeMap.set(edge.id, edge);
      processed.add(edge.id);
    }
  }

  return Array.from(edgeMap.values());
}
```

### Visual Rendering

Bidirectional edges are rendered with arrows on both ends using SVG markers:
- `marker-end`: Arrow pointing to target (existing)
- `marker-start`: Arrow pointing from source (new)

## Verification

All existing tests continue to pass:
- ✓ `tests/webcola-translator.test.ts` (1/1)
- ✓ `tests/webcola-edge-length.test.ts` (4/4)
- ✓ `tests/layout-instance.test.ts` (6/6)
- ✓ `tests/symmetric-edge-collapse.test.ts` (5/5)

Total: 16/16 tests passing ✓

## Benefits

1. **Reduced Visual Clutter**: Fewer edges on screen
2. **Tufte's Principles**: Maximizes data-ink ratio
3. **Semantic Clarity**: Bidirectional arrows clearly indicate mutual relationships
4. **Information Preservation**: Different labels remain separate
5. **Automatic**: No configuration required

## Example Output

Input: 4 edges
```
A --[friend]--> B
B --[friend]--> A
C --[manages]--> D
D --[reports_to]--> C
```

Output: 3 edges
```
A <--[friend]--> B          (bidirectional - collapsed)
C --[manages]--> D          (unidirectional)
D --[reports_to]--> C       (unidirectional)
```

The first pair collapsed because both edges have the same label "friend".
The second pair remains separate because labels differ ("manages" vs "reports_to").
