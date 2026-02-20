# IIS Extraction Analysis

## Overview

This document describes how the `ConstraintValidator` extracts an Irreducible Infeasible Set (IIS) when layout constraints conflict. The IIS is the minimal set of constraints reported to the user so they can understand and fix the problem.

## What is an IIS?

An IIS is a minimal subset of constraints that is:
1. **Infeasible**: The constraints cannot all be satisfied simultaneously.
2. **Irreducible**: Removing any single constraint from the set makes it satisfiable.

The goal is to present the user with the *smallest useful explanation* of why their constraints conflict, rather than dumping every constraint in the system.

## When IIS Extraction Triggers

IIS extraction happens in two distinct situations during `validatePositionalConstraints()`:

### 1. Conjunctive constraint conflict (`addConstraintToSolver`)

Conjunctive constraints (orientation, alignment) are added to the Kiwi solver one at a time. When `solver.addConstraint()` throws, the newly-added constraint conflicts with the constraints already in the solver. At that point `getMinimalConflictingConstraints` is called with:
- `consistentConstraints` — the `added_constraints` accumulated so far (known-satisfiable prefix).
- `conflictingConstraint` — the single constraint that just failed.

### 2. Disjunctive constraint conflict (`backtrackDisjunctions`)

Disjunctive constraints (e.g., cyclic orientations that expand into multiple alternatives) are solved via depth-first backtracking. When every alternative of a disjunction has been exhausted, `getMinimalDisjunctiveConflict` is called with:
- `existingConstraints` — the `added_constraints` at the current backtracking level.
- `disjunctiveAlternative` — the alternative that made the most progress (went deepest) before failing.

## Feasibility Testing

Every IIS extraction method needs to answer the question *"is this subset of constraints still infeasible?"* This is done by `isConflictingSet`, which:

1. Creates a fresh Kiwi `Solver`.
2. If bounding-box or group-boundary constraints are present, sets up temporary bounding-box variables and adds member-containment constraints.
3. Converts each `LayoutConstraint` to Kiwi constraints and adds them.
4. Calls `solver.updateVariables()`.
5. If the solver throws, the set is **infeasible** (returns `true`). If it succeeds, the set is **satisfiable** (returns `false`).

## The Deletion-Based Algorithm

All IIS extraction in the system is built on the same core idea: **iterative deletion**. Given a set of constraints $S$ known to be infeasible, we repeatedly try to remove individual constraints while infeasibility persists:

```
Algorithm: DELETION-MINIMIZE(S, fixed)
  Input:  S — a set of constraints known to be infeasible when combined with fixed
          fixed — constraints that must remain (never removed)
  Output: S' ⊆ S such that S' ∪ fixed is infeasible and irreducible

  repeat
      changed ← false
      for i from |S| − 1 down to 0:
          S' ← S \ {S[i]}
          if INFEASIBLE(S' ∪ fixed):       // send to Kiwi
              S ← S'
              changed ← true
  until ¬changed
  return S
```

Each call to `INFEASIBLE` creates a fresh Kiwi solver, adds the candidate constraints, and checks whether the solver throws. The backward iteration order provides deterministic results for a given constraint ordering.

This algorithm guarantees **irreducibility** (subset-minimality): no constraint can be removed from the result without restoring feasibility. It does *not* guarantee **global minimality** — there may exist a strictly smaller infeasible subset. Finding the globally smallest IIS is NP-hard; the deletion-based approach runs in polynomial time, making at most $O(n^2)$ feasibility checks where $n = |S|$.

## IIS Extraction for Conjunctive Conflicts

When a single conjunctive constraint $c$ fails against the existing set $E$, we run:

$$\texttt{DELETION-MINIMIZE}(E, \{c\})$$

The conflicting constraint $c$ is held fixed — it must be present for the conflict to exist. Only the previously-added constraints in $E$ are candidates for removal.

After the deletion loop, a **transitive reduction** post-processing step removes redundant constraints the solver cannot infer on its own:
- **Ordering transitivity**: If $A < B$ and $B < C$ are both in the IIS, then $A < C$ is redundant (detected via Floyd-Warshall reachability).
- **Alignment transitivity**: If $\text{align}(A,B)$ and $\text{align}(A,C)$ are both in the IIS, then $\text{align}(B,C)$ is redundant (detected via BFS spanning tree).

## IIS Extraction for Disjunctive Conflicts

Disjunctive conflicts involve two sides: the *existing constraints* $E$ (the satisfiable prefix) and the *disjunctive alternative* $D$ (the branch that failed). The algorithm dispatches to one of two strategies depending on whether group bounding-box constraints are involved.

### Simple conflicts (aggressive minimization)

Used when no bounding-box/grouping constraints are present. Runs a three-phase bidirectional deletion:

```
Algorithm: SIMPLE-IIS(E, D)
  Input:  E — existing constraints, D — disjunctive alternative
          E ∪ D is known infeasible
  Output: (E', D') where E' ⊆ E, D' ⊆ D, E' ∪ D' is infeasible and irreducible

  // Phase 1: minimize E while holding D fixed
  repeat until no change:
      for i from |E| − 1 down to 0:
          if INFEASIBLE((E \ {E[i]}) ∪ D):
              E ← E \ {E[i]}

  // Phase 2: minimize D while holding E fixed
  repeat until no change:
      for i from |D| − 1 down to 0:
          if INFEASIBLE(E ∪ (D \ {D[i]})):
              D ← D \ {D[i]}

  // Phase 3: re-minimize E (Phase 2 may have opened new opportunities)
  repeat until no change:
      for i from |E| − 1 down to 0:
          if INFEASIBLE((E \ {E[i]}) ∪ D):
              E ← E \ {E[i]}

  return (E, D)
```

The third phase is necessary because removing disjunctive constraints in Phase 2 may have made additional existing constraints droppable. The result is an irreducible pair $(E', D')$; neither side can lose any constraint without restoring feasibility.

### Grouping conflicts (conservative minimization)

Used when bounding-box constraints are involved. Group bounding-box constraints create complex interdependencies: a single group-membership constraint implicitly ties a node's position to four bounding-box boundary variables (`left`, `right`, `top`, `bottom`), and those boundaries in turn depend on every other member of the group. Aggressive deletion on these constraints risks reducing the IIS to a single constraint plus a bounding-box inequality — which is technically irreducible but provides insufficient context for the user to understand *why* the group placement conflicts.

The conservative strategy therefore works differently:

```
Algorithm: GROUPING-IIS(E, D)
  Input:  E — existing constraints, D — disjunctive alternative (contains bounding-box constraints)
  Output: (E', D) — note: D is returned in full

  // Step 1: test with a single representative from D
  representative ← D[0]
  if INFEASIBLE(E ∪ {representative}):
      E' ← DELETION-MINIMIZE(E, {representative})
  else:
      E' ← ∅

  // Step 2: context expansion if result is too sparse
  if |E'| ≤ 1:
      groupMembers ← all node IDs mentioned in bounding-box constraints of D
      E' ← { c ∈ E : c involves a node in groupMembers }

  return (E', D)
```

**Why groups get special treatment.** The core tension is between *mathematical minimality* and *explanatory value*. For simple ordering and alignment constraints, each constraint is self-contained: `A left-of B` is a single inequality between two node variables, and users can immediately understand its role in a conflict. Bounding-box constraints are different — they are *structurally coupled*. Stating that "node $X$ must be inside group $G$'s left boundary" is uninformative without also showing which other constraints force $X$ outside that boundary. The conservative strategy preserves this context by:

1. **Keeping the full disjunctive alternative $D$**, so the user sees the entire group-membership picture.
2. **Expanding sparse results** by including all constraints that touch group member nodes, even if strict deletion would have pruned them.

The tradeoff is that grouping IIS results may include constraints that are not strictly necessary for infeasibility. In practice, this produces more understandable error messages because users can see both the group structure and the spatial constraints that conflict with it.

## Deduplication and Post-Processing

After extraction, the IIS goes through:

1. **Hash-based deduplication**: Each constraint is assigned a string key (e.g., `left:A:B`, `align:A:B:x`, `bbox:node:group:side`). Duplicate keys are removed.
2. **Transitive reduction**: Removes transitive orderings and transitive alignments (as described above).
3. **Grouping by source**: The deduplicated, reduced set is grouped into a `Map<SourceConstraint, LayoutConstraint[]>` for error reporting, so the user sees constraints organized by the high-level specification rule that generated them.

## Selecting a Representative Branch

When a disjunctive constraint fails, the solver must choose a branch of the disjunctive search tree from which to extract and report the conflict. It is unclear whether the most specific (deepest) or most general (shallowest) disjunction offers the most informative explanation. We have not been able to find work in disjunctive or linear constraint solving that has studied these human factors questions.

The system therefore adopts a pragmatic strategy: during backtracking, it tracks which alternative *went deepest* before failing, using two metrics ranked by priority:

1. **Recursion depth** — total constraints added across this alternative and all deeper disjunction levels.
2. **Local constraints added** — constraints added from this alternative alone (tiebreaker).

The alternative with the highest recursion depth is selected. This reflects the concrete configuration that exhausted all feasible alternatives: the branch that made the most progress before every remaining option was ruled out.

If a recursive call returned a deeper error (e.g., two disjunctions conflict with each other), that error is propagated directly, since it already contains IIS information from both levels. Only when no deeper error exists does the current level extract its own IIS. This ensures that when two disjunctions conflict with each other (e.g., two cyclic constraints), the reported IIS contains constraints from **both** disjunctions, not just one.

## Isolating the Conflicting Constraints

Once a branch is fixed, the solver must identify the smallest subset of inequalities within that branch that together form the contradiction.

The system extracts a quasi-IIS using iterative deletion: starting from the full conflicting set, it removes constraints one at a time while infeasibility persists. This deletion is **aggressive** for inequalities purely between boxes (the three-phase bidirectional algorithm), but **more conservative** for those involving group bounding-box constraints, using existing knowledge about group membership to avoid pruning essential context.

The result is **subset-minimal**: no remaining constraint can be removed without restoring feasibility, though smaller infeasible subsets may still exist.

For UI highlighting, a single *representative constraint* is chosen from the IIS:

- **Default**: The first constraint from the best disjunctive alternative.
- **Grouping conflicts**: If the IIS involves group constraints, the representative is the first IIS constraint that involves a group member node (by checking node IDs against the group's `nodeIds`).

This ensures the highlighted constraint is relevant to the elements the user cares about.

## Correctness Properties

### Guarantees
- **Irreducibility (subset-minimality)**: No constraint can be removed from the result without making the set satisfiable.
- **Infeasibility**: The returned set is genuinely infeasible (verified by sending it to Kiwi).
- **Duplicate-free**: Hash-based deduplication and transitive reduction remove redundancy.
- **Polynomial time**: $O(n^2)$ feasibility checks in the worst case, where each check is $O(c)$ in solver overhead.

### Non-guarantees
- **Global minimality**: The deletion-based algorithm may not find the *smallest* possible IIS. Finding the globally smallest IIS is NP-hard.
- **Uniqueness**: Different iteration orders may produce different (but equally valid) irreducible sets.

## Performance Considerations

- **Feasibility checks** create a fresh Kiwi solver each time. This is acceptable because IIS extraction only runs on constraint failures, which are rare in normal usage.
- **Kiwi constraint caching** (`kiwiConstraintCache`) avoids re-converting `LayoutConstraint` → `Constraint[]` during backtracking and IIS extraction.
- **Expression caching** (`expressionCache`) avoids creating duplicate `variable.plus(constant)` expression objects.
- **Bounding-box member constraint caching** (`boundingBoxMemberConstraints`) avoids re-creating permanent containment constraints on every solver clone during backtracking.
