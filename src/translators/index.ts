/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';


// WebColaSpytialGraph web component for browser usage
export { WebColaSpytialGraph } from './webcola/webcola-spytial-graph';

// StructuredInputGraph web component for structured input
export { StructuredInputGraph } from './webcola/structured-input-graph';
export type { ParsedSpytialSpec } from './webcola/structured-input-graph';

// Re-export types for convenience
export type { 
  InstanceLayout, 
  LayoutNode, 
  LayoutEdge, 
  LayoutConstraint, 
  LayoutGroup 
} from '../layout/interfaces';

export type { NodeWithMetadata, EdgeWithMetadata } from './webcola/webcolatranslator';
