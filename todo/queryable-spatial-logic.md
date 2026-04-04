# Queryable Spatial Logic: Research Direction

The AccessibleTranslator compiles `InstanceLayout` constraints to navigation and description. But the constraints encode more than layout — they are **logical assertions about spatial relationships**. This document outlines a research direction: exposing the constraint system as a queryable logic, enabling must/can/cannot reasoning over diagram structure.

## The Core Idea

Spytial's constraints are facts in a spatial logic:

```
left(Node0, Node1)       // LeftConstraint
left(Node1, Node3)       // LeftConstraint
group(BSTNodes, Node0)   // BoundingBoxConstraint
```

From these facts, composition and inference give us:

- **Must**: `left(A,B) ^ left(B,C) -> left(A,C)` — "Node(10) must be right of Node(3)"
- **Can**: No constraint orders Node(7) and Node(12) — they can be in either arrangement
- **Cannot**: `left(A,B) -> ~left(B,A)` — "Node(5) cannot be to the right of Node(10)"
- **Grouped**: `group(G,A) ^ group(G,B)` — must be co-grouped. No shared group -> cannot be grouped.

This is not description. It is **reasoning over the diagram's logical content** — the same kind of reasoning a sighted user performs by inspection ("I can see that 3 must be further left than 10 because of the tree structure") but made explicit and queryable.

## Related Work

### Diagrams as First-Class Logical Objects

**Fisler, "A Unified Approach to Hardware Verification Through a Heterogeneous Logic of Design Diagrams" (PhD, Indiana, 1996); Fisler & Johnson, TPCD 1994.**
Defines a heterogeneous logic where hardware diagrams participate in formal proofs alongside sentential formulas. Diagrams are not informal aids — they are objects with inference rules. The key principle: a diagram's structural constraints carry logical content that should be formally exploitable, not flattened into a different representation.

**Fisler, "Diagrams and Computational Efficacy" (2002).**
Argues that diagrams change what is *computationally tractable*, not just what is cognitively natural. Her timing diagram logic (Fisler, JLLI 1999; CAV 1997) can express context-free and context-sensitive properties that linear temporal logics like LTL cannot — strictly because of the 2D diagrammatic structure. The implication for Spytial: the spatial constraint structure may support queries that a flat relational encoding does not naturally afford.

**Shin, "The Logical Status of Diagrams" (Cambridge, 1994).**
Formalizes Venn diagrams as a logic (Venn-I, Venn-II) with syntax, semantics, and inference rules. Venn-II is sound, complete, and expressively equivalent to monadic first-order logic. Establishes the precedent that diagrammatic representations can be rigorous formal systems.

**Stapleton et al., Spider Diagrams (2004-2005); Concept Diagrams (2013-2018).**
Extend Euler diagrams with existential witnesses ("spiders") and binary-relation arrows. Concept diagrams support reasoning about OWL ontology axioms — detecting inconsistencies and entailments diagrammatically. Sound inference rules operate on diagram structure. Speedith (Urbas & Jamnik, 2015) implements an interactive theorem prover for spider diagrams.

**Barwise & Etchemendy, "Hyperproof" (1994).**
A heterogeneous logic mixing first-order sentential reasoning with diagrammatic reasoning about blocks-world configurations. Proofs can transfer information between modalities. Demonstrates that formal reasoning can operate across representational formats.

### Query-Based Analysis of Formal Structures

**Fisler, Krishnamurthi, Meyerovich, Tschantz, "Verification and Change-Impact Analysis of Access-Control Policies" (ICSE 2005) — the Margrave tool.**
Translates XACML policies into MTBDDs and supports *query-based analysis*: users pose structural questions ("who can access what under which conditions?") and Margrave enumerates answers. Also supports *change-impact analysis* — given two policy versions, what differs? This is the interaction model for queryable diagram logic: pose a question about the constraint system, get enumerated answers.

**Nelson, Saghafi, Dougherty, Fisler, Krishnamurthi, "Aluminum: Principled Scenario Exploration through Minimality" (ICSE 2013).**
Modifies Alloy's constraint solver to present *minimal* satisfying instances — no unnecessary structure. Addresses the usability problem of overwhelming counterexamples. Directly relevant to presenting query results: when asking "what can be left of X?", show the simplest arrangement that satisfies the constraint.

**Jackson, "Software Abstractions: Logic, Language, and Analysis" (MIT Press, 2006/2012).**
Alloy's relational logic — first-order logic with transitive closure and relational join. Models are found by SAT-solving bounded instances. Spytial already uses relational queries over data instances (SGraphQueryEvaluator). The gap is applying the same relational query machinery to the *constraint/layout* layer.

### Qualitative Spatial Reasoning (QSR)

**Randell, Cui, Cohn, "A Spatial Logic Based on Regions and Connection" (KR 1992) — RCC-8.**
Eight jointly exhaustive, pairwise disjoint topological relations (disconnected, externally connected, partial overlap, equal, proper part, etc.) with a composition table. Given the relation between A-B and B-C, infer possible relations between A-C. This is the reasoning engine for must/can/cannot queries over spatial constraints.

**Allen, "Maintaining Knowledge about Temporal Intervals" (CACM 1983).**
Thirteen interval relations with a composition table. The template for all qualitative calculi. Spytial's left/right/above/below constraints are interval-like: they define qualitative ordering without exact positions.

**Ligozat, "Qualitative Spatial and Temporal Reasoning" (Wiley, 2013).**
Unifies Allen, RCC-8, cardinal directions under a single algebraic framework (relation algebras, constraint networks, algebraic closure). Identifies tractable fragments — important for knowing which queries can be answered efficiently.

**Stocker & Sirin, "PelletSpatial" (OWLED 2009); GeoSPARQL (OGC 2022).**
Make QSR queryable: PelletSpatial wraps RCC-8 in SPARQL; GeoSPARQL standardizes spatial queries on RDF data. These target geographic data, but the query patterns (SPARQL + spatial composition) transfer to abstract diagram constraints.

### Diagram Accessibility and the "Free Ride" Problem

**Barter & Coppin, "A Diagram Must Never Be Ten Thousand Words" (Diagrams 2022).**
Argues formally that WCAG text descriptions destroy Shimojima's "free ride" property — the automatic consequential information that diagrams provide because their structural constraints match domain constraints. Accessible representations must preserve constraint structure. This is the theoretical justification for queryable spatial logic as an accessibility mechanism: if text descriptions lose the free rides, and free rides come from constraint structure, then exposing the constraints as queryable logic *restores* the free rides non-visually.

**Shimojima, "Semantic Properties of Diagrams and Their Cognitive Relevance" (1996).**
Defines "free rides" formally: when a representation's structural constraints match the target domain's constraints, consequences become readable without explicit inference. Spytial's constraints *are* the structural constraints — they directly encode spatial free rides. A query interface makes those free rides accessible without vision.

**Goncalves et al., "TADA: Making Node-Link Diagrams Accessible" (CHI 2024).**
Touch-and-audio exploration of node-link diagrams for blind users. Supports search, navigation, filtering, overview queries. Preserves some structural properties through sonification. But no formal logic underneath — queries are ad-hoc, not grounded in the diagram's constraint system.

### Cardelli's Spatial Logic for Graphs

**Cardelli, Gardner, Ghelli, "A Spatial Logic for Querying Graphs" (ICALP 2002).**
Defines a logic with spatial connectives (composition, restriction) for querying labeled directed graphs. You can express "find all subgraphs matching pattern P adjacent to pattern Q." Not about physical space, but about structural/spatial organization. Provides a theoretical model for what a query language over Spytial layouts could look like — graph queries with spatial composition operators.

## Where Spytial Sits

No published system combines:
1. A formal logic over spatial diagram constraints (not geographic, not set-theoretic)
2. A query language for must/can/cannot reasoning over that logic
3. Accessibility as a first-class output modality

The pieces exist separately:
- Fisler's heterogeneous logic: diagrams as formal objects with inference rules
- Margrave/Aluminum: query-based exploration of formal structures
- QSR composition tables: reasoning machinery for spatial must/can/cannot
- Barter & Coppin: theoretical argument that accessibility requires preserving constraint structure

Spytial is uniquely positioned because the `InstanceLayout` already is a constraint structure — not pixel positions, not visual rendering, but abstract spatial assertions. The `SGraphQueryEvaluator` already supports relational queries over data instances. Extending this to spatial constraints would close the loop: data queries ("what is Node(10)'s left child?") + constraint queries ("what must be to the left of Node(10)?") + accessibility output.

## Possible Query Interface

Building on Margrave's interaction model:

```
// Must queries (entailed by constraints)
must.leftOf("Node0")        // -> ["Node1"] — LeftConstraint(Node0, Node1)
must.leftOf("Node0", transitive=true)  // -> ["Node1", "Node3"] — transitive closure

// Can queries (consistent with constraints)
can.leftOf("Node5")         // -> ["Node6", ...] — no constraint prevents it

// Cannot queries (contradicted by constraints)
cannot.leftOf("Node1")      // -> ["Node0"] — would contradict left(Node0, Node1)

// Grouped queries
must.coGrouped("Node0", "Node1")    // -> true if both in same group
can.beGrouped("Node3", "Node6")     // -> true if no constraint prevents it

// Change-impact (a la Margrave)
// Given two InstanceLayouts, what spatial relationships changed?
diff.newConstraints(layout1, layout2)
diff.removedConstraints(layout1, layout2)
```

These queries compose with the existing SGraphQueryEvaluator:

```
// "What must be to the left of all nodes whose val > 10?"
const highValueNodes = evaluator.query("Node.val > 10");  // data query
highValueNodes.flatMap(n => must.leftOf(n.id));            // constraint query
```

## Open Questions

1. **Tractability**: Which fragments of the spatial constraint logic admit efficient query answering? QSR composition tables give polynomial path consistency for the basic relations, but transitive closure + grouping may be harder.

2. **Completeness**: The constraint system is often *under-specified* — many arrangements are consistent. "Can" queries may have large answer sets. How to present these usefully? Aluminum's minimality principle applies here.

3. **Interaction model**: Margrave uses a command-line query interface. For accessibility, should queries be posed via natural language ("what must be left of the root?"), structured commands, or navigational actions (arrow key + modifier = "show me everything that must be in this direction")?

4. **Connecting data and constraint queries**: The most interesting questions cross the boundary — "is this a valid BST?" requires checking that data ordering (val) is consistent with spatial ordering (left/right constraints). This is heterogeneous reasoning in Fisler's sense.
