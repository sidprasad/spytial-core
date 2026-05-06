# RQ6.2 — Sequencing analysis plan

**The research question, verbatim** ([guzdial-chart.md:36](../Thesis_Proposal/guzdial-chart.md)):

> *How can spatial specifications remain coherent across sequences of
> changing values?*

This document is the analysis plan for that question, with initial
structural data to back it. It is written for committee defense, not
for a paper. The argument is grounded in three established literatures:
the **mental-map** tradition (Misue 1995, Friedrich & Eades 2002), the
**empirical pushback** that complicates it (Purchase et al. 2007;
Archambault, Purchase & Pinaud 2011), and the **partial-consistency**
formalization that gives it falsifiable structure (Penlloy 2025; Liang
et al. 2026). Each metric we report is justified against one of these
lines; each scope deferral is justified against another.

---

## 1. Why this question, in the literature

A spec in a declarative diagramming language describes what one
diagram should look like. When the input is a *sequence* — successive
states of an algorithm, a Forge temporal trace, debugger snapshots —
each frame is locally valid against the spec, but consecutive frames
can jump around in ways that destroy the sequence's legibility. This
is not a new observation. It has had three waves of treatment in the
graph-drawing and HCI literatures, and the realization-policy proposal
sits in dialogue with all three.

### Wave 1: the mental map (Misue 1995; Friedrich & Eades 2002)

**Misue, Eades, Lai & Sugiyama (1995)** introduced the *mental map* —
the cognitive representation a reader builds of a graph layout — and
gave three operational quantifications of when it is preserved across
a transition:

1. **Orthogonal ordering.** For each pair of nodes, do their
   left/right and up/down relationships survive?
2. **Proximity.** For each node, do its $k$ nearest neighbors stay
   the same?
3. **Topological structure.** Do pairwise distances between nodes
   stay roughly proportional?

These three are exactly what we measure under `stability` (§4 below).
A passing `stability` is a definitional claim that mental-map
preservation, *as Misue et al. operationalized it*, holds.

**Friedrich & Eades (2002), *Graph Drawing in Motion*,** added a
separate concern: smoothness across the *whole* trace, not just
between frame pairs. Two layouts can have identical positional drift
but read very differently if one moves evenly and the other lurches
once. They argued for per-atom velocity, acceleration, and arclength
across the trace. We measure all three (§4).

### Wave 2: the empirical pushback (Purchase 2007; Archambault et al. 2011)

The mental-map literature has its own internal critique, and it is
the reason this thesis stops at *structural* metrics rather than
claiming reader benefit.

**Purchase, Hoggan & Görg (2007), GD,** ran the first dynamic-graph
user study testing whether mental-map-preserving layouts actually
helped on user tasks. They found **weak and inconsistent effects**.
The implication: the link from "preserves the mental map" to "helps
the reader" is not automatic.

**Saffrey & Purchase (2008)** found that purely mental-map-optimized
layouts can be aesthetically *worse* than static-aesthetic layouts,
even when they preserve more structure. Reinforces the gap.

**Archambault, Purchase & Pinaud (2011), TVCG,** is the cleanest
version of this critique to date. They compared two display formats
on the same dynamic graphs:

- **Animated layouts** with high mental-map preservation (smooth
  position carry-over across frames) — equivalent to our `stability`.
- **Small-multiples displays** (each frame laid out fresh, displayed
  side-by-side, no preservation) — equivalent to our `ignore_history`.

Tested on multiple reader-task types. **Preservation won
path-tracing and motion-detection tasks**; **small-multiples won
counting and comparison tasks.** The result is **task-dependent**:
"consistency helps readers" is true for some tasks and false for
others.

This is *the* reason this thesis defers reader-benefit claims. The
proposal's evaluation contract makes it explicit
([guzdial-chart.md:131](../Thesis_Proposal/guzdial-chart.md)): *"Do
not require an RQ6 user study."* Behavioral validation comes after
the structural metrics show visible differences between policies. §7
proposes a Prolific study designed to extend Archambault et al.
into the constraint-based-layout setting.

### Wave 3: partial consistency (Penlloy 2025; Liang et al. 2026)

The most recent line, and the one that gives the *change-stability
tradeoff* a falsifiable structure.

**Penlloy (2025), PLATEAU**, defined three squared-error consistency
metrics over post-solver positions: per-node *positional*, per-edge
*relative*, and per-pair *pairwise-distance*. These are the
running-code baseline of our harness; raw-pixel versions appear
directly in `aggregate.csv`.

**Liang et al. (2026), TOSEM,** generalized them to a
*partial-consistency framework*: a chosen substructure is held
tight while the complement reflows. Their argument is that real
diagrams have *focal* substructure — you don't want consistency over
everything, you want it over the right things. Their §2.6.1 and §3.4
define a measurable separation between a target subset and its
complement. **Our `change_emphasis` policy and the
`changed_vs_stable_auc` metric are direct operationalizations** of
their framework.

### Where Diehl & Görg fit

The *change-stability tradeoff* itself comes from **Diehl & Görg
(2002), GD**, *"Graphs, they are changing — dynamic graph drawing
for a sequence of graphs."* They introduced *foresighted layout* and
framed the underlying problem as the explicit tradeoff our four
policies span: a layout that fully preserves prior positions cannot
also accommodate structural change, and vice versa.

---

## 2. The proposed answer

From [`proposed-beyond-host.tex:54–60`](../Thesis_Proposal/proposed-beyond-host.tex):
a **realization policy** is a function from the previous frame's
solver output and the current instance to seed positions for the
current solve. The policy lives *outside* the language semantics. It
never modifies the spec; whatever positions it seeds, the constraint
solver projects onto the feasible region, so spec satisfaction is
invariant of the policy by construction.

We instantiate four canonical policies, each grounded in one of the
literatures above:

| Policy | Literature pedigree |
|---|---|
| `stability` — every persisting node starts where it was last frame | Gibson (1955) perceptual continuity; Diehl & Görg (2002) foresighted layout |
| `change_emphasis` — pin nodes whose context didn't change; jitter the rest | Goldstone (1994) contrasting cases; Liang et al. (2026) partial consistency |
| `ignore_history` — start fresh every frame | Archambault, Purchase & Pinaud (2011) small-multiples |
| `random_positioning` — random seed every frame | off-axis baseline; probe of layout invariance under the spec |

The contribution is the **mechanism** (a small language-external
layer) plus the **taxonomy** (four canonical policies, each with a
literature pedigree). The metrics in §4 are the *evidence* that each
policy does what its literature predicts.

---

## 3. What we evaluate, and what we do not

### What we evaluate

For each policy, on each trace: **does the policy do what its
literature predicts?**

- `stability` ↔ Misue (1995): orthogonal-ordering preservation
  ≥ 0.85, $k$-NN Jaccard ≥ 0.80, normalized per-atom drift small.
- `change_emphasis` ↔ Liang (2026) §3.4: changed-vs-stable
  displacement separation, $\mathrm{AUC}_{\mathrm{c}:\mathrm{s}}$
  large, stable subset quiet.
- `ignore_history` ↔ Archambault et al. (2011) small-multiples pole:
  metrics sit between `stability` and `random_positioning` on the
  Diehl-Görg axis.
- `random_positioning` ↔ off-axis: cross-seed variance reveals which
  layout properties the spec constrains vs. leaves free.

### What we do not

Three deliberate scope deferrals, each grounded in cited literature:

- **Reader-task benefit.** Archambault et al. (2011) showed
  preservation is task-dependent — wins path-tracing, loses
  comparison. Any reader-benefit claim has to specify a task.
  Deferred per [`guzdial-chart.md:131`](../Thesis_Proposal/guzdial-chart.md);
  §7 proposes the behavioral follow-up.
- **Algorithm-learning effectiveness.** Hundhausen, Douglas & Stasko
  (2002) meta-study showed animation alone doesn't reliably help
  learning; engagement does. The proposal explicitly forbids drift
  in this direction ([`guzdial-chart.md:129`](../Thesis_Proposal/guzdial-chart.md)).
- **A unified theory of cross-frame coherence.** Per
  [`critique.md:116`](../Thesis_Proposal/critique.md) the RQ6 row is
  *evidence of existence across distinct boundaries*, not a theory.

---

## 4. Method, with metric justification

### Trace families

The proposal's evaluation contract names *Forge temporal traces +
algorithm/data-structure traces with structural change*
([`guzdial-chart.md:59`](../Thesis_Proposal/guzdial-chart.md)).
Current state:

| Family | Status | Coverage |
|---|---|---|
| **CLRS algorithm traces** | ✅ done, 296 transitions | RB-tree insert+delete (Ch. 13), DSU MAKE-SET+UNION (Ch. 21), Dijkstra Fig 24.6 (Ch. 24), Max-Heap insert+extract (Ch. 6) |
| **Forge temporal traces** | ⚠️ priority gap | Highest-leverage missing piece; closes the contract |

The CLRS four are **paradigm coverage of structural-change types**
(pointer-tree rotation, forest edge mutation, fixed-graph attribute
change, array-backed implicit swap), not graph-size scale. There is
no rome-lib-equivalent for dynamic graphs — Beck, Burch, Diehl &
Weiskopf (2017, CGF) survey explicitly notes this gap.

### Metrics, justified by citation

Three families. Each metric is named by the literature it descends
from, the question it answers, and why it's the right measure for
that question.

**Family A: Consistency** (Penlloy 2025).
Squared-error drift over persisting atoms; the running-code
baseline.

| Metric | What it measures | Why this metric |
|---|---|---|
| `positional` (raw px²) | per-node coord drift² | Penlloy §6.2's headline metric |
| `relative` (raw px²) | per-edge-vector drift² | catches rotations a per-node metric misses |
| `pairwise_distance` (raw px⁴) | per-pair-distance drift² | invariant to translation/rotation; speaks to *gestalt* preservation |
| `*_norm` | divide raw by $n \cdot \mathrm{diag}^2$ | makes squared-pixel metrics cross-paradigm comparable; without normalization a per-paradigm comparison is arithmetic, not structural |
| `constraint_adherence` | spec-satisfaction post-solve | guard rail; should be 1.0 always |

**Family B: Mental-map** (Misue 1995; Friedrich & Eades 2002). The
operational definitions of mental-map preservation. We measure
exactly what these papers asked for.

| Metric | What it measures | Source |
|---|---|---|
| `orthogonal_ordering_preservation` | fraction of node-pairs whose L/R + U/D ordering survives | Misue 1995 §3.1 |
| `knn_jaccard` ($k=3$) | mean Jaccard overlap of $k$-nearest-neighbor sets | Misue 1995 §3.2 (proximity preservation) |
| `edge_crossings_delta` | absolute change in edge crossings per transition | Friedrich & Eades 2002 (used as a complement to ordering) |
| `velocity_max`, `velocity_mean` | per-atom single-frame displacement | Friedrich & Eades 2002 §4 |
| `acceleration_max` | per-atom single-frame change in displacement | Friedrich & Eades 2002 §5 — the *lurch* metric |
| `arclength_mean` | per-atom total path length over the trace | Friedrich & Eades 2002 §6 |

`stability` is tested directly against the Misue thresholds. The
Friedrich-Eades smoothness battery distinguishes "drifts evenly"
from "lurches once," which the squared-error drift metrics conflate.

**Family C: Partial consistency** (Liang et al. 2026 §2.6.1, §3.4).
Each persisting atom is classified into a changed-context set $C_n$
or stable-context set $S_n$ by edge-fingerprint diff between
frames. The classification is a syntactic property of the *data*,
not of any policy.

| Metric | What it measures | Source |
|---|---|---|
| `changed_count`, `stable_count` | sizes of $C_n$, $S_n$ | Liang 2026 §2.6.1 (substructure decomposition) |
| `changed_*` / `stable_*` | each Family A metric, restricted to one subset | Liang 2026 §3.4 (partial-consistency separation) |
| $\mathrm{AUC}_{\mathrm{c}:\mathrm{s}} = \Pr[\mathrm{drift}(c) > \mathrm{drift}(s)]$ | rank-based reading of the displacement separation | this thesis; faithful to Liang's *headline* claim while removing the dependence on absolute pixel scale |
| `stable_quiet_ratio` | fraction of $S_n$ with drift below 5 px | dual claim — not just "change is salient" but "the un-change is *truly* still" |
| `directional_coherence` | mean resultant length of unit displacement vectors over $C_n$ | Goldstone-grounded: contrasting cases work better when motion is *grouped* |
| `changed_displacement_concentration` | Gini of $C_n$ drifts | salience focality; high = a few atoms account for most drift |

The two-level partial split is the most distinctive metric family —
it operationalizes Liang's claim that *consistency over the right
substructure* is the right thing to measure, not consistency over
everything.

### Reproducibility and bootstrap

`runner/run.ts` runs every (algorithm, policy, seed) cell;
`runner/aggregate.ts` collects per-transition rows;
`runner/derived_metrics.py` computes Families B and C;
`runner/bootstrap_cis.py` produces 95% percentile CIs over
(3 seeds × N transitions) per cell. The contract at
[`guzdial-chart.md:59`](../Thesis_Proposal/guzdial-chart.md) calls
for "paired analyses with bootstrap CIs"; this is what
[`results/cells.csv`](results/cells.csv) provides.

---

## 5. Initial data

296 transitions across 4 algorithms × 4 policies × 3 seeds.
Per-policy verdicts:

- **`stability` ↔ Misue (1995). Holds on 4/4.** Orthogonal-ordering
  ≥ 0.90, $k$-NN Jaccard ≥ 0.83, normalized drift ≤ 0.025 of
  bounding-box diagonal². The mental-map preservation claim, *as
  Misue operationalized it*, holds on every paradigm tested.
- **`change_emphasis` ↔ Liang (2026) §3.4. Holds on 3/4** with a
  named failure mode on the fourth. $\mathrm{AUC}_{\mathrm{c}:\mathrm{s}}$:
  Dijkstra 1.00, DSU 0.99, Max-Heap 0.89. **RB-tree fails (0.72)**:
  delete-phase transitions flip ~59% of nodes' context, and the
  changed-context set is too large for jitter to discriminate. The
  failure mode pins a real bound: `change_emphasis` works *when the
  changed-context fraction per transition is small*.
- **`ignore_history` ↔ Archambault et al. (2011) small-multiples
  pole. Holds on 4/4.** Sits between `stability` and
  `random_positioning` on every metric. On Dijkstra (attribute-only
  trace) `pairwise_distance_norm` ≈ 0 — the default-seed layout is
  deterministic across attribute-only frames, so `ignore_history`
  gets a free *gestalt* win.
- **`random_positioning` ↔ off-axis probe.** Cross-paradigm spread:
  Max-Heap (0.62) and RB-tree (0.79) retain partial mental-map
  structure even under random seeds because their specs encode
  strong shape constraints; DSU (0.22) and Dijkstra (0.23) do not.
  The variance *itself* reports back about the specs.

### Two cross-policy findings

- **"Free salience" under `stability`.** Mean
  $\mathrm{AUC}_{\mathrm{c}:\mathrm{s}} = 0.66$ under `stability`
  without any explicit emphasis. Changed-context atoms get pulled by
  their new neighbors while stable atoms stay locked, and the
  solver's own propagation does the salience work
  `change_emphasis` is designed for. *If this generalizes beyond
  these four paradigms, it argues that explicit emphasis is
  over-engineered for many cases.*
- **The change-stability axis is paradigm-monotonic, not universal.**
  Strict ordering `stability ≤ change_emphasis ≤ ignore_history ≤
  random_positioning` on `positional_norm` holds **only on DSU**.
  RB-tree and Max-Heap have `change_emphasis` louder than
  `ignore_history`; the dependence tracks the same property that
  drives the `change_emphasis` failure mode — the changed-context
  fraction per transition.

---

## 6. Anticipated committee critique

Each named critic gets the question I expect them to press, the
answer we go in with, and what would actually rebut them.

### Josh Sunshine (CMU; programmer experience, live programming)

> *"Why should programmers care? The motivation is debugging in
> everyday workflow ([motivation.tex:21](../Thesis_Proposal/motivation.tex)).
> But the eval is on textbook CLRS. Programmers don't debug
> RB-trees; they debug their own messy code."*

CLRS is paradigm coverage, not realism — *if the policies cannot
handle a textbook RB-tree delete cascade, they certainly cannot
handle a programmer's messy heap state.* Real-debugger-state
evaluation is a separate evaluation layered on top, not the
structural baseline.

> *"What's the user-facing knob? Does the programmer pick a policy?
> Does the IDE? Does it adapt?"*

This is the right question and we don't fully answer it. The
current claim is that the four policies are well-defined and
literature-grounded; *who chooses, and how* is a UI question that
follows the structural results — and is the obvious follow-up
chapter or stretch contribution if the defense pushes for it.

> *"Engagement matters more than animation per Hundhausen et al."*

Agreed; we explicitly do not claim improved algorithm learning.

### Arvind Satyanarayan (MIT; declarative visualization grammars)

> *"How does this relate to Vega/Vega-Lite transitions, gganimate's
> `transition_states`, or D3 joins? Are you reinventing what those
> grammars already provide?"*

Those grammars couple *what to draw* with *how it animates* — the
author has to write the transition. **Realization policies require
nothing**: the policy is a property of the renderer, not the spec.
The spec is unchanged across frames. Heer & Robertson (2007),
*Animated Transitions in Statistical Data Graphics*, is the closest
prior work in the perceptual-transitions tradition; we cite them as
context but our contribution is the *language-external* framing
they don't have.

> *"Your metrics are layout-stability metrics, not perception
> metrics. Why these and not, e.g., the staged-animation literature
> on attention guidance?"*

We make a *structural* claim, not a perceptual one. Mapping
structural preservation onto perception is exactly the
Archambault-et-al. result we use to defer the behavioral question.
§7 proposes the follow-up.

> *"The 'outside the language' framing is a meta-language move. Why
> not make it part of the spec?"*

Because adding cross-frame stability *inside* the spec either
(a) overconstrains it (the spec now refuses frames that satisfy it
but drift from the prior frame), or (b) requires modal/temporal
extensions to the spec language. The thin-layer choice keeps the
spec compositional and lets us swap policies without language
changes. The unresolved formal issue at
[`critique.md:80`](../Thesis_Proposal/critique.md) — *"the
relationship between the denotation and the realization policy used
across time"* — wants this stated formally; the direction is that
the policy is denotationally invisible, and a Lean mechanization is
the obvious next step.

### Helen Purchase / a graph-drawing reviewer

> *"You're using Misue 1995 metrics to vindicate `stability`, but
> Purchase 2007 and Archambault 2011 showed those metrics don't
> reliably predict reader benefit. Why are you using them as a
> positive signal?"*

Exactly the right question, and we are explicit. We test the
**definitional** claim (does `stability` produce what Misue
operationalized as preservation?), not the **normative** claim
(does preservation help readers?). Archambault et al. (2011) is
*the* citation we use to defer the normative question to a separate
behavioral evaluation. §7 proposes that follow-up explicitly along
the path-tracing-vs-comparison split Archambault found.

> *"N=4 algorithms × 3 seeds is small."*

Acknowledged. **Paradigm coverage, not graph-size coverage** —
no rome-lib-equivalent for dynamic graphs (Beck et al. 2017 survey
explicitly flags the gap). Forge traces add a second family with
different change patterns; that closes some of the small-N concern.

### Tim Nelson (advisor) / Forge community

> *"Forge temporal traces are the highest-leverage benchmark. Why
> aren't they here?"*

Honest answer: not yet implemented. Priority gap to close before
defense, since the contract names them explicitly and every Forge
user has them.

### Shriram Krishnamurthi (Brown; PL, programming environments, evaluation rigor)

> *"Liang already gave you partial consistency. What's the
> contribution beyond engineering an existing framework?"*

The contribution is twofold. First, the realization-policy
*mechanism* — Liang's framework defines what a stable / changed
substructure is, but does not say *how* a renderer should pick
realizations across frames. The policy mechanism is the operational
layer their formalism is silent on, and it is what makes spec
satisfaction invariant by construction. Second, the **four-policy
taxonomy with literature-grounded justification** is not in Liang —
it ties the partial-consistency abstraction to Gibson 1955,
Goldstone 1994, and the Diehl-Görg axis explicitly, so the design
space is principled rather than ad hoc.

> *"Why these four policies and not others? What's the principle?"*

Each occupies a named point on the change-stability axis (Diehl &
Görg 2002), and each is justified by a distinct prior literature
(Gibson, Goldstone, Archambault, off-axis baseline). The set is not
a complete enumeration — it is the *minimum* taxonomy that lets us
falsify claims from each of the three relevant literatures
independently. Other policies (e.g., adaptive, learned, hybrid) are
deliberately out of scope; the case for those follows the
structural case landing.

> *"You say the policy lives 'outside' the language — but the
> changed/stable classification depends on the data semantics, which
> is inside. Where exactly is the boundary?"*

Sharp, and the right question. The boundary is: the **classification
function** (`classifyChangeEmphasisChangedSet`) is a syntactic
property of the data instance — it reads edge fingerprints on a pair
of consecutive instances. The **policy** consumes the classification
plus the prior realization. The spec is consulted only by the
solver, after the policy hands seeds in. So: classification ∈ data
semantics; policy ∈ renderer; spec ∈ language semantics. The three
are separable and the dependence flow is one-way (classification →
policy → solver). Making this precise is part of the formal piece
the proposal critique flags as outstanding
([`critique.md:80`](../Thesis_Proposal/critique.md)).

> *"If `stability` gets free salience (§5), doesn't that suggest you
> don't need `change_emphasis` at all?"*

Open question, and one of the most interesting findings. The free-
salience effect averages 0.66 AUC across paradigms; `change_emphasis`
averages 0.90. The gap is real (∼0.24 AUC) but smaller than the
gap between either of them and `random_positioning` (∼0.43). For
some paradigms (RB-tree mixed insert + delete) `change_emphasis`
*hurts*. The honest reading is: `change_emphasis` is justified for
paradigms with small changed-context fractions per transition, and
the case for it is empirical, not universal.

> *"You're going to drift from 'algorithm traces are stress tests'
> to 'algorithm visualization helps learning' if you're not careful."*

Explicit no-drift discipline: the eval does not claim learning
effects. Hundhausen, Douglas & Stasko (2002) is cited *against*
that direction. CLRS algorithms are paradigm coverage, not
educational targets.

### A formal-methods reviewer

> *"You claim spec satisfaction is invariant by construction. Where's
> the proof?"*

It's a soundness *argument*, not a proof: the policy emits seed
positions, the solver projects onto $\mathcal{F}(s, x_n)$, so $r_n
\in \mathcal{F}(s, x_n)$ regardless of policy. The proof obligation
reduces to the solver's projection step, which is a property of the
solver, not the policy layer. Lean mechanization is the obvious
next step (`critique.md:80`).

---

## 7. Pre-registered Prolific behavioral study

The structural results bracket but do not make a reader-benefit
claim. The natural follow-up is a small Prolific study designed to
test whether **Archambault, Purchase & Pinaud's (2011) task-
dependent split holds inside the constraint-based-layout setting**.

This is **registered in advance** of the data so the conclusions are
not fishing. The study is small, cheap, and either outcome is
publishable: replication of Archambault confirms the structural
metrics map onto reader benefit per their split; non-replication
isolates a real difference between force-directed (their setting)
and constraint-based (our setting) dynamic layouts.

### Hypotheses

Stated in advance against existing literature
([archambault2011animation]):

- **H1 (path-tracing favors preservation).** On a path-tracing task,
  `stability` produces higher accuracy and shorter response time
  than `ignore_history`. (Archambault: animated preservation > small
  multiples on tracking.)
- **H2 (comparison favors small-multiples).** On a comparison task,
  `ignore_history` produces higher accuracy than `stability`.
  (Archambault: small multiples > animated preservation on
  comparison.)
- **H3 (asymmetric time cost).** Time-on-task is longer under
  `stability` for comparison than under `ignore_history`.

### Design

**Between-subjects on policy** (`stability` vs `ignore_history`),
**within-subjects on task** (path-tracing vs comparison) and trace
(Dijkstra vs DSU). Each participant sees one policy across both
traces, answering one path-tracing question and one comparison
question per trace — four questions total. Trace order and
task order counterbalanced via Latin square.

Why these two policies: they are exactly the Archambault arms
(animated preservation vs small-multiples), translated into the
constraint-based renderer. Why these two traces: Dijkstra is a
fixed-graph attribute-only trace (`change_emphasis` AUC = 1.00 in
the structural results), DSU is edge-only mutation
(`change_emphasis` AUC = 0.99). Both are paradigms where the
structural metrics show the strongest policy contrast, so
reader-task differences (if any) should be visible.

### Tasks

- **Path-tracing.** *Dijkstra:* "Across the sequence you just
  watched, which node's distance changed the most times?" *DSU:*
  "Watch the union sequence. By the end, which two atoms ended up
  in the same set with atom $X$?"
- **Comparison.** *Dijkstra:* "Compare frame 0 and frame 5. How
  many nodes changed position?" *DSU:* "Compare the start and end
  states. How many edges are different?"

### Stimuli

Render existing per-run JSONs through the same renderer as
[`analysis.ipynb`](analysis.ipynb): `stability` plays as a
frame-to-frame animation with a 1-second crossfade, `ignore_history`
displays as a small-multiples grid. Stimuli generation is
deterministic from existing data — no new layout work required.

### Measures

- **Accuracy** (binary, per question).
- **Response time** (log-transformed).
- **Self-reported confidence** (1–5 Likert) as secondary.

### Analysis (pre-specified before data collection)

Mixed-effects models with policy as fixed effect and participant +
trace as random intercepts, on accuracy (logistic) and log-time
(linear). Pre-registration filed at OSF or AsPredicted before
participants are recruited — no peeking.

### Sample size, power, and budget — explicit constraint

**Hard cap: $N = 50$ total** (25 per between-subjects cell). This is
the budget constraint, not a power-derived target. ~15-minute
sessions × 50 participants × ~$2.50 = ~$125 + Prolific platform fees,
budget-feasible. If even that is unavailable, course-credit pool at
the home institution is a viable substitute for the same $N = 50$.

**Power consequences, stated honestly.** Archambault et al. (2011)
reported task-by-format effect sizes around $d = 0.5$. With $N = 25$
per between-subjects cell and 4 questions per participant (200
question-responses analyzed via mixed-effects model with participant
random intercept), power for a medium effect on the primary contrast
is approximately **70–75%**. For smaller effects ($d \approx 0.3$),
power drops to ~35% and null results are uninformative. The study is
**adequately powered for the primary predicted contrast and
underpowered for secondary effects** — pre-registration takes this
into account.

### Pre-registered hypotheses, ranked by predicted effect size

- **H1 (primary).** *Stability beats ignore-history on path-tracing
  accuracy.* This is Archambault et al.'s strongest finding (d ≈ 0.6
  in their data); we are powered to detect it.
- **H2 (secondary).** *Ignore-history beats stability on comparison
  accuracy.* Archambault's reverse-direction finding; smaller effect
  size (d ≈ 0.4); we are marginally powered.
- **H3 (exploratory).** *Time cost asymmetry — stability slower on
  comparison than ignore-history.* Reported as exploratory only;
  $N = 50$ does not adequately power this contrast.

A confirmed H1 alone is publishable; H1 + H2 is a clean replication
of Archambault inside the constraint-based-layout setting; failing
H1 is the most informative null because it would mean structural
metrics in our setting do not map onto the strongest reader-benefit
effect from prior work.

### Pilot

No separate pilot phase given the budget; instead, the **first 5
participants** are flagged in the pre-registration as a stopping
checkpoint — if median session time exceeds 20 minutes or
attention-check failure rate exceeds 30%, the protocol is revised
and those 5 are excluded from the main analysis.

### Pre-commit

The full pre-registration should be filed at
[OSF](https://osf.io/) or [AsPredicted](https://aspredicted.org/)
before recruitment, specifying:
- exact stimuli URLs (rendered videos for `stability`,
  small-multiples PNGs for `ignore_history`);
- the three hypotheses verbatim with their effect-size predictions;
- the analysis script (with mock data) committed to a public repo;
- inclusion criteria (Prolific approval rating ≥ 95%; English-fluent;
  desktop only);
- exclusion criteria (attention-check failure; response time
  outliers > 3 SD).

### Outcomes

- **H1 (and H2) confirm.** The structural metrics in §5 map onto
  reader benefit per Archambault et al. The constraint-based-layout
  setting replicates the force-directed result. Cleanest finding
  for the thesis.
- **Only H1 confirms.** Partial mapping; preservation helps tracking
  but the comparison-task split is uncertain. Honest report given
  the underpowered H2.
- **H1 fails.** A real finding: structural metrics in
  constraint-based layout do not map onto Archambault's strongest
  reader-benefit effect. The structural case in §5 still stands as
  a definitional claim; the normative claim needs new theory.

All outcomes are publishable; none undermines §5. This is the right
shape for a small, budget-constrained follow-up attached to a
structural-eval thesis.

---

## 8. What's missing before defense

In rough order of importance:

1. **Forge temporal traces.** Closes the evaluation contract;
   demonstrates the policies generalize beyond imperative algorithm
   states.
2. **A formal statement** of the policy/denotation relationship
   ([`critique.md:80`](../Thesis_Proposal/critique.md)). Either a
   Lean mechanization or a scoped soundness argument with named
   assumptions.
3. **A 30-seed sweep on at least one algorithm** to tighten
   stochastic-policy CIs.
4. **A split RB-tree analysis** (insert-only vs delete-only) to
   characterize the `change_emphasis` failure mode as a bound on
   changed-context fraction, not just observed as a miss.
5. **The Prolific study** (§7) if behavioral validation is wanted
   as part of the defense rather than as future work.

---

## 9. References

Archambault, D., Purchase, H. C., & Pinaud, B. (2011). *Animation,
small multiples, and the effect of mental map preservation in
dynamic graphs.* IEEE TVCG, 17(4), 539–552.

Beck, F., Burch, M., Diehl, S., & Weiskopf, D. (2017). *A taxonomy
and survey of dynamic graph visualization.* Computer Graphics Forum.

Brown, M. H. (1988). *Algorithm Animation.* ACM Distinguished
Dissertations.

Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2009).
*Introduction to Algorithms*, 3rd ed. MIT Press.

Diehl, S., & Görg, C. (2002). *Graphs, they are changing — dynamic
graph drawing for a sequence of graphs.* GD 2002, LNCS 2528, 23–30.

Friedrich, C., & Eades, P. (2002). *Graph drawing in motion.* JGAA,
6(3), 353–370.

Gibson, J. J. (1955). *The optical expansion-pattern in aerial
locomotion.* American Journal of Psychology, 68(3), 480–484.

Goldstone, R. L. (1994). *The role of similarity in categorization:
providing a groundwork.* Cognition, 52(2), 125–157.

Heer, J., & Robertson, G. (2007). *Animated transitions in
statistical data graphics.* IEEE TVCG, 13(6), 1240–1247.

Hundhausen, C. D., Douglas, S. A., & Stasko, J. T. (2002). *A meta-
study of algorithm visualization effectiveness.* JVLC, 13(3),
259–290.

Liang et al. (2026). *Partial-consistency framework for sequenced
diagrams.* TOSEM (accepted).

Misue, K., Eades, P., Lai, W., & Sugiyama, K. (1995). *Layout
adjustment and the mental map.* JVLC, 6(2), 183–210.

Penlloy (2025). *Consistency metrics for constraint-based diagrams.*
PLATEAU 2025, §6.2.

Purchase, H. C., Hoggan, E., & Görg, C. (2007). *How important is
the mental map? An empirical investigation of a dynamic graph
layout algorithm.* GD 2006, LNCS 4372, 184–195.

Saffrey, P., & Purchase, H. C. (2008). *The "mental map" versus
"static aesthetic" compromise in dynamic graphs: a user study.*
AUIC 2008, 85–93.


---
Context
Research claim. Choosing an appropriate warm-start position causes
the solver to converge at a layout that preserves the mental map,
modulo hard constraints.

The claim factors into three sub-claims, each with a distinct contrast:

Warm-start matters at all. Warm-started runs end up at different
layouts than cold-started ones. Contrast: warm vs no warm.
Choice of warm-start matters. Different warm-start positions
produce different terminal layouts (not just different convergence
speeds). Contrast: warm-start A vs warm-start B.
Appropriate warm-starts preserve the mental map. Among warm-start
strategies, the more "appropriate" ones score better on Misue's
three criteria, under spytial's hard-constraint regime. Contrast:
graded appropriateness against Misue scores.
The four existing policies in
src/translators/webcola/sequence-policy.ts
already span a graded appropriateness factor. Read them not as four
unrelated strategies but as one IV at four levels:

Level	Policy	Reading
Anti	random_positioning	Prior info actively discarded for noise — lower bound on how bad it gets
None	ignore_history	No prior info — pure baseline
Partial	change_emphasis	Prior for unchanged; deliberately perturbed for changed (partially inappropriate by design)
Full	stability	Prior for everything persisting — most appropriate
The claim predicts a monotone gradient: Misue scores rise from anti →
none → partial → full. This experiment is what this PR is built to
run.

Sharper appropriateness measure: gap from the oracle. Don't score
appropriateness as "rank in the four-level gradient" — score it as
distance from the mental-map-preserving optimum subject to the
hard constraints. For each transition we can compute a reference
layout L_oracle = the feasible layout that maximally preserves a
named mental-map criterion, then per policy P measure
gap(P) = d(P_output, L_oracle). Smaller gap = more appropriate.
This makes the IV absolute, not relative, and makes "the existing
four are graded along an axis" a falsifiable claim about the gaps
they produce, not a definitional one.