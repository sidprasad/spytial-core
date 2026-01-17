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
export { RacketGDataInstance } from './data-instance/racket/racket-g-data-instance';
export { PyretDataInstance } from './data-instance/pyret/pyret-data-instance';
export { TlaDataInstance, createTlaDataInstance, isTlaDataInstance } from './data-instance/tla/tla-data-instance';

// Export schema descriptor functions for generating descriptions of data instances
export { 
  generateAlloySchema, 
  generateSQLSchema, 
  generateTextDescription 
} from './data-instance/schema-descriptor';
export type { SchemaDescriptorOptions } from './data-instance/schema-descriptor';

// Direct exports of key classes for convenience
export { LayoutInstance } from './layout/layoutinstance';
export { parseLayoutSpec } from './layout/layoutspec';
export { setupLayout } from './layout';
export { type default as IEvaluator } from './evaluators/interfaces';
export { ForgeEvaluator, WrappedForgeEvaluator } from './evaluators/forge-evaluator';
export { WebColaTranslator } from './translators';
export { StructuredInputGraph } from './translators';
export type { ParsedCnDSpec, NodePositionHint, WebColaLayoutOptions } from './translators';
export { SGraphQueryEvaluator } from "./evaluators/sgq-evaluator";
export { PythonEvaluator } from "./evaluators/python-evaluator";

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

// Export React components
export { InstanceBuilder } from './components/InstanceBuilder/InstanceBuilder';
export type { InstanceBuilderProps } from './components/InstanceBuilder/InstanceBuilder';
export { ReplInterface } from './components/ReplInterface/ReplInterface';
export type { ReplInterfaceProps } from './components/ReplInterface/ReplInterface';
export { PyretReplInterface } from './components/ReplInterface/PyretReplInterface';
export type { PyretReplInterfaceProps } from './components/ReplInterface/PyretReplInterface';
export { ReplWithVisualization } from './components/ReplInterface/ReplWithVisualization';
export type { ReplWithVisualizationProps } from './components/ReplInterface/ReplWithVisualization';

// Export Combined Input Component
export { CombinedInputComponent } from './components/CombinedInput/CombinedInputComponent';
export type { CombinedInputConfig, CombinedInputProps, LayoutViewMode } from './components/CombinedInput/CombinedInputComponent';
export { mountCombinedInput, createCombinedInputSetup, setupCombinedInput } from './components/CombinedInput/mounting';
export type { CombinedInputMountConfig } from './components/CombinedInput/mounting';

// Export REPL parsers
export { PyretExpressionParser } from './components/ReplInterface/parsers/PyretExpressionParser';
export type { PyretEvaluator, PyretEvaluationResult } from './components/ReplInterface/parsers/PyretExpressionParser';

// Projection Controls Component
export { ProjectionControls } from './components/ProjectionControls';
export type { ProjectionControlsProps, ProjectionChoice } from './components/ProjectionControls';
