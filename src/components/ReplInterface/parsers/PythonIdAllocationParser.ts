import { ICommandParser, CommandResult } from './CoreParsers';
import { IInputDataInstance, IAtom } from '../../../data-instance/interfaces';
import { PythonDataInstance } from '../../../data-instance/python/python-data-instance';
import { PythonEvaluator } from './PythonExpressionParser';

/**
 * Parser for Python-style variable assignment syntax
 * 
 * Supports:
 * - x = 1 (assign variable 'x' to a primitive value)
 * - alice = "Alice" (assign variable 'alice' to a string)
 * - node = TreeNode(value=1) (assign variable 'node' to a constructor expression)
 * - my_list = [1, 2, 3] (assign variable 'my_list' to a list)
 * 
 * This parser uses the external evaluator to infer proper types instead of
 * defaulting to generic types like "1:int"
 */
export class PythonIdAllocationParser implements ICommandParser {
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

  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Must contain an assignment operator
    if (!trimmed.includes('=')) {
      return false;
    }
    
    // Exclude remove commands
    if (trimmed.startsWith('remove ')) {
      return false;
    }
    
    // Exclude utility commands
    const utilityCommands = ['help', 'info', 'status', 'list', 'clear', 'reify'];
    if (utilityCommands.includes(trimmed.toLowerCase())) {
      return false;
    }
    
    // Exclude dot notation relations (handled by DotNotationRelationParser)
    // Only exclude if dot comes before equals (e.g., alice.friend=bob)
    if (trimmed.includes('.') && trimmed.includes('=')) {
      const dotIndex = trimmed.indexOf('.');
      const equalsIndex = trimmed.indexOf('=');
      if (dotIndex < equalsIndex) {
        return false; // This is dot notation relation like alice.friend=bob
      }
    }
    
    // Pattern: variable = expression
    // Where variable is a valid Python identifier and expression is a Python expression
    // Exclude comparison operators (==, !=, <=, >=, etc.)
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (!assignmentMatch) {
      return false;
    }
    
    const [, variableName, expression] = assignmentMatch;
    
    // Validate variable name
    if (!this.isValidPythonIdentifier(variableName)) {
      return false;
    }
    
    // Check if the expression looks like a Python expression or primitive
    return this.looksLikePythonExpression(expression);
  }
  
  getPriority(): number {
    return 110; // Higher priority than AtomCommandParser but lower than RemoveCommandParser
  }
  
  getHelp(): string[] {
    return [
      'Python Variable Assignment Parser',
      'Handles Python-style variable assignments',
      'Examples:',
      '  x = 1',
      '  alice = "Alice"',
      '  node = TreeNode(value=1)',
      '  my_list = [1, 2, 3]'
    ];
  }

  getCommandPatterns(): string[] {
    return [
      'x = 1',
      'alice = "Alice"',
      'node = TreeNode(...)',
      'my_list = [1, 2, 3]',
      'tree = node(1, empty, empty)'
    ];
  }

  async execute(command: string, instance: IInputDataInstance): Promise<CommandResult> {
    const trimmed = command.trim();
    
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (!assignmentMatch) {
      return {
        success: false,
        message: 'Invalid assignment syntax. Use: variable = expression'
      };
    }
    
    const [, variableName, expression] = assignmentMatch;
    
    // Ensure we have a PythonDataInstance
    if (!(instance instanceof PythonDataInstance)) {
      return {
        success: false,
        message: 'Python assignments can only be used with PythonDataInstance'
      };
    }
    
    try {
      // If we have an external evaluator, use it to evaluate the expression
      if (this.evaluator) {
        return await this.executeWithEvaluator(variableName, expression, instance);
      } else {
        // Fallback: try to parse as a primitive or simple expression
        return this.executeWithoutEvaluator(variableName, expression, instance);
      }
    } catch (error) {
      return {
        success: false,
        message: `Error in Python assignment: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute assignment using external Python evaluator
   */
  private async executeWithEvaluator(
    variableName: string, 
    expression: string, 
    instance: PythonDataInstance
  ): Promise<CommandResult> {
    if (!this.evaluator) {
      throw new Error('No evaluator available');
    }

    try {
      // Evaluate the expression
      const result = await this.evaluator.runPython(expression);
      
      // Create a Python object representing this assignment
      const pythonObject = {
        [variableName]: result,
        __class__: { __name__: 'assignment' }
      };
      
      // Create a new PythonDataInstance from this assignment
      const assignmentInstance = new PythonDataInstance(pythonObject, false, this.evaluator);
      
      // Add the assignment instance to the existing instance
      const addSuccess = instance.addFromDataInstance(assignmentInstance, true);
      
      if (!addSuccess) {
        return {
          success: false,
          message: 'Failed to add assignment to instance'
        };
      }

      return {
        success: true,
        message: `Assigned ${variableName} = ${this.formatResult(result)}`
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Python evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute assignment without external evaluator (fallback)
   */
  private executeWithoutEvaluator(
    variableName: string, 
    expression: string, 
    instance: PythonDataInstance
  ): Promise<CommandResult> {
    const trimmedExpr = expression.trim();
    
    // Try to parse as primitive values
    let value: unknown;
    let type: string;
    
    // Check for string literals
    if ((trimmedExpr.startsWith('"') && trimmedExpr.endsWith('"')) ||
        (trimmedExpr.startsWith("'") && trimmedExpr.endsWith("'"))) {
      value = trimmedExpr.slice(1, -1); // Remove quotes
      type = 'str';
    }
    // Check for numbers
    else if (/^\d+$/.test(trimmedExpr)) {
      value = parseInt(trimmedExpr, 10);
      type = 'int';
    }
    else if (/^\d+\.\d+$/.test(trimmedExpr)) {
      value = parseFloat(trimmedExpr);
      type = 'float';
    }
    // Check for booleans
    else if (trimmedExpr === 'True') {
      value = true;
      type = 'bool';
    }
    else if (trimmedExpr === 'False') {
      value = false;
      type = 'bool';
    }
    else if (trimmedExpr === 'None') {
      value = null;
      type = 'NoneType';
    }
    else {
      // For complex expressions without evaluator, create a placeholder
      value = trimmedExpr;
      type = 'expression';
    }
    
    // Create an atom for this assignment
    const atom: IAtom = {
      id: `${variableName}_${Date.now()}`,
      label: variableName,
      type: type
    };
    
    instance.addAtom(atom);
    
    return Promise.resolve({
      success: true,
      message: `Assigned ${variableName} = ${this.formatResult(value)} (type: ${type})`
    });
  }

  /**
   * Check if a string is a valid Python identifier
   */
  private isValidPythonIdentifier(name: string): boolean {
    // Python identifier rules: starts with letter or underscore, followed by letters, digits, or underscores
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  /**
   * Check if an expression looks like a Python expression
   */
  private looksLikePythonExpression(expression: string): boolean {
    const trimmed = expression.trim();
    
    // Empty expression is not valid
    if (!trimmed) {
      return false;
    }
    
    // Python literals
    if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) return true; // Strings
    if (/^\d+$/.test(trimmed) || /^\d+\.\d+$/.test(trimmed)) return true; // Numbers
    if (/^(True|False|None)$/.test(trimmed)) return true; // Python keywords
    
    // Python collections
    if (/^\[.*\]$/.test(trimmed)) return true; // Lists
    if (/^\{.*\}$/.test(trimmed)) return true; // Dicts/sets
    if (/^\(.*\)$/.test(trimmed)) return true; // Tuples
    
    // Function calls or constructor calls
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\(.*\)$/.test(trimmed)) return true;
    
    // Other expressions
    return true; // For now, accept anything else as a potential Python expression
  }

  /**
   * Format evaluation result for display
   */
  private formatResult(result: unknown): string {
    if (result === null) return 'None';
    if (typeof result === 'string') return `"${result}"`;
    if (typeof result === 'boolean') return result ? 'True' : 'False';
    if (typeof result === 'number') return String(result);
    if (Array.isArray(result)) return `[${result.length} items]`;
    if (typeof result === 'object') return '[object]';
    return String(result);
  }
}