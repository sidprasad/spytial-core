# Spytial-for-Rust: Integration Design

Before any code, the `integrate-language` skill walks four subproblems: **Recover, Attach, Present, Gaps**. The Rust integration that already exists (Caraspace) is your closest reference, but you're starting fresh, so this document is a design you can hand to an implementer (or yourself) and start cutting code from.

I have your high-level answers (Rust, proc macros, `Vec<Person>`, BST). A few things I'd normally batch-ask in Phase 1 I'm going to **assume** so we can keep momentum — they're called out below. Push back on any that are wrong and we'll revise.

---

## Phase 1 — Host interrogation (with my assumptions)

| # | Question | Your answer / my assumption |
|---|---|---|
| 1 | Host language and runtime | Rust, compiled. **Assumption:** standard `cargo` project, no `no_std`, edition 2021+. Surface = browser tab opened from a CLI command (no IDE infoview). |
| 2 | Identity model | Rust has no GC and no universal object identity. **Assumption (load-bearing):** identity = **address of the value during traversal** (`&T as *const T as usize`), augmented with the type name. We do *not* hash contents — two `Person { name: "Ada", age: 30 }` values at different addresses are different atoms. This matches Caraspace's approach and is the right default for the Rust idiom. |
| 3 | Spec-attachment idiom | **Procedural macros**, as you said. Specifically a `#[derive(Spytial)]` macro plus attribute macros (`#[spytial(orientation(...))]`). |
| 4 | Surface | **Assumption:** explicit `spytial::diagram(&value)` call that writes `out.html` next to the binary and (optionally) opens it. No Jupyter, no LSP. |
| 5 | Target user + classical example | **Assumption:** library authors instrumenting their own types, with end-developers as a secondary audience via the raw-YAML escape hatch. Classical examples are the two you named: `Vec<Person>` (with `parent: Option<Rc<Person>>` — see §2.4) and `BinTree<i32>`. |

If #2 or #4 are wrong, the design changes materially. Everything else is cosmetic.

---

## Phase 2 — Design across the four subproblems

### 2.1 Recover (host value -> `IDataInstance`)

**Technique: type-directed serialization via a `derive` macro, traversal at runtime, JSON output.**

Rust's identity model rules out Python-style runtime reflection (no `__dict__`), and the host's idiom is "derive a trait." So:

```rust
#[derive(Spytial)]
struct Person { name: String, age: u32, parent: Option<Rc<Person>> }
```

The `Spytial` derive expands to an `impl SpytialRelationalize for Person` with a single method `fn relationalize(&self, ctx: &mut RelCtx)`. The macro:

1. Emits an atom for `self`, keyed by `RelCtx::intern(self as *const _ as usize, "Person")`. `intern` returns the *existing* atom id if this address has been seen, otherwise mints a fresh one. **This is the identity-aware reflection step the skill calls out as the #1 source of bugs.**
2. For each named field, recursively calls `field.relationalize(ctx)` and emits a tuple `(self_id, child_id)` in a relation named after the field (`"name"`, `"age"`, `"parent"`).
3. Field iteration order = declaration order (Caraspace-confirmed pattern). This makes `orderBy` honest without a directive for record types.

Generic containers get blanket impls in the runtime crate, not in the macro:

- `impl<T: SpytialRelationalize> SpytialRelationalize for Vec<T>` — emits a `Vec<T>` atom plus an `elements` relation with explicit index in a parallel `index` relation (so we can `orderBy index` in the spec; **don't fake order via the relation's tuple order**, per the anti-patterns section).
- `impl<T: SpytialRelationalize> SpytialRelationalize for Option<T>` — `None` is a builtin atom, `Some(x)` emits a `some` tuple to `x`.
- `impl<T: SpytialRelationalize> SpytialRelationalize for Rc<T>` and `Box<T>` — **delegate identity to the pointee**, i.e., `intern((*self).as_ptr() as usize, ...)`. This is what makes `parent: Option<Rc<Person>>` show as one atom referenced twice instead of two clones. The skill flagged "don't silently dedupe shared references" — the inverse is also true: don't silently *split* them.
- `String`, `i32`, `u32`, `bool`, `f64` etc. — emit atoms with `isBuiltin: true`, type matching the Rust name (so users write `Int` selectors? No — write `i32`, matching what the user typed. Caraspace pattern: types should match user-written selectors).

**Hand-traced atoms/tuples for `BinTree { val: 1, left: Some(Box::new(BinTree{ val:2, ...})), right: None }`:**

```
atoms:
  { id: "BinTree#1", type: "BinTree", label: "BinTree" }
  { id: "BinTree#2", type: "BinTree", label: "BinTree" }
  { id: "i32#1",     type: "i32",     label: "1", isBuiltin: true }
  { id: "i32#2",     type: "i32",     label: "2", isBuiltin: true }
  { id: "None",      type: "Option",  label: "None", isBuiltin: true }
relations:
  { name: "val",   types:["BinTree","i32"],     tuples:[["BinTree#1","i32#1"], ["BinTree#2","i32#2"]] }
  { name: "left",  types:["BinTree","BinTree"], tuples:[["BinTree#1","BinTree#2"]] }
  { name: "right", types:["BinTree","Option"],  tuples:[["BinTree#1","None"]] }
```

**JSON path vs. `IDataInstance`:** emit JSON, wrap with `JSONDataInstance`. The custom-data-instance docs are explicit that this is what every existing integration does. Only deviate if you measure a problem (huge data, an existing graph in your runtime, etc.). For the prototype, no.

### 2.2 Attach (specs alongside types)

**Seam: `#[derive(Spytial)]` plus `#[spytial(...)]` attribute macros, generating YAML at compile time and registering it in a per-type spec table.**

Draft signatures (attribute form on the type):

```rust
#[derive(Spytial)]
#[spytial(orientation(selector = "left",  directions = ["left", "below"]))]
#[spytial(orientation(selector = "right", directions = ["right", "below"]))]
struct BinTree { val: i32, left: Option<Box<BinTree>>, right: Option<Box<BinTree>> }

#[derive(Spytial)]
#[spytial(group(field = "parent", group_on = "parent", add_to_group = "self"))]
#[spytial(atom_color(selector = "Person", value = "#cce"))]
struct Person { name: String, age: u32, parent: Option<Rc<Person>> }
```

These compile to a `static SPEC: &str = "..."` snippet of YAML registered under the type's `TypeId`. At `diagram` time we walk the reachable type tree (`Vec<Person>` -> `Person` -> `String`/`u32`/`Option<Rc<Person>>`) and **concat the per-type YAML fragments**. This is the Caraspace "decorators propagate through the entire reachable type tree" pattern: a user only writes specs on `Person` and they apply automatically when they `diagram(&vec_of_people)`.

**Composition rule:** specs from container and element compose by concatenation under the top-level YAML keys (`constraints:`, `directives:`). If a user attaches conflicting `orientation`s on `Vec<Person>` and `Person`, both are emitted; spytial-core resolves at solve time. We do not try to merge them in Rust.

**Escape hatch (non-negotiable, per the skill):**

```rust
spytial::diagram_with_spec(&value, r#"
constraints:
  - orientation: { selector: "left", directions: [left, below] }
"#);
```

…which bypasses the per-type registry entirely.

### 2.3 Present (diagram surface)

**Pattern: explicit `spytial::diagram(&value)`. Bundle source: CDN, pinned.**

`diagram` does three things:
1. Run the relationalizer to produce `payload.json`.
2. Concat the per-type YAML fragments (plus a default `flag: hideDisconnectedBuiltIns: true` so stray `String`s don't clutter the canvas).
3. Write `out.html` containing a small inline `<script>` that runs the canonical five-line skeleton:

```html
<script src="https://cdn.jsdelivr.net/npm/spytial-core@X.Y.Z/dist/browser/spytial-core-complete.global.js"></script>
<webcola-cnd-graph></webcola-cnd-graph>
<script>
  const { JSONDataInstance, parseLayoutSpec, SGraphQueryEvaluator, LayoutInstance } = window.spytialCore;
  const instance  = new JSONDataInstance(JSON_PAYLOAD);
  const spec      = parseLayoutSpec(YAML_SPEC);
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const layout = new LayoutInstance(spec, evaluator).generateLayout(instance);
  document.querySelector('webcola-cnd-graph').renderLayout(layout);
</script>
```

Pin the version (`spytial-core@X.Y.Z`, not `@latest`) so users who run your Rust crate today and three years from now see the same diagram.

### 2.4 Gaps (ordering, derived metrics, sharing)

For the two examples:

- **Ordering, `Vec<Person>`:** the macro emits both an `elements` relation `(Vec, Person)` and an `index` relation `(Vec, i32)`. Spec uses `orderBy index`. Insertion order is preserved; we never *invent* it.
- **Ordering, `BinTree`:** declaration order of `left` then `right` is reflected in tuple emission order, but we still attach an explicit `orientation` on each so the spec doesn't depend on tuple order. Honest.
- **Derived metric, `BinTree` height:** compute in the **relationalizer**, not in JS. Walk the tree once during `relationalize`, attach `height: u32` as a synthetic atom + `height_of` relation. This is exactly the red-black-tree balance pattern from Caraspace. (Alternative: emit a `tag` directive that computes via AlaSQL on the spec side. Use that only if the metric is one you already have in pure relational data.)
- **Sharing, `Option<Rc<Person>>`:** `Rc` delegates identity to its pointee, so two `Rc::clone`s render as **one atom referenced twice**, which is the right default ("faithful relationalization"). Cycles caused by `Rc<RefCell<Person>>` parent-back-pointers are handled by the `intern` cache: the second visit returns the cached id and stops recursing. Without this, you stack-overflow — that's the failure mode the skill flagged as the most common new-integration bug.

---

## Phase 3 — Pre-flight checklist (from `integration.md`)

- [x] **Recover:** Recursive values with sharing and cycles? Yes — `intern` keyed on raw-pointer addresses, with `Rc`/`Box` delegating to pointee. Cycles bottom out on cache hit.
- [x] **Attach:** Users add specs without learning YAML? Yes — `#[spytial(orientation(...))]` is typed Rust syntax checked by the macro. Raw YAML escape hatch via `diagram_with_spec`.
- [x] **Present:** One keystroke in a typical workflow? Yes — `spytial::diagram(&v)` writes `out.html`, optionally `xdg-open`s it. No setup beyond `cargo add spytial`.
- [x] **Gaps:** Classical examples (BST, `Vec<Person>`) express ordering and a derived metric? Yes — declaration-order + explicit `orderBy index`, height computed in the relationalizer.

All four green; design is ready to implement.

---

## Phase 4 hand-off (what to build first)

1. Crate `spytial` with two modules:
   - `spytial-runtime`: `SpytialRelationalize` trait, `RelCtx` with `intern`, blanket impls for `Vec`/`Option`/`Rc`/`Box`/primitives, `diagram(&v)` and `diagram_with_spec(&v, &str)`.
   - `spytial-derive`: proc-macro crate exporting `Spytial` derive plus the `spytial` attribute parser. Output: an `impl SpytialRelationalize` body + a `SPEC` string registered via `inventory` or `linkme`.
2. Wire to a `out.html` template that loads spytial-core from jsDelivr at a pinned version.
3. End-to-end test: `BinTree<i32>` of height 3 renders with left/below, right/below orientation, and a `height` tag visible on the root.
4. Stop. Polish (clickable atoms, JSON download, Jupyter/notebook surfaces) is iteration 2 — not part of the minimum viable integration.

---

## Three things I'd watch for, lifted from the skill's anti-patterns section

1. **Don't fake order.** If you ever find yourself relying on `HashMap` iteration order in the relationalizer, stop — emit an explicit `index` relation.
2. **Don't silently dedupe.** Two `Person`s with the same name are still two atoms. Identity = address, not contents.
3. **Don't skip identity-aware reflection.** The `intern` cache is what makes the whole thing work. If you're tempted to "just clone the value" to avoid a borrow checker fight, you've broken sharing semantics.

If any of my Phase 1 assumptions are off (especially #2 — identity model — or #4 — surface), say which and I'll revise the relevant Phase 2 section before you write code.
