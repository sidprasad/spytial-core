import { IDataInstance } from "../data-instance/interfaces";

/**
 * Error thrown when a selector's arity doesn't match what a constraint expects.
 * For example, using a unary selector (e.g. `Person`) where a binary selector
 * (e.g. `Person->Person`) is required, or vice versa.
 */
export class SelectorArityError extends Error {
  /** The selector expression that had the wrong arity */
  public readonly selector: string;
  /** The arity that was expected ('unary' or 'binary') */
  public readonly expectedArity: 'unary' | 'binary';
  /** The arity that the selector actually produced */
  public readonly actualArity: 'unary' | 'binary';

  constructor(selector: string, expectedArity: 'unary' | 'binary', actualArity: 'unary' | 'binary', message?: string) {
    const defaultMessage = expectedArity === 'binary'
      ? `Selector "${selector}" evaluates to unary (atom) results, but a binary selector was expected. ` +
        `This selector produces individual atoms, but the constraint requires pairs (e.g. A->B). ` +
        `Try using a binary/relational selector instead.`
      : `Selector "${selector}" evaluates to binary (pair) results, but a unary selector was expected. ` +
        `This selector produces pairs (e.g. A->B), but the constraint requires individual atoms. ` +
        `Try using a unary selector instead.`;
    super(message || defaultMessage);
    this.name = 'SelectorArityError';
    this.selector = selector;
    this.expectedArity = expectedArity;
    this.actualArity = actualArity;
  }
}

/**
 * Result types for evaluator operations
 */
export type EvaluatorResult = SingleValue | Tuple[] | ErrorResult;

export type SingleValue = string | number | boolean;
export type Tuple = SingleValue[];

export interface ErrorResult {
  error: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Configuration options for evaluators
 */
export interface EvaluatorConfig {
  /** Enable debug mode for additional logging */
  debug?: boolean;
  /** Timeout for evaluation in milliseconds */
  timeout?: number;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Instance index to evaluate against (for multi-instance contexts) */
  instanceIndex?: number;
}

/**
 * Context data that evaluators operate on
 */
export interface EvaluationContext {
  /** Raw data source (XML, JSON, etc.) */
  sourceData: string | Record<string, unknown> | IDataInstance;
  /** Parsed/processed data structure */
  processedData?: Record<string, unknown>;
  /** Source code associated with the data (if applicable) */
  sourceCode?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Wrapped result that provides convenient access methods
 */
export interface IEvaluatorResult {
  /** Get a pretty-printed string representation */
  prettyPrint(): string;
  

  noResult(): boolean;

  /** Get result as a single value (throws if not singleton) */
  singleResult(): SingleValue;
  
  /** Get selected atoms (arity 1 results) */
  selectedAtoms(): string[];
  
  /** Get selected pairs (arity 2 results, first and last elements) */
  selectedTwoples(): string[][];
  
  /** Get all selected tuples with all elements */
  selectedTuplesAll(): string[][];

  /**
   * Returns the maximum arity of the non-empty tuples in the result.
   * Returns 0 if there are no results, or if the result is a singleton/error.
   */
  maxArity(): number;
  
  /** Check if result is an error */
  isError(): boolean;
  
  /** Check if result is a singleton value */
  isSingleton(): boolean;
  
  /** Get the original expression that produced this result */
  getExpression(): string;
  
  /** Get the raw result data */
  getRawResult(): EvaluatorResult;

  
}

/**
 * Main evaluator interface that different evaluators must implement
 */
interface IEvaluator {
  /**
   * Initialize the evaluator with context data
   * @param _context The evaluation context containing data and metadata
   */
  initialize(_context: EvaluationContext): void;
  
  /**
   * Check if the evaluator is properly initialized and ready
   */
  isReady(): boolean;
  
  /**
   * Evaluate an expression and return the wrapped result
   * @param _expression The expression to evaluate
   * @param _config Optional configuration for this evaluation
   * @returns Wrapped result with convenience methods
   * @throws Error if the evaluation fails
   */
  evaluate(_expression: string, _config?: EvaluatorConfig): IEvaluatorResult;
  

}

export default IEvaluator;

// ==================== Spatial Layout Evaluator ====================
//
// A parallel evaluator over the layout constraint system.
// Where IEvaluator queries the datum (atoms, relations, tuples),
// ILayoutEvaluator queries the spatial arrangement (constraints, groups).
//
// The three modalities mirror Alloy's analysis:
//   must  = entailed by all satisfying assignments (universal assertion)
//   can   = consistent with at least one assignment (instance finding)
//   cannot = holds in no satisfying assignment (unsat proving)

import type { InstanceLayout } from "../layout/interfaces";
import type { QualitativeConstraintValidator } from "../layout/qualitative-constraint-validator";

/**
 * Spatial relations corresponding to constraint types in InstanceLayout.
 * These are the atomic predicates of the diagram logic.
 */
export type SpatialRelation = 'leftOf' | 'rightOf' | 'above' | 'below' | 'xAligned' | 'yAligned' | 'grouped' | 'contains';

/**
 * A structured query over the spatial constraint system.
 *
 * Queries ask: which nodes stand in a given spatial relation to a specified anchor node?
 *
 * Examples (in the string syntax that maps to this structure):
 *   must { x | leftOf(x, Node0) }          → all nodes that must be left of Node0
 *   must { x | ^leftOf(x, Node0) }         → transitive closure
 *   can  { x | above(x, Node0) }           → nodes that can be above Node0
 *   cannot xAligned(Node1, Node0)           → boolean: can Node1 not be x-aligned with Node0?
 */
export interface SpatialQuery {
    /** The spatial relation to query */
    relation: SpatialRelation;
    /** The anchor node ID */
    nodeId: string;
    /** If true, follow transitive closure of the relation (^relation) */
    transitive?: boolean;
}

/**
 * Evaluator over the spatial constraint system of an InstanceLayout.
 *
 * Backed by a QualitativeConstraintValidator — delegates directional and
 * alignment queries to the solver's DifferenceConstraintGraphs (hGraph, vGraph).
 * Group membership is tracked separately.
 *
 * Design follows Margrave (Fisler & Krishnamurthi, ICSE 2005): pose queries
 * over a constraint system, get enumerated node sets as results.
 */
export interface ILayoutEvaluator {
    /**
     * Initialize with a layout and the solver that validated it.
     * The solver must have already run validateConstraints().
     */
    initialize(layout: InstanceLayout, solver: QualitativeConstraintValidator): void;

    /** Whether the evaluator has been initialized */
    isReady(): boolean;

    /**
     * What MUST satisfy the query? (entailed by the resolved model)
     * For directional relations: isStrictlyOrdered in the solver's DCGs.
     * For alignment: SCC-based equivalence classes.
     * For grouped: all co-members of shared groups.
     */
    must(query: SpatialQuery): IEvaluatorResult;

    /**
     * What CANNOT satisfy the query? (contradicted by the resolved model)
     * Derived from antisymmetry: if A must be right of X, A cannot be left of X.
     */
    cannot(query: SpatialQuery): IEvaluatorResult;

    /**
     * What CAN satisfy the query? (consistent with the resolved model)
     * With solver backing, can = must (the resolved model is the assignment).
     */
    can(query: SpatialQuery): IEvaluatorResult;
}