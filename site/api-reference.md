# API Reference

This is the exported surface of `spytial-core` (npm `spytial-core`, CDN global `spytialcore`). Symbols are grouped by role; everything below is reachable from the package root unless noted.

> This page mirrors [src/index.ts](https://github.com/sidprasad/spytial-core/blob/main/src/index.ts). When in doubt, that file is authoritative.

---

## Pipeline (the core five)

These five symbols are what almost every integration touches.

### `JSONDataInstance`

```typescript
new JSONDataInstance(payload: IJsonDataInstance, options?: IJsonImportOptions)
```

Builds a canonical `IDataInstance` from the [JSON format](json-data.md). `IJsonImportOptions`:

| Field                | Default | Meaning                                                       |
|----------------------|---------|---------------------------------------------------------------|
| `mergeRelations`     | `true`  | Combine tuples of relations that share a name.                |
| `inferTypes`         | `true`  | Auto-generate missing type definitions from atom types.       |
| `validateReferences` | `true`  | Throw if a tuple references a missing atom id.                |
| `deduplicateAtoms`   | `true`  | Drop later atoms with a duplicate id.                         |

Also exported: `DataInstanceNormalizer` for running those passes manually.

### `parseLayoutSpec(yaml: string): LayoutSpec`

Parse a YAML string into a typed `LayoutSpec`. The `LayoutSpec` type is exported from the package root.

### `SGraphQueryEvaluator`

```typescript
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: instance });   // sourceData : IDataInstance
const result = evaluator.evaluate('Node - left.Node');
```

Implements `IEvaluator`. Use this unless you specifically need Forge or SQL semantics.

Result methods: `selectedAtoms()`, `selectedTwoples()`, `selectedTuplesAll()`, `singleResult()`, `prettyPrint()`, `noResult()`, `isError()`, `isSingleton()`, `maxArity()`, `getExpression()`, `getRawResult()`. See `IEvaluatorResult` in [src/evaluators/interfaces.ts](https://github.com/sidprasad/spytial-core/blob/main/src/evaluators/interfaces.ts).

### `LayoutInstance`

```typescript
new LayoutInstance(spec: LayoutSpec, evaluator: IEvaluator)
layoutInstance.generateLayout(instance: IDataInstance): {
  layout: InstanceLayout;
  error: ConstraintError | null;
  selectorErrors: SelectorErrorDetail[];
  warnings: LayoutWarning[];
}
```

The orchestrator. `generateLayout` returns a result object, not the layout itself. The `layout` field holds the `InstanceLayout` that any translator can render — pass **that** to `renderLayout`, not the whole result. `error` is non-null when constraints are unsatisfiable (the layout is then a counterfactual diagram with the conflict highlighted), and `selectorErrors` / `warnings` report selectors that failed or quietly matched nothing.

### `setupLayout(spec, instance, evaluator)`

Sugar for the three-line incantation: parses `spec` if it's a string, builds a `LayoutInstance`, and calls `generateLayout`.

---

## Data instances

| Export | Notes |
|--------|-------|
| `JSONDataInstance`, `DataInstanceNormalizer`             | Canonical JSON path. |
| `AlloyDataInstance`, `createEmptyAlloyDataInstance`      | Alloy XML evaluator output. |
| `DotDataInstance`, `DotTypeConfig`, `DotTypeDescriptor`, `DotDataInstanceOptions` | Graphviz DOT with optional layered type system. |
| `PyretDataInstance`                                       | Pyret value-skeleton output. |
| `TlaDataInstance`, `createTlaDataInstance`, `isTlaDataInstance` | TLA+ traces. |
| `IDataInstance`, `IInputDataInstance`, `IAtom`, `ITuple`, `IType`, `IRelation`, `DataInstanceEvent`, `DataInstanceEventListener`, `DataInstanceEventType` | Core interface types. |

Re-exported namespaces: `AlloyGraph`, `AlloyInstance`.

---

## Schema descriptors

```typescript
generateAlloySchema(instance, options?)      // sigs / fields, Alloy-style
generateSQLSchema(instance, options?)        // CREATE TABLE statements
generateTextDescription(instance, options?)  // human-readable summary
```

`SchemaDescriptorOptions`: `includeBuiltInTypes`, `includeTypeHierarchy`, `includeArityHints`. Useful for LLM prompts, generated docs, debugging.

---

## Layout

| Export | Notes |
|--------|-------|
| `LayoutInstance`                          | Layout orchestrator. |
| `parseLayoutSpec`                         | YAML → `LayoutSpec`. |
| `setupLayout`                             | Convenience wrapper. |
| `ConstraintValidatorStrategy`             | Strategy pattern hook for swapping the validator. |
| `AlignmentEdgeStrategy`                   | Strategy hook for the alignment-edge optimisation. |
| `QualitativeConstraintValidator`          | Qualitative spatial constraint validator (above/below/left/right/align/cyclic). Used inside `LayoutInstance`; exposed for accessibility components and tests. |

Re-exports under `Layout` namespace include `LayoutSpec`, `InstanceLayout`, `LayoutNode`, `LayoutEdge`, `LayoutConstraint`, `LayoutGroup`, plus all of `colorpicker`, `constraint-types`, `equivalence-checker`, `denotation-diff`, `icon-registry`.

---

## Evaluators

| Export | Notes |
|--------|-------|
| `IEvaluator` (default)                          | The evaluator interface. |
| `SelectorArityError`                            | Thrown when a unary/binary selector mismatches the constraint. |
| `SGraphQueryEvaluator`                          | Default selector engine. |
| `ForgeEvaluator`, `WrappedForgeEvaluator`       | Forge expression evaluator (uses the `forge-expr-evaluator` dependency). |
| `SQLEvaluator` *(moved in 4.0.0)*               | AlaSQL-backed alternative for users who'd rather write SQL. Import from `spytial-core/sql-evaluator`; on CDN pages load `spytial-core-sql.global.js`. |
| `LayoutEvaluator`, `LayoutEvaluatorResult`, `LayoutEvaluatorRecordResult`, `LayoutEvaluatorEdgeResult` | Spatial query engine — answers what a spec entails ("what *must* be above A?"), against the solved constraint graph rather than rendered positions. Used by `<spytial-explorer>`, accessibility tooling, and the conformance harness. |
| `SpatialQuery`, `DirectionalRelation`, `AlignmentAxis`, `Modality`, `EdgeInfo` | Types used by `LayoutEvaluator`. |

Re-exported namespace: `Evaluators`.

---

## Conformance harness

Testing for integrations: does the relationalizer's datum describe a well-formed graph, and does the emitted spec entail the spatial facts its author meant? Import from `spytial-core/conformance`, or use the `spytial-check` bin from a host that is not JavaScript. See [Testing an Integration](testing-integrations.md).

| Export | Notes |
|--------|-------|
| `runCase`, `runCases`      | Run conformance cases. Never throw — failures come back as diagnostics. |
| `checkDatum`               | Check a raw relationalizer output on its own, before the data instance normalizes it. |
| `evaluateAssertion`, `validateAssertion` | The assertion layer, if you are building your own runner. |
| `extractCases`             | Read cases out of a document (single case, array, or `{cases: [...]}`). |
| `CONFORMANCE_FORMAT_VERSION`, `ASSERTION_CHECKS` | The case/result contract version, and every check an assertion can carry. |
| `ConformanceCase`, `Assertion`, `CaseResult`, `RunResult`, `Diagnostic`, `DiagnosticCode` | Types for the case and result JSON. |

---

## Translators

| Export | Notes |
|--------|-------|
| `WebColaTranslator`              | Programmatic (non-element) WebCola compilation target. |
| `AccessibleTranslator`, `buildSpatialNavigationMap` | Parallel a11y compilation target. |
| `StructuredInputGraph`           | Custom element for structured (form-like) input authoring. |

Type re-exports include `InstanceLayout`, `LayoutNode`, `LayoutEdge`, `LayoutConstraint`, `LayoutGroup`, `NodeWithMetadata`, `EdgeWithMetadata`, `NodePositionHint`, `TransformInfo`, `LayoutState`, `WebColaLayoutOptions`, `AccessibleLayout`, `AccessibleTranslatorOptions`, `SpatialNavigationMap`, `SpatialNeighbors`, `LayoutDescription`, `SpatialRelationshipDescription`.

Re-exported namespace: `Translators`.

---

## Sequence policies

```typescript
import {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  classifyChangeEmphasisChangedSet,
  getSequencePolicy,
  registerSequencePolicy,
} from 'spytial-core';

import type {
  SequencePolicy,
  SequencePolicyContext,
  SequencePolicyResult,
  SequenceViewportBounds,
} from 'spytial-core';
```

See [Sequences of States](sequences.md) for usage. `classifyChangeEmphasisChangedSet` exposes the diff classifier behind `changeEmphasis` for hosts that want to drive their own emphasis logic.

---

## Web components (custom elements)

These register themselves automatically when the bundle loads in a browser.

| Tag                     | Class                | Role                                                                          |
|-------------------------|----------------------|-------------------------------------------------------------------------------|
| `<webcola-cnd-graph>`   | `WebColaCnDGraph`    | The default visual renderer. Methods: `renderLayout`, `generateSequenceLayouts`, `getLayoutState`, `getNodePositions`, `clear`, `highlightNodes`, `highlightNodePairs`, `clearNodeHighlights`, `getAllRelations`, `highlightRelation`, `clearHighlightRelation`. |
| `<spytial-explorer>`    | `SpytialExplorer`    | `WebColaCnDGraph` + Data Navigator overlay, must/can spatial REPL, datum REPL, group navigation, modal spatial annotations. Adds `enableAccessibility(layout, validator, dataEvaluator?)`. Opt-in since 4.0.0: `spytial-core/explorer` (npm) or `spytial-core-explorer.global.js` (CDN). |
| `<structured-input-graph>` | `StructuredInputGraph` | Form-like editor for building specs and instances. |

### Events from `<webcola-cnd-graph>`

The element draws into its own shadow root, so anything it shows about a render
— the spec-warnings badge, an error — is only visible to someone looking at the
diagram. These events are how a host learns the same things. All bubble except
`layout-complete`, which must be listened for on the element itself.

| Event | Detail | When |
|-------|--------|------|
| `layout-complete`      | `{ nodePositions }`                        | A render finished, including one that drew nothing. |
| `layout-warnings`      | `{ warnings: LayoutWarning[] }`            | The layout carried advisory warnings — a selector that matched nothing, a deprecated spec form. |
| `layout-error`         | `LayoutErrorDetail`                        | A render failed. `fatal: false` means the diagram is on screen but degraded (e.g. the solver could not run, so positions are unsolved). |
| `relations-available`  | `{ relations, count }`                     | The relation names in the rendered layout, for highlighting UI. |

A layout with no nodes is not an error: the element draws an empty canvas, says
so on it, and still fires `layout-complete`. If that is unexpected, the datum
reaching `generateLayout` had no atoms — check the `layout-warnings` detail,
where a selector matching nothing is the usual tell.

---

## React components

Since 4.0.0 these live on their own entry: `import { … } from 'spytial-core/react'`
(npm; styles via `spytial-core/react.css`), or the CDN component bundle
`dist/components/react-component-integration.global.js`, which also exposes the
`window.mount*` API. Exception: `ErrorStateManager` (+ its types) is React-free
and stays on the default entry too.

| Export | Role |
|--------|------|
| `ErrorMessageContainer`, `ErrorMessageContainerProps`        | UI surface for system errors. |
| `ErrorStateManager`, `SystemError`, `SelectorErrorDetail`    | Error-state plumbing for surfacing selector / IIS errors. |

Components are tree-shakable and also published under the subpath `spytial-core/components/*`.

---

## Selector synthesis

Generate CnD selector expressions from positive/negative atom or pair examples — useful for "I clicked these three nodes; give me a selector that picks them" UIs.

```typescript
synthesizeAtomSelector(examples, maxDepth?)                    // unary
synthesizeBinarySelector(examples, maxDepth?)                  // binary
synthesizeAtomSelectorWithExplanation(examples, maxDepth?)     // + provenance tree
synthesizeBinarySelectorWithExplanation(examples, maxDepth?)   // + provenance tree

createOrientationConstraint(selector, directions)              // → YAML snippet
createAlignmentConstraint(selector, alignment)                 // → YAML snippet
createColorDirective(selector, color)                          // → YAML snippet

isSynthesisSupported(dataInstance): boolean
SelectorSynthesisError                                         // thrown on infeasible synthesis
```

Type: `SynthesisWhy` (re-exported from `simple-graph-query`) — the structure of provenance explanations. See [docs/SELECTOR_SYNTHESIS.md](https://github.com/sidprasad/spytial-core/blob/main/docs/SELECTOR_SYNTHESIS.md) for the full algorithm.

---

## Evaluation API (sequence-policy analysis)

A headless layout pipeline plus visual-consistency metrics. Intended for offline analysis (the thesis evaluation repo, A/B comparisons of policies); not for production rendering.

```typescript
runHeadlessLayout(options)
positionalConsistency(...)
relativeConsistency(...)
pairwiseDistanceConsistency(...)
changeEmphasisSeparation(...)
constraintAdherence(...)
classifyChangeEmphasisStableSet(...)
```

Types: `HeadlessLayoutOptions`, `HeadlessLayoutResult`, `EdgeKey`, `ChangeEmphasisSeparation`. See [docs/evaluation-api.md](https://github.com/sidprasad/spytial-core/blob/main/docs/evaluation-api.md).

---

## Errors

| Error | Thrown when |
|-------|-------------|
| `SelectorArityError`         | A selector evaluates to the wrong arity for the constraint (e.g. unary where binary is needed). |
| `SelectorSynthesisError`     | The synthesizer can't find a covering selector at the requested depth. |

`ErrorStateManager` (above) is the recommended way to surface either to a user.

---

## Library shell

| Export | Notes |
|--------|-------|
| `CndCore`, `createCndCore`, `CoreConfig` | Tiny config object, kept for backward compatibility. Most integrations don't need it. |
| `version`                                | The package version string. |
| `window.spytialcore` (and aliases `window.CndCore`, `window.CnDCore`) | The CDN global. |

---

## Bundles

| Path                                                                | Use                                            |
|---------------------------------------------------------------------|------------------------------------------------|
| `spytial-core` (default entry)                                      | NPM consumers (Vite, Webpack, esbuild, Node). Real ESM — tree-shakable, no React/SQL weight. |
| `spytial-core/react`                                                | The React components (error modal, REPLs, projections, `CndLayoutInterface`). `react`/`react-dom` are optional peer deps. Styles: `spytial-core/react.css`. |
| `spytial-core/sql-evaluator`                                        | `SQLEvaluator` (AlaSQL-backed). `alasql` is an optional peer dep. |
| `spytial-core/explorer`                                             | `<spytial-explorer>` a11y element (registers itself on import). `data-navigator` is an optional peer dep. |
| `spytial-core/alloy-instance`                                       | Standalone Alloy XML parser. |
| `spytial-core/evaluator`                                            | Self-contained headless evaluator (bundles SGQ). |
| `spytial-core/conformance`                                          | The conformance harness for integration tests. |
| `spytial-check` (bin)                                               | CLI wrapper around the harness: case documents in, JSON verdict on stdout, exit 0/1/2. Self-contained, so it can be vendored beside a non-JavaScript package. |
| `dist/browser/spytial-core-complete.global.js` (CDN)                | Self-contained browser bundle (engine + custom elements; no React components or SQL since 4.0.0). Carries its own d3 v4 and WebCola, so it needs no other script tag; it publishes both on `window` only if the page has not already set them. Set `window.d3v4` before loading to make it use your own d3 v4 build instead. |
| `dist/browser/spytial-core-sql.global.js` (CDN, opt-in)             | Adds `SQLEvaluator` back onto the `spytialcore` global for pages using SQL selectors. Load after the main bundle. |
| `dist/browser/spytial-core-explorer.global.js` (CDN, opt-in)        | Registers `<spytial-explorer>` and adds `SpytialExplorer` onto the `spytialcore` global. Load after the main bundle. |
| `dist/components/react-component-integration.global.js` + `.css` (CDN) | React component bundle + `window.mount*` API (`mountErrorMessageModal`, `mountCndLayoutInterface`, …). |

CDN URLs:

- jsDelivr: `https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`
- unpkg:    `https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`

For reproducibility, pin a version (`spytial-core@5.4.0`).

---

## Where each symbol lives

If you want to read the source rather than the prose:

- Pipeline plumbing: [src/index.ts](https://github.com/sidprasad/spytial-core/blob/main/src/index.ts)
- Data interfaces: [src/data-instance/interfaces.ts](https://github.com/sidprasad/spytial-core/blob/main/src/data-instance/interfaces.ts)
- Layout: [src/layout/](https://github.com/sidprasad/spytial-core/tree/main/src/layout)
- Evaluators: [src/evaluators/](https://github.com/sidprasad/spytial-core/tree/main/src/evaluators)
- Translators: [src/translators/](https://github.com/sidprasad/spytial-core/tree/main/src/translators)
- Synthesis: [src/synthesis/selector-synthesizer.ts](https://github.com/sidprasad/spytial-core/blob/main/src/synthesis/selector-synthesizer.ts)
- Components: [src/components/](https://github.com/sidprasad/spytial-core/tree/main/src/components)
