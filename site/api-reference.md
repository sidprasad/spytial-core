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

Parse a YAML string into a typed `LayoutSpec`. Exposed type: `ParsedCnDSpec` (from `translators`).

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
layoutInstance.generateLayout(instance: IDataInstance): InstanceLayout
```

The orchestrator. `generateLayout` returns an `InstanceLayout` object that any translator can render.

### `setupLayout(spec, instance, evaluator)`

Sugar for the three-line incantation: parses `spec` if it's a string, builds a `LayoutInstance`, and calls `generateLayout`.

---

## Data instances

| Export | Notes |
|--------|-------|
| `JSONDataInstance`, `DataInstanceNormalizer`             | Canonical JSON path. |
| `AlloyDataInstance`, `createEmptyAlloyDataInstance`      | Alloy XML evaluator output. |
| `DotDataInstance`, `DotTypeConfig`, `DotTypeDescriptor`, `DotDataInstanceOptions` | Graphviz DOT with optional layered type system. |
| `RacketGDataInstance`                                     | rkt-graphable. |
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
| `SQLEvaluator`                                  | AlaSQL-backed alternative for users who'd rather write SQL. |
| `LayoutEvaluator`, `LayoutEvaluatorResult`, `LayoutEvaluatorRecordResult`, `LayoutEvaluatorEdgeResult` | Spatial query engine — answers questions like "what's directly above A?". Used by `<spytial-explorer>` and accessibility tooling. |
| `SpatialQuery`, `DirectionalRelation`, `AlignmentAxis`, `Modality`, `EdgeInfo` | Types used by `LayoutEvaluator`. |

Re-exported namespace: `Evaluators`.

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

## Projection transform

Projections are a **pre-layout data transformation**, not a layout directive.

```typescript
import { applyProjectionTransform, topologicalSortWithCycleBreaking } from 'spytial-core';
import type { Projection, ProjectionTransformOptions, ProjectionTransformResult } from 'spytial-core';
```

Pass an `evaluateOrderBy` callback (`(selector) => string[][]`) to support relation-driven ordering. See [docs/DEV_GUIDE.md § Projection Transform](https://github.com/sidprasad/spytial-core/blob/main/docs/DEV_GUIDE.md#projection-transform-pre-layout-data-rewriting) for the full discussion.

---

## Web components (custom elements)

These register themselves automatically when the bundle loads in a browser.

| Tag                     | Class                | Role                                                                          |
|-------------------------|----------------------|-------------------------------------------------------------------------------|
| `<webcola-cnd-graph>`   | `WebColaCnDGraph`    | The default visual renderer. Methods: `renderLayout`, `generateSequenceLayouts`, `getLayoutState`, `getNodePositions`, `clear`, `highlightNodes`, `highlightNodePairs`, `clearNodeHighlights`, `getAllRelations`, `highlightRelation`, `clearHighlightRelation`. |
| `<spytial-explorer>`    | `SpytialExplorer`    | `WebColaCnDGraph` + Data Navigator overlay, must/can spatial REPL, datum REPL, group navigation, modal spatial annotations. Adds `enableAccessibility(layout, validator, dataEvaluator?)`. |
| `<structured-input-graph>` | `StructuredInputGraph` | Form-like editor for building specs and instances. |

---

## React components

| Export | Role |
|--------|------|
| `ProjectionControls`, `ProjectionControlsProps`, `ProjectionChoice` | Type/atom dropdown UI for projections. |
| `ProjectionOrchestrator`, `ProjectionOrchestratorProps`, `ProjectionOrchestratorResult` | Wraps `applyProjectionTransform` + controls into one component. |
| `InstanceBuilder`, `InstanceBuilderProps`                    | Visual graph editor for building data instances. |
| `ReplInterface`, `ReplInterfaceProps`                        | Generic REPL component. |
| `PyretReplInterface`, `PyretReplInterfaceProps`              | Pyret-flavoured REPL. |
| `ReplWithVisualization`, `ReplWithVisualizationProps`        | REPL + linked diagram. |
| `PyretExpressionParser`, `PyretEvaluator`, `PyretEvaluationResult` | Pyret expression parsing helpers used by `PyretReplInterface`. |
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
| `spytial-core` (default export)                                     | NPM consumers (Vite, Webpack, esbuild, …).     |
| `spytial-core/components/*`                                         | Tree-shakable subpath for individual components. |
| `dist/browser/spytial-core-complete.global.js` (CDN)                | Self-contained browser bundle.                 |

CDN URLs:

- jsDelivr: `https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`
- unpkg:    `https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`

For reproducibility, pin a version (`spytial-core@2.5.2`).

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
