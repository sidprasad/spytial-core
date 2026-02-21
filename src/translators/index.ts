/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';


// WebColaCnDGraph web component for browser usage
export { WebColaCnDGraph } from './webcola/webcola-cnd-graph';
export { generateSequenceLayouts, SequenceStepper } from './webcola/temporal-sequence';

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

// Sequence policies
export type { SequencePolicy, SequencePolicyContext, SequencePolicyResult } from './webcola/sequence-policy';
export { ignoreHistory, stability, changeEmphasis, getSequencePolicy, registerSequencePolicy } from './webcola/sequence-policy';
export type { SequenceLayoutOptions, SequenceStepperOptions } from './webcola/temporal-sequence';
