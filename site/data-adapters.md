# Built-in Data Adapters

`spytial-core` ships several `IDataInstance` implementations. Most integrators will use `JSONDataInstance` (and its [JSON format](json-data.md)). The others exist either as reference implementations or to support specific source languages directly.

---

## JSONDataInstance

The canonical entry point. See [JSON Data Format](json-data.md) for the full schema and [Custom Data Instances](custom-data-instance.md) for usage patterns.

```typescript
import { JSONDataInstance, DataInstanceNormalizer } from 'spytial-core';

const instance = new JSONDataInstance(jsonPayload, {
  mergeRelations: true,    // default
  inferTypes: true,        // default
  validateReferences: true,// default
  deduplicateAtoms: true,  // default
});
```

Every existing host integration (Python, Rust, Pyret, Lean, Racket) flows through this class.

---

## AlloyDataInstance

Adapter for [Alloy](https://alloytools.org/) / [Forge](https://forge-fm.org/) XML evaluator output. Use this when your host already produces Alloy-shaped traces.

```typescript
import { AlloyDataInstance, createEmptyAlloyDataInstance } from 'spytial-core';

// Build incrementally
const instance = createEmptyAlloyDataInstance();
// ... addAtom, addRelationTuple ...
```

Pair with `ForgeEvaluator` / `WrappedForgeEvaluator` if you also need to evaluate Forge expressions against the instance.

---

## DotDataInstance

Adapter for [Graphviz DOT](https://graphviz.org/doc/info/lang.html). DOT has no native type system, so this adapter lets you layer one on top:

```typescript
import { DotDataInstance } from 'spytial-core';
import type { DotTypeConfig } from 'spytial-core';

const typeConfig: DotTypeConfig = {
  types: {
    Entity: {},
    Person: { extends: 'Entity' },
    Int: { isBuiltin: true },
  },
  defaultType: 'Entity',
  builtinTypes: ['Int'],
};

const instance = new DotDataInstance(dotSource, { typeConfig });
```

If you skip the config, every node is `Node` with a flat hierarchy.

---

## RacketGDataInstance

Adapter for [rkt-graphable](https://github.com/sidprasad/rkt-graphable), the Racket `#lang` integration.

---

## PyretDataInstance

Adapter for Pyret value-skeleton output, used by the [Spyret](https://github.com/sidprasad/spyret-lang) integration.

---

## TlaDataInstance

Adapter for TLA+ trace output.

```typescript
import { TlaDataInstance, createTlaDataInstance, isTlaDataInstance } from 'spytial-core';

const instance = createTlaDataInstance(tlaTrace);
if (isTlaDataInstance(instance)) { /* ... */ }
```

---

## When to write a new adapter

In nearly every case the answer is "don't — emit JSON instead." The dedicated adapters above exist because their source format is sufficiently structured (Alloy XML, DOT, TLA+ traces) that parsing it inline saved the integration from re-encoding into JSON.

If your host can produce JSON — and any host that can produce a string can — start with `JSONDataInstance`. Reach for a custom adapter only when you've measured the serialization cost and it matters.
