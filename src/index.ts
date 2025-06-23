/**
 * Main entry point for the cnd-core library
 */

// Export sub-modules
export * as AlloyGraph from './alloy-graph';
export * as AlloyInstance from './alloy-instance';
export * as Evaluators from './evaluators';
export * as Layout from './layout';
export * as Translators from './translators';

// Direct exports of key classes for convenience
export { LayoutInstance } from './layout/layoutinstance';
export { parseLayoutSpec } from './layout/layoutspec';
export { setupLayout } from './layout';
export { type default as IEvaluator } from './evaluators/interfaces';
export { ForgeEvaluator, WrappedForgeEvaluator } from './evaluators/forge-evaluator';
export { WebColaTranslator, DagreTranslator } from './translators';

// Browser-specific exports and initialization
if (typeof window !== 'undefined') {
  // Import and register WebCola custom element for browser environments
  import('./translators/webcola/webcola-cnd-graph').then(({ WebColaCnDGraph }) => {
    // Make d3 and webcola available globally for WebCola d3adaptor
    Promise.all([
      import('d3'),
      import('webcola')
    ]).then(([d3Module, colaModule]) => {
      (window as any).d3 = d3Module;
      (window as any).cola = colaModule;
      
      // Register the custom element
      if (typeof customElements !== 'undefined' && !customElements.get('webcola-cnd-graph')) {
        customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
        console.log('✅ WebCola CnD Graph custom element registered');
      }
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
      console.log(`CndCore initialized with version ${this.config.version}`);
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
