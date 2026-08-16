/**
 * Main entry point for the spytial-core library
 */

// Export sub-modules
export * as AlloyGraph from './data-instance/alloy/alloy-graph';
export * as AlloyInstance from './data-instance/alloy/alloy-instance';
export * as Evaluators from './evaluators';
export * as Layout from './layout';
export * as Translators from './translators';

// Export new data instance abstraction
export * from './data-instance/interfaces';
// Keeps a relation's positional column types intact on a write — anything
// implementing IInputDataInstance should settle a tuple through this.
export { settleTupleTypes } from './data-instance/tuple-types';
export type { AtomTypeLookup, SettledTuple } from './data-instance/tuple-types';
export { JSONDataInstance, DataInstanceNormalizer } from './data-instance/json-data-instance';
export { AlloyDataInstance, createEmptyAlloyDataInstance } from './data-instance/alloy-data-instance';
export { DotDataInstance } from './data-instance/dot/dot-data-instance';
export type { DotTypeConfig, DotTypeDescriptor, DotDataInstanceOptions } from './data-instance/dot/dot-data-instance';
export { RacketGDataInstance } from './data-instance/racket/racket-g-data-instance';
export { PyretDataInstance } from './data-instance/pyret/pyret-data-instance';
// The evaluator a PyretDataInstance runs against (`window.__internalRepl`).
// These types were exported from the REPL's expression parser before it was
// removed; they describe `fromExpression`'s third argument, so they keep their
// place on this entry, now from the data instance that actually uses them.
export type { PyretEvaluator, PyretEvaluationResult } from './data-instance/pyret/pyret-data-instance';
// Pyret structural reify / replit + data-instance canonical form (building blocks;
// the fidelity measurement harness that exercises these lives in tests/pyret/).
export { reifyToValue } from './data-instance/pyret/reify';
export type { ReifiedValue } from './data-instance/pyret/reify';
export { replit } from './data-instance/pyret/replit';
export { canon } from './data-instance/pyret/canon';
export { TlaDataInstance, createTlaDataInstance, isTlaDataInstance } from './data-instance/tla/tla-data-instance';

// Export schema descriptor functions for generating descriptions of data instances
export { 
  generateAlloySchema, 
  generateSQLSchema, 
  generateTextDescription 
} from './data-instance/schema-descriptor';
export type { SchemaDescriptorOptions } from './data-instance/schema-descriptor';

// Direct exports of key classes for convenience
export { LayoutInstance, ConstraintValidatorStrategy, AlignmentEdgeStrategy } from './layout/layoutinstance';
export { QualitativeConstraintValidator } from './layout/qualitative-constraint-validator';
export { parseLayoutSpec } from './layout/layoutspec';
// `parseLayoutSpec`'s return type. Replaces the `ParsedCnDSpec` alias that
// `translators` used to re-export — that name had already been deleted, so the
// re-export was dangling and shipped a broken line into dist/types.
export type { LayoutSpec } from './layout/layoutspec';
export { setupLayout } from './layout';
export { type default as IEvaluator, SelectorArityError } from './evaluator-contracts';
export { ForgeEvaluator, WrappedForgeEvaluator } from './evaluators/data/forge-evaluator';
// SQLEvaluator moved out of the default entry in 4.0.0 — it drags the alasql
// SQL engine (~500 KB min) into every bundle. Import it from
// 'spytial-core/sql-evaluator' (npm) or load spytial-core-sql.global.js (CDN).
export { WebColaTranslator } from './translators';
export { AccessibleTranslator, buildSpatialNavigationMap } from './translators';
// SpytialExplorer (the a11y explorer element) moved out of the default entry
// in 4.0.0 while it matures — it carries the data-navigator dependency. Import
// it from 'spytial-core/explorer' (npm, auto-registers the element) or load
// spytial-core-explorer.global.js after the main bundle (CDN).
export { StructuredInputGraph } from './translators';
// Edge-routing registry: opt-in routers register a mode here and it appears
// in the renderer's Routing dropdown (layoutFormat selects it by id).
export {
  registerRoutingMode,
  getRoutingMode,
  listRoutingModes,
  type RoutingModeDefinition,
  type RoutingPipeline,
  type EdgeRouter,
  type RouterHost,
  // The building blocks of the two interfaces above, so third-party routers
  // can write their own signatures (deep imports are blocked by the exports
  // map).
  type Point,
  type PortAttachment,
  type ObstacleRect,
  type BoundsRect,
} from './translators/webcola/routing';
export {
  ignoreHistory,
  stability,
  changeEmphasis,
  classifyChangeEmphasisChangedSet,
  randomPositioning,
  getSequencePolicy,
  registerSequencePolicy,
} from './translators';
export type {
  NodePositionHint,
  TransformInfo,
  LayoutState,
  WebColaLayoutOptions,
  SequencePolicy,
  SequencePolicyContext,
  SequencePolicyResult,
  SequenceViewportBounds,
  AccessibleLayout,
  AccessibleTranslatorOptions,
  SpatialNavigationMap,
  SpatialNeighbors,
  LayoutDescription,
  SpatialRelationshipDescription,
} from './translators';
export { SGraphQueryEvaluator } from "./evaluators/data/sgq-evaluator";
export { LayoutEvaluator, LayoutEvaluatorResult, LayoutEvaluatorRecordResult, LayoutEvaluatorEdgeResult } from "./evaluators/layout/layout-evaluator";
export type { SpatialQuery, DirectionalRelation, AlignmentAxis, Modality, EdgeInfo } from "./evaluators/layout/layout-evaluator";

// Selector synthesis API (requires SGraphQueryEvaluator)
export { 
  synthesizeAtomSelector,
  synthesizeBinarySelector,
  synthesizeAtomSelectorWithExplanation,
  synthesizeBinarySelectorWithExplanation,
  createOrientationConstraint,
  createAlignmentConstraint,
  createColorDirective,
  SelectorSynthesisError,
  isSynthesisSupported
} from './synthesis/selector-synthesizer';
export type { SynthesisWhy } from 'simple-graph-query';

// Browser-specific exports and initialization
if (typeof window !== 'undefined') {
  // Import and register WebCola custom element for browser environments
  import('./translators/webcola/webcola-cnd-graph').then(({ WebColaCnDGraph }) => {
    // Make d3 and webcola available globally for WebCola d3adaptor
    Promise.all([
      import('./vendor/d3.v4.min.js'),
      import('./vendor/cola.js')
    ]).then(([d3Module, colaModule]) => {
      (window as any).d3 = d3Module;
      (window as any).cola = colaModule;
      
      // Register the custom element
      if (typeof customElements !== 'undefined' && !customElements.get('webcola-cnd-graph')) {
        customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
        //console.log('✅ WebCola CnD Graph custom element registered');
      }

      // Register structured input graph
      import('./translators/webcola/structured-input-graph').then(({ StructuredInputGraph }) => {
        if (typeof customElements !== 'undefined' && !customElements.get('structured-input-graph')) {
          customElements.define('structured-input-graph', StructuredInputGraph as any);
          //console.log('✅ Structured Input Graph custom element registered');
        }
      }).catch(console.error);

      // <spytial-explorer> registration moved to the spytial-core/explorer
      // entry (spytial-core-explorer.global.js on CDN) in 4.0.0.
    }).catch(console.error);
  }).catch(console.error);
}

export interface CoreConfig {
  debug?: boolean;
  version?: string;
}

export class CndCore {
  private config: CoreConfig;

  constructor(config: CoreConfig = {}) {
    this.config = {
      debug: false,
      version: '1.0.0',
      ...config,
    };
  }

  /**
   * Initialize the core library
   */
  init(): void {
    if (this.config.debug) {
      //console.log(`CndCore initialized with version ${this.config.version}`);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): CoreConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  updateConfig(newConfig: Partial<CoreConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Utility functions
export const createCndCore = (config?: CoreConfig): CndCore => {
  return new CndCore(config);
};

export const version = '1.0.0';

// Error state (shared with the separately-bundled error modal UI).
// The React components themselves (ErrorMessageContainer, CndLayoutInterface)
// moved out of the default entry in 4.0.0: import them from 'spytial-core/react'
// (npm) or load dist/components/react-component-integration.global.js (CDN),
// which also exposes the window.mount* API.
export { ErrorStateManager } from './layout/error-state';
// LayoutWarning is exported because consumers *receive* it — it rides on
// `InstanceLayout.warnings` and on the `layout-warnings` event — and until now
// there was no name to import for it. The exports map blocks a deep import of
// the declaration, so the only way to annotate one was an indexed access into
// InstanceLayout.
export type { SystemError, SelectorErrorDetail, LayoutWarning } from './layout/error-state';

// Projection Transform (pre-layout data instance transformation)
export { applyProjectionTransform, topologicalSortWithCycleBreaking } from './data-instance/projection-transform';
export type { Projection, ProjectionTransformOptions, ProjectionTransformResult } from './data-instance/projection-transform';

// Evaluation API — headless layout + visual-consistency metrics from
// multiple sources (Penlloy PLATEAU 2025; Liang TOSEM 2026), plus a
// per-frame constraint-adherence fairness check. Intended for
// sequence-policy analysis (e.g., the thesis evaluation repo); not
// for production rendering.
export {
  runHeadlessLayout,
  positionalConsistency,
  relativeConsistency,
  pairwiseDistanceConsistency,
  changeEmphasisSeparation,
  constraintAdherence,
  classifyChangeEmphasisStableSet,
  // Misue mental-map battery (JVLC 1995)
  orthogonalOrderingPreservation,
  knnJaccard,
  edgeCrossings,
  edgeCrossingsDelta,
  directionalCoherence,
  stableQuietRatio,
  // Constraint-perturbation moderator
  constraintPerturbation,
  // Appropriateness oracles
  positionalOracle,
  pairwiseDistanceOracle,
} from './evaluation';
export type {
  HeadlessLayoutOptions,
  HeadlessLayoutResult,
  EdgeKey,
  CrossingEdge,
  ChangeEmphasisSeparation,
  PairwiseDistanceOracleOptions,
} from './evaluation';

// The spec-language contract: a machine-readable description of the YAML spec
// language, versioned by the date it last changed (LANGUAGE_VERSION), which
// moves independently of this package's version.
// Integrations that GENERATE specs should read this rather than the prose
// reference — it is pinned to the parser by tests/language-manifest.test.ts.
// The same data ships as `docs/spytial-language.json` (plus a JSON Schema) for
// non-JS consumers.
export {
  LANGUAGE_VERSION,
  LANGUAGE_VERSIONING,
  getLanguageManifest,
  getLanguageItems,
  getLanguageItem,
  getLanguageBlocks,
  buildJsonSchema,
} from './language';
export type {
  LanguageManifest,
  LanguageItem,
  LanguageField,
  LanguageBlock,
  ItemDeprecation,
  FieldDeprecation,
  SpecSection,
  FieldType,
  SelectorArity,
  Enforcement,
  DocumentRules,
  HoldRules,
} from './language';
