# The Four Subproblems

> Using Claude Code? Run `/integrate-language` (see [skill.md](skill.md)) for a guided walkthrough of this recipe.

> The goal is not merely to build three ports, but to extract what is **invariant** across hosts from what is **host-specific**.

Every integration of Spytial — Python, Rust, Pyret, the next one you write — must resolve the same four subproblems. The mechanisms differ; the questions don't.

This page is the contract for an integrator. If you can answer all four for your host, you have a working Spytial port.

---

## 1. Recovering structure

> *How does the host turn a value into atoms and labeled edges?*

`spytial-core` operates on a relational view: atoms, tuples (with arity ≥ 1), and an optional type hierarchy. Your host has to produce one. The three established techniques:

| Host   | Technique                          | What it walks                                              |
|--------|------------------------------------|------------------------------------------------------------|
| Python | **Run-time reflection**            | `__dict__`, `__slots__`, `id()`-based identity tracking   |
| Rust   | **Type-directed serialization**    | A `derive` macro emits per-type traversal at compile time |
| Pyret  | **Value-skeleton machinery**       | Pyret's reflection of constructor arity + field names     |

What you produce, regardless of mechanism, is an `IDataInstance` (or its JSON serialization). See [Custom Data Instances](custom-data-instance.md).

**Rules of thumb:**
- Identity matters. Two distinct values must get distinct `id`s, even if structurally equal. Two references to the same value must share an `id`. (Python uses `id()`. Caraspace, despite Rust having pointer identity, uses **counter-based IDs with singleton dedup** — pointer identity is fragile under move semantics, and most Rust diagrams don't share state across `Rc`/`Arc` anyway.)
- Types should match what users will write in selectors. If a user types `selector: BST.left`, the atoms had better have type `BST` (or a subtype) and the relation had better be called `left`.
- Built-in / primitive types (Int, String, …) should be marked with `isBuiltin: true` so `flag: hideDisconnectedBuiltIns` can clean up scaffolding.

---

## 2. Attaching spatial specifications

> *How do specs live alongside code?*

Spytial doesn't dictate where the YAML comes from. Each host picks the seam that best matches how its users already annotate code:

| Host   | Mechanism                                  | What gets collected                                                                 |
|--------|--------------------------------------------|-------------------------------------------------------------------------------------|
| Python | **Decorators** (`@spytial.orientation(...)`) and a registration API | Decorator state on the class; merged at `diagram(value)` time.                      |
| Rust   | **Procedural macros** (`#[orientation(...)]`)                       | Compile-time decorator collection walked through generic type tree (`Vec<T>`, `Option<T>`, …). |
| Pyret  | **Output-method attachment**                                        | Specs attached to a function's output method, applied when the value is rendered.   |

Whatever mechanism you choose, the output is the same: a string of YAML matching the [spec language](yaml-reference.md).

---

## 3. Presenting diagrams

> *How does the diagram surface to the user?*

This is the most host-shaped subproblem. The standard pattern is an **explicit rendering call**: Python and Rust expose a function (`spytial.diagram(...)`, `caraspace::diagram(...)`) that produces an HTML artifact and either opens a browser tab, writes a file, or returns an inline IPython display. This is the right default when the host doesn't already have an output channel.

Whichever surface you use, the browser-side payload is identical: load the spytial-core bundle (NPM or [CDN](#cdn)), build a `JSONDataInstance`, parse the spec, and call `renderLayout` on a `<webcola-cnd-graph>` (or `<spytial-explorer>` for accessibility).

### CDN

Most integrations ship the bundle from CDN rather than copying it:

```html
<script src="https://cdn.jsdelivr.net/npm/spytial-core@2.5.2/dist/browser/spytial-core-complete.global.js"></script>
<script>
  const { JSONDataInstance, parseLayoutSpec, SGraphQueryEvaluator, LayoutInstance } = spytialcore;

  const instance  = new JSONDataInstance(jsonPayload);
  const spec      = parseLayoutSpec(yamlSpec);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  const layout = new LayoutInstance(spec, evaluator).generateLayout(instance);
  document.querySelector('webcola-cnd-graph').renderLayout(layout);
</script>
```

(`spytial-core` also exports a `setupLayout(spec, instance, evaluator)` helper that collapses the `parseLayoutSpec` / `LayoutInstance.generateLayout` lines into one — equivalent shape, fewer keystrokes. Use whichever reads cleaner.)

For reproducibility (papers, locked notebooks), keep the version pinned in the script `src` as above. Bare `spytial-core` URLs silently shift.

---

## 4. Handling representation gaps

> *Some information relevant to visualization is absent from the run-time representation. When can Spytial infer it, and when do you need an adapter?*

This is the subtlest subproblem and the one most likely to bite you. The categories:

**Implicit ordering.** A `set` has no order. A red-black tree's left/right children are ordered, but a Python `dict` of children is not (until 3.7). When users want a stable left-to-right rendering, you need to either (a) preserve insertion order during relationalization, or (b) attach an `orderBy` directive (e.g. `projection.orderBy: "next"`). Caraspace uses field declaration order; sPyTial uses dictionary insertion order.

**Derived metrics.** Tree height, subtree size, RB-tree black-height, balance factor — none of these live in the data, but users want to color or label by them. Two options:

  1. Compute them in your relationalizer and emit them as extra atoms / tuples (e.g. a `height: Node → Int` relation), then drive a directive off them.
  2. Compute them in JS and attach via the `tag` directive.

Caraspace's red-black tree example does the first.

**Hidden structure.** Sharing in immutable values, reference cycles (Python), interior pointers (Rust). The relationalizer must decide whether to expose sharing as one atom referenced twice (faithful) or two duplicate atoms (cleaner-looking but lying). Faithful is the default; offer a "duplicate-on-share" mode if the visual blow-up is too painful.

**Cycles in the projection ordering.** When the user writes `projection.orderBy: "next"` and `next` has a cycle, `applyProjectionTransform` breaks the cycle by lexicographic order. If your host can produce a more meaningful tiebreak (e.g. source-position in Pyret), you can pass an `evaluateOrderBy` callback that returns a deterministic ordering.

**Ambient state the user can't see.** Debugger frames, evaluation contexts, proof goals. Decide what counts as "the value" for diagramming and what is environment that should be summarised (or omitted).

When in doubt: **start by faithfully relationalizing what's there**, then layer adapters as users hit limits. Don't try to predict every gap.

---

## A checklist for a new port

Before you publish, make sure you can answer these:

- [ ] **Recover** — Can your relationalizer round-trip a recursive value with sharing? With cycles?
- [ ] **Attach** — Can a user attach a spec without learning YAML? Is there an escape hatch for users who want raw YAML?
- [ ] **Present** — In the host's typical workflow (REPL, notebook, IDE, build tool), does a diagram appear in the right place with one keystroke?
- [ ] **Gaps** — For at least one classical example (BST, linked list, AST, DAG with sharing), is there a way to express ordering and at least one derived metric?

Once you can check those, read the [Case Studies](case-studies.md) — they show what the four answers look like in practice.
