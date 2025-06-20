/**
 * Base abstract evaluator that provides common functionality
 * and demonstrates how to implement IEvaluator interface
 */

import IEvaluator, { 
  EvaluationContext, 
  EvaluatorConfig, 
  IEvaluatorResult, 
  EvaluatorResult,
  SingleValue,
  Tuple,
  ErrorResult 
} from './interfaces';

/**
 * Base implementation of IEvaluatorResult
 */
export abstract class BaseEvaluatorResult implements IEvaluatorResult {
  protected result: EvaluatorResult;
  protected expression: string;

  constructor(result: EvaluatorResult, expression: string) {
    this.result = result;
    this.expression = expression;
  }

  abstract prettyPrint(): string;
  
  abstract singleResult(): SingleValue;
  
  abstract selectedAtoms(): string[];
  
  abstract selectedTwoples(): string[][];
  
  abstract selectedTuplesAll(): string[][];

  isError(): boolean {
    return (this.result as ErrorResult).error !== undefined;
  }

  isSingleton(): boolean {
    return typeof this.result === 'string' || 
           typeof this.result === 'number' || 
           typeof this.result === 'boolean';
  }

  getExpression(): string {
    return this.expression;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }
}

/**
 * Abstract base evaluator class that other evaluators can extend
 */
export abstract class BaseEvaluator implements IEvaluator {
  protected context?: EvaluationContext;
  protected initialized = false;

  initialize(context: EvaluationContext): void {
    this.context = context;
    this.initialized = true;
    this.onInitialize(context);
  }

  isReady(): boolean {
    return this.initialized && this.context !== undefined;
  }

  abstract evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult;

  abstract validateExpression(expression: string): boolean;

  getContextInfo() {
    if (!this.context) {
      return {
        hasSourceCode: false,
        instanceCount: 0,
        dataType: 'none'
      };
    }

    return {
      hasSourceCode: !!this.context.sourceCode,
      instanceCount: this.getInstanceCount(),
      dataType: this.getDataType(),
      ...this.getAdditionalContextInfo()
    };
  }

  abstract getCapabilities(): {
    language: string;
    version?: string;
    supportedOperators: string[];
    supportedTypes: string[];
    features: string[];
  };

  dispose(): void {
    this.context = undefined;
    this.initialized = false;
    this.onDispose();
  }

  // Protected methods for subclasses to override
  protected onInitialize(_context: EvaluationContext): void {
    // Override in subclass if needed
  }

  protected onDispose(): void {
    // Override in subclass if needed
  }

  protected abstract getInstanceCount(): number;
  
  protected abstract getDataType(): string;
  
  protected getAdditionalContextInfo(): Record<string, unknown> {
    return {};
  }

  // Utility methods
  protected throwIfNotReady(): void {
    if (!this.isReady()) {
      throw new Error('Evaluator not properly initialized');
    }
  }

  protected createErrorResult(error: string, expression: string): ErrorResult {
    return {
      error: {
        message: error,
        code: 'EVALUATION_ERROR'
      }
    };
  }
}

/**
 * Example implementation showing how forge-evaluator might implement this interface
 */
export class ExampleForgeEvaluator extends BaseEvaluator {
  private forgeEvaluator?: any; // Would be the actual ForgeExprEvaluatorUtil

  protected onInitialize(context: EvaluationContext): void {
    // Initialize the forge evaluator with the context
    // this.forgeEvaluator = new ForgeExprEvaluatorUtil(context.processedData, context.sourceCode);
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    this.throwIfNotReady();
    
    const instanceIndex = config?.instanceIndex ?? 0;
    
    try {
      // const result = this.forgeEvaluator.evaluateExpression(expression, instanceIndex);
      // return new ForgeEvaluatorResult(result, expression);
      
      // Placeholder implementation
      throw new Error('Not implemented - this is just an example');
    } catch (error) {
      const errorResult = this.createErrorResult(error.message, expression);
      return new ForgeEvaluatorResult(errorResult, expression);
    }
  }

  validateExpression(expression: string): boolean {
    this.throwIfNotReady();
    
    try {
      // Could try parsing or basic syntax validation
      return expression.length > 0 && !expression.includes('INVALID');
    } catch {
      return false;
    }
  }

  getCapabilities() {
    return {
      language: 'Forge/Alloy',
      version: '1.0.0',
      supportedOperators: ['+', '-', '.', '->', '&', '|', '!', '=', 'in', 'some', 'all'],
      supportedTypes: ['Int', 'String', 'univ', 'seq/Int'],
      features: ['relational-logic', 'quantifiers', 'temporal-operators']
    };
  }

  protected getInstanceCount(): number {
    if (!this.context?.processedData) return 0;
    // Would inspect the processed data to count instances
    return 1; // placeholder
  }

  protected getDataType(): string {
    return 'alloy-xml';
  }
}

// Example result implementation for Forge
class ForgeEvaluatorResult extends BaseEvaluatorResult {
  prettyPrint(): string {
    if (this.isError()) {
      const error = this.result as ErrorResult;
      return `Error: ${error.error.message}`;
    }
    
    if (this.isSingleton()) {
      return String(this.result);
    }
    
    const tuples = this.result as Tuple[];
    return tuples.map(tuple => tuple.join('->')).join(', ');
  }

  singleResult(): SingleValue {
    if (!this.isSingleton()) {
      throw new Error(`Expected ${this.expression} to evaluate to a single value`);
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (this.isSingleton() || this.isError()) {
      throw new Error(`Expected ${this.expression} to evaluate to atoms`);
    }
    
    const tuples = this.result as Tuple[];
    return tuples
      .filter(tuple => tuple.length === 1)
      .map(tuple => String(tuple[0]));
  }

  selectedTwoples(): string[][] {
    if (this.isSingleton() || this.isError()) {
      throw new Error(`Expected ${this.expression} to evaluate to tuples`);
    }
    
    const tuples = this.result as Tuple[];
    return tuples
      .filter(tuple => tuple.length >= 2)
      .map(tuple => [String(tuple[0]), String(tuple[tuple.length - 1])]);
  }

  selectedTuplesAll(): string[][] {
    if (this.isSingleton() || this.isError()) {
      throw new Error(`Expected ${this.expression} to evaluate to tuples`);
    }
    
    const tuples = this.result as Tuple[];
    return tuples.map(tuple => tuple.map(String));
  }
}
