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
 * An advisory note raised while evaluating an expression. The evaluation still
 * produced a value — this says something about *how*.
 *
 * Declared structurally rather than re-exported from simple-graph-query so this
 * module stays free of evaluator-specific imports; sgq's `Diagnostic` is
 * assignable to it. Today the only kind is `'unresolved-name'`, which evaluates
 * to the empty set. That matters more than it sounds: an empty set satisfies
 * predicates vacuously (`no Playr` is `true`), so a typo produces the same
 * *value* as a selector that legitimately matched nothing. This is the only
 * signal separating the two.
 */
export interface EvaluationDiagnostic {
  /** Machine-readable category, e.g. `'unresolved-name'`. */
  kind: string;
  severity: 'warning' | 'info';
  /** The name that could not be resolved, when the kind carries one. */
  name?: string;
  /** Human-readable message suitable for showing to a spec author. */
  message: string;
  /** Closest name in the instance, when one is near enough to be worth offering. */
  suggestion?: string;
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

  /**
   * Advisory diagnostics raised while evaluating the expression — a name that
   * resolved to nothing, say. Distinct from {@link isError}: the evaluation
   * succeeded, but something about it is worth telling the spec author.
   *
   * Optional because only the simple-graph-query evaluator produces these; the
   * SQL, Forge and layout evaluators simply omit it. Callers should reach for it
   * with `result.getDiagnostics?.() ?? []`.
   */
  getDiagnostics?(): readonly EvaluationDiagnostic[];
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