/**
 * Constraint types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 * 
 * @public
 */
export type ConstraintType = 'orientation' | 'cyclic' | 'align' | 'groupfield' | 'groupselector' | 'size' | 'hideAtom';

/**
 * Directive types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 * 
 * @public
 */
export type DirectiveType = 'attribute' | 'hideField' | 'icon' | 'atomColor' | 'edgeColor' | 'size' | 'projection' | 'flag' | 'inferredEdge' | 'hideAtom';