import { IDataInstance } from "../data-instance/interfaces";

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
 * Main evaluator interface that different evaluators must implement.
 * This is the synchronous version of the evaluator interface.
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

/**
 * Asynchronous evaluator interface for evaluators that rely on async backends.
 * This extends the base evaluator concept with async methods for initialization and evaluation.
 * 
 * Use this interface when your evaluator:
 * - Communicates with a remote service
 * - Uses Web Workers
 * - Depends on async I/O operations
 * - Needs to await external resources
 * 
 * @example
 * ```typescript
 * class RemoteEvaluator implements IEvaluatorAsync {
 *   async initializeAsync(context: EvaluationContext): Promise<void> {
 *     await fetch('/api/initialize', { body: JSON.stringify(context) });
 *   }
 *   
 *   isReady(): boolean {
 *     return this.initialized;
 *   }
 *   
 *   async evaluateAsync(expr: string): Promise<IEvaluatorResult> {
 *     const response = await fetch('/api/evaluate', { body: expr });
 *     return response.json();
 *   }
 * }
 * ```
 */
export interface IEvaluatorAsync {
  /**
   * Initialize the evaluator with context data asynchronously
   * @param _context The evaluation context containing data and metadata
   * @returns Promise that resolves when initialization is complete
   */
  initializeAsync(_context: EvaluationContext): Promise<void>;
  
  /**
   * Check if the evaluator is properly initialized and ready.
   * This method is synchronous for quick status checks.
   */
  isReady(): boolean;
  
  /**
   * Evaluate an expression asynchronously and return the wrapped result
   * @param _expression The expression to evaluate
   * @param _config Optional configuration for this evaluation
   * @returns Promise resolving to wrapped result with convenience methods
   * @throws Error if the evaluation fails
   */
  evaluateAsync(_expression: string, _config?: EvaluatorConfig): Promise<IEvaluatorResult>;
}

/**
 * Union type representing any evaluator (sync or async)
 */
export type AnyEvaluator = IEvaluator | IEvaluatorAsync;

/**
 * Type guard to check if an evaluator is synchronous
 * @param evaluator The evaluator to check
 * @returns True if the evaluator is synchronous (implements IEvaluator)
 */
export function isEvaluatorSync(evaluator: AnyEvaluator): evaluator is IEvaluator {
  return 'evaluate' in evaluator && typeof (evaluator as IEvaluator).evaluate === 'function';
}

/**
 * Type guard to check if an evaluator is asynchronous
 * @param evaluator The evaluator to check
 * @returns True if the evaluator is asynchronous (implements IEvaluatorAsync)
 */
export function isEvaluatorAsync(evaluator: AnyEvaluator): evaluator is IEvaluatorAsync {
  return 'evaluateAsync' in evaluator && typeof (evaluator as IEvaluatorAsync).evaluateAsync === 'function';
}

/**
 * Adapter that wraps either a sync or async evaluator and provides a unified async interface.
 * This allows layout generation code to work with a single interface regardless of evaluator type.
 * 
 * For sync evaluators, the adapter wraps their results in immediately-resolving Promises.
 * For async evaluators, it passes through to the underlying async methods.
 * 
 * @example
 * ```typescript
 * // Wrap a sync evaluator
 * const syncEvaluator = new SGraphQueryEvaluator();
 * const adapter = new EvaluatorAdapter(syncEvaluator);
 * const result = await adapter.evaluate(expr); // Returns Promise
 * 
 * // Wrap an async evaluator
 * const asyncEvaluator = new RemoteEvaluator();
 * const adapter = new EvaluatorAdapter(asyncEvaluator);
 * const result = await adapter.evaluate(expr); // Returns Promise
 * ```
 */
export class EvaluatorAdapter {
  private readonly syncEvaluator?: IEvaluator;
  private readonly asyncEvaluator?: IEvaluatorAsync;
  
  /**
   * Creates an adapter that wraps either a sync or async evaluator
   * @param evaluator The evaluator to wrap (sync or async)
   */
  constructor(evaluator: AnyEvaluator) {
    if (isEvaluatorSync(evaluator)) {
      this.syncEvaluator = evaluator;
    } else if (isEvaluatorAsync(evaluator)) {
      this.asyncEvaluator = evaluator;
    } else {
      throw new Error('Evaluator must implement either IEvaluator or IEvaluatorAsync');
    }
  }
  
  /**
   * Check if the underlying evaluator is ready
   */
  isReady(): boolean {
    if (this.syncEvaluator) {
      return this.syncEvaluator.isReady();
    }
    return this.asyncEvaluator!.isReady();
  }
  
  /**
   * Evaluate an expression, returning a Promise regardless of underlying evaluator type.
   * For sync evaluators, the Promise resolves immediately.
   * For async evaluators, the Promise resolves when the async evaluation completes.
   */
  async evaluate(expression: string, config?: EvaluatorConfig): Promise<IEvaluatorResult> {
    if (this.syncEvaluator) {
      // Wrap sync result in resolved Promise
      return Promise.resolve(this.syncEvaluator.evaluate(expression, config));
    }
    return this.asyncEvaluator!.evaluateAsync(expression, config);
  }
  
  /**
   * Check if this adapter wraps a sync evaluator (useful for optimization)
   */
  isSyncEvaluator(): boolean {
    return this.syncEvaluator !== undefined;
  }
}

export default IEvaluator;