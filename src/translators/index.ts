/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';


// WebColaCnDGraph web component for browser usage
export { WebColaCnDGraph } from './webcola/webcola-cnd-graph';
export { renderTemporalSequence, resolveSequenceMode } from './webcola/temporal-sequence';

// StructuredInputGraph web component for structured input
export { StructuredInputGraph } from './webcola/structured-input-graph';
export type { ParsedCnDSpec } from './webcola/structured-input-graph';

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
  TransformInfo,
  LayoutState,
  WebColaLayoutOptions 
} from './webcola/webcolatranslator';

export type { TemporalPolicyName, TemporalPolicyCanonicalName } from './webcola/temporal-policy';
export type {
  SequenceMode,
  SequenceModeStrategy,
  ChangedRegionStrategy,
  TemporalSequenceStrategy,
  RenderTemporalSequenceOptions
} from './webcola/temporal-sequence';
