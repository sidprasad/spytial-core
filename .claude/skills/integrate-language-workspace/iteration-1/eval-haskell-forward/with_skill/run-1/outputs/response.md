# Designing a Spytial integration for Haskell

Welcome — let's walk this through properly. Spytial integrations all solve the same four subproblems (Recover structure, Attach specs, Present diagrams, Handle gaps), but the right *mechanism* for each is different in every host. Haskell is its own animal: pure value semantics, no `id()`, no procedural macros in the Rust sense, but a lot of leverage from type classes and Generics.

I've already pulled the canonical recipe (`integration.md`), the case studies for Python/Rust/Pyret/Lean, the `IDataInstance` interface contract, the YAML directive list, and the consumer-side five-line skeleton. The design below references those.

Since you're a first-timer and starting fresh, I'm going to do two things at once: ask the five Phase 1 questions, **and** propose a concrete design assuming the most defensible default for each. If any of those defaults are wrong for your situation, just push back and we'll re-cut the relevant section.

---

## Phase 1 — Questions (with my assumed answers)

| # | Question | My assumed answer | Why |
|---|----------|-------------------|-----|
| 1 | **Host runtime / surface where you work?** | GHC + `cabal repl` / `ghci`, possibly notebook (IHaskell) later. Library form. | Most prototype-stage Haskell library work lives in ghci. |
| 2 | **Identity model?** | Pure value semantics; no stable runtime identity. We will use **structural identity** — atom IDs are derived from a hash of the constructor + children, with the path/occurrence as a tiebreaker only when you opt into the duplicate-on-share mode. | Haskell values aren't `id()`-addressable; `StableName` exists but is too brittle for AST visualization. ASTs typically *should* share — `Var "x"` referenced in three places really is the same variable. |
| 3 | **Spec-attachment idiom?** | A type class `SpytialSpec a` with a default empty instance, plus a `GHC.Generics`-backed default relationalizer (`class (Generic a) => Relationalize a`). Specs accumulate. Plus a `diagramWithRawSpec :: a -> Text -> IO ()` raw-YAML escape hatch. | Type classes are the canonical Haskell seam for "attach metadata to a type." `Generic` is the canonical "walk a value structurally" mechanism — same thing `aeson` and `cassava` use. |
| 4 | **Surface?** | Explicit `diagram :: a -> IO ()` that writes a self-contained HTML file to a temp path and opens it in the default browser. (Same shape as sPyTial's primary path.) Optional `diagramHtml :: a -> Text` for IHaskell display later. | "Just a library, run from ghci" — explicit call is the lowest-friction surface. |
| 5 | **Target user + classical example?** | Library author (you), instrumenting your own recipe-parser AST. Classical structure = AST tree (constructor name + children). | You said exactly this in your message. |

If the table above is roughly right, read on. If anything's off — especially Q2 and Q4 — flag it and I'll redo the affected design section.

---

## Phase 2 — Design

### 2.1 Recover (Subproblem 1)

**Technique: type-directed traversal via `GHC.Generics`.**

Haskell has no runtime reflection in the Python sense, but `GHC.Generics` gives you a compile-time-derived structural view of any algebraic data type. That's the natural Haskell analogue of Caraspace's procedural-macro traversal — same idea (compile-time type-directed serialization), different machinery.

```haskell
class Relationalize a where
  toAtoms :: a -> RelM AtomId
  default toAtoms :: (Generic a, GRelationalize (Rep a)) => a -> RelM AtomId
  toAtoms = gToAtoms . from
```

`RelM` is a state monad accumulating atoms and tuples and a memo table from value-hash → atom ID.

**Identity strategy.**

Haskell has no `id()`. Two viable strategies, and you should pick one as the default:

- **(A) Structural hash** — `atomId v = hash (constructorName v, map atomId (children v))`. Identical sub-trees collapse to one atom. This is what you almost certainly want for an AST: if `Var "x"` appears three times, it's *meant* to be the same node. **This is my recommended default.**
- **(B) Path identity** — `atomId = "<root>/0/1/2"` based on traversal path. Every occurrence is its own atom; no sharing. Good for when you genuinely want to see every occurrence as a separate node, but lies about a graph that has real sharing.

Expose this as a flag: `diagram` defaults to (A); `diagramDuplicating` opts into (B). This is the "faithful vs duplicate-on-share" knob from the integration recipe — the recipe's recommended default ("faithful: one atom referenced twice") matches my (A).

`StableName` is a third option (true runtime identity), but it's GC-sensitive and breaks under `seq`/strictness changes. Don't use it for v1.

**Sketch — recipe AST round-trip.**

Given a tiny AST type:

```haskell
data Recipe = Recipe { title :: String, steps :: [Step] }
data Step   = Mix [Ingredient] | Bake Int | Wait Int
data Ingredient = Ingredient { name :: String, qty :: Double }
```

For the value `Recipe "Bread" [Mix [Ingredient "flour" 500], Bake 30]`, the emitted JSON looks like:

```json
{
  "atoms": [
    {"id": "a0", "type": "Recipe",     "label": "Recipe"},
    {"id": "a1", "type": "String",     "label": "\"Bread\"",  "isBuiltin": true},
    {"id": "a2", "type": "[Step]",     "label": "[Step]"},
    {"id": "a3", "type": "Step.Mix",   "label": "Mix"},
    {"id": "a4", "type": "[Ingredient]", "label": "[Ingredient]"},
    {"id": "a5", "type": "Ingredient", "label": "Ingredient"},
    {"id": "a6", "type": "String",     "label": "\"flour\"", "isBuiltin": true},
    {"id": "a7", "type": "Double",     "label": "500.0",     "isBuiltin": true},
    {"id": "a8", "type": "Step.Bake",  "label": "Bake"},
    {"id": "a9", "type": "Int",        "label": "30",        "isBuiltin": true}
  ],
  "relations": [
    {"id": "r_title",  "name": "title",  "types": ["Recipe","String"],
     "tuples": [{"atoms": ["a0","a1"], "types": ["Recipe","String"]}]},
    {"id": "r_steps",  "name": "steps",  "types": ["Recipe","[Step]"],
     "tuples": [{"atoms": ["a0","a2"], "types": ["Recipe","[Step]"]}]},
    {"id": "r_elem",   "name": "elem",   "types": ["[Step]","Step"],
     "tuples": [
       {"atoms": ["a2","a3"], "types": ["[Step]","Step.Mix"]},
       {"atoms": ["a2","a8"], "types": ["[Step]","Step.Bake"]}
     ]},
    {"id": "r_mix_ings", "name": "ingredients", "types": ["Step.Mix","[Ingredient]"],
     "tuples": [{"atoms": ["a3","a4"], "types": ["Step.Mix","[Ingredient]"]}]},
    {"id": "r_name",   "name": "name",   "types": ["Ingredient","String"],
     "tuples": [{"atoms": ["a5","a6"], "types": ["Ingredient","String"]}]},
    {"id": "r_qty",    "name": "qty",    "types": ["Ingredient","Double"],
     "tuples": [{"atoms": ["a5","a7"], "types": ["Ingredient","Double"]}]},
    {"id": "r_bake_min","name": "minutes","types": ["Step.Bake","Int"],
     "tuples": [{"atoms": ["a8","a9"], "types": ["Step.Bake","Int"]}]}
  ]
}
```

Contract check: every atom has `id`/`type`/`label`; every relation has `id`/`name`/`types`/`tuples`; primitives (`String`, `Int`, `Double`) are flagged `isBuiltin`. Constructor variants get a qualified type (`Step.Mix`, `Step.Bake`) so users can write Spytial selectors over a single variant.

You'll emit this via `Path A` — go through `JSONDataInstance` rather than implementing `IDataInstance` natively. Nothing about Haskell needs the advanced path.

### 2.2 Attach (Subproblem 2)

**Seam: a `SpytialSpec` type class, one instance per type, composing automatically.**

```haskell
class SpytialSpec a where
  spec :: Proxy a -> [SpecFragment]
  spec _ = []   -- empty default
```

Users opt in per type:

```haskell
instance SpytialSpec Step where
  spec _ = [ orientation ["Step.Mix"] [Below]
           , group       ["Ingredient"] "ingredients"
           ]

instance SpytialSpec Recipe where
  spec _ = [ align ["steps"] Vertical ]
```

When `diagram x` runs, it walks every type encountered during relationalization, collects each one's `spec`, and concatenates them into a single YAML document. This is the Haskell version of Caraspace's "specs on `Vec<T>` and `T` compose independently" — the type-class dispatch *is* the composition mechanism.

**Drafted signatures** for the four required spec fragments:

```haskell
orientation :: [Selector] -> [Direction] -> SpecFragment
align       :: [Selector] -> Axis        -> SpecFragment
group       :: [Selector] -> Text        -> SpecFragment

-- non-negotiable escape hatch:
diagramWithRawSpec :: Relationalize a => a -> Text -> IO ()
```

The escape hatch is non-negotiable because typed DSLs always miss directives — the YAML reference has things like `inferredEdge`, `tag`, `projection` with `orderBy` that you won't want to model in the typed layer on day one.

**Composition rule.** If both `SpytialSpec [Step]` and `SpytialSpec Step` are defined, both fire — the container spec sees `[Step]` selectors, the element spec sees `Step` selectors, and they coexist in the merged YAML. No precedence rule needed; the YAML language already handles directive composition.

### 2.3 Present (Subproblem 3)

**Pattern: explicit call, file-backed, browser-launched.**

```haskell
diagram :: (Relationalize a, SpytialSpec a) => a -> IO ()
diagram x = do
  let json = encodeJSON (relationalize x)
      yaml = renderSpec  (collectSpecs x)
  path <- writeTempHtml json yaml
  openBrowser path
```

**Bundle source: CDN for the prototype.**

The generated HTML embeds the JSON + YAML inline as `<script type="application/json">` blocks and pulls the engine from:

```
https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js
```

NPM-pinned local copy is a v2 concern.

**Five-line skeleton inside the HTML.**

```js
const instance  = new JSONDataInstance(jsonPayload);
const spec      = parseLayoutSpec(yamlSpec);
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: instance });
const layout = new LayoutInstance(spec, evaluator).generateLayout(instance);
document.querySelector('webcola-cnd-graph').renderLayout(layout);
```

Identical to every other host — that's the whole point of the recipe. Your Haskell side only has to emit the JSON and the YAML correctly.

### 2.4 Gaps (Subproblem 4) — for the AST example

- **Ordering.** AST children are *ordered* (the order of arguments to a constructor matters). In your relationalizer, emit list elements as a `[Step]` atom containing an `elem` relation whose tuples preserve insertion order, **and** add an `orderBy` via the `projection` directive on list-type atoms so the layout solver respects it. Don't rely on Spytial inferring order from tuple order alone — be explicit. (This is the "Don't fake order" anti-pattern from the recipe.)
- **Derived metric — AST tree depth.** Pick this one because it's the most useful AST property. Compute it in the relationalizer as you traverse, then emit `tag`s on each node:
  ```yaml
  - tag: { toTag: "*", name: "depth", value: <computed> }
  ```
  Computing in the relationalizer (Haskell side) is easier than doing it via JS evaluation for v1.
- **Sharing/cycles.** Default = faithful (structural-hash identity), so `Var "x"` referenced three times shows as one atom with three incoming edges. Opt-in `diagramDuplicating` for the duplicate-on-share view. Cycles (mutually recursive let-bindings, if your recipe DSL has those) are handled by the memo table — every value gets an atom ID before its children are recursed into, so a cycle resolves rather than loops.

---

## Phase 3 — Pre-flight checklist

Walking the canonical four checks against the design above:

- [x] **Recursive values with sharing and cycles?** Yes — memo table keyed by structural hash, atom ID assigned before recursion, faithful sharing by default.
- [x] **Specs without learning YAML?** Yes — typed `SpytialSpec` instances cover the common case; `diagramWithRawSpec` for the rest.
- [x] **Diagram appears with one action?** Yes — `diagram x` writes HTML and opens the browser.
- [x] **Classical example: ordering + derived metric?** Yes — `projection`/`orderBy` for child order, `tag` directive carrying computed `depth` for the derived metric.

All four are green on paper. The honest gotcha is item 1: structural-hash identity is correct *for ASTs*, but if you later visualize values where two equal sub-trees are semantically distinct, you'll want the duplicating mode. Build both modes from day one.

---

## Phase 4 — Suggested first build

When you're ready to write code (only after the design above is signed off):

1. **Package skeleton.** A new cabal package `spytial-haskell` (or whatever you want to call it) — separate repo, depends on `spytial-core` from the CDN at runtime, no build-time JS dependency.
2. **Modules to write, in order:**
   - `Spytial.Atom` — `IAtom`/`ITuple`/`IRelation` mirror types + `aeson` `ToJSON` instances matching the JSON shape above.
   - `Spytial.Relationalize` — the `Relationalize` class, `Generic`-derived default, `RelM` monad with the memo table.
   - `Spytial.Spec` — `SpytialSpec` class + `orientation`/`align`/`group` smart constructors emitting `SpecFragment`s, plus a YAML renderer (`yaml` package).
   - `Spytial.Render` — temp-file HTML writer, browser launcher, the embedded five-line JS skeleton.
   - `Spytial` — re-exports.
3. **Round-trip test.** Build the recipe AST from §2.1, call `diagram`, confirm: tree renders; `Var`-style shared sub-terms collapse to one atom (test by reusing an `Ingredient` value across two `Mix` steps); `depth` tag appears on each node; insertion order of `[Step]` is preserved.
4. **Then stop.** Polish, IHaskell display, NPM-bundled offline mode, Template-Haskell-driven specs — all v2.

---

## Anti-patterns to watch (from the case-studies doc)

Three things every previous integration got bitten by — pre-warning so you don't repeat them:

1. **Don't fake order.** Spytial relations are sets. The order tuples appear in JSON does not guarantee render order. Always attach `projection`/`orderBy` for AST children. (Affects you immediately — ASTs are the canonical "order matters" case.)
2. **Don't silently dedupe sharing the wrong way.** Two `Ingredient "flour" 500` values in different parts of the tree: are they the same atom or two? Structural hash says "same" — confirm that's what you want for *recipe* ASTs. (For lambda-calculus ASTs it's almost always right; for recipe data it's arguable.)
3. **Don't skip identity-aware reflection.** Without the memo table, mutually recursive values stack-overflow. Memo before recurse.

---

## What I need from you to move to Phase 4

- Confirm the assumed answers in the Phase 1 table — especially identity (Q2: structural hash OK?) and surface (Q4: temp-file HTML + browser, not IHaskell first).
- Confirm the example: paste a real fragment of your AST type, or the cabal name of the recipe-parser repo. The §2.1 sketch becomes a real round-trip test once I see the actual constructors.
- Confirm `GHC.Generics` is acceptable (it usually is). If you're targeting `DataKinds`-heavy GADT trees that don't have `Generic` instances, we'd switch to a `Data.Data`-based traversal, which is a different but tractable design.

Once those three are nailed, I'd recommend we build §2.1 (Recover) end-to-end first, in isolation — get the JSON emission round-tripping through `JSONDataInstance` for the recipe AST, see a diagram, *then* layer on specs (§2.2) and gaps (§2.4). The case studies all converged on this order; integrations that started with specs first wasted effort.
