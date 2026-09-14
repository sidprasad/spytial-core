# Migrating to spytial-core 6.0

## Store by ID, query by name

`JSONDataInstance` no longer destroys distinct relation identities during
normalization. Given records `A:foo` and `B:foo`, both named `foo`,
`getRelations()` returns both. A selector `foo` still denotes their tuple set
union; the SQL evaluator still exposes one table `foo`. Duplicate tuples are
identified by their ordered atom IDs, not type annotations. The default JSON
graph draws a shared `(name, tuple)` once without changing the stored records.

This is a breaking data-instance/API change, **not a selector-language change**.
Existing YAML selectors do not need to be rewritten to IDs.

- `mergeRelations: true` (default) merges only repeated IDs. Missing IDs still
  default to names, so name-only producers retain their previous behavior.
- One ID associated with different names is an error. Fix the producer's IDs;
  don't rely on whichever record happened to arrive first.
- `mergeRelations: false` requires unique IDs. Same-named records with distinct
  IDs are valid with either setting.
- `addRelationTuple` and `removeRelationTuple` use exact IDs. To edit a relation
  selected by name, resolve the intended ID explicitly; don't pick the first
  record of an ambiguous name.
- `addFromDataInstance` preserves distinct relation IDs. JSON composition checks
  conflicting names before changing atoms or tuples.
- Replace `getRelations().find(r => r.name === name)` when you intend a query
  over all records. `relationsByName(records)` and `nameBasedView(instance)`
  provide a name-based set projection, independent of stored identity. Never
  serialize that projection as a substitute for the original host datum.
- Use `IAtom.metadata` for JSON-serializable host reconstruction data; it is
  independent of display `label` / `labels`, and survives atom-ID remapping.

Hosts that emit `id === name` need no payload change. Hosts that already emit
qualified IDs gain preservation automatically. Audit code that assumes one
`getRelations()` record per name, caches a single such record, counts raw
records as query relations, or uses relation names as mutation IDs.

## Pyret constructor values

The working `PyretDataInstance` now accepts primitive roots directly, including
`0`, `false`, and the empty string. For real Pyret `data` values it reads
`$name`, `$arity`, and `$constructor.$fieldNames`, rather than inferring declared
field order from the object's dictionary.

Constructor fields use versioned relation IDs:

```text
id:   pyret:field:v1:["duo",0,"zebra"]
name: zebra

id:   pyret:field:v1:["duo",1,"alpha"]
name: alpha
```

The suffix is a JSON array `[constructorName, position, fieldName]`, not an
unescaped delimiter convention. Names and displayed labels stay unchanged.
An atom carries `metadata: { pyret: { version: 1, arity: n } }`; `-1` denotes a
singleton and `0` denotes a zero-argument constructor application. Metadata is
not encoded in atom IDs, because composition may remap those IDs.

Reification reads only this datum, validates declared positions and arity, and
does not require the producer's constructor cache. Missing or conflicting
positions are errors, not guesses. Legacy/synthetic objects lacking this
metadata retain the previous cache/alphabetical fallback and its limitations.
Existing exported v5 data cannot recover metadata that was never recorded.

The target is finite immutable acyclic constructor data with default Pyret
printing, over strings, booleans, and bounded exact integers. Sharing is allowed.
Custom `_output`, references/cycles, plain objects, tuples, arrays, and general
Pyret numbers are not newly claimed as inspection-faithful. The real-Pyret
integration experiment lives in `spyret-ide`; core's runtime-shaped property
tests alone are not evidence for all real Pyret values.

This change prepares a major release. It does not publish the package or
automatically upgrade downstream applications' pinned dependencies.

## Verification of this change

- Core: 167 test files, **2,469 tests passing**, including 300 generated
  relation-identity cases and 500 generated constructor-order cases.
- `npm run typecheck` and `npm run build:all` pass.
- Real Spyret integration, native Node 22.22.2 / Chrome 152: **154/154** exact
  `torepr` matches with seed 1 (10 samples per family/schema, 5 schemas), and
  **63/63** with seed 2 (3 samples per family/schema, 2 schemas).
- The IDE's pinned-4.4.3 regression suites still pass their 111 baseline tests.

For the real-Pyret checks, build core and use `SPYTIAL_CORE_DIST` in the
`spyret-ide/test/constructor-data` harness. No publication or production pin
change is needed. Each report records the actual core version, override path,
runtime/core artifact fingerprints, fixture manifest, and every A/B comparison.
