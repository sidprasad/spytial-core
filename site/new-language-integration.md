# New Language Integration

> An integration is not a wrapper around a renderer. It is a translation from a language's values and annotation habits into Spytial's relational model and layout spec.

Every integration has to answer the same four questions. Python, Rust, and Pyret answer them differently because their runtimes, type systems, and display surfaces differ.

If you can answer these four for a host, you have the shape of a working Spytial integration.

---

## 1. Recovering structure

> *How does the host turn a value into atoms and labeled edges?*

`spytial-core` does not inspect Python objects, Rust structs, or Pyret values directly. It expects atoms, tuples (with arity >= 1), and an optional type hierarchy. The host has to produce that view.

The existing integrations use three different techniques:

| Host   | Technique                          | What it walks                                              |
|--------|------------------------------------|------------------------------------------------------------|
| Python | **Run-time reflection**            | `__dict__`, `__slots__`, `id()`-based identity tracking   |
| Rust   | **Type-directed serialization**    | A `derive` macro emits per-type traversal at compile time |
| Pyret  | **Value-skeleton machinery**       | Pyret's reflection of constructor arity + field names     |

The output, regardless of mechanism, is an `IDataInstance` or its JSON serialization. See [Custom Data Instances](custom-data-instance.md).

**Rules of thumb:**
- Identity matters. Two distinct values must get distinct `id`s, even if structurally equal. Two references to the same value must share an `id`. (Python uses `id()`. Caraspace, despite Rust having pointer identity, uses **counter-based IDs with singleton dedup** — pointer identity is fragile under move semantics, and most Rust diagrams don't share state across `Rc`/`Arc` anyway.)
- Types should match what users will write in selectors. If a user types `selector: BST.left`, the atoms had better have type `BST` (or a subtype) and the relation had better be called `left`.
- Built-in / primitive types (Int, String, ...) should be marked with `isBuiltin: true` so `flag: hideDisconnectedBuiltIns` can clean up scaffolding.

---

## 2. Attaching spatial specifications

> *How do specs live alongside code?*

Spytial does not prescribe an annotation system. Use the one your host's users already expect:

| Host   | Mechanism                                  | What gets collected                                                                 |
|--------|--------------------------------------------|-------------------------------------------------------------------------------------|
| Python | **Decorators** (`@spytial.orientation(...)`) and a registration API | Decorator state on the class; merged at `diagram(value)` time.                      |
| Rust   | **Procedural macros** (`#[orientation(...)]`)                       | Compile-time decorator collection walked through generic type tree (`Vec<T>`, `Option<T>`, …). |
| Pyret  | **Output-method attachment**                                        | Specs attached to a function's output method, applied when the value is rendered.   |

Whatever mechanism you choose, the output is a string of YAML matching the [spec language](yaml-reference.md).

---

## 3. Presenting diagrams

> *How does the diagram surface to the user?*

This is where host conventions matter most. The usual default is an **explicit rendering call**: Python and Rust expose a function (`spytial.diagram(...)`, `caraspace::diagram(...)`) that produces an HTML artifact and either opens a browser tab, writes a file, or returns an inline IPython display. That is the right shape when the host does not already have an output channel.

Whichever surface you use, the browser-side payload is identical: load the spytial-core bundle (NPM or [CDN](#cdn)), build a `JSONDataInstance`, parse the spec, and call `renderLayout` on a `<webcola-cnd-graph>` (or `<spytial-explorer>` for accessibility).

### CDN

Most integrations load the browser bundle from a CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/spytial-core@5.2.0/dist/browser/spytial-core-complete.global.js"></script>
<script>
  const { JSONDataInstance, parseLayoutSpec, SGraphQueryEvaluator, LayoutInstance } = spytialcore;

  const instance  = new JSONDataInstance(jsonPayload);
  const spec      = parseLayoutSpec(yamlSpec);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });

  const generatedLayout = new LayoutInstance(spec, evaluator).generateLayout(instance);
  document.querySelector('webcola-cnd-graph').renderLayout(generatedLayout.layout);
</script>
```

(`spytial-core` also exports a `setupLayout(spec, instance, evaluator)` helper that collapses the `parseLayoutSpec` / `LayoutInstance.generateLayout` lines into one. Use it when it makes the integration code clearer.)

For reproducibility (papers, locked notebooks), keep the version pinned in the script `src` as above. Bare `spytial-core` URLs silently shift.

---

## 4. Handling representation gaps

> *What does the runtime value fail to say?*

Visualization often depends on information that is not present in the value you are walking. Handle those cases explicitly:

**Implicit ordering.** A `set` has no order. A red-black tree's left/right children are ordered, but a Python `dict` of children is not (until 3.7). When users want a stable left-to-right rendering, you need to either (a) preserve insertion order during relationalization, or (b) emit an explicit ordering relation and drive an `orientation` constraint off it (or carry the order in your own projection step, if you are stepping through states). Caraspace uses field declaration order; sPyTial uses dictionary insertion order.

**Derived metrics.** Tree height, subtree size, RB-tree black-height, balance factor — none of these live in the data, but users want to color or label by them. Two options:

  1. Compute them in your relationalizer and emit them as extra atoms / tuples (e.g. a `height: Node → Int` relation), then drive a directive off them.
  2. Compute them in JS and attach via the `tag` directive.

Caraspace's red-black tree example does the first.

**Hidden structure.** Sharing in immutable values, reference cycles (Python), interior pointers (Rust). The relationalizer must decide whether to expose sharing as one atom referenced twice (faithful) or two duplicate atoms (cleaner-looking, but false). Faithful is the default; offer a "duplicate-on-share" mode if the visual blow-up is too painful.

**Cycles in the projection ordering.** If your host projects over an ordered type and the ordering relation has a cycle, you need a deterministic tiebreak — source position in Pyret, say, or lexicographic order as a last resort. spytial-core does not project (see [Directives](directives.md)), so this is entirely the host's call.

**Ambient state the user can't see.** Debugger frames, evaluation contexts, proof goals. Decide what counts as "the value" for diagramming and what is environment that should be summarised (or omitted).

When in doubt: **start by faithfully relationalizing what is there**, then add adapters when users hit limits. Do not try to predict every gap.

---

## 5. Testing what you built

> *How do you know the datum and the spec say what you meant?*

Two of the four answers above can be checked automatically, and should be.

The trap is testing at the wrong level. A spec describes spatial *relationships*, not a picture — a list that runs left to right is satisfied by infinitely many drawings. Comparing rendered images or asserting on coordinates therefore tests the renderer, not the integration: those tests break when nothing is wrong, and pass when something is.

What you can check, without rendering anything, is what the spec **entails**:

```yaml
assertions:
  - query: must.rightOf(n1)
    equals: [n2, n3]
    because: orientation is transitive, so the tail is all to the right of the head
```

`spytial-check` runs cases like this from the command line, in JSON in and JSON out, so integrations in any host can use it as a subprocess. It also checks the raw datum for the bugs the data instance would otherwise repair on the way in — duplicate ids, dangling tuples, lost sharing.

See [Testing an Integration](testing-integrations.md).

---

## A checklist for a new integration

Before you publish, make sure the integration has answers for these:

- [ ] **Recover** — Can your relationalizer round-trip a recursive value with sharing? With cycles?
- [ ] **Attach** — Can a user attach a spec without learning YAML? Is there an escape hatch for users who want raw YAML?
- [ ] **Present** — In the host's typical workflow (REPL, notebook, IDE, build tool), does the diagram appear where users will look for output?
- [ ] **Gaps** — For at least one classical example (BST, linked list, AST, DAG with sharing), is there a way to express ordering and at least one derived metric?
- [ ] **Test** — Do you have conformance cases pinning down what your specs entail, and a check that a shared value stays one atom?

Once you can check those, you have the outline of an integration. The next step is to build the smallest end-to-end path: one value, one spec, one rendered diagram.
