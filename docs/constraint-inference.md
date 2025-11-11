# Constraint Inference System

The constraint inference system implements a synthesis loop that infers spatial layout constraints from user interactions and concrete node positions. This follows the pattern: **concrete → abstract → invariants → spec**.

## Overview

The system tracks user actions (drags, align button clicks, etc.) along with the resulting layout positions, and automatically infers spatial relationships between nodes. These inferred constraints can then be used to generate layout specifications or to understand how users expect their visualizations to behave.

## Key Concepts

### UI Actions

The system recognizes several types of user interactions:

- **drag**: Dragging one or more nodes to new positions
- **alignButton**: Clicking an align button (horizontal or vertical)
- **distributeButton**: Clicking a distribute button (horizontal or vertical)
- **ringGesture**: Gesture to create a cyclic/ring layout
- **multiSelect**: Selecting multiple nodes (no spatial change, but enables set-level analysis)

### Spatial Primitives

The system can infer the following spatial constraints:

1. **leftOf(a, b)**: Node `a` is to the left of node `b`
2. **above(a, b)**: Node `a` is above node `b`
3. **aligned_v(S)**: Set `S` of nodes is vertically aligned (same x coordinate)
4. **aligned_h(S)**: Set `S` of nodes is horizontally aligned (same y coordinate)
5. **ordered_h(S)**: Set `S` maintains horizontal ordering (x-order is stable)
6. **ordered_v(S)**: Set `S` maintains vertical ordering (y-order is stable)
7. **cyclic(S)**: Set `S` forms a ring/cycle pattern
8. **group(S)**: Set `S` moves as a rigid body (uniform translation)

### Abstract Facts

Each inferred constraint is tracked as an "abstract fact" with:

- **type**: The primitive constraint type
- **atomIds**: The node IDs involved
- **support**: Set of time indices where the fact held true
- **killed**: First time index where the fact became false (if any)
- **metadata**: Additional information (e.g., ring score, average position)

### Stable Facts

Facts become "stable" when they:
1. Have sufficient support (appear in multiple time steps)
2. Are not killed (still hold in current state)

Stable facts represent reliable constraints that persist across user interactions.

## Usage

### Basic Example

```typescript
import { ConstraintInference, UIAction, LayoutState } from 'spytial-core/layout';

// Create inference instance
const inference = new ConstraintInference({
  epsilon: 5,           // Pixel tolerance
  minSupport: 2,        // Minimum occurrences for stability
  cyclicThreshold: 0.8  // Threshold for ring detection
});

// Record first action: drag node A
const action1: UIAction = {
  type: 'drag',
  timestamp: 1000,
  atomIds: ['A']
};

const layout1: LayoutState = {
  timestamp: 1000,
  positions: new Map([
    ['A', { x: 100, y: 100 }],
    ['B', { x: 200, y: 100 }]
  ])
};

inference.addAction(action1, layout1);

// Record second action: align nodes horizontally
const action2: UIAction = {
  type: 'alignButton',
  timestamp: 2000,
  atomIds: ['A', 'B', 'C'],
  direction: 'horizontal'
};

const layout2: LayoutState = {
  timestamp: 2000,
  positions: new Map([
    ['A', { x: 100, y: 100 }],
    ['B', { x: 200, y: 100 }],
    ['C', { x: 300, y: 100 }]
  ])
};

inference.addAction(action2, layout2);

// Get stable facts
const stableFacts = inference.getStableFacts();
console.log(stableFacts);
// [
//   { type: 'leftOf', atomIds: ['A', 'B'], support: Set(2), ... },
//   { type: 'aligned_h', atomIds: ['A', 'B', 'C'], support: Set(1), ... }
// ]
```

### Configuration Options

```typescript
const inference = new ConstraintInference({
  epsilon: 10,          // Larger tolerance for position comparisons
  minSupport: 3,        // Require more evidence for stability
  cyclicThreshold: 0.9  // Stricter threshold for ring detection
});
```

### Querying Facts

```typescript
// Get all facts (including unstable and killed)
const allFacts = inference.getFacts();

// Get only stable facts
const stableFacts = inference.getStableFacts();

// Get current layout
const currentLayout = inference.getCurrentLayout();

// Reset to initial state
inference.reset();
```

## Predicates

### Pairwise Relationships

**leftOf(a, b, t)**: Returns true if `x[a] + ε < x[b]` at time `t`.

**above(a, b, t)**: Returns true if `y[a] + ε < y[b]` at time `t`.

### Set-Based Constraints

**aligned_v(S, t)**: Returns true if `max{|x[a]-x[b]| : a,b∈S} ≤ ε` at time `t`.

**aligned_h(S, t)**: Returns true if `max{|y[a]-y[b]| : a,b∈S} ≤ ε` at time `t`.

**ordered_h(S, t)**: Returns true if the x-ordering of nodes in `S` matches the previous time step.

**ordered_v(S, t)**: Returns true if the y-ordering of nodes in `S` matches the previous time step.

**cyclic(S, t)**: Returns true if nodes in `S` form a ring pattern with score ≥ threshold.

The ring score considers:
- **Polygonality**: How uniform the distances from center are
- **Angle uniformity**: How evenly spaced the nodes are around the circle

**group(S, t)**: Returns true if all nodes in `S` translated by the same amount (within ε).

## Transfer Functions

Transfer functions determine how facts are updated based on action type:

### drag(atomIds)

Recomputes:
- All facts involving dragged atoms
- Pairwise relationships (leftOf, above) with other atoms
- Group movement detection if multiple atoms dragged

### alignButton(direction)

Adds:
- `aligned_h` constraint if direction is horizontal
- `aligned_v` constraint if direction is vertical

Drops:
- Conflicting ordering constraints (e.g., ordered_v when aligning horizontally)

### distributeButton(direction)

Adds:
- `ordered_h` constraint if direction is horizontal
- `ordered_v` constraint if direction is vertical

### ringGesture(atomIds)

Adds:
- `cyclic` constraint for the selected atoms

### multiSelect(atomIds)

No spatial changes, but:
- Caches selection for future set-level operations
- Checks for candidate facts (alignment, ordering, cyclic patterns)

## Implementation Details

### Fact Tracking

Each fact maintains:

1. **Support set**: Time indices where the fact held true
2. **Killed status**: First time the fact became false
3. **Metadata**: Additional context (e.g., average position, translation vector)

### Stability Detection

Facts are considered stable when:
- `support.size >= minSupport`
- `killed === undefined` (not yet violated)

### Overconstraint Prevention

The system handles potential overconstraint by:
- Tracking when facts are killed
- Dropping conflicting constraints (e.g., alignment vs. ordering)
- Using disjunctive constraints where appropriate

## Example Scenarios

### Detecting Alignment from Drag

```typescript
// User drags three nodes to align them horizontally
inference.addAction({ type: 'drag', timestamp: 1000, atomIds: ['A', 'B', 'C'] }, {
  timestamp: 1000,
  positions: new Map([
    ['A', { x: 100, y: 100 }],
    ['B', { x: 200, y: 100 }],
    ['C', { x: 300, y: 100 }]
  ])
});

// Check for alignment
const facts = inference.getFacts();
const aligned = facts.find(f => f.type === 'aligned_h');
// aligned_h will be detected
```

### Detecting Group Movement

```typescript
// First position
inference.addAction({ type: 'multiSelect', timestamp: 1000, atomIds: ['A', 'B'] }, {
  timestamp: 1000,
  positions: new Map([
    ['A', { x: 100, y: 100 }],
    ['B', { x: 150, y: 100 }]
  ])
});

// Drag both nodes together
inference.addAction({ type: 'drag', timestamp: 2000, atomIds: ['A', 'B'] }, {
  timestamp: 2000,
  positions: new Map([
    ['A', { x: 150, y: 150 }],
    ['B', { x: 200, y: 150 }]
  ])
});

// Group movement will be detected
const facts = inference.getFacts();
const group = facts.find(f => f.type === 'group');
// group.metadata.translation === { dx: 50, dy: 50 }
```

### Detecting Cyclic Patterns

```typescript
// Create a square arrangement
const squarePositions = new Map([
  ['A', { x: 100, y: 100 }],
  ['B', { x: 200, y: 100 }],
  ['C', { x: 200, y: 200 }],
  ['D', { x: 100, y: 200 }]
]);

inference.addAction(
  { type: 'ringGesture', timestamp: 1000, atomIds: ['A', 'B', 'C', 'D'] },
  { timestamp: 1000, positions: squarePositions }
);

// Cyclic constraint will be inferred
const facts = inference.getFacts();
const cyclic = facts.find(f => f.type === 'cyclic');
// cyclic.metadata.ringScore > 0.8
```

## Future Extensions

Potential enhancements to the inference system:

1. **Constraint generalization**: Infer more general constraints from specific examples
2. **Pattern recognition**: Identify common layout patterns (grid, tree, hierarchy)
3. **Confidence scores**: Weight facts based on frequency and consistency
4. **Constraint simplification**: Reduce redundant or implied constraints
5. **Interactive refinement**: Allow users to accept/reject inferred constraints
6. **Machine learning**: Use ML to improve pattern recognition and prediction

## API Reference

### Classes

#### `ConstraintInference`

Main class for constraint inference.

**Constructor:**
```typescript
constructor(config?: InferenceConfig)
```

**Methods:**
- `addAction(action: UIAction, layout: LayoutState): void`
- `getFacts(): AbstractFact[]`
- `getStableFacts(): AbstractFact[]`
- `getCurrentLayout(): LayoutState | undefined`
- `reset(): void`

### Interfaces

#### `UIAction`
```typescript
interface UIAction {
  type: UIActionType;
  timestamp: number;
  atomIds: string[];
  direction?: ActionDirection;
}
```

#### `LayoutState`
```typescript
interface LayoutState {
  timestamp: number;
  positions: Map<string, { x: number; y: number }>;
}
```

#### `AbstractFact`
```typescript
interface AbstractFact {
  type: PrimitiveType;
  atomIds: string[];
  support: Set<number>;
  killed?: number;
  metadata?: Record<string, unknown>;
}
```

#### `InferenceConfig`
```typescript
interface InferenceConfig {
  epsilon?: number;
  minSupport?: number;
  cyclicThreshold?: number;
}
```

### Types

#### `UIActionType`
```typescript
type UIActionType = 
  | "drag"
  | "alignButton"
  | "distributeButton"
  | "ringGesture"
  | "multiSelect";
```

#### `PrimitiveType`
```typescript
type PrimitiveType = 
  | "leftOf"
  | "above"
  | "aligned_h"
  | "aligned_v"
  | "ordered_h"
  | "ordered_v"
  | "cyclic"
  | "group";
```

### Constants

#### `DEFAULT_EPSILON`
```typescript
const DEFAULT_EPSILON = 5;
```

Default pixel tolerance for spatial comparisons.
