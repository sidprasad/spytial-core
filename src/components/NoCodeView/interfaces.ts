import { ConstraintType, DirectiveType } from './types';

/**
 * Constraint data model for No Code View state management
 * 
 * Represents constraint configuration in a format optimized for visual editing.
 * This interface bridges the gap between the visual interface and the core
 * LayoutSpec constraint types.
 * 
 * Following cnd-core TypeScript guidelines:
 * - Strict typing for all properties
 * - Comprehensive JSDoc documentation
 * - Tree-shakable interface exports
 * 
 * @public
 * @interface ConstraintData
 */
export interface ConstraintData {
  /** Unique identifier for constraint management */
  id: string;
  /** Type of constraint (orientation, cyclic, groupfield, groupselector) */
  type: ConstraintType;
  /** Constraint-specific parameters (directions, selector, etc.) */
  params: Record<string, unknown>;
  /** Whether the card is collapsed in the No Code View */
  collapsed?: boolean;
  /** Optional comment/note for this constraint */
  comment?: string;
}

/**
 * Directive data model for No Code View state management
 * 
 * Represents directive configuration in a format optimized for visual editing.
 * This interface provides a structured approach to managing visual directives
 * within the No Code View interface.
 * 
 * Following cnd-core TypeScript guidelines:
 * - Comprehensive type safety
 * - Extensible parameter system
 * - Client-side performance optimization
 * 
 * @public
 * @interface DirectiveData
 */
export interface DirectiveData {
  /** Unique identifier for directive management */
  id: string;
  /** Type of directive (color, size, icon, etc.) */
  type: DirectiveType;
  /** Directive-specific parameters (color, selector, path, etc.) */
  params: Record<string, unknown>;
  /** Whether the card is collapsed in the No Code View */
  collapsed?: boolean;
  /** Optional comment/note for this directive */
  comment?: string;
}