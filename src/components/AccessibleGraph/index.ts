/**
 * AccessibleGraph Component
 * 
 * An accessible wrapper around the webcola-cnd-graph custom element
 * that provides enhanced accessibility features for visually-impaired users.
 * 
 * This component implements best practices from:
 * - Data Navigator (https://github.com/cmudig/data-navigator)
 * - Web Content Accessibility Guidelines (WCAG)
 * - ARIA best practices for data visualizations
 * 
 * The navigation follows the declarative spatial relationships defined in
 * the CnD spec, not just geometric positions. For example, if the CnD spec
 * says "A is left of B", then pressing right arrow on A will navigate to B.
 */

export { AccessibleGraph, type AccessibleGraphProps } from './AccessibleGraph';
export { 
  generateNavigatorSchema, 
  toDataNavigatorFormat,
  type NavigatorNode,
  type NavigatorSchema 
} from './data-navigator-schema';
export { default } from './AccessibleGraph';
