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

/**
 * Evaluator types supported by the system
 */
export enum EvaluatorType {
  /** Simple Graph Query evaluator (default) */
  SGQ = 'sgq',
  /** SQL-based evaluator using AlaSQL */
  SQL = 'sql',
  /** Forge expression evaluator */
  FORGE = 'forge'
}

/**
 * Registry for managing multiple evaluators
 */
export interface IEvaluatorRegistry {
  /**
   * Register an evaluator with a specific type
   * @param type The evaluator type
   * @param evaluator The evaluator instance
   */
  register(type: EvaluatorType, evaluator: IEvaluator): void;
  
  /**
   * Get an evaluator by type
   * @param type The evaluator type
   * @returns The evaluator instance, or undefined if not registered
   */
  get(type: EvaluatorType): IEvaluator | undefined;
  
  /**
   * Get the default evaluator
   * @returns The default evaluator instance
   */
  getDefault(): IEvaluator;
  
  /**
   * Set the default evaluator type
   * @param type The evaluator type to use as default
   */
  setDefault(type: EvaluatorType): void;
  
  /**
   * Check if an evaluator is registered for a type
   * @param type The evaluator type
   * @returns True if an evaluator is registered for this type
   */
  has(type: EvaluatorType): boolean;
}

/**
 * Default implementation of IEvaluatorRegistry
 */
export class EvaluatorRegistry implements IEvaluatorRegistry {
  private evaluators: Map<EvaluatorType, IEvaluator> = new Map();
  private defaultType: EvaluatorType = EvaluatorType.SGQ;
  
  register(type: EvaluatorType, evaluator: IEvaluator): void {
    this.evaluators.set(type, evaluator);
  }
  
  get(type: EvaluatorType): IEvaluator | undefined {
    return this.evaluators.get(type);
  }
  
  getDefault(): IEvaluator {
    const defaultEvaluator = this.evaluators.get(this.defaultType);
    if (!defaultEvaluator) {
      throw new Error(`Default evaluator type '${this.defaultType}' is not registered`);
    }
    return defaultEvaluator;
  }
  
  setDefault(type: EvaluatorType): void {
    if (!this.has(type)) {
      throw new Error(`Cannot set default to unregistered evaluator type '${type}'`);
    }
    this.defaultType = type;
  }
  
  has(type: EvaluatorType): boolean {
    return this.evaluators.has(type);
  }
}