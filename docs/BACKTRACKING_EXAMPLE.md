# Backtracking Example: Disjunctive Constraint Solving

## Scenario

Consider 3 disjunctions with the following alternatives:
- **Disjunction 1** (D1): 2 alternatives (A, B)
- **Disjunction 2** (D2): 3 alternatives (X, Y, Z)
- **Disjunction 3** (D3): 2 alternatives (P, Q)

Let's assume the following satisfiability:
- D1-A + D2-X + D3-P: ✗ Unsatisfiable
- D1-A + D2-X + D3-Q: ✗ Unsatisfiable
- D1-A + D2-Y + D3-P: ✓ **Satisfiable** ← Solution found!

## Backtracking Execution Trace

```
Start: Solve all 3 disjunctions
│
├─ [D1] Try alternative A
│  ├─ Add constraints from D1-A to solver
│  ├─ ✓ D1-A is locally satisfiable
│  │
│  └─ Recurse to D2 ──────────────────────────────────┐
│                                                       │
│                                                       ↓
│                              [D2] Try alternative X
│                              ├─ Add constraints from D2-X to solver
│                              ├─ ✓ D2-X is locally satisfiable
│                              │
│                              └─ Recurse to D3 ──────────────────────┐
│                                                                      │
│                                                                      ↓
│                                                   [D3] Try alternative P
│                                                   ├─ Add constraints from D3-P
│                                                   ├─ ✗ Conflicts with D1-A + D2-X
│                                                   ├─ Backtrack ⟲
│                                                   │
│                                                   [D3] Try alternative Q
│                                                   ├─ Add constraints from D3-Q
│                                                   ├─ ✗ Conflicts with D1-A + D2-X
│                                                   ├─ All D3 alternatives exhausted
│                                                   └─ Return FAILURE ✗✗
│                                                                      │
│                                                                      ↓
│                              [D2] Received FAILURE from D3
│                              ├─ Backtrack ⟲ (restore to state before D2-X)
│                              │
│                              [D2] Try alternative Y
│                              ├─ Add constraints from D2-Y to solver
│                              ├─ ✓ D2-Y is locally satisfiable
│                              │
│                              └─ Recurse to D3 ──────────────────────┐
│                                                                      │
│                                                                      ↓
│                                                   [D3] Try alternative P
│                                                   ├─ Add constraints from D3-P
│                                                   ├─ ✓ Satisfiable with D1-A + D2-Y
│                                                   ├─ Base case: All disjunctions satisfied!
│                                                   └─ Return SUCCESS ✓✓
│                                                                      │
│                                                                      ↓
│                              [D2] Received SUCCESS from D3
│                              └─ Return SUCCESS ✓✓ (don't backtrack!)
│                                                                      │
│                                                                      ↓
│  [D1] Received SUCCESS from D2
│  └─ Return SUCCESS ✓✓ (solution found!)
│
└─ DONE: Solution is D1-A + D2-Y + D3-P
```

## Key Points

### 1. Depth-First Search
The algorithm explores in depth-first order:
- D1-A → D2-X → D3-P
- D1-A → D2-X → D3-Q
- D1-A → D2-Y → D3-P ← Success!

It does **NOT** try all combinations breadth-first (e.g., D1-A+D2-X+D3-P, D1-A+D2-Y+D3-P, D1-B+D2-X+D3-P, ...).

### 2. Proper Backtracking Order
When D3 fails with D1-A + D2-X:
1. **First**, exhausts all D3 alternatives (P, Q)
2. **Then**, backtracks to D2 and tries D2-Y
3. **Only if** all D2 alternatives fail (X, Y, Z), backtracks to D1

This is the correct behavior! The algorithm:
- Tries all alternatives at current level before backtracking
- Backtracks to previous level only when current level is exhausted
- Never skips levels (doesn't jump from D3 to D1 without trying all D2 alternatives)

### 3. State Management
At each backtracking point:
```typescript
// Before trying D2-Y:
savedSolver = clone(solver with D1-A)
savedConstraints = [D1-A constraints]

// After D2-X fails:
solver = savedSolver          // Restore to state before D2-X
added_constraints = savedConstraints  // Remove D2-X constraints

// Now try D2-Y with clean state (only D1-A applied)
```

### 4. Early Pruning
If an alternative conflicts immediately (e.g., D2-X creates a cycle), it's rejected without recursing:
```
[D2] Try alternative X
├─ Add constraints from D2-X
├─ ✗ Conflicts with D1-A (detected by Kiwi)
├─ Backtrack immediately ⟲ (no need to try D3)
│
[D2] Try alternative Y
└─ ...
```

This makes the search efficient—no point exploring D3 if D2 already fails.

## Comparison: What Would Be WRONG

### ❌ Wrong: Skipping D2 alternatives
```
[D1] Try A
  [D2] Try X
    [D3] Try P → Fail
    [D3] Try Q → Fail
  [D2] All exhausted? NO! Still have Y, Z
  BUT WRONGLY: Backtrack to D1 ❌
  [D1] Try B  ← This is premature!
```

### ❌ Wrong: Not saving state properly
```
[D1] Try A (add D1-A constraints)
  [D2] Try X (add D2-X constraints)
    [D3] Fails
  [D2] Try Y (add D2-Y constraints)
    BUT: D2-X constraints still in solver! ❌
    → Solver has both X and Y, causing conflicts
```

### ✅ Correct: Our implementation
```
[D1] Try A (add D1-A constraints)
  savedState1 = clone()
  
  [D2] Try X (add D2-X constraints)
    savedState2 = clone()
    [D3] Try P → Fail
    [D3] Try Q → Fail
  
  [D2] Restore savedState2 ✓ (has D1-A, no D2-X)
  [D2] Try Y (add D2-Y constraints)
    [D3] Try P → Success! ✓
```

## Real-World Example: Cyclic Constraints

### Scenario
- **D1**: Arrange cycle A→B→C (3 perturbations: [A,B,C], [B,C,A], [C,A,B])
- **D2**: Arrange cycle D→E→F (3 perturbations: [D,E,F], [E,F,D], [F,D,E])
- **Conjunctive**: A must be left of D

### Execution
1. Try D1=[A,B,C] (A at position 0)
   - Try D2=[D,E,F] (D at position 0)
     - Check: A left of D? Yes ✓
     - Success! Done.

Total alternatives tried: **2 out of 9 possible** (3×3)

### If first combination failed
If D1=[A,B,C] + D2=[D,E,F] conflicted:
1. Try D1=[A,B,C]
   - Try D2=[D,E,F] → Fail
   - Try D2=[E,F,D] → ...
   - Try D2=[F,D,E] → ...
2. If all D2 fail, try D1=[B,C,A]
   - Try D2=[D,E,F] → ...
   - And so on...

This exhausts D2 before changing D1, which is correct!

## Logging Output Example

With the debug logging, you'd see:

```
Disjunction 1/3: Trying 2 alternatives
  → Disjunction 1: Trying alternative 1/2 (5 constraints)
    ✓ Alternative 1 is locally satisfiable, recursing to disjunction 2...
    
Disjunction 2/3: Trying 3 alternatives
  → Disjunction 2: Trying alternative 1/3 (5 constraints)
    ✓ Alternative 1 is locally satisfiable, recursing to disjunction 3...
    
Disjunction 3/3: Trying 2 alternatives
  → Disjunction 3: Trying alternative 1/2 (5 constraints)
    ✗ Alternative 1 conflicts with existing constraints
  → Disjunction 3: Trying alternative 2/2 (5 constraints)
    ✗ Alternative 2 conflicts with existing constraints
  ✗✗ Disjunction 3: All 2 alternatives exhausted, returning failure
  
    ✗ Alternative 1 failed in later disjunctions, backtracking...
    ⟲ Backtracked from alternative 1, state restored
    
  → Disjunction 2: Trying alternative 2/3 (5 constraints)
    ✓ Alternative 2 is locally satisfiable, recursing to disjunction 3...
    
Disjunction 3/3: Trying 2 alternatives
  → Disjunction 3: Trying alternative 1/2 (5 constraints)
    ✓ Alternative 1 is locally satisfiable, recursing to disjunction 4...
    ✓ Base case reached: All 3 disjunctions satisfied
    ✓✓ Alternative 1 led to full success!
    
    ✓✓ Alternative 2 led to full success!
    
    ✓✓ Alternative 1 led to full success!
```

## Summary

✅ The implementation **correctly** implements depth-first backtracking:
- Exhausts all alternatives at current disjunction before backtracking
- Properly saves and restores solver state
- Backtracks to the immediate parent disjunction (not grandparent)
- Short-circuits on success (doesn't try more alternatives after finding solution)

This matches the standard backtracking algorithm used in SAT solvers and constraint programming systems.
