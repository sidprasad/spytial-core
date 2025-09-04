/**
 * Python Evaluator for Spatial REPL
 * 
 * This evaluator provides an interface for Python-like expressions in the spatial REPL.
 * Since we're in a browser environment, this simulates Python syntax and semantics
 * using JavaScript, providing a familiar Python-like interface for data manipulation.
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
 * Python-like evaluation context with built-in functions
 */
interface PythonEvaluationContext {
  /** Python-like print function */
  print: (...args: any[]) => void;
  /** Python-like len function */
  len: (obj: any) => number;
  /** Python-like range function */
  range: (start: number, stop?: number, step?: number) => number[];
  /** Python-like list constructor */
  list: (iterable?: any[]) => any[];
  /** Python-like dict constructor */
  dict: (obj?: Record<string, any>) => Record<string, any>;
  /** Python-like set constructor */
  set: (iterable?: any[]) => Set<any>;
  /** Python-like tuple constructor */
  tuple: (...args: any[]) => any[];
  /** Create an atom (Python-style function) */
  atom: (id: string, type: string, label?: string) => { id: string; type: string; label?: string };
  /** Create a relation (Python-style function) */
  relation: (id: string, name: string, from_atom: string, to_atom: string) => { id: string; name: string; from: string; to: string };
  /** Current data instance for querying */
  data_instance: IInputDataInstance;
  /** Math-like operations */
  abs: typeof Math.abs;
  max: typeof Math.max;
  min: typeof Math.min;
  sum: (arr: number[]) => number;
}

/**
 * Wrapped result for Python-like evaluations
 */
class PythonEvaluatorResult implements IEvaluatorResult {
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
      // Python-like list representation
      return '[' + this.result.map(tuple => {
        if (Array.isArray(tuple)) {
          return '(' + tuple.map(item => this.formatPythonValue(item)).join(', ') + ')';
        }
        return this.formatPythonValue(tuple);
      }).join(', ') + ']';
    }
    
    return this.formatPythonValue(this.result);
  }

  private formatPythonValue(value: any): string {
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value === null) {
      return 'None';
    }
    if (value === undefined) {
      return 'None';
    }
    return String(value);
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
      .filter(tuple => Array.isArray(tuple) ? tuple.length === 1 : true)
      .map(tuple => Array.isArray(tuple) ? String(tuple[0]) : String(tuple));
  }

  selectedTwoples(): string[][] {
    if (!Array.isArray(this.result)) {
      return [];
    }
    return this.result
      .filter(tuple => Array.isArray(tuple) && tuple.length >= 2)
      .map(tuple => [String(tuple[0]), String(tuple[tuple.length - 1])]);
  }

  selectedTuplesAll(): string[][] {
    if (!Array.isArray(this.result)) {
      return [];
    }
    return this.result.map(tuple => {
      if (Array.isArray(tuple)) {
        return tuple.map(item => String(item));
      }
      return [String(tuple)];
    });
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
 * Python-like Evaluator implementation
 * 
 * Provides Python-like syntax and semantics for data manipulation in the spatial REPL.
 * This is implemented in JavaScript but provides a Python-familiar interface.
 */
export class PythonEvaluator implements IEvaluator {
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
      return new PythonEvaluatorResult(
        { error: { message: 'Evaluator not initialized', code: 'NOT_INITIALIZED' } },
        expression
      );
    }

    try {
      // Preprocess Python-like syntax to JavaScript
      let jsExpression = this.preprocessPythonSyntax(expression);

      // Create Python-like evaluation context
      const evalContext: PythonEvaluationContext = {
        print: (...args: any[]) => {
          console.log('[Python-REPL]', ...args.map(arg => this.formatPythonValue(arg)));
          return args.length === 1 ? args[0] : args;
        },
        len: (obj: any) => {
          if (Array.isArray(obj) || typeof obj === 'string') {
            return obj.length;
          }
          if (obj instanceof Set || obj instanceof Map) {
            return obj.size;
          }
          if (typeof obj === 'object' && obj !== null) {
            return Object.keys(obj).length;
          }
          return 0;
        },
        range: (start: number, stop?: number, step: number = 1): number[] => {
          if (stop === undefined) {
            stop = start;
            start = 0;
          }
          const result: number[] = [];
          for (let i = start; i < stop; i += step) {
            result.push(i);
          }
          return result;
        },
        list: (iterable?: any[]): any[] => Array.isArray(iterable) ? [...iterable] : [],
        dict: (obj?: Record<string, any>): Record<string, any> => obj ? { ...obj } : {},
        set: (iterable?: any[]): Set<any> => new Set(iterable),
        tuple: (...args: any[]): any[] => args,
        atom: (id: string, type: string, label?: string) => ({ id, type, label }),
        relation: (id: string, name: string, from_atom: string, to_atom: string) => ({ 
          id, name, from: from_atom, to: to_atom 
        }),
        data_instance: this.dataInstance!,
        abs: Math.abs,
        max: Math.max,
        min: Math.min,
        sum: (arr: number[]) => arr.reduce((a, b) => a + b, 0)
      };

      // Add Python keywords
      const pythonKeywords = {
        None: null,
        True: true,
        False: false
      };

      const fullContext = { ...evalContext, ...pythonKeywords };

      // Create a function that evaluates the expression in the Python-like context
      const contextKeys = Object.keys(fullContext);
      const contextValues = Object.values(fullContext);
      
      // Use Function constructor for safer evaluation
      const evaluationFunction = new Function(...contextKeys, `"use strict"; return (${jsExpression});`);
      
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

      // Handle Promise results
      if (result instanceof Promise) {
        return new PythonEvaluatorResult(
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

      return new PythonEvaluatorResult(evaluatorResult, expression);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new PythonEvaluatorResult(
        { error: { message: errorMessage, code: 'EVALUATION_ERROR' } },
        expression
      );
    }
  }

  /**
   * Preprocess Python-like syntax to valid JavaScript
   */
  private preprocessPythonSyntax(expression: string): string {
    let jsExpression = expression;

    // Convert Python None to JavaScript null
    jsExpression = jsExpression.replace(/\bNone\b/g, 'None');
    
    // Convert Python True/False to JavaScript boolean
    jsExpression = jsExpression.replace(/\bTrue\b/g, 'True');
    jsExpression = jsExpression.replace(/\bFalse\b/g, 'False');
    
    // Convert Python list comprehensions to JavaScript
    // [x for x in range(10) if x % 2 == 0] -> range(10).filter(x => x % 2 == 0).map(x => x)
    const listComprehensionWithConditionRegex = /\[(.+?)\s+for\s+(\w+)\s+in\s+(.+?)\s+if\s+(.+?)\]/g;
    jsExpression = jsExpression.replace(listComprehensionWithConditionRegex, '($3).filter($2 => $4).map($2 => $1)');
    
    // [x for x in range(10)] -> range(10).map(x => x)
    const listComprehensionRegex = /\[(.+?)\s+for\s+(\w+)\s+in\s+(.+?)\]/g;
    jsExpression = jsExpression.replace(listComprehensionRegex, '($3).map($2 => $1)');
    
    // Convert Python ** to JavaScript Math.pow
    jsExpression = jsExpression.replace(/(\w+|\d+)\s*\*\*\s*(\w+|\d+)/g, 'Math.pow($1, $2)');
    
    // Convert Python // to JavaScript Math.floor division
    jsExpression = jsExpression.replace(/(\w+|\d+)\s*\/\/\s*(\w+|\d+)/g, 'Math.floor($1 / $2)');

    return jsExpression;
  }

  /**
   * Format a value in Python style
   */
  private formatPythonValue(value: any): string {
    if (typeof value === 'string') {
      return `'${value}'`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value === null) {
      return 'None';
    }
    if (value === undefined) {
      return 'None';
    }
    if (Array.isArray(value)) {
      return '[' + value.map(item => this.formatPythonValue(item)).join(', ') + ']';
    }
    return String(value);
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