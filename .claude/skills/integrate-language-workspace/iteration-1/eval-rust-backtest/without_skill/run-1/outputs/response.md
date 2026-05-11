# A Spytial integration for Rust — what shape should it take?

Good news: Spytial's design is fairly portable, and Rust's proc-macro story is a clean fit for it. Below is what I learned from the project and a concrete shape I'd recommend for the Rust side, with sketches for your two example types.

## What Spytial actually is (so we know what we're porting)

`sPyTial` (by Siddhartha Prasad / Brown PLT) is a Python library that turns structured Python data into "box-and-arrow" diagrams. Internally it has three pieces that you'd need analogues for in any language:

1. **Annotations / decorators on user types.** These attach *spatial constraints* (where things go) and *visual directives* (how things look) to a class. The catalog from the API reference includes:
   - Layout constraints: `@orientation`, `@cyclic`, `@align`, `@group`
   - Visual directives: `@atomColor`, `@edgeColor`, `@size`, `@icon`, `@hideField`, `@hideAtom`, `@projection`, `@attribute`, `@inferredEdge`, `@tag`, `@flag`
   - All of them take a `selector` plus type-specific args; orientation/cyclic/align also take a `hold` policy.
2. **A relationalizer** that walks a runtime object into a relational instance: a set of *atoms* (nodes), *relations* (typed tuples of atom refs), and *type* metadata. Spytial uses a pluggable `RelationalizerRegistry` so different types can be walked differently.
3. **A handoff to the renderer.** Spytial bundles `python_data` (JSON: atoms / relations / types) plus a `cnd_spec` (YAML: constraints + directives) into a self-contained HTML file. The actual diagram engine is **Cope and Drag (CnD)**, a constraint-based diagramming language for Alloy/Forge instances — the same language whose npm package powers Sterling.

So the contract that matters for any new language binding is: **emit `(atoms, relations, types) + cnd_spec` and feed it to a CnD-rendering frontend.** Everything else is ergonomics.

## The shape I'd recommend for Rust

I'd structure it as a small workspace with three crates. This mirrors Spytial's separation of concerns and matches Rust idioms (proc-macro crates can't export anything but macros, so you always end up with at least two crates).

```
spytial-rs/
  spytial/                # runtime: traits, relationalizer, JSON+YAML emit, viewer
  spytial-derive/         # proc-macro crate: #[derive(Spytial)] + attribute macros
  spytial-macros/         # (optional) re-export, plus declarative helpers
```

### `spytial` (runtime crate)

The core trait is what your `derive` will implement:

```rust
pub trait Spytial {
    fn type_name() -> &'static str;
    /// Walk `self` into the builder, registering atoms/relations.
    fn relationalize(&self, b: &mut InstanceBuilder) -> AtomId;
    /// Spec fragments contributed by this type (orientation, group, etc.).
    fn spec_fragments() -> &'static [SpecFragment] { &[] }
}

pub struct InstanceBuilder { /* atoms, relations, types, identity map */ }

pub fn diagram<T: Spytial>(value: &T) -> Diagram { /* … */ }
```

`Diagram` then has `.open_in_browser()`, `.to_html(path)`, `.to_json()` — analogues of Spytial's `diagram(..., method="file")`.

A few Rust-specific calls:

- **Identity.** Python gets `id(obj)` for free; in Rust you'll need a deterministic atom-id strategy. Use raw-pointer addresses for `&T` walks of owned structures, plus a user-overridable `IdentityHook` (matching Spytial's `identity=` kwarg on `diagramSequence`). For `Vec`/`Box`/`Rc`/`Arc` you should special-case.
- **Built-ins as relationalizers.** Provide blanket impls or built-in `Relationalizer`s for `Vec<T>`, `Option<T>`, `Box<T>`, `Rc<T>`, `Arc<T>`, `HashMap<K,V>`, `String`, primitives. This is the equivalent of Spytial's `domain_relationalizers/` — make it pluggable so users can register their own for foreign types they don't own (similar to serde's `Serialize`).
- **Output.** Just emit the same `(json data, yaml spec)` envelope into the CnD HTML template. You can either ship the template inside the crate (à la Spytial) or call out to the existing `copeanddrag` npm package via a child process for users who already have it.

### `spytial-derive` (proc-macro crate)

This is the part that should feel native to Rust users. Two macro families:

1. **A `derive` for the trait:**

   ```rust
   #[derive(Spytial)]
   ```

   walks the struct/enum at compile time and generates `impl Spytial`, emitting one atom per value and one relation per field (relation name = field name, arity 2: parent → child).

2. **Attribute macros** for each Spytial annotation. I'd keep names + parameter shapes faithful to Python so docs transfer:

   ```rust
   #[spytial::orientation(selector = "Person.parent", directions = ["below"])]
   #[spytial::group(field = "children", group_on = "parent")]
   #[spytial::atom_color(selector = "Person", value = "#aef")]
   #[spytial::cyclic(selector = "Ring", direction = "clockwise")]
   ```

   These don't transform the type — they collect into a `const SPEC_FRAGMENTS: &[SpecFragment]` that the derive picks up. (Implementation tip: stash the fragments in a `#[spytial_spec(...)]` hidden attribute that the `derive` reads, since attribute macros run before derives.)

   The set to ship in v1, mirroring Spytial 1:1: `orientation`, `cyclic`, `align`, `group`, `atom_color`, `edge_color`, `size`, `icon`, `hide_field`, `hide_atom`, `projection`, `attribute`, `inferred_edge`, `tag`, `flag`.

Selectors are strings (`"Person.parent"`) just like in CnD/Spytial — don't try to make them typed in v1, you'll fight the type system and lose the ability to talk about projections.

## Sketch for your two examples

### `Vec<Person>` with `name`, `age`, `parent`

```rust
use spytial::Spytial;

#[derive(Spytial)]
#[spytial::orientation(selector = "Person.parent", directions = ["above"])]
#[spytial::attribute(field = "name")]
#[spytial::attribute(field = "age")]
#[spytial::atom_color(selector = "Person", value = "#cce5ff")]
struct Person {
    name: String,
    age: u32,
    parent: Option<Rc<Person>>,
}

fn main() {
    let alice = Rc::new(Person { name: "Alice".into(), age: 70, parent: None });
    let bob   = Rc::new(Person { name: "Bob".into(),   age: 45, parent: Some(alice.clone()) });
    let cara  = Rc::new(Person { name: "Cara".into(),  age: 20, parent: Some(bob.clone()) });

    let people = vec![alice, bob, cara];
    spytial::diagram(&people).open_in_browser();
}
```

The `Vec<Person>` is handled by the built-in `Relationalizer for Vec<T>` (one atom per element, an `index` relation if you want ordering). `parent` becomes a relation `Person.parent : Person -> Person`, and the orientation directive draws parents above children — which is the "obvious" reading and exactly what Spytial does for tree-shaped data.

### Binary tree of `i32`

```rust
#[derive(Spytial)]
#[spytial::orientation(selector = "Node.left",  directions = ["below", "left"])]
#[spytial::orientation(selector = "Node.right", directions = ["below", "right"])]
#[spytial::attribute(field = "value")]
struct Node {
    value: i32,
    left:  Option<Box<Node>>,
    right: Option<Box<Node>>,
}
```

That's the canonical CnD pattern for binary trees: two orientation constraints, one per child relation. Nothing tree-specific in the runtime — the diagram just falls out.

## Things to decide before you start coding

1. **Trait name and crate name.** `Spytial` as a trait reads fine; the crate is probably `spytial` on crates.io if available.
2. **Identity strategy.** Decide up front how you handle `Rc`/`Arc` cycles and value duplication. I'd lean on pointer identity for reference types and structural identity (hash) for `Copy`/`Clone` value types, with an opt-in `#[spytial(identity = "...")]` field-level override.
3. **Renderer delivery.** Easiest v1: vendor the CnD HTML template into the crate (matches Spytial). Fancier v1.1: a thin server mode + a `cargo spytial serve` for live re-render during dev.
4. **Spec format.** Emit YAML for `cnd_spec` to stay byte-compatible with Spytial's frontend; it means you can reuse the existing `copeanddrag` npm renderer unchanged.
5. **No-std / WASM.** Worth deciding now whether the runtime needs to compile to `wasm32-unknown-unknown` (likely yes if you want browser-side use). Keep file/HTML emission behind a feature flag.

## What I'd build first

A 200-line spike that:

1. Defines `trait Spytial` and `InstanceBuilder` with just atoms + binary relations.
2. Implements it by hand for `Node` (the binary tree above).
3. Emits the `(json, yaml)` envelope and pipes it through the existing CnD renderer.

Once that round-trips a real diagram, layer the `derive` and the attribute macros on top — by that point you'll know exactly what spec fragments need to look like, which is the part that's easiest to get wrong if you start with the macros.

## Sources

- [sidprasad/spytial on GitHub](https://github.com/sidprasad/spytial)
- [sPyTial documentation](https://www.siddharthaprasad.com/spytial/)
- [sPyTial API reference](https://www.siddharthaprasad.com/spytial/reference/api/)
- [`spytial/annotations.py`](https://github.com/sidprasad/spytial/blob/main/spytial/annotations.py) (decorator catalog)
- [`spytial/visualizer.py`](https://github.com/sidprasad/spytial/blob/main/spytial/visualizer.py) (JSON + YAML envelope)
- [Cope and Drag docs](https://www.siddharthaprasad.com/copeanddrag/) and [sidprasad/copeanddrag](https://github.com/sidprasad/copeanddrag)
- [Lightweight Diagramming for Lightweight Formal Methods (ECOOP 2025)](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ECOOP.2025.26)
- [Brown PLT blog: Cope and Drag](https://blog.brownplt.org/2025/06/09/copeanddrag.html)
