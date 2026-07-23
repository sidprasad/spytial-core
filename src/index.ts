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
export { JSONDataInstance, DataInstanceNormalizer } from './data-instance/json-data-instance';
export { AlloyDataInstance, createEmptyAlloyDataInstance } from './data-instance/alloy-data-instance';
export { DotDataInstance } from './data-instance/dot/dot-data-instance';
export type { DotTypeConfig, DotTypeDescriptor, DotDataInstanceOptions } from './data-instance/dot/dot-data-instance';
export { RacketGDataInstance } from './data-instance/racket/racket-g-data-instance';
export { PyretDataInstance } from './data-instance/pyret/pyret-data-instance';
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
export { setupLayout } from './layout';
export { type default as IEvaluator, SelectorArityError } from './evaluators/interfaces';
export { ForgeEvaluator, WrappedForgeEvaluator } from './evaluators/data/forge-evaluator';
// SQLEvaluator moved out of the default entry in 4.0.0 — it drags the alasql
// SQL engine (~500 KB min) into every bundle. Import it from
// 'spytial-core/sql-evaluator' (npm) or load spytial-core-sql.global.js (CDN).
export { WebColaTranslator } from './translators';
export { AccessibleTranslator, buildSpatialNavigationMap } from './translators';
export { SpytialExplorer } from './components/spytial-explorer';
export { StructuredInputGraph } from './translators';
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
  ParsedCnDSpec,
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

      // Register spytial-explorer
      import('./components/spytial-explorer/spytial-explorer').then(({ SpytialExplorer }) => {
        if (typeof customElements !== 'undefined' && !customElements.get('spytial-explorer')) {
          customElements.define('spytial-explorer', SpytialExplorer as any);
        }
      }).catch(console.error);
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
// The React components themselves (ErrorMessageContainer, InstanceBuilder, the
// REPL interfaces, ProjectionControls/Orchestrator, CndLayoutInterface) moved
// out of the default entry in 4.0.0: import them from 'spytial-core/react'
// (npm) or load dist/components/react-component-integration.global.js (CDN),
// which also exposes the window.mount* API.
export { ErrorStateManager } from './layout/error-state';
export type { SystemError, SelectorErrorDetail } from './layout/error-state';

// REPL expression parser (React-free; kept for Pyret hosts using the global)
export { PyretExpressionParser } from './components/ReplInterface/parsers/PyretExpressionParser';
export type { PyretEvaluator, PyretEvaluationResult } from './components/ReplInterface/parsers/PyretExpressionParser';

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
