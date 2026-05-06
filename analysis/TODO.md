# TODO — Algorithm × Policy stories for the thesis

Working notes for picking, per realization policy, the CLRS algorithm whose
*characteristic transition* most clearly showcases what that policy is
good for. Not implementation tasks — these are story candidates.

Numbers below are from the current 6-tree × 4-policy × 3-seed sweep
in `results/aggregate.csv`.

---

## What each metric tells you

The harness reports two layers. Read them together; one alone never
makes the case.

| Metric                          | Question it answers                                                          | Good story when…                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `positional`                    | Did the persisting nodes' coords stay put?                                   | The algorithm grows incrementally and you want to argue continuity.                         |
| `relative`                      | Did the persisting *edges* keep the same vector?                             | Algorithm preserves local relationships (e.g. parent-child layout direction).               |
| `pairwise_distance`             | Did the persisting *subset's* shape survive?                                 | You care about gestalt: "the tree still looks like the same tree."                          |
| `constraint_adherence`          | Did the spec actually hold post-solver?                                      | Sanity check. If this isn't ~1.0, every other number is suspect.                            |
| `changed_count` / `stable_count` | How many persisting nodes have a context change vs none?                     | Tells you whether a transition is local (small changed set) or restructuring (large set).   |
| `changed_vs_stable_auc`         | P(a context-changed node moved farther than a stable one). 0.5 = no signal. | The headline salience metric. > 0.7 means the eye is drawn to the change.                   |
| `changed_mean_drift` / `stable_mean_drift` | Average pixel-distance moved, per subset.                          | Pairs with AUC: AUC says "ranks separate," means say "by how much."                         |
| `changed_positional` / `stable_positional` | Squared coord drift on each subset.                                | Lets you write "stable subset moved < X px², changed subset moved > Y px²" claims directly. |
| `changed_pairwise_distance` / `stable_pairwise_distance` | Shape preservation per subset.                       | Argument: "even when changed nodes move, their shape relative to each other survives."       |
| `runtime_ms`                    | Cost of the policy.                                                          | Necessary trade-off context for any other claim.                                            |

The two-level split (changed-context vs stable-context, computed via
edge-fingerprint diff in `classifyChangeEmphasisChangedSet`) lets every
metric be reported per-subset, *for any policy*. That is the hook the
spytial-core demo gives us — and it's now the headline of this harness.

---

## Per-metric story arcs across our 6 trees

Drawing on `results/aggregate.csv` (mean over the 6 transitions / 3 seeds):

### `positional` — stability dominates everywhere

Strict ordering on every tree:

```
stability  ≪  change_emphasis  <  ignore_history  <  random_positioning
```

Aggregate means: **11K / 68K / 120K / 337K px²**. Every tree sees the
same shape. This is the cleanest story — RQ6.2's headline.

### `relative` — same ordering, smaller spread

Tracks `positional`. Where they diverge is where edge vectors *flip*
(e.g., a rotation): a node's coord can stay roughly put while its edge
to a moved neighbor reverses direction. Worth a callout when an
algorithm *only* looks bad on `relative` — that's a rotation tell.

### `pairwise_distance` — gestalt budget, hits ceiling fast under random

Random positioning has mean **759K px⁴** vs **79K** for stability — a
~10× gap. This is the metric to use when you want to argue
"the layout looks like a different graph entirely."

### `constraint_adherence` — uninformative for policy ranking

1.00 across the board. Useful only as a guard rail: a regression
showing < 1.0 means a policy started silently violating the spec.

### `changed_vs_stable_auc` — the salience metric

This is where the per-policy stories diverge:

| Policy             | Mean AUC | Reading                                                             |
| ------------------ | -------: | ------------------------------------------------------------------- |
| change_emphasis    |     0.82 | Actively pushes changed nodes; designed for this.                   |
| stability          |     0.71 | Even pure-position-reuse separates: changed-context nodes get pulled by their new neighbors while stable ones stay locked. **Free salience.** |
| random_positioning |     0.45 | At chance — random by construction.                                 |
| ignore_history     |     0.43 | At chance — fresh layouts erase any pattern.                        |

The "free salience under stability" finding (0.71 without trying) is
the most interesting cross-policy result the harness produces. Pull
this into the proposal.

---

## Algorithm × policy pairings

For each policy, the CLRS algorithm whose transitions most clearly
demonstrate what the policy is *for*.

### `stability` — incremental growth where context is sacred

> Best showcase: **BST insert** (already in `traces/algorithms/bst.py`)

`bst-insert` × stability gives **positional = 0.0** across all 6
transitions. Every prior node stays exactly put while the new node
finds its slot. That's the textbook claim of "perceptual continuity"
with no caveats.

**Better candidate to add (CLRS Ch. 21):**

- [ ] **Disjoint-Set Forest (union-find), MAKE-SET / UNION trace** —
  atoms are perfectly persisting (no nodes added/removed), and only
  the parent edge changes on UNION with path compression. Stability
  should hold drift to *exactly zero on stable atoms* even when many
  edges flip in a single union. That's a stronger claim than BST,
  because BST's stability win partly depends on the new node being
  somewhere out of the way.

### `change_emphasis` — local restructuring inside a mostly-fixed shape

> Best showcase already in repo: **Red-Black insert** (`rbtree.py`)

`rbtree-insert` × change_emphasis gets **AUC = 0.79** because rotations
locally re-parent a small subtree while the rest of the tree doesn't
move. The eye correctly tracks "what just rotated" because
change_emphasis pinned the unaffected nodes and jittered only the
rotated ones.

**Even better candidates to add:**

- [ ] **Heap SIFT-UP / HEAP-INSERT (CLRS Ch. 6)** — only one node and
  its ancestors change parents; the rest of the heap is untouched.
  The "context-change" set per transition is *tiny* (1–log n), which
  maximizes the AUC ceiling. Should produce AUC > 0.95 transitions —
  a clean upper-bound demo.
- [ ] **AVL-rebalance** — same shape as RB, but the `change_emphasis`
  set is even more localized (just the pivot triple).

### `ignore_history` — when continuity actively misleads

> Best showcase to add: **structure-changing transformation**

Our six tree-insert traces are *bad* showcases for ignore_history —
they all penalize it because each step is small and continuity is
useful. The natural pairing is a transition where the prior layout
would *mislead*:

- [ ] **CLRS Ch. 18 B-tree node split** as a focused micro-trace —
  start from a full leaf, do one insert that triggers a split, ignore
  history. The argument: trying to preserve old positions through a
  split forces ugly compromises; a fresh layout reads cleaner. Use
  `change_emphasis` as the comparison baseline and report
  `pairwise_distance` (shape) — ignore_history may *win* on shape
  even while losing on positional.
- [ ] **Tree-to-DAG transformation** (e.g. CLRS DP memoization
  collapsing a recursion tree into a DAG): the underlying graph
  changed type. Stability would lock layouts that no longer make
  sense.

### `random_positioning` — surface what doesn't depend on layout

> Best showcase to add: **partial-order / DAG construction**

The user's intuition: random_positioning is a *probe*, not a
visualization tactic. It answers "which properties of this object
survive arbitrary placement?" Across multiple seeds, properties that
hold under randomization are layout-invariant.

- [ ] **Topological sort intermediate states (CLRS Ch. 22.4)** — at
  step k, the partial order is fixed but many topological orderings
  are valid. Random positioning *each frame, multiple seeds* exposes
  which constraints actually pin which atoms. If a node lands in
  similar relative regions across seeds, its position is constrained
  by the partial order; if it lands anywhere, it's free. This is the
  partial-order argument the user named.
- [ ] **Hasse diagram of a poset, growing via incremental insertions** —
  same logic; random seeds reveal whether the diagram *has* to look a
  certain way.
- [ ] **Equivalence classes after disjoint-set unions** — random
  positioning across seeds shows which atoms cluster together
  *because they're in the same set*, not because of seed coincidence.

---

## Open experimental questions

Order roughly by how cheaply they can be answered with the existing
harness.

- [ ] **Multi-seed random sweep, fixed algorithm** (10–20 seeds on
  one trace per algorithm). For random_positioning, plot the
  variance of `pairwise_distance` per atom across seeds. Low-variance
  atoms = layout-invariant; high-variance = free. This is the
  partial-order probe in concrete form.
- [ ] **Wider-key sweeps** (e.g. BST insert of 30 keys). Does
  stability hold when N grows? Does change_emphasis's AUC degrade
  because too much context shifts at once? Simple `--keys` argument
  change to `traces/generate.py`.
- [ ] **Add Disjoint-Set Forest trace** (above). One small Python file
  in `traces/algorithms/dsf.py`.
- [ ] **Add Heap SIFT-UP trace** (above). Likewise.
- [ ] **Add a "structural collapse" trace** (RB insert that triggers a
  long fix-up cascade — say 15 keys producing multiple rotations).
  Compare ignore_history vs change_emphasis on `pairwise_distance` to
  see whether continuity helps or hurts on a long restructure.
- [ ] **Cross-tree comparison of "free salience"**: stability gives
  AUC 0.58 (vEB) → 0.86 (B-tree). What property of a tree predicts
  the spread? Conjecture: trees where insertion *also* re-parents
  existing nodes (RB, OS, vEB cluster shuffle) get higher free
  salience than pure-append trees (BST). Worth a one-paragraph note.
  *(Partially landed in `report.md` §4.1 on the four CLRS algorithms;
  cross-tree extension still open.)*
- [x] ~~**Bootstrap CIs at aggregation time.**~~ Landed in
  `runner/bootstrap_cis.py`; `results/cells.csv` carries 95% CIs
  per (algorithm, policy). Per-strategy tables in `report.md` §3
  quote them.

---

## Notes on existing solver failures

Two algorithms have spec/data issues that need a fix before their
results are trustworthy:

- **VEB insert frame 0** — `kv` selector arity error on empty cluster.
  Spawned task already filed.
- **B-tree insert** — one deterministic mid-trace failure per seed.
  Spawned task already filed.

Don't draw conclusions from VEB or B-tree numbers in any thesis prose
until those are fixed; the rest of the algorithms (BST / RB / OS /
Interval) are clean.
