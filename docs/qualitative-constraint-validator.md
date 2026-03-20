# Qualitative Constraint Validator

A CDCL-based constraint solver for axis-aligned rectangle layout, designed as the feasibility and ordering layer in a two-phase architecture: **qualitative reasoning** (this validator) followed by **numeric coordinate assignment** (Kiwi/WebCola).

---

## 1. Problem Formulation

### Domain

A finite set of **boxes** `B` (drawable elements with known width and height) and a finite set of **groups** `G` (bounding envelopes whose geometry is derived from their members). All rectangles are axis-aligned on the Cartesian plane.

### Decision Variables

| Variable | Type | Meaning |
|---|---|---|
| `H(a, b)` | Boolean | Box `a` is strictly left of box `b` |
| `V(a, b)` | Boolean | Box `a` is strictly above box `b` |
| `Xeq(a, b)` | Boolean | Boxes `a` and `b` share the same x-coordinate (x-alignment) |
| `Yeq(a, b)` | Boolean | Boxes `a` and `b` share the same y-coordinate (y-alignment) |

`H` and `V` are **strict partial orders** — irreflexive, asymmetric, transitive — represented as DAGs. `Xeq` and `Yeq` are **equivalence relations** represented as Union-Find structures.

### Constraints

**Conjunctive** (must all hold):

- `LeftConstraint(a, b)`: asserts `H(a, b)`, adds edge `a → b` in the H-graph.
- `TopConstraint(a, b)`: asserts `V(a, b)`, adds edge `a → b` in the V-graph.
- `AlignmentConstraint(a, b, axis)`: asserts `Xeq(a,b)` or `Yeq(a,b)`. Mutual exclusion with ordering on the same axis — you cannot be both x-aligned with and left-of the same node.
- `BoundingBoxConstraint(node, group, side)`: a node must be on a specific side of a group's bounding box. Encoded as an edge to/from a virtual group node.

**Disjunctive** (exactly one alternative must hold):

- `DisjunctiveConstraint(alternatives)`: a set of alternative constraint bundles (e.g., "A is left of B, OR A is right of B, OR A is above B, OR A is below B"). Generated automatically for non-overlap between non-member nodes and groups, between groups, or provided directly for cyclic orientation constraints.

### Objective

Find an assignment to all decision variables such that:
1. `H` and `V` remain acyclic (strict partial orders).
2. No alignment-ordering contradictions (e.g., `Xeq(a,b)` and `H(a,b)`).
3. All conjunctive constraints are satisfied.
4. At least one alternative from each disjunctive constraint is satisfied.

There is no optimization — the problem is **satisfiability** (SAT/UNSAT). Actual coordinate values are deferred to the numeric phase.

---

## 2. Architecture: Two-Phase Layout

```
┌─────────────────────────────────────────┐
│  Phase 1: Qualitative Validator         │
│                                         │
│  Input: boxes, groups, constraints      │
│  Output: SAT + resolved orderings       │
│          or UNSAT + conflict diagnosis   │
│                                         │
│  Method: CDCL over partial order DAGs   │
└──────────────────┬──────────────────────┘
                   │ resolved LeftConstraints,
                   │ TopConstraints, AlignmentConstraints
                   ▼
┌─────────────────────────────────────────┐
│  Phase 2: Kiwi/WebCola                  │
│                                         │
│  Input: resolved ordering constraints   │
│  Output: (x, y) coordinates for all     │
│          boxes satisfying the orderings │
│                                         │
│  Method: one LP solve, no backtracking  │
└─────────────────────────────────────────┘
```

The key insight: the Kiwi/Cassowary LP solver is excellent at coordinate assignment but expensive at combinatorial search (it clones the entire solver state at each branch point). By resolving all disjunctive choices qualitatively — using only graph reachability and union-find, no numeric variables — we reduce the numeric phase to a single LP solve with no backtracking.

---

## 3. Search Strategy: CDCL with Luby Restarts

The solver uses **Conflict-Driven Clause Learning** (CDCL), the same paradigm behind modern SAT solvers, adapted for partial-order constraints.

### 3.1 Decision (Branching)

When no unit propagation is possible, the solver **picks a disjunction** and **commits to one of its alternatives**.

**VSIDS heuristic**: each alternative `(disjunction d, alternative a)` has an activity score. When a conflict involves an alternative (directly or via learned clauses), its activity is bumped. All activities decay by 0.95× after each conflict. The alternative with the highest `activity + 1/(1 + |constraints in alternative|)` score is chosen — preferring both recently-conflicting and simpler alternatives.

Alternatives already eliminated by learned clauses are excluded from consideration.

### 3.2 Propagation

After each decision (or at the start of each loop iteration), **unit propagation** fires:

1. For each learned clause, count how many literals are satisfied, falsified, or unresolved.
2. If all literals are falsified → **conflict** at the current decision level.
3. If exactly one literal is unresolved:
   - **Positive literal** (`d = a`): force that assignment via `tryAssign`.
   - **Negative literal** (`d ≠ a`): compute remaining valid alternatives (considering all learned clauses). If exactly one remains, force it. If zero remain, conflict.
4. If an assignment is made, re-scan all clauses (fixpoint).

The propagation also interacts with the graph: `tryAssign` adds edges to the H/V DAGs and checks for cycles. A failed graph insertion (cycle) is treated as a conflict.

### 3.3 Conflict Analysis and Backtracking

When a conflict occurs at decision level > 0:

1. **Analyze**: build a **learned clause** — a conjunction of negative literals recording which assignments (from the assignment trail) contributed to the conflict. This clause prevents the same combination from recurring.
2. **Bump activity** of all variables in the clause (VSIDS).
3. **Backtrack** to the second-highest decision level in the clause (1-UIP backjumping). Undo all assignments above that level, restore graph state from checkpoint. If any undone assignments involved alignment constraints, **restore the alignment Union-Find** from per-assignment snapshots (each assignment on the trail records `xAlignSnapshot`/`yAlignSnapshot` if it touched alignments).

When a conflict occurs at decision level 0 → **proved UNSAT**. No amount of different choices can satisfy the constraints.

### 3.4 Restarts (Luby Sequence)

After `restartThreshold` conflicts in a search episode, the solver **restarts**: resets all assignments and graph state to the initial checkpoint, but **retains all learned clauses**. The threshold follows the **Luby sequence** (1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8, ...) × 32, which balances exploration breadth with search depth. Maximum 50 restarts before declaring UNSAT.

---

## 4. Geometric Insights

The solver exploits the fact that all objects are axis-aligned rectangles with known dimensions, going beyond pure graph-theoretic feasibility.

### 4.1 Dimension-Aware Partial Orders

Each node in the H-graph carries its **width**; each node in the V-graph carries its **height**. The **longest weighted chain** through the DAG equals the minimum canvas span required to lay out those nodes:

```
span(chain) = Σ size(node_i) + (k-1) × gap
```

Computed via topological DP in O(V + E). If any chain exceeds `MAX_SPAN` (100,000px), the configuration is infeasible — detected before any search begins.

This also enables **dimension-aware alternative pruning**: when evaluating a disjunctive alternative, the solver temporarily adds the edge and checks if the resulting chain overflows. Alternatives that are acyclic but geometrically impossible are pruned without backtracking.

### 4.2 Pigeonhole on Alignment Classes

If K nodes are x-aligned (share the same x-coordinate via transitive alignment), they must all fit in a vertical column:

```
required_height = Σ height(node_i) + (K-1) × gap
```

If this exceeds `MAX_SPAN`, infeasibility is detected immediately after processing conjunctive constraints, before any disjunctive search. Symmetric check for y-aligned nodes in a horizontal row.

### 4.3 Pre-Solver Disjunction Resolution

Before entering CDCL, a **pre-solve pass** attempts to resolve disjunctions cheaply:

1. **Already separated**: if the pair of regions is already ordered in H or V (by transitivity through the conjunctive graph), the disjunction is trivially satisfied. Skip it.
2. **Prune infeasible alternatives**: check each alternative for cycles, alignment conflicts, and dimension overflow. Remove provably-dead alternatives.
3. **Unit propagation**: if only one alternative survives, commit it as conjunctive (no search needed).

This often eliminates a large fraction of disjunctions — especially group bounding-box disjunctions where existing orderings already separate most node-group pairs.

### 4.4 Alignment-Ordering Mutual Exclusion

The solver enforces that alignment and ordering on the same axis are contradictory at three levels:

1. **Within-class**: Adding `LeftConstraint(a, b)` checks `Xeq(a, b)` first — if they share the same x-coordinate, they can't be left/right of each other. Adding `AlignmentConstraint(a, b, 'x')` checks all pairs in the merged alignment class for existing H-ordering.

2. **Transitive**: After adding any ordering edge `a → b`, the solver checks whether this creates a transitive ordering path between any two nodes in the same alignment class. For example, `align-x(A, C), leftOf(A, B), leftOf(B, C)` creates a transitive path `A → B → C`, and since A and C are x-aligned, this is a contradiction.

3. **Cross-class cycles**: Two distinct alignment classes can become mutually ordered — class A has a member ordered before a member of class B, and vice versa. Since aligned nodes must share a coordinate, this creates a cycle in the "alignment-class-contracted graph" and is unsatisfiable. Example: `align-y(N1, N4), above(N2, N1), above(N4, N3), align-y(N3, N2)` — classes {N1,N4} and {N2,N3} are V-ordered in both directions. The solver detects this via `hasAlignmentClassCycle`, which contracts the ordering graph by alignment equivalence classes and checks for cycles among super-nodes.

### 4.5 Bounding-Box Containment Semantics

A `BoundingBoxConstraint(node=X, group=G, side='left')` asserts that X is to the left of the group's bounding box. Since the bounding box must **contain all members** of G, this implicitly means X must be to the left of **every member** of G. The solver checks this containment invariant:

- `side=left`: X left of group → infeasible if any member M is already ordered left of X (`M → X` in H-graph)
- `side=right`: X right of group → infeasible if X is already ordered left of any member M (`X → M` in H-graph)
- `side=top`: X above group → infeasible if any member M is already ordered above X (`M → X` in V-graph)
- `side=bottom`: X below group → infeasible if X is already ordered above any member M (`X → M` in V-graph)

This check fires in both `isAlternativeFeasible` (pre-solve pruning) and `addQualitativeEdge` (CDCL commit). Without it, the qualitative abstraction is unsound for cases where a non-member node has both alignment and ordering relationships with group members — the virtual group node alone doesn't capture the containment geometry.

**Example**: `align-x(N2, N5), above(N2, N5), above(N5, N0), Group G0={N0, N1, N2}`. N5 is x-aligned with member N2 (can't be left/right of G0), must be below N2 (can't be above G0), and must be above N0 (can't be below G0). All four BoundingBox sides are infeasible → UNSAT. The containment check detects the above/below infeasibility that the virtual-node cycle check alone would miss.

---

## 5. Virtual Group Nodes

Groups are encoded using **virtual nodes** in the H/V graphs, an approach that keeps group constraints O(non-members) rather than O(non-members × members).

For a group G with members {m1, m2, m3}, a virtual node `_group_G` is created in both graphs. A `BoundingBoxConstraint(node=X, group=G, side='left')` becomes a single edge `X → _group_G` in the H-graph — meaning "X is left of the group's bounding region."

Virtual nodes have **size 0** in the weighted graph, so they contribute only gap spacing to chain computations. The members' individual dimensions are accounted for through their own edges.

Group-to-group separation uses edges between virtual nodes: `_group_A → _group_B`.

**Important**: the virtual group node is a lightweight proxy — it does **not** have edges to/from its own members in the ordering graph. Containment semantics (the group box must encompass all members) are enforced separately via the `isBoundingBoxFeasible` check (Section 4.5), which verifies that placing a node on a given side of the group is consistent with the node's ordering relationships to individual members.

---

## 6. Solver Phases

The validator executes in 9 sequential phases:

| Phase | Action | Can fail? |
|---|---|---|
| 1 | Add all conjunctive constraints to H/V graphs and alignment UFs | Yes (cycle, alignment conflict) |
| 2 | Check dimension feasibility (longest chain ≤ MAX_SPAN) | Yes |
| 3 | Check pigeonhole on alignment classes | Yes |
| 4 | Generate group bounding-box disjunctions (virtual group nodes) | No |
| 5 | Collect all disjunctive constraints | No |
| 6 | Pre-solve: resolve trivial disjunctions before CDCL | No (commits or prunes) |
| 7 | CDCL search on remaining disjunctions | Yes (UNSAT) |
| 8 | Compute implicit alignment ordering constraints | No |
| 9 | Detect node overlaps (dual-aligned nodes occupying same position) | Yes |

Early phases handle the cheap, deterministic checks. CDCL search (phase 7) only fires if disjunctions remain after pre-solving.

---

## 7. Data Structures

| Structure | Purpose | Operations |
|---|---|---|
| `WeightedPartialOrderGraph` | H and V strict partial orders as DAGs. Nodes carry axis dimensions. | `addEdge` (O(V+E) cycle check), `canReach` (BFS), `longestChainSpan` (topo DP), `wouldOverflow`, `clone` |
| `UnionFind` | Alignment equivalence classes (`Xeq`, `Yeq`). | `union`, `find`, `connected`, `snapshot`/`restore`, `clone` |
| `LearnedClause[]` | Accumulated conflict-driven clauses across restarts. | Append, scan during unit propagation |
| `Assignment[]` (trail) | Stack of decisions and propagations at each decision level. | Push on assign, truncate on backtrack |
| `Map<string, number>` (activity) | VSIDS scores per `(disjunction, alternative)` pair. | Bump on conflict, decay globally |

---

## 8. Complexity

- **Conjunctive phase**: O(C × (V + E)) where C = number of conjunctive constraints, V + E = graph size (BFS cycle check per edge addition).
- **Pre-solve**: O(D × A × (V + E)) where D = disjunctions, A = max alternatives per disjunction.
- **CDCL worst case**: exponential in the number of disjunctions (inherent to the satisfiability problem). In practice, geometric pruning and clause learning keep it fast — the 10-group × 5-member benchmark (50 nodes, ~200 disjunctions) solves in ~25ms.
- **Space**: O(V² + L) where L = learned clauses accumulated across restarts.

---

## 9. Relationship to the Kiwi Constraint Validator

The original `ConstraintValidator` (in `constraint-validator.ts`) uses the Kiwi/Cassowary linear programming solver directly for both feasibility checking and coordinate assignment. It handles disjunctions by **cloning the entire solver state** at each branch point — effectively a depth-first backtracking search over LP snapshots.

The qualitative validator replaces only the **search and feasibility** portion:

| Concern | Kiwi Validator | Qualitative Validator |
|---|---|---|
| Feasibility check | LP solve per branch | DAG cycle check + chain span |
| Disjunction search | Clone-and-backtrack LP | CDCL with clause learning |
| Coordinate assignment | Same LP solve | Deferred to Kiwi/WebCola |
| Group encoding | Per-member constraints | Virtual group nodes (O(1) per group edge) |
| Conflict diagnosis | Last failing LP constraint | Learned clauses + minimal conflict set |

The qualitative approach is faster when the problem has many disjunctions (group exclusion, non-overlap) because graph operations (BFS reachability, union-find) are much cheaper than LP cloning, and CDCL avoids redundant exploration through clause learning.

---

## 10. Conflict Diagnosis: IIS and Maximal Feasible Subsets

When the solver proves UNSAT, it produces two diagnostic artifacts:

### Irreducible Infeasible Subsystem (IIS)

A **minimal set of constraints** that is itself infeasible — removing any single constraint from the IIS would make it feasible. The solver computes this differently depending on the conflict type:

- **Ordering cycle** (conjunctive phase): `findMinimalConflictSet` finds the cycle path in the H/V graph via BFS from the conflicting edge's target back to its source, then maps each path edge back to the `addedConstraints` that created it.

- **Alignment-ordering conflict** (within-class or cross-class): `findAlignmentConflictSet` identifies the conflicting alignment classes and ordering paths:
  - *Within-class*: finds two aligned nodes `(a, b)` that are transitively ordered, collects the alignment constraints forming their class + the ordering path `a → ... → b`.
  - *Cross-class cycle*: finds two alignment classes mutually ordered (A→B and B→A), collects alignment constraints forming both classes + one ordering path in each direction.

- **CDCL UNSAT** (disjunctive phase): `buildUnsatResult` uses `computeMaximalFeasibleSubset` (see below) to identify which disjunctions are infeasible.

### Maximal Feasible Subset (MFS)

The **largest subset of constraints that can be simultaneously satisfied**. This tells the user "here's what we *can* keep."

- For **CDCL UNSAT**: `computeMaximalFeasibleSubset` builds a fresh pair of H/V graphs, greedily adds disjunctions (prioritizing low-activity ones — i.e., those least involved in conflicts), and reports which disjunctions couldn't be added.

- For **alignment conflicts**: the MFS is `addedConstraints \ IIS` — all committed constraints not in the irreducible infeasible set. Since any single removal from the IIS breaks the cycle, this is a valid maximal feasible subset.

Both are exposed on the `PositionalConstraintError` return type as `minimalConflictingSet` (IIS, grouped by source constraint) and `maximalFeasibleSubset` (MFS, flat list of layout constraints).

### Determinism

IIS extraction is **deterministic**: the same (input, spec) pair always produces the same IIS. This is important for UX consistency — users should not see different error explanations on repeated runs.

Determinism is enforced by canonical ordering at every decision point in the IIS computation:

- **`findPath` BFS**: successors are sorted lexicographically before exploration, so the same shortest path is always selected when multiple exist.
- **`UnionFind.classes()`**: members within each equivalence class are sorted, ensuring alignment class iteration order is stable.
- **`findAlignmentConflictSet` / `hasAlignmentClassCycle`**: alignment class roots are sorted before iterating, so the same conflict is found first when multiple exist.
- **`computeMaximalFeasibleSubset`**: the VSIDS activity sort uses the original disjunction index as a stable tiebreaker for equal scores.
