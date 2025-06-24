
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
  sourceData: string | Record<string, unknown>;
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