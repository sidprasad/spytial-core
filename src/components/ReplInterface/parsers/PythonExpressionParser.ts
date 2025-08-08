import { ICommandParser, CommandResult } from './CoreParsers';
import { IInputDataInstance } from '../../../data-instance/interfaces';
import { PythonDataInstance } from '../../../data-instance/python/python-data-instance';

/**
 * Interface for external Python evaluator (e.g., pyodide instance)
 */
export interface PythonEvaluator {
  /** 
   * Run a Python expression and return the result
   * @param code - Python code to evaluate
   * @returns Promise that resolves to evaluation result
   */
  runPython(code: string): Promise<unknown>;
  
  /**
   * Optional method to check if the evaluator is ready
   */
  isReady?(): boolean;
  
  /**
   * Optional method to get globals
   */
  globals?: Record<string, unknown>;
}

/**
 * Result of evaluating a Python expression
 */
export interface PythonEvaluationResult {
  /** The raw Python value (if successful) */
  result?: unknown;
  /** Exception information (if failed) */
  error?: unknown;
  /** Whether the evaluation was successful */
  success?: boolean;
}

/**
 * Parser for arbitrary Python expressions using an external Python evaluator
 * 
 * This parser handles Python expressions that can be evaluated by an external
 * Python runtime (e.g., Pyodide). It can parse and add complex
 * Python data structures, builtin types, and collections.
 * 
 * Examples of supported expressions:
 * - [1, 2, 3, 4]
 * - {"name": "Alice", "age": 25}
 * - TreeNode(value=1, left=None, right=None)
 * - range(10)
 */
export class PythonExpressionParser implements ICommandParser {
  private evaluator: PythonEvaluator | null;

  constructor(evaluator?: PythonEvaluator) {
    this.evaluator = evaluator || null;
  }

  /**
   * Update the external evaluator
   */
  setEvaluator(evaluator: PythonEvaluator | null): void {
    this.evaluator = evaluator;
  }

  /**
   * Checks if a value is a primitive type (string, number, boolean)
   */
  private isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  private async evaluateExpression(command: string): Promise<PythonEvaluationResult> {
    if (!this.evaluator) {
      throw new Error('No external Python evaluator available');
    }
    
    try {
      const result = await this.evaluator.runPython(command);

      return {
        success: true,
        result: result,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown evaluation error',
      };
    }
  }

  /**
   * Check if this parser can handle the command
   * This is a catch-all parser that tries to evaluate any Python expression
   */
  canHandle(command: string): boolean {
    // Don't handle if no evaluator is available
    if (!this.evaluator) {
      return false;
    }

    // Skip empty commands
    const trimmed = command.trim();
    if (!trimmed) {
      return false;
    }

    // Skip commands that look like specific REPL commands
    if (trimmed.startsWith('help') || 
        trimmed.startsWith('info') || 
        trimmed.startsWith('clear') ||
        trimmed.startsWith('reify') ||
        trimmed.startsWith('remove ')) {
      return false;
    }

    // Skip atom declarations (Name:Type pattern)
    if (/^[a-zA-Z_]\w*\s*:\s*[a-zA-Z_]\w*$/.test(trimmed)) {
      return false;
    }

    // Skip dot notation relations (a.property = value)
    if (/^[a-zA-Z_]\w*\.[a-zA-Z_]\w*\s*=/.test(trimmed)) {
      return false;
    }

    // This is a catch-all parser, so if we have an evaluator and it's not 
    // obviously another type of command, we'll try to parse it
    return true;
  }

  /**
   * Parse a Python expression and update the data instance
   */
  async execute(command: string, instance: IInputDataInstance): Promise<CommandResult> {
    // Ensure we have a PythonDataInstance
    if (!(instance instanceof PythonDataInstance)) {
      return {
        success: false,
        message: 'Python expressions can only be used with PythonDataInstance'
      };
    }

    const trimmed = command.trim();

    try {
      // Evaluate the Python expression
      const evaluationResult = await this.evaluateExpression(trimmed);

      if (!evaluationResult.success) {
        return {
          success: false,
          message: `Python evaluation failed: ${this.formatError(evaluationResult.error)}`
        };
      }

      // Create a new PythonDataInstance from the result
      let newInstance: PythonDataInstance;

      if (this.isPrimitive(evaluationResult.result)) {
        // For primitive results, create a simple instance with just that value
        newInstance = new PythonDataInstance(null, false, this.evaluator);
        
        const atomType = typeof evaluationResult.result === 'string' ? 'str' :
                         typeof evaluationResult.result === 'number' ? 
                           (Number.isInteger(evaluationResult.result) ? 'int' : 'float') : 'bool';
        
        const primitiveAtom = {
          id: `result_${evaluationResult.result}`,
          label: String(evaluationResult.result),
          type: atomType
        };
        
        newInstance.addAtom(primitiveAtom);
      } else {
        // For complex objects, try to parse them as Python objects
        try {
          newInstance = new PythonDataInstance(
            evaluationResult.result as any, 
            false, 
            this.evaluator
          );
        } catch (parseError) {
          return {
            success: false,
            message: `Failed to parse Python result: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
          };
        }
      }

      // Add the new instance to the existing one
      const addSuccess = instance.addFromDataInstance(newInstance, true);
      
      if (!addSuccess) {
        return {
          success: false,
          message: 'Failed to merge Python evaluation result with existing instance'
        };
      }

      return {
        success: true,
        message: `Python expression evaluated successfully: ${trimmed}`
      };

    } catch (error) {
      return {
        success: false,
        message: `Error parsing Python expression: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Format Python evaluation errors for display
   */
  private formatError(error: any): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      if (error.message) {
        return error.message;
      }

      if (error.toString && typeof error.toString === 'function') {
        return error.toString();
      }
    }

    return String(error);
  }

  /**
   * Get parser priority (lower number = higher priority)
   * Python expression parser has medium priority (90) to allow other 
   * specialized parsers to handle their specific cases first
   */
  getPriority(): number {
    return 90;
  }

  /**
   * Get help text for this parser
   */
  getHelp(): string[] {
    const baseHelp = [
      'Python Expression Parser',
      'Evaluates arbitrary Python expressions using external Python runtime',
      'Examples:',
      '  1 + 2',
      '  [1, 2, 3]',
      '  {"name": "Alice", "age": 25}',
      '  TreeNode(value=1, left=None, right=None)'
    ];
    
    if (!this.evaluator) {
      return [
        ...baseHelp,
        '',
        'NOTE: External Python evaluator not available - parser disabled'
      ];
    }
    
    return baseHelp;
  }

  /**
   * Get command patterns this parser recognizes
   */
  getCommandPatterns(): string[] {
    return [
      '1 + 2',
      '[1, 2, 3]',
      '{"key": "value"}',
      'TreeNode(value=1)',
      'range(10)',
      '"hello world"'
    ];
  }

  /**
   * Check if the parser has an external evaluator
   */
  hasEvaluator(): boolean {
    return this.evaluator !== null;
  }

  /**
   * Get the current evaluator
   */
  getEvaluator(): PythonEvaluator | null {
    return this.evaluator;
  }
}