# Custom Data Instances

The `IDataInstance` interface is the contract between your relationalizer and `spytial-core`. Most integrators don't implement it directly — they emit JSON in the [standard format](json-data.md) and let `JSONDataInstance` do the work. This page covers both paths.

---

## Path A — Emit JSON (recommended)

This is what every existing integration does.

```typescript
import { JSONDataInstance } from 'spytial-core';

const json = {
  atoms: [
    { id: "n1", type: "Node", label: "1" },
    { id: "n2", type: "Node", label: "2" },
  ],
  relations: [
    {
      id: "next",
      name: "next",
      types: ["Node", "Node"],
      tuples: [{ atoms: ["n1", "n2"], types: ["Node", "Node"] }],
    },
  ],
};

const instance = new JSONDataInstance(json);
```

`JSONDataInstance` accepts an [`IJsonImportOptions`](api-reference.md#jsondatainstance) second argument for normalization (merge duplicate relations, infer types, validate references, deduplicate atoms — all on by default). `DataInstanceNormalizer` is exposed if you want to run those passes yourself.

The full schema is documented in [JSON Data Format](json-data.md). The bare minimum:

- Every atom: `{ id, type, label }`.
- Every relation: `{ id, name, types, tuples: [{ atoms, types }] }`.
- Types are optional; they're inferred from atoms unless you have a hierarchy worth preserving.

---

## Path B — Implement `IDataInstance` directly

You only need this if:

- Your data is huge and JSON serialization would be wasteful.
- Your host already has a graph data structure you'd prefer to reuse.
- You want fine-grained control over the `applyProjections` rewrite or the `generateGraph` step.

The interface ([src/data-instance/interfaces.ts](https://github.com/sidprasad/spytial-core/blob/main/src/data-instance/interfaces.ts)) is small:

```typescript
interface IDataInstance {
  getAtomType(id: string): IType;
  getTypes(): readonly IType[];
  getAtoms(): readonly IAtom[];
  getRelations(): readonly IRelation[];

  applyProjections(atomIds: string[]): IDataInstance;
  generateGraph(hideDisconnected: boolean, hideDisconnectedBuiltIns: boolean): Graph;
}
```

For mutable instances (e.g. an interactive instance builder), `IInputDataInstance` extends it with `addAtom`, `removeAtom`, `addRelationTuple`, `removeRelationTuple`, an event system, `addFromDataInstance`, and a `reify(): unknown` round-trip back to the source language.

The cleanest reference implementation is [`JSONDataInstance`](https://github.com/sidprasad/spytial-core/blob/main/src/data-instance/json-data-instance.ts) — read it before writing your own.

---

## Built-in adapters

`spytial-core` ships several `IDataInstance` implementations that you can subclass or imitate:

| Class                      | Source format                | Notes                                                                                       |
|----------------------------|------------------------------|---------------------------------------------------------------------------------------------|
| `JSONDataInstance`         | The canonical JSON shape     | The default for every host integration.                                                     |
| `AlloyDataInstance`        | Alloy XML evaluator output   | Use `createEmptyAlloyDataInstance()` to build incrementally.                                |
| `DotDataInstance`          | Graphviz DOT                 | Configurable type system (`DotTypeConfig`) since DOT has no native types.                   |
| `RacketGDataInstance`      | rkt-graphable JSON           |                                                                                             |
| `PyretDataInstance`        | Pyret value-skeleton output  |                                                                                             |
| `TlaDataInstance`          | TLA+ trace output            | `createTlaDataInstance(...)` factory, `isTlaDataInstance(x)` predicate.                     |

Pick the one that matches your host's serialization, or use them as templates. All five expose the same `IDataInstance` surface to the rest of `spytial-core`.

---

## Identity, sharing, cycles

Three things to get right in any relationalizer:

1. **Stable IDs.** Two references to the same value must produce the same `id`. Two distinct values must not collide.
2. **Cycles.** Use a visited-set keyed by your identity function. A naive recursive walk will stack-overflow on the first cyclic Python list.
3. **Sharing visibility.** If `a.left` and `b.left` point at the same value, your default should produce one atom referenced by two tuples, not two duplicate atoms. Offer "duplicate on share" only as an opt-in.

---

## Schema descriptors

Once you have an `IDataInstance`, three helpers turn it into LLM- or human-readable summaries — useful for prompts, debugging, or generated documentation:

```typescript
import { generateAlloySchema, generateSQLSchema, generateTextDescription } from 'spytial-core';

generateAlloySchema(instance);      // Alloy-style sigs and fields
generateSQLSchema(instance);        // CREATE TABLE statements
generateTextDescription(instance);  // human-readable summary
```

All three accept a `SchemaDescriptorOptions` second argument (`includeBuiltInTypes`, `includeTypeHierarchy`, `includeArityHints`).

---

## Where this fits in the pipeline

```
host value
    │
    ▼
relationalizer (host-specific)
    │   atoms, tuples, types
    ▼
JSON  ──────►  JSONDataInstance  ──────►  evaluator + LayoutInstance
                    ▲
                    │
              (or: your IDataInstance subclass)
```

Once you have an `IDataInstance`, the rest of the pipeline (evaluator, layout, render) is the same for every host. See [The Integration Pipeline](pipeline.md).
