/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';


// WebColaCnDGraph web component for browser usage
export { WebColaCnDGraph } from './webcola/webcola-cnd-graph';

// StructuredInputGraph web component for structured input
export { StructuredInputGraph } from './webcola/structured-input-graph';

// Data Navigator translators
export { 
  DataNavigatorTranslator,
  createDataNavigatorTranslator,
  translateToDataNavigator
} from './data-navigator';
export type {
  DataNavigatorStructure,
  AccessibilityTranslatorOptions,
  SemanticProperties,
  SpatialProperties
} from './data-navigator';

// Re-export types for convenience
export type { 
  InstanceLayout, 
  LayoutNode, 
  LayoutEdge, 
  LayoutConstraint, 
  LayoutGroup 
} from '../layout/interfaces';

export type { NodeWithMetadata, EdgeWithMetadata } from './webcola/webcolatranslator';
