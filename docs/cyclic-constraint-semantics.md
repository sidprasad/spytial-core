# Cyclic Constraint Translation to Layout Constraints

## Overview

This document describes how **cyclic orientation constraints** in the CnD layout system are translated into elementary layout constraints. The core insight is that cyclic constraints generate **disjunctions over circular arrangements** - each possible arrangement produces a different set of `LeftConstraint`, `TopConstraint`, and `AlignmentConstraint` objects.

## The Translation Process

### Input: Cyclic Constraint
A cyclic constraint consists of:
- **Direction**: `clockwise` or `counterclockwise` 
- **Fragments**: Arrays of node IDs forming cycles/paths (e.g., `[['A', 'B', 'C']]`)

### Output: Layout Constraints
The translation produces arrays of these concrete constraint types:
- **LeftConstraint**: `{ left: LayoutNode, right: LayoutNode, minDistance: number }`
- **TopConstraint**: `{ top: LayoutNode, bottom: LayoutNode, minDistance: number }`  
- **AlignmentConstraint**: `{ axis: "x" | "y", node1: LayoutNode, node2: LayoutNode }`

## Translation Function

The core translation function maps each fragment to multiple constraint sets (one per circular arrangement):

```typescript
translateCyclicConstraint(constraint: CyclicConstraint): LayoutConstraint[][]
```

### Mathematical Specification

For a fragment `F = [v₁, v₂, ..., vₙ]`, the translation generates `n` different perturbations:

```
Perturbation p: position(vᵢ, p) = (r·cos((i + p)·θ), r·sin((i + p)·θ))
where θ = 2π/n and p ∈ [0, n-1]
```

### Constraint Generation Rules

For each pair of nodes `(vᵢ, vⱼ)` with positions `(xᵢ, yᵢ)` and `(xⱼ, yⱼ)`:

#### Horizontal Constraints
```
if xᵢ > xⱼ:     LeftConstraint(vⱼ, vᵢ)     // vⱼ left of vᵢ
if xᵢ < xⱼ:     LeftConstraint(vᵢ, vⱼ)     // vᵢ left of vⱼ
if xᵢ ≈ xⱼ:     AlignmentConstraint(vᵢ, vⱼ, axis: "x")
```

#### Vertical Constraints  
```
if yᵢ > yⱼ:     TopConstraint(vⱼ, vᵢ)      // vⱼ above vᵢ
if yᵢ < yⱼ:     TopConstraint(vᵢ, vⱼ)      // vᵢ above vⱼ
if yᵢ ≈ yⱼ:     AlignmentConstraint(vᵢ, vⱼ, axis: "y")
```

## Lean Function Translation

The translation can be expressed as a formal mapping:

```lean
| CyclicConstraint.clockwise fragments    => generatePerturbations(fragments, identity)
| CyclicConstraint.counterclockwise fragments => generatePerturbations(fragments, reverse)

where generatePerturbations produces:
| Constraint.left a b                 => LeftConstraint(a, b, minDistance)
| Constraint.above a b                => TopConstraint(a, b, minDistance)  
| Constraint.horizontally_aligned a b => AlignmentConstraint(a, b, axis: "x")
| Constraint.vertically_aligned a b   => AlignmentConstraint(a, b, axis: "y")
```

## Example: Triangle Cycle

**Input**: `{ direction: "clockwise", fragments: [["A", "B", "C"]] }`

**Perturbation 0** (A at 0°, B at 120°, C at 240°):
```typescript
[
  LeftConstraint("B", "A"),           // B left of A
  LeftConstraint("C", "A"),           // C left of A  
  AlignmentConstraint("B", "C", "x"), // B and C x-aligned
  TopConstraint("C", "B"),            // C above B
  TopConstraint("A", "B"),            // A above B
  TopConstraint("A", "C")             // A above C
]
```

**Perturbation 1** (A at 120°, B at 240°, C at 0°):
```typescript
[
  LeftConstraint("A", "C"),           // A left of C
  LeftConstraint("B", "C"),           // B left of C
  AlignmentConstraint("A", "B", "x"), // A and B x-aligned  
  TopConstraint("A", "B"),            // A above B
  TopConstraint("C", "A"),            // C above A
  TopConstraint("C", "B")             // C above B
]
```

**Perturbation 2** (A at 240°, B at 0°, C at 120°):
```typescript
[
  LeftConstraint("A", "B"),           // A left of B
  AlignmentConstraint("A", "C", "y"), // A and C y-aligned
  LeftConstraint("C", "B"),           // C left of B
  TopConstraint("A", "C"),            // A above C
  TopConstraint("B", "A"),            // B above A  
  TopConstraint("B", "C")             // B above C
]
```

## Disjunctive Semantics

The cyclic constraint is satisfied if **any** of the generated constraint sets is satisfiable:

```
satisfies(CyclicConstraint) ≡ ∃cs ∈ translateCyclicConstraint(constraint) : satisfiable(cs)
```

This creates a **disjunction** over all possible circular arrangements. The layout solver attempts each perturbation until it finds one that satisfies all constraints or exhausts all possibilities.

## Implementation

The actual implementation in `layoutinstance.ts` uses this translation within a backtracking algorithm:

1. **Extract fragments** from the constraint selector
2. **Generate perturbations** for each fragment  
3. **Backtrack** through combinations until a satisfiable assignment is found
4. **Return** the constraint set that produces a valid layout

The translation ensures that cyclic relationships can be satisfied in multiple geometric configurations, providing flexibility while maintaining the essential circular ordering semantics.