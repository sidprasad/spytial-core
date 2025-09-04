/**
 * JavaScript Evaluator for Spatial REPL
 * 
 * This evaluator allows users to write JavaScript expressions to manipulate data instances
 * in the spatial REPL environment. It provides a safe execution context for JavaScript
 * expressions that can create atoms, relations, and data structures.
 */

import IEvaluator, { 
  EvaluatorResult, 
  EvaluationContext, 
  EvaluatorConfig, 
  IEvaluatorResult, 
  SingleValue,
  Tuple, 
  ErrorResult 
} from './interfaces';
import { IInputDataInstance } from '../data-instance/interfaces';
import { JSONDataInstance } from '../data-instance/json-data-instance';

/**
 * JavaScript evaluation context with safe built-in functions
 */
interface JavaScriptEvaluationContext {
  /** Create an atom with given id, type, and optional label */
  atom: (id: string, type: string, label?: string) => { id: string; type: string; label?: string };
  /** Create a relation between atoms */
  relation: (id: string, name: string, fromAtom: string, toAtom: string) => { id: string; name: string; from: string; to: string };
  /** Access to console for debugging */
  console: typeof console;
  /** Math utilities */
  Math: typeof Math;
  /** Array utilities */
  Array: typeof Array;
  /** Object utilities */
  Object: typeof Object;
  /** String utilities */
  String: typeof String;
  /** Number utilities */
  Number: typeof Number;
  /** Boolean utilities */
  Boolean: typeof Boolean;
  /** Current data instance for querying */
  dataInstance: IInputDataInstance;
}

/**
 * Wrapped result for JavaScript evaluations
 */
class JavaScriptEvaluatorResult implements IEvaluatorResult {
  constructor(
    private result: EvaluatorResult,
    private expression: string
  ) {}

  prettyPrint(): string {
    if (this.isError()) {
      const error = this.result as ErrorResult;
      return `Error: ${error.error.message}`;
    }
    
    if (Array.isArray(this.result)) {
      return this.result.map(tuple => `(${tuple.join(', ')})`).join('\n');
    }
    
    return String(this.result);
  }

  noResult(): boolean {
    return this.result === undefined || this.result === null;
  }

  singleResult(): SingleValue {
    if (Array.isArray(this.result)) {
      throw new Error('Result is not a single value');
    }
    if (this.isError()) {
      throw new Error('Result is an error');
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (!Array.isArray(this.result)) {
      return [];
    }
    return this.result
      .filter(tuple => tuple.length === 1)
      .map(tuple => String(tuple[0]));
  }

  selectedTwoples(): string[][] {
    if (!Array.isArray(this.result)) {
      return [];
    }
    return this.result
      .filter(tuple => tuple.length >= 2)
      .map(tuple => [String(tuple[0]), String(tuple[tuple.length - 1])]);
  }

  selectedTuplesAll(): string[][] {
    if (!Array.isArray(this.result)) {
      return [];
    }
    return this.result.map(tuple => tuple.map(item => String(item)));
  }

  isError(): boolean {
    return this.result !== null && 
           typeof this.result === 'object' && 
           'error' in this.result;
  }

  isSingleton(): boolean {
    return !Array.isArray(this.result) && !this.isError();
  }

  getExpression(): string {
    return this.expression;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }
}

/**
 * JavaScript Evaluator implementation
 * 
 * Allows evaluation of JavaScript expressions in a safe context with access to
 * data manipulation functions for spatial REPL interactions.
 */
export class JavaScriptEvaluator implements IEvaluator {
  private context: EvaluationContext | null = null;
  private dataInstance: IInputDataInstance | null = null;

  initialize(context: EvaluationContext): void {
    this.context = context;
    
    // Extract or create data instance
    if (context.sourceData instanceof Object && 'getAtoms' in context.sourceData) {
      this.dataInstance = context.sourceData as IInputDataInstance;
    } else if (typeof context.sourceData === 'object' && context.sourceData !== null) {
      // Try to create JSONDataInstance from object data
      try {
        this.dataInstance = new JSONDataInstance(context.sourceData as any);
      } catch (error) {
        console.warn('Failed to create JSONDataInstance from context data:', error);
        this.dataInstance = new JSONDataInstance({ atoms: [], relations: [] });
      }
    } else {
      // Create empty instance
      this.dataInstance = new JSONDataInstance({ atoms: [], relations: [] });
    }
  }

  isReady(): boolean {
    return this.context !== null && this.dataInstance !== null;
  }

  evaluate(expression: string, config: EvaluatorConfig = {}): IEvaluatorResult {
    if (!this.isReady()) {
      return new JavaScriptEvaluatorResult(
        { error: { message: 'Evaluator not initialized', code: 'NOT_INITIALIZED' } },
        expression
      );
    }

    try {
      // Create safe evaluation context
      const evalContext: JavaScriptEvaluationContext = {
        atom: (id: string, type: string, label?: string) => ({ id, type, label }),
        relation: (id: string, name: string, fromAtom: string, toAtom: string) => ({ 
          id, name, from: fromAtom, to: toAtom 
        }),
        console: {
          log: (...args: any[]) => console.log('[JS-REPL]', ...args),
          warn: (...args: any[]) => console.warn('[JS-REPL]', ...args),
          error: (...args: any[]) => console.error('[JS-REPL]', ...args),
          info: (...args: any[]) => console.info('[JS-REPL]', ...args)
        },
        Math,
        Array,
        Object,
        String,
        Number,
        Boolean,
        dataInstance: this.dataInstance!
      };

      // Create a function that evaluates the expression in the safe context
      const contextKeys = Object.keys(evalContext);
      const contextValues = Object.values(evalContext);
      
      // Use Function constructor for safer evaluation than eval()
      const evaluationFunction = new Function(...contextKeys, `"use strict"; return (${expression});`);
      
      // Execute with timeout if specified
      let result: any;
      if (config.timeout && config.timeout > 0) {
        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Evaluation timeout')), config.timeout)
        );
        const evaluation = Promise.resolve(evaluationFunction(...contextValues));
        result = Promise.race([evaluation, timeout]);
      } else {
        result = evaluationFunction(...contextValues);
      }

      // Handle Promise results (for async expressions)
      if (result instanceof Promise) {
        return new JavaScriptEvaluatorResult(
          { error: { message: 'Async expressions not supported in this context', code: 'ASYNC_NOT_SUPPORTED' } },
          expression
        );
      }

      // Convert result to appropriate format
      let evaluatorResult: EvaluatorResult;
      
      if (result === undefined || result === null) {
        evaluatorResult = result;
      } else if (Array.isArray(result)) {
        // Convert array elements to tuples
        evaluatorResult = result.map(item => {
          if (Array.isArray(item)) {
            return item.map(subItem => this.convertToSingleValue(subItem));
          } else {
            return [this.convertToSingleValue(item)];
          }
        });
      } else {
        evaluatorResult = this.convertToSingleValue(result);
      }

      return new JavaScriptEvaluatorResult(evaluatorResult, expression);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new JavaScriptEvaluatorResult(
        { error: { message: errorMessage, code: 'EVALUATION_ERROR' } },
        expression
      );
    }
  }

  /**
   * Convert a value to a format suitable for evaluator results
   */
  private convertToSingleValue(value: any): SingleValue {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    
    // Convert objects to strings
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    
    return String(value);
  }
}