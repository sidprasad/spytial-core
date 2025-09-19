/**
 * Data Navigator translators module
 * 
 * Provides translators for making CnD layouts accessible to assistive technologies
 */

export { 
  DataNavigatorTranslator, 
  createDataNavigatorTranslator,
  translateToDataNavigator 
} from './data-navigator-translator';

export type {
  DataNavigatorNode,
  DataNavigatorEdge,
  NavigationRule,
  SpatialProperties,
  SemanticProperties,
  RenderObject,
  DataNavigatorStructure,
  AccessibilityTranslatorOptions
} from './data-navigator-translator';