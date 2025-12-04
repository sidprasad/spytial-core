/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';


// WebColaCnDGraph web component for browser usage
export { WebColaCnDGraph } from './webcola/webcola-cnd-graph';

// StructuredInputGraph web component for structured input
export { StructuredInputGraph } from './webcola/structured-input-graph';

// AlloyInputGraph web component for Alloy/Forge workflows
export { AlloyInputGraph } from './webcola/alloy-input-graph';
export type { AlloyInputControlsAPI, AlloyValidationError, AlloyValidationResult } from './webcola/alloy-input-graph';
export { AlloyInputControlsPanel, createAlloyInputControlsPanel } from './webcola/alloy-input-controls-panel';
export type { AlloyInputControlsPanelConfig } from './webcola/alloy-input-controls-panel';

// Re-export types for convenience
export type { 
  InstanceLayout, 
  LayoutNode, 
  LayoutEdge, 
  LayoutConstraint, 
  LayoutGroup 
} from '../layout/interfaces';

export type { 
  NodeWithMetadata, 
  EdgeWithMetadata, 
  NodePositionHint, 
  WebColaLayoutOptions 
} from './webcola/webcolatranslator';
