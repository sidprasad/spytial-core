# Formal Semantics of Cyclic Constraints

## Overview

This document formally specifies how **cyclic orientation constraints** in the CnD layout system are translated into elementary positional constraints (left-of, above, and alignment constraints). The translation involves **disjunctive backtracking** over different circular arrangements to find satisfiable layouts.

## Mathematical Framework

### Definitions

Let:
- `G = (V, E)` be a directed graph where `V` are layout nodes and `E` are relationships
- `C_cyclic` be a cyclic orientation constraint with direction `d ∈ {clockwise, counterclockwise}`
- `F = [v₁, v₂, ..., vₙ]` be a fragment (cycle or path) of nodes
- `θ = 2π/n` be the angular step for n nodes in circular arrangement
- `r` be the minimum radius for circular positioning

### Core Translation Algorithm

The translation `T: CyclicConstraint → 2^{PositionalConstraint}` proceeds as follows:

```
T(C_cyclic) = ⋃(i=0 to n-1) T_perturbation(F, i)
```

Where `T_perturbation(F, i)` generates constraints for the i-th rotational perturbation.

## Perturbation-Based Translation

### Circular Positioning Function

For fragment `F = [v₁, v₂, ..., vₙ]` and perturbation `p ∈ [0, n-1]`:

```
position(vⱼ, p) = (r·cos((j + p)·θ), r·sin((j + p)·θ))
```

### Constraint Generation Rules

For each pair of nodes `(vᵢ, vⱼ)` with positions `(xᵢ, yᵢ)` and `(xⱼ, yⱼ)`:

#### Horizontal Constraints
```
if xᵢ > xⱼ + ε:     generate LeftConstraint(vⱼ, vᵢ, minSep)
if xᵢ < xⱼ - ε:     generate LeftConstraint(vᵢ, vⱼ, minSep)  
if |xᵢ - xⱼ| ≤ ε:   generate AlignmentConstraint(vᵢ, vⱼ, 'x')
```

#### Vertical Constraints
```
if yᵢ > yⱼ + ε:     generate TopConstraint(vⱼ, vᵢ, minSep)
if yᵢ < yⱼ - ε:     generate TopConstraint(vᵢ, vⱼ, minSep)
if |yᵢ - yⱼ| ≤ ε:   generate AlignmentConstraint(vᵢ, vⱼ, 'y')
```

Where `ε` is a small tolerance value and `minSep` is the minimum separation distance.

## Disjunctive Semantics

### Perturbation Disjunction

The cyclic constraint is satisfied if **any** perturbation produces a satisfiable set of positional constraints:

```
satisfies(C_cyclic) ≡ ∃p ∈ [0, n-1] : satisfiable(T_perturbation(F, p))
```

This creates a **disjunction** over perturbations:

```
C_cyclic ≡ T_perturbation(F, 0) ∨ T_perturbation(F, 1) ∨ ... ∨ T_perturbation(F, n-1)
```

### Fragment Disjunction

When multiple fragments exist for a single cyclic constraint, each fragment contributes constraints:

```
T(C_cyclic) = ⋃(F ∈ fragments(C_cyclic)) ⋃(p=0 to |F|-1) T_perturbation(F, p)
```

## Direction Handling

### Clockwise vs Counterclockwise

For **counterclockwise** constraints, fragments are reversed before processing:

```
if direction = counterclockwise:
    F' = reverse(F)
    apply T_perturbation(F', p) for each p
```

This ensures that the circular ordering respects the specified rotation direction.

## Backtracking Algorithm

### Constraint Satisfaction

The implementation uses backtracking to find satisfying perturbations:

```pseudocode
function solveCyclicConstraints(fragments):
    return backtrack([], 0)
    
function backtrack(constraints, fragmentIndex):
    if fragmentIndex >= length(fragments):
        return constraints  // All fragments processed
        
    fragment = fragments[fragmentIndex]
    for perturbation in [0..length(fragment)-1]:
        newConstraints = constraints ∪ T_perturbation(fragment, perturbation)
        if satisfiable(newConstraints):
            result = backtrack(newConstraints, fragmentIndex + 1)
            if result ≠ null:
                return result
    
    return null  // No satisfying assignment found
```

### Constraint Validation

At each step, the algorithm validates constraint satisfiability using a constraint solver:

```pseudocode
function satisfiable(constraints):
    solver = createConstraintSolver()
    try:
        for c in constraints:
            solver.addConstraint(translateToSolver(c))
        solver.solve()
        return true
    catch ConstraintError:
        return false
```

## Fragment Detection

### Graph Traversal

Fragments are detected through depth-first traversal of the relationship graph:

```pseudocode
function getFragments(relationshipGraph):
    fragments = []
    for startNode in nodes(relationshipGraph):
        paths = dfsWithCycleDetection(startNode, relationshipGraph)
        fragments.extend(paths)
    
    return removeDuplicateAndSubsumedPaths(fragments)
```

### Path Equivalence

Two paths are considered equivalent if they represent the same cyclic ordering:

```
equivalent(P₁, P₂) ≡ P₁.isSubpathOf(P₂) ∧ P₂.isSubpathOf(P₁)
```

## Complexity Analysis

### Time Complexity

For a cyclic constraint with `k` fragments of average size `n`:
- Fragment detection: `O(V + E)` per constraint
- Perturbation generation: `O(k × n³)` for all pairwise constraints
- Backtracking: `O(n^k)` in worst case (exponential in number of fragments)

### Space Complexity

- Constraint storage: `O(k × n²)` for all pairwise relationships
- Solver state: `O(V)` for variable storage

## Implementation Notes

### Tolerance Handling

The implementation uses floating-point positions, requiring careful tolerance handling for alignment detection:

```
const POSITION_TOLERANCE = 1e-6
function isAligned(pos1, pos2): 
    return abs(pos1 - pos2) <= POSITION_TOLERANCE
```

### Minimum Separation

All generated constraints include minimum separation distances to prevent node overlap:

```
minSepWidth = 15   // Horizontal separation
minSepHeight = 15  // Vertical separation  
```

## Example

### Input Constraint
```yaml
cyclic:
  direction: clockwise
  selector: "edges(Parent, Child)"
```

### Generated Fragments
Suppose the selector yields relationships: `A→B, B→C, C→A`, creating fragment `[A, B, C]`.

### Perturbation 0 (p=0)
- Position A: (100, 0)
- Position B: (-50, 86.6)  
- Position C: (-50, -86.6)

Generates:
```
LeftConstraint(B, A)    // B left of A
LeftConstraint(C, A)    // C left of A  
TopConstraint(C, B)     // C above B
```

### Perturbation 1 (p=1)
- Position A: (-50, 86.6)
- Position B: (-50, -86.6)
- Position C: (100, 0)

Generates:
```
LeftConstraint(A, C)    // A left of C
LeftConstraint(B, C)    // B left of C
TopConstraint(B, A)     // B above A
```

The cyclic constraint is satisfied if **either** perturbation produces a satisfiable layout.

## Conclusion

Cyclic constraints in CnD are translated through a sophisticated **disjunctive backtracking** algorithm that:

1. **Decomposes** cyclic relationships into graph fragments
2. **Generates** multiple circular arrangements (perturbations) for each fragment  
3. **Translates** each arrangement into elementary positional constraints
4. **Backtracks** through the combinatorial space to find satisfying assignments

The resulting semantics create a **disjunction of constraint sets**, where each disjunct represents a possible geometric realization of the cyclic relationship. This approach ensures that cyclic constraints can be satisfied whenever a valid circular arrangement exists, while integrating seamlessly with the broader constraint satisfaction framework.