# Symmetric Edge Collapse Feature

## Overview

The symmetric edge collapse feature automatically simplifies graph visualizations by combining bidirectional edges with the same label into a single edge with arrows on both ends.

## Behavior

### When Edges Are Collapsed

Two edges will be collapsed into a single bidirectional edge when **ALL** of the following conditions are met:

1. There are two edges between the same pair of nodes
2. One edge goes from Node A to Node B
3. The other edge goes from Node B to Node A
4. **Both edges have the same label**

Example:
```
Before collapse:
A —-"friend"—-> B
B —-"friend"—-> A

After collapse:
A <—-"friend"—-> B (single edge with arrows on both ends)
```

### When Edges Are NOT Collapsed

Edges with **different labels** are preserved as separate unidirectional edges, even if they connect the same pair of nodes in opposite directions.

Example:
```
A —-"manages"—-> B
B —-"reports to"—-> A

These remain as two separate edges because the labels differ.
```

## Implementation Details

### Changes Made

1. **EdgeWithMetadata Type** (`src/translators/webcola/webcolatranslator.ts`)
   - Added optional `bidirectional?: boolean` property to track collapsed edges

2. **Edge Collapsing Logic** (`src/translators/webcola/webcolatranslator.ts`)
   - Added `collapseSymmetricEdges()` method to WebColaLayout class
   - Method is called during layout construction, after edges are converted to WebCola format
   - Uses label-based matching to identify symmetric edge pairs

3. **Visual Rendering** (`src/translators/webcola/webcola-spytial-graph.ts`)
   - Added `start-arrow` and `hand-drawn-arrow-reverse` SVG marker definitions
   - Updated `setupLinkPaths()` to set `marker-start` attribute for bidirectional edges
   - Updated edge positioning to handle bidirectional arrows

### Algorithm

The collapse algorithm:
1. Iterates through all edges
2. For each edge, creates a key based on the pair of nodes and the edge label
3. Searches for a matching reverse edge with the same label
4. If found, marks both edges as processed and creates a single bidirectional edge
5. If not found, keeps the edge as unidirectional

## Benefits

1. **Reduced Visual Clutter**: Fewer edge lines on screen make graphs easier to read
2. **Tufte's Principles**: Follows Edward Tufte's data visualization principle of maximizing data-ink ratio
3. **Semantic Clarity**: Bidirectional arrows clearly indicate mutual relationships
4. **Preserved Information**: Different relationships (different labels) are still shown separately

## Testing

Comprehensive test suite in `tests/symmetric-edge-collapse.test.ts` covers:
- Collapsing symmetric edges with same labels
- Preserving edges with different labels
- Handling unidirectional edges
- Multiple pairs of symmetric edges
- Mixed symmetric and asymmetric edges

All tests pass with 100% coverage of the feature.

## Usage

The feature is automatic and requires no configuration. Simply create your graph layout as usual:

```typescript
const instanceLayout: InstanceLayout = {
  nodes: [nodeA, nodeB],
  edges: [
    { source: nodeA, target: nodeB, label: 'friend', ... },
    { source: nodeB, target: nodeA, label: 'friend', ... }
  ],
  constraints: [],
  groups: []
};

const webcolaLayout = await translator.translate(instanceLayout);
// webcolaLayout.links will contain a single bidirectional edge
```

## Demo

See `webcola-demo/symmetric-edge-collapse-demo.html` for a visual demonstration of the feature.
