/**
 * Constraint types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 * 
 * @public
 */
export type ConstraintType = 'orientation' | 'cyclic' | 'align' | 'groupselector' | 'size' | 'hideAtom';

/**
 * Directive types supported by the CND layout system
 * Following cnd-core TypeScript strict typing guidelines
 *
 * `atomStyle` and `edgeStyle` are the current styling forms — composite,
 * selector-matched, and resolved through the shared style resolver. The three
 * legacy members below them (`atomColor`, `edgeColor`, `icon`) are still parsed
 * and rendered, each desugaring onto one of those two behind a deprecation
 * warning, so they stay in the union; prefer the style forms in new specs.
 *
 * @public
 */
export type DirectiveType =
    | 'attribute'
    | 'hideField'
    | 'atomStyle'
    | 'edgeStyle'
    | 'size'
    | 'flag'
    | 'inferredEdge'
    | 'hideAtom'
    | 'tag'
    /** @deprecated Use `atomStyle` with a `borderStyle` block. */
    | 'atomColor'
    /** @deprecated Use `edgeStyle` with a `lineStyle` block. */
    | 'edgeColor'
    /** @deprecated Use `atomStyle` with an `iconStyle` block. */
    | 'icon';