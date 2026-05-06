# Literature review — who's who in the sequences-of-states evaluation

A scan-friendly map of every paper cited in the RQ6.2 evaluation:
**who they were, what they did, what they showed, and where in our
work it appears.** Use as a reference when a committee member asks
"where does *that* come from?"

---

## Headline citations by role

| Role | Headline citation | What it buys us |
|---|---|---|
| Closest prior work | **Diehl & Görg (GD 2002)** | The change-stability axis our four policies sit on. |
| Mental-map metrics | **Misue, Eades, Lai, Sugiyama (JVLC 1995)** | Orthogonal-ordering and k-NN thresholds we test `stability` against. |
| Smoothness metrics | **Friedrich & Eades (JGAA 2002)** | Velocity / acceleration / arclength as a separate concern from drift. |
| Consistency metrics (this thesis line) | **Penlloy (PLATEAU 2025)** | The three squared-error metrics in spytial-core: positional, relative, pairwise-distance. |
| Partial-consistency / two-level split | **Liang et al. (TOSEM 2026, in submission)** | The substructure-based "what should stay vs. what should move" framing. Underpins our changed/stable AUC. |
| Empirical pushback (why we don't claim reader benefit) | **Archambault, Purchase & Pinaud (TVCG 2011)** | Animation vs small-multiples user study. Preservation wins tracking; small multiples win comparison. |
| Benchmark materials | **CLRS (Cormen et al. 2009)** | The four algorithms in §3. |

---

## The structural-metrics line — what each paper buys

### Diehl & Görg (GD 2002) — *Graphs, they are changing — dynamic graph drawing for a sequence of graphs*

The closest prior work. They introduced **foresighted layout** for
incremental graph change and framed the problem as an explicit
**change-stability tradeoff**: a layout that fully preserves prior
positions cannot also accommodate structural change, and vice versa.
**Our four policies sit on their axis.** Their preserved-layout end ≈
our `stability`; their fresh-layout-per-frame end ≈ our
`ignore_history`. `change_emphasis` is a deliberate move toward the
change pole that pins unchanged context; `random_positioning` is
off-axis.

What we add: we run their tradeoff inside a **constraint-based**
layout (spytial uses WebCola plus declarative spec constraints), not
a force-directed or Sugiyama-hierarchical one. We also add the
two-level changed/stable split. **Headline citation for "where does
this idea come from?"**

### Misue, Eades, Lai, Sugiyama (JVLC 1995) — *Layout adjustment and the mental map*

The seminal mental-map paper. Defined three quantifications:

1. **Orthogonal ordering** — do node-pair left/right and up/down
   relations survive across frames?
2. **Proximity** — k-nearest-neighbor set overlap.
3. **Topological structure** — pairwise distances.

We implement (1) and (2) directly as
`orthogonal_ordering_preservation` and `knn_jaccard` in
[`runner/derived_metrics.py`](runner/derived_metrics.py); (3) is
folded into `pairwise_distance_norm`. **Headline citation for "what
does mental-map preservation *mean* operationally?"**

### Friedrich & Eades (JGAA 2002) — *Graph drawing in motion*

Argued that **smoothness is a separate concern from drift**. Per-atom
velocity, acceleration, and arclength across the *whole* trace, not
just frame pairs. Two layouts can have identical positional drift but
read very differently if one lurches once and the other moves evenly.

Implemented as `velocity_max`, `velocity_mean`,
`acceleration_max`, `arclength_mean` (and their `_norm` companions)
in [`runner/derived_metrics.py`](runner/derived_metrics.py). **Headline
citation for "why a separate smoothness battery?"**

### Penlloy (PLATEAU 2025), §6.2

Defined the three squared-error consistency metrics over post-solver
positions:

- **Positional consistency** — per-node coord-drift².
- **Relative consistency** — per-edge-vector drift².
- **Pairwise-distance consistency** — per-pair-distance drift².

These are the *running-code* baseline. They live in
`spytial-core/src/evaluation/consistency-metrics.ts`; our
`positional`, `relative`, `pairwise_distance` columns in
[`results/aggregate.csv`](results/aggregate.csv) come straight from
this paper. **Headline citation for "where do the squared-error
metrics come from?"**

### Liang et al. (TOSEM 2026, in submission), §2.6.1 and §3.4

Generalized Penlloy's metrics to a **partial-consistency** framework:
a chosen substructure (a subset of nodes whose shape we care about)
is held tight while the rest reflows. Their argument: real diagrams
have *focal* substructure — you don't want consistency over
*everything*, you want it over the *right things*.

**This is the theoretical underpinning of our two-level split.**
`classifyChangeEmphasisChangedSet` returns the substructure complement
(the changed set); `changeEmphasisSeparation` reports each consistency
metric restricted to the stable subset and to the changed subset
separately. Our headline `changed_vs_stable_auc` is a rank-based
reading of their displacement-ratio metric.

Liang is also the citation behind the *consistency-helps-legibility*
argument we open §1 with — they argue that visual consistency across
frames is what makes a sequence of diagrams legible. **Headline
citation for "why is consistency over substructure the right thing to
measure?"**

### Brandes, Indlekofer & Mader (Social Networks 2011) — *Visualization methods for longitudinal social networks and stochastic actor-oriented modeling*

Survey paper. Useful for context questions about **dynamic-stress**
metrics and time-evolving graph layout in the social-networks
literature. We don't directly implement their metrics — cited as the
survey-of-record for the dynamic-graph metric battery's broader
heritage.

---

## The empirical-pushback line — why we don't claim reader benefit

### Archambault, Purchase & Pinaud (TVCG 2011) — *Animation, small multiples, and the effect of mental-map preservation in dynamic graphs*

The headline empirical-pushback citation. Compared two display
formats on the same dynamic graph:

- **Animated diagrams** with high mental-map preservation (smooth
  position carry-over across frames — our `stability` analogue).
- **Small multiples** with no preservation (each frame laid out fresh,
  shown side by side — our `ignore_history` analogue).

Measured time and accuracy on different reader-task types.
**Preservation won on path-tracing and motion-detection tasks.**
**Small multiples won on counting and comparison tasks.** The result
is task-dependent: "consistency helps readers" is true *for some
tasks* and false for others.

**This is *the* citation** for why our report stops at structural
metrics and defers reader-benefit claims to the Prolific follow-up
(report §6).

### Purchase, Hoggan & Görg (GD 2007) — *How important is the mental map? An empirical investigation of a dynamic graph layout algorithm*

Earlier empirical-pushback paper. Found mental-map preservation has
**weak and inconsistent effects** on user task performance. The first
dynamic-graph user study to show the mental-map → reader-benefit link
isn't automatic. Cited together with Archambault when defending the
structural-only scope.

### Saffrey & Purchase (AUIC 2008) — *The "mental map" versus "static aesthetic" compromise in dynamic graphs: a user study*

Companion empirical study. Found that purely mental-map-optimized
layouts can be aesthetically *worse* than static-aesthetic layouts,
even when they preserve more structure. Reinforces the point that
structural metrics and reader-experience metrics can diverge.

---

## Algorithm-visualization context

### Brown (ACM Distinguished Dissertations 1988) — *Algorithm Animation*

Historical anchor — the BALSA system. Cited so the committee knows
the algorithm-animation tradition exists and that we deliberately use
CLRS data structures because that field validated them as benchmark
material.

### Hundhausen, Douglas & Stasko (JVLC 2002) — *A meta-study of algorithm visualization effectiveness*

The field's reckoning. Found that **animation alone doesn't reliably
help students learn algorithms** — what helps is engagement.
Important: if a committee asks "doesn't algorithm animation already
work?", the answer is "the meta-study says no — engagement matters,
not animation." Our scope is consistent: we use CLRS as benchmark
stress tests, not as a learning claim.

### Naps et al. (SIGCSE 2002) — *Exploring the role of visualization and engagement in computer science education*

Defined the **engagement taxonomy**: viewing < responding < changing
< constructing < presenting. Cited together with Hundhausen et al.
for the "engagement matters more than animation" framing.

---

## Cognitive-science grounding

### Gibson (1955) — *Perceptual continuity*

Cited as the cognitive basis for `stability`'s preservation principle:
human visual perception groups a moving thing as the same thing only
when its motion is continuous. Cited in
`Thesis_Proposal/proposed-beyond-host.tex:47` as the basis for "fresh
layout for each state can destroy perceptual continuity."

### Goldstone (1994) — *The role of similarity in categorization* (Cognition 52(2))

**Contrasting cases.** Cited as the cognitive basis for
`change_emphasis`: making a difference visually salient is what lets
a reader categorize the *kind* of change.

---

## Benchmark material

### Cormen, Leiserson, Rivest & Stein (2009) — *Introduction to Algorithms* (CLRS, 3rd ed.)

The four algorithms in report §3 come from CLRS:

- **Red-Black tree insert + delete** — Ch. 13.
- **Disjoint-Set Forest with MAKE-SET + UNION** — Ch. 21.
- **Dijkstra's shortest-paths algorithm on Fig 24.6** — Ch. 24.
- **Max-Heap insert + extract-max** — Ch. 6.

Picked for paradigm coverage: pointer tree with rotations, forest
with edge-only mutation, fixed graph with attribute change,
array-backed implicit binary tree. Citing CLRS makes the benchmark
choice defensible (textbook canonical) and the implementations
comparable to other algorithm-trace evaluations.

---

## How to use this in front of the committee

If a committee member asks…

- **"Where does the change-stability axis come from?"**
  → Diehl & Görg (GD 2002).
- **"What does 'mental-map preservation' mean operationally?"**
  → Misue et al. (JVLC 1995). They defined the three quantifications
  (orthogonal ordering, k-NN, topological structure); we test
  against the first two.
- **"Why are you measuring smoothness separately from drift?"**
  → Friedrich & Eades (JGAA 2002). Two layouts with identical drift
  can read very differently if one lurches.
- **"Where do the squared-error consistency metrics come from?"**
  → Penlloy (PLATEAU 2025). The running-code baseline in
  spytial-core.
- **"Why is consistency over a *substructure* the right thing to
  measure, instead of consistency over all atoms?"**
  → Liang et al. (TOSEM 2026), §2.6.1 and §3.4. Their
  partial-consistency framework is the underpinning of our two-level
  changed/stable split.
- **"Doesn't preserving the mental map always help readers?"**
  → No — Archambault, Purchase & Pinaud (TVCG 2011) showed it's
  task-dependent. Preservation wins for tracking; small multiples
  win for comparison. That's why we stop at structural metrics and
  put a behavioral study in §6.
- **"Hasn't algorithm animation already been studied for learning?"**
  → Yes — Hundhausen, Douglas & Stasko (JVLC 2002) meta-study
  showed animation alone doesn't reliably help; engagement does.
  We use CLRS as benchmark stress tests, not as a learning claim.
- **"Why these four algorithms?"**
  → CLRS (Cormen et al. 2009). Picked for paradigm coverage —
  pointer tree, forest, fixed graph, array-backed implicit tree.
