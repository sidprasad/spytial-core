# Portable Pyret capture

`spytial-core/pyret-capture` captures live values from an ordinary Pyret JavaScript
runtime. It needs neither the Spyret compiler extension, a REPL evaluator, a
display skeleton, nor a browser. The entry ships CommonJS, ESM, and an IIFE
(`dist/pyret-capture.global.js`, global `SpytialPyretCapture`).

```js
import {
  capturePyret, createPyretRuntimeAdapter, importPyretCapture,
} from 'spytial-core/pyret-capture';

const snapshot = capturePyret([
  { name: 'tree', value: tree, observation: { expression: 'tree' } },
  { name: 'selected', value: selectedNode },
], createPyretRuntimeAdapter(runtime), { module: 'example.arr' });

// Save JSON.stringify(snapshot). The receiver does not need Pyret:
const { instance, values } = importPyretCapture(JSON.parse(savedText));
// instance implements IDataInstance for layout/query consumers.
// values is a map from root names to synthetic structural values; aliases and
// cycles, including aliases between different roots, share JS object identity.
```

Use the **owning runtime**. Runtime predicates distinguish its functions,
references, data values, numeric objects, etc. A different runtime can have a
different number tower and class identities. `createPyretRuntimeAdapter` keeps
the unavoidable constructor, reference, and library backing-store reads in one
module. Alternative hosts can implement the small `PyretRuntimeAdapter.observe`
interface; adapter observations are transient live facts, not a portable format.

## Contract

`capturePyret(roots, adapter, provenance?)` returns a detached JSON snapshot or
throws `PyretCaptureError`, which supplies `root`, `path`, and `reason`. It never
returns a successful partial capture. Names must be nonempty and unique. All
roots share one object-identity map, and the returned root IDs are explicit.
Call again to refresh after a mutation; there is no mutation observer.

`importPyretCapture(snapshot)` checks the format/version, root and endpoint IDs,
type memberships, duplicate records, and structural field/position/reference
constraints. It returns a detached snapshot, a `JSONDataInstance`, and synthetic
values. Synthetic values are **not executable Pyret values**: they have no
methods, annotations, runtime brands, or closures. They are useful for inspecting
structure without the producing runtime. Constructor identity is the synthetic
value's encoded `$name`; use `readConstructorTypeId`/`constructorDisplayName` to
inspect its nominal token/display spelling.

| State | Preservation |
| --- | --- |
| Numbers | Exact integer/rational text; rough versus exact, including rough negative zero |
| Strings/booleans/nothing | Content and distinct kinds |
| Data constructors | Capture-scoped nominal identity, declared ordered slots, singleton versus nullary application, mutable-slot positions |
| Objects | Enumerable fields, including inherited fields, in observed order |
| Raw arrays/tuples | Kind, positions, duplicates, empty containers, shared elements |
| References | Initialized mutable cells with only the owning runtime's `Any` annotation; identity and target |
| Dictionaries | Mutable/immutable kind, sealed state, observed entry order, keys, values and sharing |
| Tables | Ordered headers and row occurrences, including duplicate rows, empty/zero-column tables and structured cells |
| Lists/options/either/sets | Observed declared constructor state; no serialization of executable library behavior |
| Sharing/cycles | Object identity, equal-but-distinct objects, cycles and cross-root aliases |
| Observation/provenance | Caller-supplied JSON, carried separately from value structure |

No printer or arbitrary annotation runs during capture. Declared datatype methods
are behavior supplied by declarations and are outside the declared-slot state
contract; this includes `_output`. Non-method extension fields on data values
are rejected instead of dropped. Functions/methods in state-bearing slots,
opaque values, unrecognized branded library objects, standalone table Row
values, sparse arrays, unset/frozen references, and arbitrary reference
annotations produce explicit diagnostics. This API does not serialize closures
or a program's execution environment.

Value-only capture cannot discover unobserved datatype variants, erased generic
parameters, binding names, or complete declaration/source schemas. Supply
observation metadata explicitly. Runtime brand strings are not persisted as
stable declaration IDs. Rebinding saved constructor identities to executable
constructors in a fresh runtime requires a separate declaration-binding API.

## Format version 1

```text
{ format: "spytial-pyret-capture", version: 1,
  datum: { atoms, relations, types },
  roots: [{ name, atomId, observation? }], provenance? }
```

The datum remains the sole authority for value structure. Exact primitive labels,
`element`, `entry`, `column`, `row`, `target`, mutable-field and nullary facts use
the existing Core encoding. No second object tree is exported.

Nominal constructor type IDs encode `pyret:constructor:v1:[scope,index,name]`.
The scope is fresh for each capture. Existing field relation IDs retain their
`pyret:field:v1:[typeId,position,field]` encoding, now with the nominal type ID.
Labels retain the ordinary constructor name. Name-based type selectors use a
display-name supertype, so `node` still selects observed `node` variants; it is
the union when multiple nominal constructors have that spelling. Names reserved
by builtin kinds (e.g. `Number`) are not aliases: the nominal type remains
distinct and can be selected by its ID or other graph structure.

These are immutable snapshots. An edited datum must pass import validation, but
the API does not promise live program updates, complete edit semantics, or
backwards conversion to the legacy nominally ambiguous format.

`pyretCaptureSource(instance, rootId)` provides a best-effort source preview using
Core's existing source emitter. It rejects ambiguous same-named constructors.
Some valid structural graphs cannot be emitted as executable source. In
particular, direct container cycles and library aliasing may need constructs
the emitter does not support. Render the graph even if this preview fails.

## Verified runtime and reproducible checks

The compatibility target is upstream `brownplt/pyret-lang` revision
`6e62dcda5298606aa0abe66a372c4eb17a38db85` (`lang/` in the upstream monorepo).
The same checks also run locally against Spyret revision
`6a6c8728f7540d36a143538f6068eb033849ed27`.

```sh
npm ci
npm run build:pyret-capture
npm run test:run -- tests/pyret tests/pyret-data-instance.test.ts tests/pyret-from-expression.test.ts
# In the selected upstream checkout's lang/: npm ci --ignore-scripts && make phaseA
node scripts/check-pyret-capture.mjs /path/to/pyret/lang runtime-report.json
node scripts/check-pyret-capture-program.mjs /path/to/pyret/lang program-report.json
```

The runtime check constructs real runtime/library values, transports 23 roots to
a fresh Node process with no Pyret loaded, asserts structural identity/content,
and checks ten unsupported-value diagnostics. The program check compiles and
executes actual Pyret source, including two imported modules defining `same`
with different field orders, a reference cycle, an `_output` that throws, and
shared dictionary/table contents. The CI workflow pins and builds upstream and
uploads both reports. These checks establish structural capture, not arbitrary
executable reconstruction or a migration of the IDE's display extension.

The capture unit suite also runs 1,000 generated graphs for each of seeds 1 and 2.
It compares the original and imported graphs with a bijection, checking that
sharing, cycles, distinct objects, constructor identities, ordered fields and
primitive contents survive JSON transport independently of enumeration order.
