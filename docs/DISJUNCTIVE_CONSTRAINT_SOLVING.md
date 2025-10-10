# Disjunctive Constraint Solving in ConstraintValidator

## Overview

The `ConstraintValidator` now acts as a **disjunctive constraint solver** built on top of Kiwi.js. It handles both:

1. **Conjunctive constraints** (`InstanceLayout.constraints`) - Must always be satisfied
2. **Disjunctive constraints** (`InstanceLayout.disjunctiveConstraints`) - At least one alternative per disjunction must be satisfiable

## How It Works

### Architecture

```
ConstraintValidator
├── Conjunctive Constraints (always true)
│   └── Added first to the Kiwi solver
│
└── Disjunctive Constraints (OR operations)
    └── Solved via backtracking algorithm
        ├── Try Alternative 1 → Recurse
        ├── Try Alternative 2 → Recurse
        └── Try Alternative N → Recurse
```

### Algorithm: Backtracking Search

The validator uses a **depth-first backtracking search** to find a satisfying assignment:

```typescript
solveDisjunctiveConstraints(disjunctions) {
    return backtrack(disjunctions, index=0)
}

backtrack(disjunctions, index) {
    // Base case: all disjunctions satisfied
    if (index >= disjunctions.length) {
        return { satisfiable: true }
    }
    
    currentDisjunction = disjunctions[index]
    
    // Try each alternative
    for (alternative in currentDisjunction.alternatives) {
        // Save state for backtracking
        savedSolver = cloneSolver()
        savedConstraints = [...added_constraints]
        
        // Try adding this alternative
        if (addConstraints(alternative) succeeds) {
            // Recursively solve remaining disjunctions
            result = backtrack(disjunctions, index + 1)
            
            if (result.satisfiable) {
                return { satisfiable: true }  // Success!
            }
        }
        
        // Backtrack: restore state and try next alternative
        restoreSolver(savedSolver)
        added_constraints = savedConstraints
    }
    
    // All alternatives failed
    return { satisfiable: false, error: ... }
}
```

### Key Features

1. **Early Pruning**: If an alternative violates constraints, it's immediately rejected without exploring further.

2. **State Management**: 
   - `cloneSolver()` creates a snapshot of the current Kiwi solver
   - `restoreSolver()` resets to a previous state during backtracking
   - `added_constraints` tracks all chosen constraint alternatives

3. **Chosen Alternatives**: When a satisfiable combination is found, the selected alternatives are in `this.added_constraints`, which gets added to `layout.constraints` for downstream use.

4. **Error Handling**: If no satisfiable combination exists, returns a `PositionalConstraintError` indicating which disjunction failed.

## Example: Cyclic Constraints

### Problem Setup

Consider a 3-node clockwise cycle: `A → B → C → A`

This creates a `DisjunctiveConstraint` with 3 alternatives (perturbations):

```typescript
const cyclicDisjunction = new DisjunctiveConstraint(
    cyclicOrientationConstraint,  // source
    [
        // Alternative 0: [A, B, C]
        [
            leftConstraint(A, B),
            leftConstraint(B, C),
            leftConstraint(C, A),
            topConstraint(A, B),
            // ... more positional constraints
        ],
        
        // Alternative 1: [B, C, A] (rotated)
        [
            leftConstraint(B, C),
            leftConstraint(C, A),
            leftConstraint(A, B),
            // ... more positional constraints
        ],
        
        // Alternative 2: [C, A, B] (rotated)
        [
            leftConstraint(C, A),
            leftConstraint(A, B),
            leftConstraint(B, C),
            // ... more positional constraints
        ],
    ]
);
```

### Solving Process

1. **Add Conjunctive Constraints First**
   ```typescript
   // E.g., A must be above D
   addConstraintToSolver(topConstraint(A, D))
   ```

2. **Try Alternative 0** ([A, B, C])
   ```typescript
   // Try adding: A left of B, B left of C, C left of A, ...
   // Check if satisfiable with existing constraints
   ```
   
   - If **satisfiable**: Done! Return success.
   - If **unsatisfiable** (e.g., creates cycle): Backtrack.

3. **Backtrack and Try Alternative 1** ([B, C, A])
   ```typescript
   // Restore solver to state before Alternative 0
   // Try adding: B left of C, C left of A, A left of B, ...
   ```
   
   - If **satisfiable**: Done! Return success.
   - If **unsatisfiable**: Backtrack.

4. **Backtrack and Try Alternative 2** ([C, A, B])
   ```typescript
   // Restore solver to state before Alternative 1
   // Try adding: C left of A, A left of B, B left of C, ...
   ```
   
   - If **satisfiable**: Done! Return success.
   - If **unsatisfiable**: Return error (all alternatives exhausted).

### Interaction with Conjunctive Constraints

Conjunctive constraints **limit** which disjunctive alternatives are valid:

```
Given:
  Conjunctive: A must be left of D
  Disjunctive: Cycle A → B → C (3 perturbations)

Solving:
  Alternative 0 [A, B, C]: 
    Requires: A left of B, B left of C
    Combined with A left of D: ✓ Satisfiable
  
  Alternative 1 [B, C, A]:
    Requires: B left of C, C left of A
    Combined with A left of D: ✗ May be unsatisfiable (depends on layout)
  
  Alternative 2 [C, A, B]:
    Requires: C left of A, A left of B
    Combined with A left of D: ✗ Likely unsatisfiable

Result: Alternative 0 is chosen.
```

The conjunctive constraint acts as a "filter" that prunes invalid disjunctive branches early.

## Multiple Disjunctions

When multiple disjunctive constraints exist, the solver explores their **Cartesian product** of alternatives:

```
Disjunction 1: 3 alternatives (A's cycle)
Disjunction 2: 4 alternatives (B's cycle)

Total combinations to potentially explore: 3 × 4 = 12

Backtracking explores these efficiently:
1. Try D1-Alt0 + D2-Alt0 ✓
   → If satisfiable, done (only 1 combination tried!)
2. Try D1-Alt0 + D2-Alt1 ✗
3. Try D1-Alt0 + D2-Alt2 ✗
4. Try D1-Alt0 + D2-Alt3 ✗
5. Try D1-Alt1 + D2-Alt0 ✓
   → If satisfiable, done (5 combinations tried)
...
```

Early pruning means we often don't explore all combinations.

## Performance Characteristics

### Time Complexity

- **Best case**: O(D) where D = number of disjunctions
  - First alternative of each disjunction is satisfiable
  
- **Worst case**: O(A^D) where A = average alternatives per disjunction
  - Must explore all combinations (exponential)
  
- **Typical case**: Much better than worst case due to:
  - Constraint propagation in Kiwi.js
  - Early pruning of unsatisfiable branches
  - Most alternatives are satisfiable in practice

### Space Complexity

- O(D × C) where C = average constraints per alternative
  - Must clone solver state for backtracking
  - Each state contains all added constraints

## Integration with LayoutInstance

### Before (Manual Backtracking in LayoutInstance)

```typescript
// OLD: LayoutInstance had to manually try perturbations
for (let perturbation = 0; perturbation < N; perturbation++) {
    try {
        const constraints = getCyclicConstraintForFragment(..., perturbation);
        const validator = new ConstraintValidator(layout);
        validator.addConstraints(constraints);
        if (validator.validate()) {
            return constraints;  // Success
        }
    } catch {
        continue;  // Try next perturbation
    }
}
throw new Error("No satisfiable perturbation");
```

### After (Declarative Disjunctions)

```typescript
// NEW: LayoutInstance declares disjunctions, validator solves them
const disjunctiveConstraint = new DisjunctiveConstraint(
    cyclicConstraint,
    perturbations.map(p => getCyclicConstraintForFragment(..., p))
);

layout.disjunctiveConstraints = [disjunctiveConstraint];

const validator = new ConstraintValidator(layout);
const error = validator.validateConstraints();
if (error) {
    // No satisfiable combination exists
}
// Else: validator found a satisfying assignment automatically
```

**Benefits:**
- Separation of concerns: LayoutInstance defines what, validator solves how
- Cleaner code: No manual backtracking loops
- Better error messages: Validator knows full constraint context
- Extensible: Easy to add more disjunctive constraint types

## Error Reporting

When no satisfiable combination exists:

```typescript
{
    type: 'positional-conflict',
    message: 'No satisfiable alternative found for disjunctive constraint from [cyclic: clockwise(A->B->C)]',
    conflictingConstraint: lastTriedConstraint,
    conflictingSourceConstraint: cyclicOrientationConstraint,
    minimalConflictingSet: Map<SourceConstraint, LayoutConstraint[]>
}
```

This tells users:
- Which disjunctive constraint failed
- The source constraint (e.g., cyclic orientation)
- Which specific constraints were tried last

### IIS (Irreducible Inconsistent Subset) Extraction

When all alternatives in a disjunction fail, the validator performs **minimal conflict analysis** to identify the smallest set of constraints that cause the conflict. This is known as IIS extraction.

#### Deepest Path Selection

**Problem**: Simply using the first alternative for conflict analysis can miss the most informative conflicts.

**Solution**: The validator now tracks which alternative "went deepest" - i.e., satisfied the most constraints before failing. This alternative is then used for IIS extraction.

The selection criteria are:
1. **Recursion depth** (primary): How many constraints were added in deeper disjunction levels
2. **Local constraints added** (secondary): How many constraints from the current alternative were successfully added before failure

#### Example

```typescript
// Given conjunctive constraint: A < B
const conjunctive = [leftConstraint(A, B)];

// Two disjunctive alternatives:
const alternative1 = [leftConstraint(B, A)];  // Fails immediately (conflicts with A < B)
const alternative2 = [
    leftConstraint(A, C),  // ✓ Succeeds
    leftConstraint(C, D),  // ✓ Succeeds  
    leftConstraint(D, B),  // ✓ Succeeds
    leftConstraint(B, A),  // ✗ Fails (creates cycle)
];

// Result: alternative2 is used for conflict analysis because it:
// - Added 3 constraints successfully before failing
// - Provides more context about what constraints are incompatible
// 
// The error will reference all 4 constraints from alternative2,
// giving users better insight into the conflict.
```

This improvement is especially important for **grouping constraints with orientation**, where disjunctive constraints encode "element is IN group" vs "element is OUT of group" alternatives. The deepest path often reveals which elements are being forced incorrectly.

## Future Enhancements

### 1. Smarter Alternative Ordering
Currently tries alternatives in declaration order. Could use heuristics:
- Try alternatives with fewer constraints first (faster to validate)
- Use prior solutions as hints (warm starting)
- Learn from failed branches to reorder remaining alternatives

### 2. Constraint Propagation Between Disjunctions
Currently solves disjunctions independently. Could propagate:
- If D1-Alt0 + D2-Alt1 fails, maybe skip D1-Alt0 + D2-Alt2 if similar
- Use failed branches to prune future search space

### 3. Incremental Solving
When layout changes slightly:
- Reuse previous satisfying assignment
- Only re-solve affected disjunctions
- Much faster for interactive editing

### 4. Parallel Search
Explore multiple alternative combinations in parallel:
- Each worker tries a different branch
- First satisfiable result wins
- Good for multi-core systems

### 5. SAT Solver Integration
Replace backtracking with a full SAT/SMT solver:
- Model constraints as boolean formulas
- Use industrial-strength solvers (Z3, MiniSat)
- Better performance on complex constraint systems

## Related Documentation

- [Cyclic Constraint Validation](./CYCLIC_CONSTRAINT_VALIDATION.md) - How cyclic constraints use disjunctions
- [Constraint Validator](./IMPLEMENTATION_SUMMARY.md) - Overall validation architecture
- [DisjunctiveConstraint Class](../src/layout/interfaces.ts) - Type definitions

## Testing Disjunctive Constraints

### Unit Test Example

```typescript
test('solves simple disjunctive constraint', () => {
    const nodes = [nodeA, nodeB, nodeC];
    
    const disjunction = new DisjunctiveConstraint(
        cyclicConstraint,
        [
            [leftConstraint(A, B), leftConstraint(B, C)],  // Alt 0
            [leftConstraint(B, C), leftConstraint(C, A)],  // Alt 1
            [leftConstraint(C, A), leftConstraint(A, B)],  // Alt 2
        ]
    );
    
    const layout: InstanceLayout = {
        nodes,
        edges: [],
        constraints: [],  // No conjunctive constraints
        groups: [],
        disjunctiveConstraints: [disjunction],
    };
    
    const validator = new ConstraintValidator(layout);
    const error = validator.validateConstraints();
    
    expect(error).toBeNull();  // Should find satisfiable alternative
    expect(validator.layout.constraints.length).toBeGreaterThan(0);  // Chosen alternative added
});
```

### Integration Test Example

```typescript
test('cyclic constraint with conflicting conjunctive constraint', () => {
    const nodes = [nodeA, nodeB, nodeC];
    
    const conjunctive = [
        leftConstraint(C, A),  // Forces C left of A
    ];
    
    const disjunction = new DisjunctiveConstraint(
        cyclicConstraint,
        [
            [leftConstraint(A, B), leftConstraint(B, C)],  // Alt 0: A < B < C (conflicts!)
            [leftConstraint(B, C), leftConstraint(C, A)],  // Alt 1: B < C < A (satisfiable!)
            [leftConstraint(C, A), leftConstraint(A, B)],  // Alt 2: C < A < B (conflicts!)
        ]
    );
    
    const layout: InstanceLayout = {
        nodes,
        edges: [],
        constraints: conjunctive,
        groups: [],
        disjunctiveConstraints: [disjunction],
    };
    
    const validator = new ConstraintValidator(layout);
    const error = validator.validateConstraints();
    
    expect(error).toBeNull();  // Should find Alt 1
    expect(validator.added_constraints).toContain(/* constraints from Alt 1 */);
});
```

## Summary

The `ConstraintValidator` now functions as a **complete disjunctive constraint solver**:

- ✅ Handles conjunctive constraints (must always be true)
- ✅ Handles disjunctive constraints (at least one alternative must be true)
- ✅ Uses backtracking to explore alternative combinations
- ✅ Prunes unsatisfiable branches early
- ✅ Tracks chosen alternatives in `added_constraints`
- ✅ Provides meaningful error messages on failure

This eliminates the need for manual backtracking in `LayoutInstance` and provides a clean, declarative way to express cyclic and other complex constraints.
