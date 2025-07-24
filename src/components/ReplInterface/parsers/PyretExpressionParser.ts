import { ICommandParser, CommandResult } from './CoreParsers';
import { IInputDataInstance } from '../../../data-instance/interfaces';
import { PyretDataInstance } from '../../../data-instance/pyret/pyret-data-instance';

/**
 * Interface for external Pyret evaluator (e.g., window.__internalRepl)
 */
export interface PyretEvaluator {
  /** 
   * Run a Pyret expression and return the result
   * @param code - Pyret code to evaluate
   * @param sourceLocation - Optional source location identifier
   * @returns Promise that resolves to evaluation result
   */
  run(code: string, sourceLocation?: string): Promise<PyretEvaluationResult>;
  
  /**
   * Runtime utilities for checking result types
   */
  runtime: {
    isSuccessResult(result: PyretEvaluationResult): boolean;
  };
}

/**
 * Result of evaluating a Pyret expression
 */
export interface PyretEvaluationResult {
  /** The raw Pyret JS value (if successful) */
  result?: unknown;
  /** Exception information (if failed) */
  exn?: unknown;
  /** Whether the evaluation was successful */
  success?: boolean;
}


/**
 * 
 * 
 */

/**
 * Parser for arbitrary Pyret expressions using an external Pyret evaluator
 * 
 * This parser handles Pyret expressions that can be evaluated by an external
 * Pyret runtime (e.g., window.__internalRepl). It can parse and add complex
 * Pyret data structures, builtin types, and collections that would be difficult
 * to handle with simple parsers.
 * 
 * Examples of supported expressions:
 * - edge("1", "b", 3)
 * - [list: 1, 2, 3, 4]
 * - tree(node(1, empty, empty), node(2, empty, empty))
 * - table: name, age row: "Alice", 25 row: "Bob", 30 end
 */
export class PyretExpressionParser implements ICommandParser {
  private evaluator: PyretEvaluator | null;

  constructor(evaluator?: PyretEvaluator) {
    this.evaluator = evaluator || null;
  }

  /**
   * Update the external evaluator
   */
  setEvaluator(evaluator: PyretEvaluator | null): void {
    this.evaluator = evaluator;
  }


  /**
   * Recursively searches for a key at any level in an object
   */
  private findKeyAtAnyLevel(obj: unknown, keyName: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }
    
    // Check if this object has the key directly
    if (keyName in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[keyName];
    }
    
    // Recursively search in nested objects and arrays
    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const found = this.findKeyAtAnyLevel(value, keyName);
        if (found !== undefined) {
          return found;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Checks if a value is a primitive type (string, number, boolean)
   */
  private isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  private async evaluateExpression(command: string): Promise<PyretEvaluationResult> {
    if (!this.evaluator) {
      throw new Error('No external Pyret evaluator available');
    }
    
    try {
      const result = await this.evaluator.run(command);

      // Step 1: Look for "exn" key at any level - if found, it's a failure
      const exnValue = this.findKeyAtAnyLevel(result, 'exn');
      if (exnValue !== undefined) {
        return {
          success: false,
          exn: exnValue,
        };
      }
      
      // Step 2: Look for "answer" key at any level - if found, process it
      const answerValue = this.findKeyAtAnyLevel(result, 'answer');
      if (answerValue !== undefined) {
        return {
          success: true,
          result: answerValue,
        };
      }

      // Step 3: Check if the result is a primitive value directly
      if (this.isPrimitive(result)) {
        return {
          success: true,
          result: result,
        };
      }

      // If we can't find an answer or exn, return failure
      return {
        success: false,
        exn: 'Unable to find answer or exn in evaluation result',
      };
      
    } catch (error) {
      return {
        success: false,
        exn: error instanceof Error ? error.message : 'Unknown evaluation error',
      };
    }
  }

  canHandle(command: string): boolean {
    const trimmed = command.trim();

    // Handle reify command
    if (trimmed.toLowerCase() === 'reify') {
      return true;
    }

    // If the command is a string or number literal, we CAN handle it.
    if (/^['"`].*['"`]$/.test(trimmed) || /^\d+(\.\d+)?$/.test(trimmed)) {
      return true;
    }
    
    // Only handle commands if we have an external evaluator
    if (!this.evaluator) {
      return false;
    }
    
    // TODO: Improve this heuristic with deeper Pyret syntax analysis
    // This is currently a hand-wavy heuristic that could be made more robust
    
    // Exclude remove commands (handled by RemoveCommandParser)
    if (trimmed.startsWith('remove ')) {
      return false;
    }
    
    // Exclude utility commands
    const utilityCommands = ['help', 'info', 'status', 'list', 'clear'];
    if (utilityCommands.includes(trimmed.toLowerCase())) {
      return false;
    }
    
    // Exclude simple atom syntax (handled by AtomCommandParser)
    // But allow table syntax which also contains colons
    if (/^[^:]+:.+$/.test(trimmed) && !trimmed.includes('(') && !trimmed.includes('[') && 
        !trimmed.includes('table:') && !trimmed.includes('row:')) {
      return false;
    }
    
    // Exclude simple dot notation (handled by DotNotationRelationParser)  
    if (trimmed.includes('.') && trimmed.includes('=') && !trimmed.includes('(')) {
      return false;
    }
    
    // Handle expressions that look like Pyret code:
    // - Function calls: func(args)
    // - Constructors: Constructor(args) 
    // - Lists: [list: items]
    // - Complex expressions with parentheses or brackets
    if (trimmed.includes('(') && trimmed.includes(')')) {
      return true;
    }
    
    if (trimmed.includes('[') && trimmed.includes(']')) {
      return true;
    }
    
    // Handle other Pyret-like expressions (tables, etc.)
    if (trimmed.includes('table:') || trimmed.includes('row:')) {
      return true;
    }
    
    return false;
  }
  
  getPriority(): number {
    return 90; // Lower priority than specific parsers, but higher than fallback
  }
  
  getCommandPatterns(): string[] {
    return [
      'reify',
      '[list: 1, 2, 3, 4]',
      'edge("id", "label", weight)'
    ];
  }

  execute(command: string, instance: IInputDataInstance): Promise<CommandResult> {
    const trimmed = command.trim();

    // Handle reify command
    if (trimmed.toLowerCase() === 'reify') {
      return this.reifyInstance(instance).then(lines => ({
        success: true,
        message: lines.length > 0 ? lines.join('\n') : 'No data to reify',
        action: 'info' as const
      }));
    }

    if (!this.evaluator) {
      return Promise.resolve({
        success: false,
        message: 'No external Pyret evaluator available. Cannot evaluate Pyret expressions.\n\nTo enable this feature, ensure window.__internalRepl is available.'
      });
    }

    // Return a promise that resolves with the actual result
    return this.evaluateExpression(trimmed)
      .then(async (evaluationResult) => {
        if (evaluationResult.success) {
          // Add the result to the instance
          const result = await this.addPyretResultToInstance(evaluationResult.result, instance, trimmed);
          return result;
        } else {
          return {
            success: false,
            message: `Evaluation failed: ${this.formatError(evaluationResult.exn)}`
          };
        }
      })
      .catch((error) => {
        return {
          success: false,
          message: `Unexpected error during evaluation: ${this.formatError(error)}`
        };
      });
  }

  /**
   * Re-ify data instance back to Pyret expressions using the external evaluator
   * This leverages the external evaluator for converting internal data back to Pyret form
   */
  async reifyInstance(instance: IInputDataInstance): Promise<string[]> {
    if (!this.evaluator) {
      return ['// No external Pyret evaluator available for reification'];
    }

    const reifyLines: string[] = [];
    
    try {
      // Re-ify atoms
      const atoms = instance.getAtoms();
      for (const atom of atoms) {
        // Convert atom to Pyret syntax based on type
        if (atom.type) {
          reifyLines.push(`${atom.label}:${atom.type}`);
        } else {
          reifyLines.push(atom.label);
        }
      }

      // Re-ify relations
      const relations = instance.getRelations();
      for (const relation of relations) {
        for (const tuple of relation.tuples) {
          if (tuple.atoms.length === 2) {
            // Binary relation - use dot notation
            reifyLines.push(`${tuple.atoms[0]}.${relation.name}=${tuple.atoms[1]}`);
          } else {
            // N-ary relation - use function-call syntax
            const args = tuple.atoms.map(a => `"${a}"`).join(', ');
            reifyLines.push(`${relation.name}(${args})`);
          }
        }
      }

      return reifyLines;
    } catch (error) {
      return [
        '// Error during reification:',
        `// ${error instanceof Error ? error.message : 'Unknown error'}`
      ];
    }
  }
  /**
   * Extract CnD specification from an expression by creating a faux expression and running it in the external evaluator
   */
  private async extractCndSpec(pyretResult: any, originalExpression: string): Promise<string> {
    try {
      // Only proceed if we have an evaluator
      if (!this.evaluator) {
        return "";
      }
      
      // Create a faux expression to call _cndspec on the result
      const cndSpecCode = `(${originalExpression})._cndspec()`;
      const specResult = await this.evaluateExpression(cndSpecCode);
      
      if (specResult.success && specResult.result) {
        // If result is a string, that's the CnD spec
        if (typeof specResult.result === 'string') {
          return specResult.result;
        }
      }
      

    } catch (error) {
      console.error('Error extracting CnD spec:', this.formatError(error));
    }
    // If error or no result, return the empty spec.
    return "";
  }

  private async addPyretResultToInstance(
    pyretResult: any, 
    instance: IInputDataInstance, 
    originalExpression: string
  ): Promise<CommandResult> {
    try {
      // First, attempt to extract CnD specification if available
      const extractedCndSpec = await this.extractCndSpec(pyretResult, originalExpression);
      
      // Check if the result is a primitive value
      if (this.isPrimitive(pyretResult)) {
        // Add primitive value directly to the current InputDataInstance with appropriate type
        const atomType = typeof pyretResult === 'string' ? 'String' :
                         typeof pyretResult === 'number' ? 'Number' : 'Boolean';
        
        // Generate a unique atom ID
        const existingIds = new Set(instance.getAtoms().map(a => a.id));
        let atomId = `result_${pyretResult}`;
        let counter = 1;
        while (existingIds.has(atomId)) {
          atomId = `result_${pyretResult}_${counter}`;
          counter++;
        }
        
        const primitiveAtom = {
          id: atomId,
          label: String(pyretResult),
          type: atomType
        };
        
        instance.addAtom(primitiveAtom);
        
        const message = `Evaluated Pyret expression: ${originalExpression}\nResult: ${pyretResult} (${atomType})\nAdded 1 atom` +
                       (extractedCndSpec ? '\nExtracted CnD specification from result' : '');
        
        return {
          success: true,
          message,
          action: 'add',
          extractedCndSpec
        };
      }
      
      // For complex objects, convert to PyretDataInstance and merge all atoms/relations
      const tempInstance = new PyretDataInstance(pyretResult);

      // Get the new atoms and relations from the temp instance
      const newAtoms = tempInstance.getAtoms();
      const newRelations = tempInstance.getRelations();

      if (newAtoms.length === 0) {
        return {
          success: false,
          message: 'Pyret expression did not produce any data structures',
          extractedCndSpec
        };
      }

      // Add all atoms to the main instance
      let atomsAdded = 0;
      let relationsAdded = 0;

      for (const atom of newAtoms) {
        try {
          // Generate unique ID if there's a conflict
          let uniqueId = atom.id;
          const existingIds = new Set(instance.getAtoms().map(a => a.id));
          let counter = 1;

          while (existingIds.has(uniqueId)) {
            uniqueId = `${atom.id}_${counter}`;
            counter++;
          }

          const atomToAdd = { ...atom, id: uniqueId };
          instance.addAtom(atomToAdd);
          atomsAdded++;
        } catch (error) {
          // Atom might already exist, continue
        }
      }

      // Add all relation tuples to the main instance
      for (const relation of newRelations) {
        for (const tuple of relation.tuples) {
          try {
            // Update tuple atom IDs if they were renamed
            const updatedTuple = { ...tuple };
            // Note: This is a simplified approach. In a full implementation,
            // we'd need to track ID mappings more carefully.
            instance.addRelationTuple(relation.name, updatedTuple);
            relationsAdded++;
          } catch (error) {
            // Tuple might already exist, continue
          }
        }
      }

      const message = `Evaluated Pyret expression: ${originalExpression}\nAdded ${atomsAdded} atoms and ${relationsAdded} relation tuples` +
                     (extractedCndSpec ? '\nExtracted CnD specification from result' : '');

      return {
        success: true,
        message,
        action: 'add',
        extractedCndSpec
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to convert Pyret result to data instance: ${this.formatError(error)}`
      };
    }
  }

  /**
   * Format Pyret evaluation errors for display
   */
  private formatError(error: any): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      // Try to extract useful error information from Pyret error objects
      const errorObj = error;

      if (errorObj.message) {
        return errorObj.message;
      }

      if (errorObj.toString && typeof errorObj.toString === 'function') {
        return errorObj.toString();
      }
    }

    return String(error);
  }

  getHelp(): string[] {
    const baseHelp = [
      'Pyret Expression Commands (requires external evaluator):',
      '  reify                                - Convert current data instance back to Pyret expressions',
      '  edge("id", "label", weight)          - Add edge data structure',
      '  [list: 1, 2, 3, 4]                  - Add Pyret list',
      '  tree(left, right)                   - Add tree data structure',
      '  table: col1, col2 row: val1, val2 end - Add table data structure',
      '',
      'This parser can evaluate arbitrary Pyret expressions and convert',
      'the results into atoms and relations in the data instance.',
    ];
    
    if (!this.evaluator) {
      return [
        ...baseHelp,
        '',
        '⚠️  External Pyret evaluator not available.',
        'This parser requires window.__internalRepl or similar.',
        'The "reify" command works without external evaluator.'
      ];
    }
    
    return [
      ...baseHelp,
      '',
      '✓ External Pyret evaluator is available.',
      'You can use any valid Pyret expression.'
    ];
  }
}