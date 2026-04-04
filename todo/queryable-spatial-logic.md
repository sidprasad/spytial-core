# Queryable Spatial Logic: Research Direction

## The Architectural Parallel

Spytial has two layers of structured information:

| | **Data layer** | **Layout layer** |
|---|---|---|
| **Structure** | `IDataInstance` — atoms, relations, tuples | `InstanceLayout` — nodes, constraints, groups |
| **Evaluator** | `IEvaluator` / `SGraphQueryEvaluator` | **missing** |
| **Query** | `"left.val"` → what is Node0's left child's value? | `"must.leftOf(Node0)"` → what must be left of Node0? |
| **Logic** | Relational (Forge/Alloy-style joins, closures) | Spatial constraint logic (conjunctions, disjunctions, negation) |

The `SGraphQueryEvaluator` queries the datum: atoms, relations, tuples. It answers "what *is*" questions about the data. What's missing is the parallel evaluator over the layout: one that answers "what *must be*, what *can be*, what *cannot be*" questions about the spatial arrangement.

The layout already has the logical machinery for this. `InstanceLayout` stores:
- **Conjunctive constraints** (`constraints: LayoutConstraint[]`) — all must hold
- **Disjunctive constraints** (`disjunctiveConstraints: DisjunctiveConstraint[]`) — at least one alternative per disjunction
- **Negation** (`negateAtomicConstraint`, `negateConjunction`, `negateDisjunction`) with De Morgan's law
- **Type guards** for each constraint kind (TopConstraint, LeftConstraint, AlignmentConstraint, BoundingBoxConstraint, GroupBoundaryConstraint)

This is already a formula in a spatial constraint logic. It just doesn't have an evaluator.

## `ILayoutEvaluator`: The Missing Piece

```typescript
interface ILayoutEvaluator {
  initialize(layout: InstanceLayout): void;
  isReady(): boolean;

  // Modal spatial queries
  must(query: SpatialQuery): IEvaluatorResult;   // entailed by all satisfying assignments
  can(query: SpatialQuery): IEvaluatorResult;    // consistent with at least one assignment
  cannot(query: SpatialQuery): IEvaluatorResult; // contradicted by all assignments

  // Compose with data evaluator
  evaluateHeterogeneous(
    dataQuery: string,              // Forge expression over IDataInstance
    spatialQuery: SpatialQuery,     // spatial query over InstanceLayout
    dataEvaluator: IEvaluator       // the datum evaluator
  ): IEvaluatorResult;
}

interface SpatialQuery {
  relation: 'leftOf' | 'rightOf' | 'above' | 'below' | 'aligned' | 'grouped' | 'contains';
  nodeId: string;
  transitive?: boolean;  // follow transitive closure
}
```

**`must`** = the query holds in every satisfying assignment of the constraint system. Computed by: the constraint (or its transitive closure) is in the conjunctive set, or it is entailed by all alternatives of every relevant disjunction.

**`can`** = the query holds in at least one satisfying assignment. Computed by: there exists some consistent selection of disjunctive alternatives where the query holds.

**`cannot`** = the query holds in no satisfying assignment. Computed by: `can` returns empty, or the negation of the query is in `must`.

The three modalities mirror Alloy's analysis: `must` is like checking a universal assertion, `can` is like finding a satisfying instance, `cannot` is like proving unsatisfiability.

## Why This Is the Real Affordance

The AccessibleTranslator's navigation and description are useful, but they only afford **observation** — the same kind of information you get from looking at a rendered diagram. A sighted user looking at a BST doesn't just observe positions; they **reason**: "3 must be to the left of 10 because it's in the left subtree, and left children go left." That reasoning is a query over the constraint system.

The free ride property (Shimojima 1996) says diagrams give you inferences for free because structural constraints match domain constraints. But a text description or even a navigable ARIA tree doesn't preserve those free rides — you can observe individual nodes but you can't query the constraint structure. An `ILayoutEvaluator` restores the free rides by making the constraint logic directly queryable.

Barter & Coppin (Diagrams 2022) argue exactly this: WCAG text descriptions destroy the inferential advantages of diagrams. The fix isn't better descriptions. It's preserving the constraint structure in a form that supports the same reasoning.

## Heterogeneous Queries: Where It Gets Interesting

The most powerful queries cross the data/layout boundary. These are heterogeneous in Fisler's sense (1996): they combine sentential (data) reasoning with diagrammatic (spatial) reasoning in a single inference.

```
// "What must be to the left of all nodes with val > 10?"
// Data query: which nodes have val > 10?
// Layout query: what must be left of those nodes?
evaluator.evaluateHeterogeneous("val > Int[10]", { relation: 'leftOf' }, dataEvaluator)

// "Is this a valid BST?"
// For every node N with left child L: must L be spatially left of N?
// AND for every node N with left child L: must L.val < N.val?
// This requires BOTH evaluators.

// "Can Node(7) and Node(12) be at the same level?"
// Layout query: can they be aligned on y?
layoutEvaluator.can({ relation: 'aligned', nodeId: 'Node4', targetId: 'Node5', axis: 'y' })

// "What nodes cannot be in the same group as the root?"
layoutEvaluator.cannot({ relation: 'grouped', nodeId: 'Node0' })
```

The BST validity example is the clearest case of Fisler's heterogeneous reasoning: it requires checking that the data semantics (value ordering) are consistent with the spatial semantics (left/right positioning). Neither evaluator alone can answer it.

## Relation to Existing Work

### Fisler: Diagrams as Formal Objects

**Fisler, "A Unified Approach to Hardware Verification Through a Heterogeneous Logic of Design Diagrams" (PhD, Indiana, 1996); Fisler & Johnson, TPCD 1994.**
Diagrams participate in formal proofs alongside sentential formulas. A diagram's structural constraints carry logical content that should be formally exploitable. The `ILayoutEvaluator` does exactly this: it treats the InstanceLayout's constraints as a formal system and evaluates queries against it.

**Fisler, "Diagrams and Computational Efficacy" (2002).**
Diagrams change what is *computationally tractable*. Her timing diagram logic (JLLI 1999; CAV 1997) expresses context-free properties that LTL cannot — because of 2D structure. Implication: the spatial constraint structure may support queries that a flat relational encoding does not naturally afford. This argues for the layout evaluator as a *separate* reasoning engine, not just a view on the data evaluator.

**Fisler, "Two-Dimensional Regular Expressions" (FMCAD 2007).**
Extends regular expressions to 2D for concurrent-channel protocol specifications. The 2D structure is essential to the formalism, not incidental. Parallel: Spytial's constraint system is inherently 2D (left/right + above/below), and collapsing it to 1D (a flat list of facts) may lose expressiveness.

### Fisler + Krishnamurthi: Query-Based Exploration

**Margrave (ICSE 2005).**
Users pose structural queries over XACML policies; Margrave enumerates answers and supports change-impact analysis. The `ILayoutEvaluator` follows this model: pose must/can/cannot queries over the constraint system, get enumerated node sets. Change-impact analysis applies directly: given two `InstanceLayout`s (e.g., before and after adding a constraint), what spatial relationships changed?

**Aluminum (ICSE 2013).**
Presents minimal satisfying Alloy instances. When `can` queries have large answer sets, Aluminum's minimality principle applies: show the simplest arrangement consistent with the constraints. This informs how we present `can` results — not all possibilities, but the minimal ones.

**Alchemy (FSE 2008).**
Compiles Alloy specs to executable implementations. The `ILayoutEvaluator` does something analogous: compiles layout constraints to an executable query engine.

### QSR: The Reasoning Machinery

**RCC-8 (Randell, Cui, Cohn, KR 1992); Allen's Interval Algebra (CACM 1983).**
Composition tables: given the relation between A-B and B-C, infer possible relations between A-C. This is the engine for must/can/cannot. Spytial's left/right/above/below constraints map to interval-algebra-style relations. Path consistency (algebraic closure) over the composition table determines what *must*, *can*, and *cannot* hold.

**Ligozat, "Qualitative Spatial and Temporal Reasoning" (Wiley, 2013).**
Identifies tractable fragments. The three maximal tractable subclasses of RCC-8 are decidable by algebraic closure. Important for knowing which `ILayoutEvaluator` queries can be answered in polynomial time.

### Accessibility as Motivation

**Barter & Coppin, "A Diagram Must Never Be Ten Thousand Words" (Diagrams 2022).**
Text descriptions destroy free rides. The fix is preserving constraint structure. The `ILayoutEvaluator` is that fix: it makes the constraint logic queryable in any modality, not just visual.

**Shimojima, "Free Rides" (1996).**
Diagrams give inferences for free when structural constraints match domain constraints. The constraints in `InstanceLayout` *are* the structural constraints. The `ILayoutEvaluator` makes those free rides accessible without vision by turning implicit spatial inference into explicit queryable logic.

**TADA (Goncalves et al., CHI 2024).**
Query-like touch interaction for blind users over node-link diagrams. Supports search, navigation, filtering. But no formal logic — queries are ad-hoc. The `ILayoutEvaluator` provides the formal grounding that TADA lacks.

### Graph Query Languages

**Cardelli, Gardner, Ghelli, "A Spatial Logic for Querying Graphs" (ICALP 2002).**
Spatial connectives (composition, restriction) for querying labeled directed graphs. "Find subgraphs matching pattern P adjacent to pattern Q." Theoretical model for what layout queries could look like as a logic.

**Shin, "The Logical Status of Diagrams" (1994); Stapleton et al., Concept Diagrams (2013-2018); Speedith (2015).**
Formal diagrammatic logics with sound inference rules and implemented provers. Establish that diagram-level reasoning can be mechanized.

## The Gap

No published system combines:
1. A formal evaluator over spatial diagram constraints (not geographic data, not set-theoretic diagrams)
2. Modal queries (must/can/cannot) over that evaluator
3. Heterogeneous composition with a data-level evaluator
4. Accessibility as a first-class output

Spytial already has (3) halfway — `SGraphQueryEvaluator` for data, `InstanceLayout` with full logical machinery for constraints. The `ILayoutEvaluator` closes the loop.

## Implementation Path

### Phase 1: Conjunctive must/cannot (transitive closure)

Build the spatial navigation map from `buildSpatialNavigationMap()` (already exists in AccessibleTranslator) into an evaluator. `must.leftOf(X)` = transitive closure of LeftConstraints from X. `cannot.leftOf(X)` = nodes where X is transitively left of them (antisymmetry). This is pure graph reachability — no SAT solving needed.

### Phase 2: Disjunctive can (constraint satisfaction)

For `can` queries over disjunctive constraints: enumerate which alternatives are consistent with the query. This requires checking satisfiability of constraint subsets. For small diagrams, direct enumeration suffices. For larger ones, connect to the existing Kiwi constraint solver.

### Phase 3: Heterogeneous queries

Compose `ILayoutEvaluator` with `SGraphQueryEvaluator`. A heterogeneous query first evaluates the data subquery (Forge expression), then pipes the result node set into a spatial query. This is where the real power is — "is this a valid BST?" as a single query.

### Phase 4: Change-impact analysis (a la Margrave)

Given two `InstanceLayout`s, compute the spatial diff: which must/can/cannot relationships changed? This connects to the existing PICK-like spec diff design (two layouts + diff).

## Open Questions

1. **Query syntax**: Should the layout evaluator accept Forge-like string expressions (consistent with `SGraphQueryEvaluator`) or a structured query API? String expressions are more composable but require a grammar extension.

2. **Tractability boundaries**: Conjunctive must/cannot is polynomial (graph reachability). Disjunctive can is NP in general (constraint satisfaction). Where does the practical boundary lie for typical Spytial diagrams?

3. **Interaction modality**: For accessibility, should queries be posed via natural language, structured commands, or navigational gestures (arrow key + modifier = "show me everything that must be in this direction")?

4. **Result presentation**: Aluminum's minimality principle for `can` queries. For `must` queries, should we show the proof (which constraints entail this) or just the answer?
