# IIS Extraction Analysis

## Overview
This document analyzes the correctness of the Irreducible Infeasible Set (IIS) extraction algorithm used in the constraint validator.

## What is an IIS?
An IIS is a minimal subset of constraints that is:
1. **Infeasible**: The constraints cannot all be satisfied simultaneously
2. **Irreducible**: Removing any single constraint makes the set satisfiable

## The Deletion-Based Algorithm

The current implementation uses a deletion-based greedy algorithm:

```
function findIIS(constraints):
    workingSet = constraints
    repeat:
        changed = false
        for each constraint c in workingSet:
            if (workingSet \ {c}) is still infeasible:
                remove c from workingSet
                changed = true
    until not changed
    return workingSet
```

## Correctness Analysis

### What the algorithm guarantees:
✅ **Irreducibility**: The result is irreducible - no constraint can be removed without making the set satisfiable
✅ **Conflict preservation**: The result is infeasible
✅ **Duplicate-free**: After deduplication, no semantically identical constraints appear twice
✅ **Polynomial time**: O(n²) complexity with n constraint satisfiability checks

### What the algorithm does NOT guarantee:
❌ **Global minimality**: May not find the SMALLEST possible IIS
❌ **Uniqueness**: Different orderings may produce different IIS results

### Example of Non-Global Minimality

Consider constraints:
- A: x₁ < x₂
- B: x₂ < x₃
- C: x₃ < x₁  (creates cycle)
- D: x₁ < x₃  (redundant via transitivity)

Possible minimal IIS results depending on deletion order:
- {A, B, C} - size 3 ✅ (optimal)
- {A, C, D} - size 3 ✅ (also minimal)
- {B, C, D} - size 3 ✅ (also minimal)

All are irreducible, but there could theoretically exist smaller IIS in more complex scenarios with multiple independent conflicts.

## Why This Approach is Acceptable

1. **Practical Performance**: Finding the globally smallest IIS is NP-hard. The deletion-based approach runs in polynomial time.

2. **User-Facing Quality**: For error reporting, an irreducible set is sufficient - it shows users a concrete set of conflicting constraints without overwhelming them with redundant information.

3. **Consistency**: The backward iteration order provides deterministic results for a given constraint ordering.

4. **Deduplication**: The addition of semantic deduplication (this PR) ensures no duplicate constraints appear, addressing the main user-facing issue.

## Test Coverage

The implementation includes tests that verify:
- IIS is irreducible (cannot remove any constraint)
- IIS has no duplicate constraints
- IIS correctly handles cycles
- IIS correctly handles disjunctive constraints (grouping)

## Future Improvements

If globally minimal IIS becomes important, consider:
- QuickXplain algorithm for better minimality
- Hitting set approaches for multiple conflicts
- User-configurable tradeoff between minimality and performance

## Conclusion

The deletion-based algorithm provides **sufficient correctness** for the use case:
- Finds an irreducible conflicting set
- Runs in polynomial time
- Produces understandable error messages
- Now guarantees no duplicates (after this PR)

While not globally minimal, the results are **locally minimal** and **good enough** for practical constraint debugging.
