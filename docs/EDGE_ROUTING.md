# Edge Routing Improvements

This document describes the edge routing improvements implemented in `webcola-cnd-graph.ts` based on Sugiyama graph drawing principles.

## Overview

The edge routing system has been enhanced to improve graph readability by implementing three key Sugiyama principles:

1. **Minimize Edge Crossings**: Detect and report edge crossings as a foundation for future optimization
2. **Avoid Node Occlusion**: Route edges around nodes instead of passing through them
3. **Optimize Label Positioning**: Position edge labels to maximize readability and avoid overlaps

## Features

### 1. Node Occlusion Avoidance

Edges are now routed around intermediate nodes rather than passing through them, making the graph structure clearer.

**How it works:**
- Detects when an edge segment would pass through a node
- Calculates waypoints to route around the node
- Chooses horizontal or vertical routing based on edge direction
- Maintains configurable margin around nodes

**Configuration:**
```typescript
NODE_OCCLUSION_MARGIN = 15         // Pixels of clearance around nodes
EDGE_ROUTING_SMOOTHNESS = 0.7      // 0 = straight, 1 = full avoidance (0.7 = balanced)
```

**Smoothness Parameter:**
The `EDGE_ROUTING_SMOOTHNESS` parameter controls the balance between avoiding nodes and maintaining smooth curves:
- **0.0-0.5**: Minimal routing, only avoids significant overlaps. Produces nearly straight lines.
- **0.6-0.8**: Balanced routing (recommended). Avoids nodes while keeping curves smooth. Uses fewer waypoints.
- **0.9-1.0**: Aggressive routing, avoids all overlaps with multiple waypoints. May create complex paths.

Default value of **0.7** provides a good balance between clarity and smoothness.

**Limitations:**
- Currently routes around the first intersecting node only
- Complex scenarios with many overlapping nodes may need manual adjustment
- Does not apply to edges with many existing waypoints (likely pre-routed)

### 2. Edge Crossing Detection

The system can now detect when edges cross each other, providing a foundation for future crossing minimization algorithms.

**How it works:**
- Compares all pairs of non-adjacent edges
- Samples curved paths at multiple points for accurate detection
- Reports crossing pairs for potential optimization
- Performance-optimized with configurable threshold

**Configuration:**
```typescript
EDGE_INTERSECTION_SAMPLES = 5           // Sampling points per edge
MAX_EDGES_FOR_CROSSING_DETECTION = 100  // Performance threshold
```

**Performance:**
- O(n²) complexity for n edges
- Automatically skips detection for large graphs (>100 edges by default)
- Configurable threshold allows tuning for specific use cases

### 3. Enhanced Label Positioning

Edge labels are intelligently positioned to avoid overlapping with nodes while remaining readable.

**How it works:**
- Initially positions labels at edge midpoint
- Detects overlaps with node bounding boxes
- Samples multiple positions along the edge path
- Selects first clear position found

**Configuration:**
```typescript
LABEL_POSITION_SAMPLES = 10  // Positions to try along edge
```

**Benefits:**
- Labels remain visible even in dense graphs
- Automatic repositioning reduces manual adjustment
- Preserves label association with correct edge

## API Changes

All improvements are backward compatible. No API changes required for existing code.

### New Configuration Constants

The following constants can be modified to tune routing behavior:

```typescript
class WebColaCnDGraph {
  private static readonly NODE_OCCLUSION_MARGIN = 15;
  private static readonly EDGE_INTERSECTION_SAMPLES = 5;
  private static readonly LABEL_POSITION_SAMPLES = 10;
  private static readonly MAX_EDGES_FOR_CROSSING_DETECTION = 100;
  private static readonly EDGE_ROUTING_SMOOTHNESS = 0.7; // Controls curve complexity
}
```

### Internal Methods

New private methods added for routing logic:

- `avoidNodeOcclusion()`: Routes edges around nodes
- `minimizeEdgeCrossings()`: Detects edge crossings
- `positionLabelForReadability()`: Optimizes label placement
- `lineIntersectsNode()`: Tests line-node intersection
- `lineSegmentsIntersect()`: Tests line-line intersection
- `rectanglesOverlap()`: Tests rectangle overlap
- `calculateWaypointsAroundNode()`: Generates routing waypoints
- `findClearLabelPosition()`: Finds non-overlapping label position

## Testing

Comprehensive unit tests are provided in `tests/edge-routing-improvements.test.ts`:

- Line segment intersection detection
- Rectangle overlap detection
- Line-rectangle intersection
- Waypoint calculation logic
- Configuration value validation

Run tests with:
```bash
npm run test:run -- tests/edge-routing-improvements.test.ts
```

## Demo

A demo is available at `webcola-demo/edge-routing-demo.html` showcasing:
- Node occlusion avoidance
- Edge crossing detection
- Smart label positioning
- Waypoint routing

To view the demo:
```bash
npm run serve
# Navigate to http://localhost:8080/webcola-demo/edge-routing-demo.html
```

## Performance Considerations

### Edge Crossing Detection

- **Complexity**: O(n² × s²) where n is number of edges and s is samples per edge
- **Mitigation**: Automatically disabled for graphs with >100 edges
- **Tuning**: Adjust `MAX_EDGES_FOR_CROSSING_DETECTION` threshold as needed

### Node Occlusion Avoidance

- **Complexity**: O(e × n) where e is number of edges and n is number of nodes
- **Performance**: Minimal impact, scales linearly with graph size
- **Optimization**: Only checks visible, non-source/target nodes

### Label Positioning

- **Complexity**: O(l × s × n) where l is labels, s is samples, n is nodes
- **Performance**: Acceptable for most graphs
- **Tuning**: Reduce `LABEL_POSITION_SAMPLES` if needed

## Future Enhancements

Potential improvements for future versions:

1. **Active Crossing Minimization**: Use detected crossings to actively adjust edge routing
2. **Multi-Node Routing**: Handle edges that intersect multiple nodes
3. **A* Pathfinding**: Implement sophisticated pathfinding for complex obstacles
4. **Label-Label Overlap**: Extend label positioning to avoid other labels
5. **Caching**: Cache intersection tests for better performance
6. **Hierarchical Routing**: Use graph hierarchy to optimize routing decisions

## References

- Sugiyama, K., Tagawa, S., & Toda, M. (1981). "Methods for visual understanding of hierarchical system structures"
- WebCola documentation: http://marvl.infotech.monash.edu/webcola/
- D3.js force-directed graphs: https://d3js.org/

## Contributing

When modifying edge routing:

1. Add unit tests for new geometric algorithms
2. Update configuration constants rather than using magic numbers
3. Document performance implications and limitations
4. Test with various graph sizes and complexities
5. Ensure backward compatibility

## License

Same as parent project (MIT)
