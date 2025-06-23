/**
 * Translators module - converts layout data to different visualization libraries
 */

export { WebColaTranslator } from './webcola/webcolatranslator';
export { DagreTranslator } from './dagretranslator';

// WebCola visualization factory function - simpler than custom elements
export { createWebColaCnDGraph } from './webcola/webcola-factory';
export type { WebColaCnDGraphAPI } from './webcola/webcola-factory';

// Re-export types for convenience
export type { 
  InstanceLayout, 
  LayoutNode, 
  LayoutEdge, 
  LayoutConstraint, 
  LayoutGroup 
} from '../layout/interfaces';

export type { NodeWithMetadata, EdgeWithMetadata } from './webcola/webcolatranslator';
