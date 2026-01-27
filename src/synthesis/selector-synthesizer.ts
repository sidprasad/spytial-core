/**
 * Selector Synthesis API
 * 
 * Wraps simple-graph-query's synthesizer to provide CnD-spec-friendly
 * selector generation from examples.
 * 
 * **IMPORTANT**: This synthesizer only works with the SimpleGraphQuery evaluator.
 * It generates expressions in the simple-graph-query language (identifiers, +, &, -, ., ^).
 * 
 * If you're using ForgeEvaluator or another evaluator, synthesis is not supported.
 * The evaluator must be SimpleGraphQueryEvaluator (SGraphQueryEvaluator).
 * 
 * Use cases:
 * - Generate selectors for orientation constraints by selecting node pairs
 * - Create alignment constraint selectors from atom examples
 * - Derive color/size directive selectors from visual examples
 */

import { 
  synthesizeSelector, 
  synthesizeBinaryRelation,
  synthesizeSelectorWithWhy,
  synthesizeBinaryRelationWithWhy,
  type AtomSelectionExample,
  type BinaryRelationExample,
  type SynthesisWhy
} from 'simple-graph-query';
import type { IAtom, IDataInstance } from '../data-instance/interfaces';
import type IEvaluator from '../evaluators/interfaces';
import { SGraphQueryEvaluator } from '../evaluators/sgq-evaluator';

/**
 * Check if synthesis is supported for a given evaluator instance.
 * 
 * Synthesis only works with SGraphQueryEvaluator (from simple-graph-query).
 * Returns false for ForgeEvaluator and other evaluators.
 * 
 * @param evaluator - The evaluator instance to check
 * @returns true if synthesis is supported, false otherwise
 * 
 * @example
 * ```typescript
 * import { SGraphQueryEvaluator, isSynthesisSupported } from 'spytial-core';
 * 
 * const evaluator = new SGraphQueryEvaluator();
 * if (isSynthesisSupported(evaluator)) {
 *   const selector = synthesizeAtomSelector([...]);
 * }
 * ```
 */
export function isSynthesisSupported(evaluator: IEvaluator): boolean {
  // Use instanceof for minification-safe type checking
  return evaluator instanceof SGraphQueryEvaluator;
}

/**
 * Synthesize a unary selector (for atom selection) from examples
 * 
 * **Requirements:**
 * - Data instances must be compatible with SimpleGraphQueryEvaluator
 * - Generates expressions in simple-graph-query syntax
 * 
 * @param examples - Array of examples, each containing atoms to select and the data instance context
 * @param maxDepth - Maximum expression depth (default: 3, higher = more complex expressions)
 * @returns Synthesized selector expression string (e.g., "Person + Student", "^parent")
 * @throws {SelectorSynthesisError} If synthesis fails (no shared identifiers, contradictory examples, etc.)
 * 
 * @example
 * ```typescript
 * const selector = synthesizeAtomSelector([
 *   { 
 *     atoms: [alice, bob], 
 *     dataInstance: instance1 
 *   },
 *   { 
 *     atoms: [charlie, diana], 
 *     dataInstance: instance2 
 *   }
 * ]);
 * // Returns e.g., "Student" or "Person & Adult" depending on what matches
 * ```
 */
export function synthesizeAtomSelector(
  examples: { atoms: IAtom[]; dataInstance: IDataInstance }[],
  maxDepth: number = 3
): string {
  const sgqExamples: AtomSelectionExample[] = examples.map(ex => ({
    atoms: new Set(ex.atoms),
    datum: ex.dataInstance
  }));
  
  return synthesizeSelector(sgqExamples, maxDepth);
}

/**
 * Synthesize a binary relation selector (for pairs/tuples) from examples
 * 
 * **Requirements:**
 * - Data instances must be compatible with SimpleGraphQueryEvaluator
 * - Generates expressions in simple-graph-query syntax
 * 
 * @param examples - Array of examples, each containing atom pairs and the data instance context
 * @param maxDepth - Maximum expression depth (default: 3)
 * @returns Synthesized binary selector expression (e.g., "friend", "parent.^parent")
 * @throws {SelectorSynthesisError} If synthesis fails
 * 
 * @example
 * ```typescript
 * const selector = synthesizeBinarySelector([
 *   { 
 *     pairs: [[alice, bob], [charlie, diana]], 
 *     dataInstance: instance1 
 *   }
 * ]);
 * // Returns e.g., "friend" or "coworker & SameOffice"
 * ```
 */
export function synthesizeBinarySelector(
  examples: { pairs: [IAtom, IAtom][]; dataInstance: IDataInstance }[],
  maxDepth: number = 3
): string {
  const sgqExamples: BinaryRelationExample[] = examples.map(ex => ({
    pairs: new Set(ex.pairs),
    datum: ex.dataInstance
  }));
  
  return synthesizeBinaryRelation(sgqExamples, maxDepth);
}

/**
 * Synthesize with detailed provenance/explanation
 * 
 * Returns both the expression and a "why" tree showing how subexpressions
 * evaluated on each example.
 */
export function synthesizeAtomSelectorWithExplanation(
  examples: { atoms: IAtom[]; dataInstance: IDataInstance }[],
  maxDepth: number = 3
): SynthesisWhy {
  const sgqExamples: AtomSelectionExample[] = examples.map(ex => ({
    atoms: new Set(ex.atoms),
    datum: ex.dataInstance
  }));
  
  return synthesizeSelectorWithWhy(sgqExamples, maxDepth);
}

/**
 * Synthesize binary relation with detailed provenance/explanation
 */
export function synthesizeBinarySelectorWithExplanation(
  examples: { pairs: [IAtom, IAtom][]; dataInstance: IDataInstance }[],
  maxDepth: number = 3
): SynthesisWhy {
  const sgqExamples: BinaryRelationExample[] = examples.map(ex => ({
    pairs: new Set(ex.pairs),
    datum: ex.dataInstance
  }));
  
  return synthesizeBinaryRelationWithWhy(sgqExamples, maxDepth);
}

/**
 * Helper to create orientation constraint spec from synthesized selector
 * 
 * @example
 * ```typescript
 * const selector = synthesizeBinarySelector([...examples]);
 * const constraint = createOrientationConstraint(selector, ['right']);
 * // Returns: "right(selector)"
 * ```
 */
export function createOrientationConstraint(
  selector: string,
  directions: ('left' | 'right' | 'above' | 'below' | 'directlyLeft' | 'directlyRight' | 'directlyAbove' | 'directlyBelow')[]
): string {
  return directions.map(dir => `${dir}(${selector})`).join('\n');
}

/**
 * Helper to create alignment constraint spec from synthesized selector
 */
export function createAlignmentConstraint(
  selector: string,
  alignment: 'left' | 'right' | 'top' | 'bottom' | 'center'
): string {
  return `align ${alignment}(${selector})`;
}

/**
 * Helper to create color directive from synthesized selector
 */
export function createColorDirective(
  selector: string,
  color: string
): string {
  return `color ${color}(${selector})`;
}

/**
 * Error thrown when synthesis fails
 */
export class SelectorSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectorSynthesisError';
  }
}
