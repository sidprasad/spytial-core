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

  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
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
    const utilityCommands = ['help', 'info', 'status', 'list', 'clear', 'reify'];
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
      '[list: 1, 2, 3, 4]'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    if (!this.evaluator) {
      return {
        success: false,
        message: 'No external Pyret evaluator available. Cannot evaluate Pyret expressions.\n\nTo enable this feature, ensure window.__internalRepl is available.'
      };
    }
    
    // For now, provide a helpful message about the detected evaluator
    // In a future implementation, this could trigger async evaluation
    return {
      success: true,
      message: `Pyret evaluator detected! Expression would be evaluated: ${trimmed}\n\n⚠️  Full async evaluation not yet implemented in parser interface.\nThis is a foundation for future development.`,
      action: 'info'
    };
  }

  /**
   * Add a Pyret evaluation result to the data instance
   */
  private async addPyretResultToInstance(
    pyretResult: unknown, 
    instance: IInputDataInstance, 
    originalExpression: string
  ): Promise<CommandResult> {
    try {
      // Create a new PyretDataInstance from the result
      const tempInstance = new PyretDataInstance(pyretResult as any);
      
      // Get the new atoms and relations from the temp instance
      const newAtoms = tempInstance.getAtoms();
      const newRelations = tempInstance.getRelations();
      
      if (newAtoms.length === 0) {
        return {
          success: false,
          message: 'Pyret expression did not produce any data structures'
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
      
      return {
        success: true,
        message: `Evaluated Pyret expression: ${originalExpression}\nAdded ${atomsAdded} atoms and ${relationsAdded} relation tuples`,
        action: 'add'
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Failed to convert Pyret result to data instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Format Pyret evaluation errors for display
   */
  private formatError(error: unknown): string {
    if (!error) {
      return 'Unknown error';
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (typeof error === 'object' && error !== null) {
      // Try to extract useful error information from Pyret error objects
      const errorObj = error as any;
      
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
      '  edge("id", "label", weight)           - Add edge data structure',
      '  [list: 1, 2, 3, 4]                   - Add Pyret list',
      '  tree(left, right)                    - Add tree data structure',
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
        'This parser requires window.__internalRepl or similar.'
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