# Built-in Data Adapters

`spytial-core` ships several `IDataInstance` implementations. Most integrators will use `JSONDataInstance` (and its [JSON format](json-data.md)). The others exist either as reference implementations or to support specific source languages directly.

---

## JSONDataInstance

The canonical entry point. See [JSON Data Format](json-data.md) for the full schema and [Custom Data Instances](custom-data-instance.md) for usage patterns.

```typescript
import { JSONDataInstance, DataInstanceNormalizer } from 'spytial-core';

const instance = new JSONDataInstance(jsonPayload, {
  mergeRelations: true,    // default: merge repeated IDs, not repeated names
  inferTypes: true,        // default
  validateReferences: true,// default
  deduplicateAtoms: true,  // default
});
```

Every existing host integration (Python, Rust, Pyret) flows through this class.

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

## PyretDataInstance

Adapter for live Pyret runtime values, used by the [Spyret](https://github.com/sidprasad/spyret-lang) integration.

Numeric roots and constructor fields use `Number` atoms with lossless
`metadata.pyretNumber` payloads. The payload has `version: 1` and one of:

| `kind` | Payload fields (strings) | Example |
|---|---|---|
| `integer` | `value` | `"123456789012345678901234567890"` |
| `rational` | `numerator`, `denominator` | `"1"`, `"3"` |
| `roughnum` | `value` | `"3.14"` |

Exact components never pass through JavaScript floating-point conversion.
Rationals are reduced with a positive denominator; integral results use
`integer`. Roughnums retain their finite floating-point payload and remain
distinct from exact values, including when primitive atom reuse is enabled.
Labels display numeric source such as `1/3` or `~3.14`; decoders use the metadata.

These payloads survive `JSON.stringify` / `JSON.parse` followed by the default
`JSONDataInstance` constructor, alongside the v6 constructor metadata and field
relation IDs. `reifyToValue` returns safe integers as JS numbers and other
numeric values as `{ $pyretNumber: payload }` carriers, which can be fed back to
`PyretDataInstance` without a runtime. `replit` renders exact Pyret numeric
source from either representation. Legacy `Number` atoms without numeric
metadata retain their label-based decoding; precision already lost in an old
datum cannot be recovered.

Core regression coverage is in `tests/pyret/pyret-number-fidelity.test.ts`.
Real-runtime acceptance uses the Spyret IDE's shared `test/pyret-round-trip`
harness with `SPYTIAL_CORE_DIST` pointing to this repository's built `dist/`.
The seven `number/rational`, `number/rational-field`, `number/decimal-literal`,
`number/roughnum`, `number/roughnum-field`, `number/bignum`, and
`number/bignum-field` cases are tracked by
[core #592](https://github.com/sidprasad/spytial-core/issues/592) and
[IDE #8](https://github.com/sidprasad/spyret-ide/issues/8). That harness evaluates
the reified source in a separate Pyret interaction after clearing caches and
normalizing the serialized datum; nested numeric values use the same path.

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
