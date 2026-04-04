/**
 * Translators module - converts layout data to different output representations
 */

export { WebColaTranslator } from './webcola/webcolatranslator';

// Accessible translator — parallel compilation target for a11y
export { AccessibleTranslator, buildSpatialNavigationMap } from './accessible';
export type {
  AccessibleLayout,
  AccessibleTranslatorOptions,
  SpatialNavigationMap,
  SpatialNeighbors,
  EdgeReference,
  LayoutDescription,
  OverviewSection,
  TypeSection,
  NodeDescription,
  EdgeDescription,
  GroupDescription,
  RelationshipSummary,
  SpatialRelationshipDescription,
} from './accessible';


// WebColaCnDGraph web component for browser usage
export { WebColaCnDGraph } from './webcola/webcola-cnd-graph';

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
export type {
  SequencePolicy,
  SequencePolicyContext,
  SequencePolicyResult,
  SequenceViewportBounds,
} from './webcola/sequence-policy';
export {
  ignoreHistory,
  stability,
  changeEmphasis,
  randomPositioning,
  getSequencePolicy,
  registerSequencePolicy,
} from './webcola/sequence-policy';
