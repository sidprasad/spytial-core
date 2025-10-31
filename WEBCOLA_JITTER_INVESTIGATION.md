# WebCola Jitter and Convergence Investigation

## Issue Summary

WebCola sometimes jitters and doesn't converge when graphs have groups or nested groups. The layout oscillates instead of settling into a stable configuration.

## Current State Analysis

### Existing Optimizations
The codebase already has several optimizations in place:
1. **Transitive reduction** - Removes redundant constraints (87%+ reduction)
2. **Alignment edge optimization** - Reduces alignment edges by 80%+ 
3. **Adaptive iteration counts** - Scales iterations based on graph size
4. **Constraint deduplication** - Removes duplicate constraints

### Current WebCola Configuration
```typescript
// From webcola-cnd-graph.ts (lines 1104-1114)
const layout: Layout = cola.d3adaptor(d3)
  .linkDistance(linkLength)
  .convergenceThreshold(1e-3)  // Convergence threshold
  .avoidOverlaps(true)
  .handleDisconnected(true)
  .nodes(webcolaLayout.nodes)
  .links(webcolaLayout.links)
  .constraints(scaledConstraints)
  .groups(webcolaLayout.groups)
  .groupCompactness(groupCompactness)  // Default: 1e-5
  .size([webcolaLayout.FIG_WIDTH, webcolaLayout.FIG_HEIGHT]);
```

### Iteration Configuration
- **Unconstrained**: 10 iterations (5 for >100 nodes)
- **User constraints**: 50 iterations (25 for >100 nodes)
- **All constraints**: 200 iterations (100 for >100 nodes)
- **Grid snap**: 1 iteration

## Root Causes of Jitter

### 1. Group-Related Issues

#### A. Identical Nested Groups
When nested groups contain the same nodes, WebCola can oscillate trying to satisfy conflicting group boundaries.

**Current Implementation:**
```typescript
// From webcolatranslator.ts (lines 624-703)
private determineGroupsAndSubgroups(groupDefinitions: Record<string, string[]>) {
  // Determines hierarchical group relationships
  // Creates subgroup structure for WebCola
}
```

**Issue:** No deduplication of identical groups

#### B. Group Compactness
The current group compactness value (`1e-5`) is very low, which can cause:
- Weak attraction between group boundaries
- Groups that don't stabilize quickly
- Oscillation as nodes try to satisfy both group and other constraints

### 2. Convergence Threshold

Current threshold: `1e-3` (0.001)

This is a reasonable default, but for graphs with many groups/constraints:
- May stop too early (before true stability)
- May allow residual oscillations

### 3. Local Minima Escape

**Current Issue:** No mechanism to escape local minima
- Graphs can get stuck oscillating
- User dragging helps (adds energy to system), but no programmatic solution

### 4. Constraint Conflicts

When groups and positioning constraints conflict:
- WebCola tries to satisfy both
- Results in oscillation between competing solutions
- No clear winner emerges

## Recommended Solutions

### Solution 1: Group Deduplication (HIGH PRIORITY)

Implement intelligent group collapsing for identical nested groups:

```typescript
/**
 * Collapses identical nested groups to reduce constraint conflicts
 * Preserves labels by combining them
 */
private collapseIdenticalGroups(groups: LayoutGroup[]): LayoutGroup[] {
  const groupsByNodes = new Map<string, LayoutGroup[]>();
  
  // Group by node set signature
  for (const group of groups) {
    const nodeKey = [...group.nodeIds].sort().join(',');
    if (!groupsByNodes.has(nodeKey)) {
      groupsByNodes.set(nodeKey, []);
    }
    groupsByNodes.get(nodeKey)!.push(group);
  }
  
  const collapsed: LayoutGroup[] = [];
  
  for (const [nodeKey, duplicateGroups] of groupsByNodes) {
    if (duplicateGroups.length === 1) {
      collapsed.push(duplicateGroups[0]);
    } else {
      // Merge groups with same nodes
      const mergedGroup = {
        ...duplicateGroups[0],
        name: duplicateGroups.map(g => g.name).join(' / '),
        // Combine labels if showLabel is true for any
        showLabel: duplicateGroups.some(g => g.showLabel)
      };
      collapsed.push(mergedGroup);
    }
  }
  
  return collapsed;
}
```

**Benefits:**
- Reduces constraint conflicts
- Maintains semantic meaning via label preservation
- Only affects WebCola-side representation

### Solution 2: Adaptive Group Compactness

Adjust group compactness based on graph characteristics:

```typescript
private calculateGroupCompactness(groups: any[], nodeCount: number): number {
  const DEFAULT_GROUP_COMPACTNESS = 1e-5;
  
  if (groups.length === 0) return DEFAULT_GROUP_COMPACTNESS;
  
  // Calculate nesting depth
  const maxDepth = this.calculateMaxGroupDepth(groups);
  
  // For deeply nested groups, increase compactness to reduce jitter
  if (maxDepth > 2) {
    return 1e-4; // 10x stronger for nested groups
  }
  
  // For many groups relative to nodes, increase compactness
  const groupRatio = groups.length / nodeCount;
  if (groupRatio > 0.3) {
    return 5e-5; // 5x stronger
  }
  
  return DEFAULT_GROUP_COMPACTNESS;
}
```

**Benefits:**
- Stronger group boundaries for complex hierarchies
- Reduces oscillation in nested group scenarios
- Adaptive to graph structure

### Solution 3: Convergence Enhancement

Add mechanisms to detect and handle non-convergence:

```typescript
/**
 * Monitors convergence and takes corrective action if jitter detected
 */
private monitorConvergence() {
  const stressHistory: number[] = [];
  const HISTORY_SIZE = 10;
  const OSCILLATION_THRESHOLD = 0.1;
  
  return {
    recordStress: (stress: number) => {
      stressHistory.push(stress);
      if (stressHistory.length > HISTORY_SIZE) {
        stressHistory.shift();
      }
    },
    
    isOscillating: (): boolean => {
      if (stressHistory.length < HISTORY_SIZE) return false;
      
      // Check if stress is oscillating rather than decreasing
      const variance = this.calculateVariance(stressHistory);
      const mean = this.calculateMean(stressHistory);
      
      return variance / mean > OSCILLATION_THRESHOLD;
    },
    
    applyStabilization: (layout: Layout) => {
      // Increase convergence threshold to force stop
      layout.convergenceThreshold(1e-2);
      
      // Reduce alpha (cooling) to dampen oscillations
      layout.alpha(0.01);
    }
  };
}
```

**Benefits:**
- Detects oscillation patterns
- Applies corrective measures automatically
- Prevents infinite jitter

### Solution 4: Random Displacement Mitigation

Add small random jitter at start to help escape local minima:

```typescript
private addInitialJitter(nodes: NodeWithMetadata[]): void {
  const JITTER_AMOUNT = 5; // pixels
  
  nodes.forEach(node => {
    if (!node.fixed) {
      node.x += (Math.random() - 0.5) * JITTER_AMOUNT;
      node.y += (Math.random() - 0.5) * JITTER_AMOUNT;
    }
  });
}
```

**Benefits:**
- Helps escape perfect symmetry that can cause oscillation
- Small enough not to disrupt intentional positioning
- Common technique in force-directed layouts

### Solution 5: Cooling Schedule

Implement a cooling schedule for better convergence:

```typescript
private applyCoolingSchedule(layout: Layout, iteration: number, totalIterations: number): void {
  // Exponential cooling: alpha decreases from 1.0 to near 0
  const progress = iteration / totalIterations;
  const alpha = Math.exp(-progress * 5); // Decreases from 1 to ~0.007
  
  layout.alpha(alpha);
}
```

**Benefits:**
- Allows exploration early, stability late
- Standard technique in simulated annealing
- Reduces jitter at end of layout

## Implementation Priority

1. **HIGH**: Group deduplication (Solution 1)
   - Directly addresses issue mentioned in problem statement
   - Clear benefit for identical nested groups
   - Low risk, high reward

2. **HIGH**: Adaptive group compactness (Solution 2)
   - Targets root cause of group-related jitter
   - Easy to implement and test
   - Can be tuned based on testing

3. **MEDIUM**: Convergence monitoring (Solution 3)
   - Provides safety net for non-convergence
   - Requires more complex implementation
   - May not be needed if 1 & 2 work well

4. **LOW**: Initial jitter (Solution 4)
   - Simple to implement
   - May help in edge cases
   - Could interfere with intentional positioning

5. **LOW**: Cooling schedule (Solution 5)
   - More experimental
   - Requires WebCola API support
   - May not provide significant benefit over current approach

## Testing Strategy

1. **Create test cases with:**
   - Identical nested groups
   - Complex group hierarchies
   - High constraint count with groups
   - Known problematic layouts

2. **Metrics to measure:**
   - Final stress value
   - Number of iterations to convergence
   - Visual stability (manual inspection)
   - Performance impact

3. **Success criteria:**
   - Reduced jitter in group scenarios
   - Faster convergence
   - No regressions in existing layouts

## Next Steps

1. Implement Solution 1 (group deduplication) first
2. Test with existing demos and problematic cases
3. If jitter persists, implement Solution 2 (adaptive compactness)
4. Document findings and effectiveness
5. Consider Solutions 3-5 only if needed

## References

- WebCola Documentation: https://github.com/tgdwyer/WebCola
- Force-Directed Graph Drawing: Fruchterman & Reingold (1991)
- Simulated Annealing for Graph Layout: Davidson & Harel (1996)
- Current codebase optimizations: WEBCOLA_TRANSITIVE_REDUCTION.md, PERFORMANCE_IMPROVEMENTS.md
