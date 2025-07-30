import { ICommandParser, CommandResult } from './CoreParsers';
import { IInputDataInstance, IAtom } from '../../../data-instance/interfaces';
import { PyretDataInstance } from '../../../data-instance/pyret/pyret-data-instance';
import { PyretEvaluator } from './PyretExpressionParser';

/**
 * Parser for Pyret-style ID allocation syntax
 * 
 * Supports:
 * - x = 1 (allocate ID 'x' to a primitive value)
 * - xz = Black(...) (allocate ID 'xz' to a constructor expression)
 * - alice = [list: 1, 2, 3] (allocate ID 'alice' to a list)
 * 
 * This parser uses the external evaluator to infer proper types instead of
 * defaulting to generic types like "1:Number"
 */
export class PyretIdAllocationParser implements ICommandParser {
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
    
    // Pattern: id = expression
    // Where id is a valid identifier and expression is a Pyret expression
    // Exclude comparison operators (==, !=, <=, >=, etc.)
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (!assignmentMatch) {
      return false;
    }
    
    const [, id, expression] = assignmentMatch;
    
    // Validate ID
    if (!this.isValidId(id)) {
      return false;
    }
    
    // Check if the expression looks like a Pyret expression or primitive
    return this.looksLikePyretExpression(expression);
  }
  
  getPriority(): number {
    return 110; // Higher priority than AtomCommandParser but lower than RemoveCommandParser
  }
  
  getCommandPatterns(): string[] {
    return [
      'x = 1',
      'alice = "Alice"',
      'node = Black(...)',
      'mylist = [list: 1, 2, 3]',
      'tree = node(1, empty, empty)'
    ];
  }

  async execute(command: string, instance: IInputDataInstance): Promise<CommandResult> {
    const trimmed = command.trim();
    
    const assignmentMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=(?!=)\s*(.+)$/);
    if (!assignmentMatch) {
      return {
        success: false,
        message: 'Invalid assignment syntax. Use: id = expression'
      };
    }
    
    const [, assignedId, expression] = assignmentMatch;
    
    try {
      // Check if ID is already in use
      const existingAtom = instance.getAtoms().find(a => a.id === assignedId);
      if (existingAtom) {
        return {
          success: false,
          message: `ID '${assignedId}' is already in use. Use a different ID or remove the existing atom first.`
        };
      }
      
      if (this.isPrimitiveExpression(expression)) {
        // Handle primitive values directly
        return this.handlePrimitiveAssignment(assignedId, expression, instance);
      }
      
      if (!this.evaluator) {
        return {
          success: false,
          message: 'No external Pyret evaluator available. Cannot evaluate complex expressions.\n\nTo enable this feature, ensure window.__internalRepl is available.'
        };
      }
      
      // Use external evaluator for complex expressions
      return await this.handleComplexAssignment(assignedId, expression, instance);
      
    } catch (error) {
      return {
        success: false,
        message: `Failed to assign '${assignedId}': ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private isValidId(id: string): boolean {
    // Valid JavaScript identifier that doesn't conflict with keywords
    const reservedWords = ['add', 'remove', 'help', 'info', 'list', 'clear', 'reify'];
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) && !reservedWords.includes(id.toLowerCase());
  }

  private looksLikePyretExpression(expression: string): boolean {
    const trimmed = expression.trim();
    
    // Primitive values
    if (this.isPrimitiveExpression(trimmed)) {
      return true;
    }
    
    // Complex Pyret expressions
    return (
      // Function calls or constructors
      (trimmed.includes('(') && trimmed.includes(')')) ||
      // Lists or collections
      (trimmed.includes('[') && trimmed.includes(']')) ||
      // Tables
      trimmed.includes('table:') ||
      trimmed.includes('row:')
    );
  }

  private isPrimitiveExpression(expression: string): boolean {
    const trimmed = expression.trim();
    
    return (
      // Numbers (including floats)
      /^\d+(\.\d+)?$/.test(trimmed) ||
      // Strings
      /^['"`].*['"`]$/.test(trimmed) ||
      // Booleans
      trimmed === 'true' || trimmed === 'false'
    );
  }

  private handlePrimitiveAssignment(assignedId: string, expression: string, instance: IInputDataInstance): CommandResult {
    const trimmed = expression.trim();
    let value: string | number | boolean;
    let type: string;
    
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      // Number
      value = trimmed.includes('.') ? parseFloat(trimmed) : parseInt(trimmed);
      type = 'Number';
    } else if (/^['"`](.*)['"`]$/.test(trimmed)) {
      // String
      value = trimmed.slice(1, -1); // Remove quotes
      type = 'String';
    } else if (trimmed === 'true' || trimmed === 'false') {
      // Boolean
      value = trimmed === 'true';
      type = 'Boolean';
    } else {
      return {
        success: false,
        message: `Cannot parse primitive value: ${expression}`
      };
    }
    
    const atom: IAtom = {
      id: assignedId,
      label: String(value),
      type: type
    };
    
    instance.addAtom(atom);
    
    return {
      success: true,
      message: `[${assignedId}] Assigned ${assignedId} = ${value} (${type})`,
      action: 'add'
    };
  }

  private async handleComplexAssignment(assignedId: string, expression: string, instance: IInputDataInstance): Promise<CommandResult> {
    if (!this.evaluator) {
      throw new Error('External evaluator not available');
    }
    
    try {
      // Evaluate the expression
      const evaluationResult = await this.evaluator.run(expression);
      
      if (!this.evaluator.runtime.isSuccessResult(evaluationResult)) {
        return {
          success: false,
          message: `Failed to evaluate expression '${expression}': ${this.formatError(evaluationResult.exn)}`
        };
      }
      
      // Create a temporary PyretDataInstance from the result
      const tempInstance = await PyretDataInstance.fromExpression(
        expression,
        false, // showFunctions
        this.evaluator
      );
      
      if (tempInstance.getAtoms().length === 0) {
        return {
          success: false,
          message: `Expression '${expression}' did not produce any data structures`
        };
      }
      
      // Get the first (root) atom and assign the specified ID
      const rootAtoms = tempInstance.getAtoms();
      const rootAtom = rootAtoms[0];
      
      // Create new atom with assigned ID
      const assignedAtom: IAtom = {
        id: assignedId,
        label: rootAtom.label,
        type: rootAtom.type
      };
      
      instance.addAtom(assignedAtom);
      
      // If there are multiple atoms or relations, add them with updated references
      if (rootAtoms.length > 1 || tempInstance.getRelations().length > 0) {
        // Update all references from the original root atom ID to the assigned ID
        await this.mergeInstanceWithIdMapping(tempInstance, instance, rootAtom.id, assignedId);
      }
      
      const atomCount = rootAtoms.length;
      const relationCount = tempInstance.getRelations().reduce((sum, rel) => sum + rel.tuples.length, 0);
      
      return {
        success: true,
        message: `[${assignedId}] Assigned ${assignedId} = ${expression}\nAdded ${atomCount} atoms and ${relationCount} relation tuples`,
        action: 'add'
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Failed to evaluate and assign '${expression}': ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async mergeInstanceWithIdMapping(
    sourceInstance: PyretDataInstance, 
    targetInstance: IInputDataInstance, 
    oldRootId: string, 
    newRootId: string
  ): Promise<void> {
    // Create ID mapping
    const idMapping = new Map<string, string>();
    idMapping.set(oldRootId, newRootId);
    
    // Add remaining atoms (skip the root atom as it's already added)
    for (const atom of sourceInstance.getAtoms()) {
      if (atom.id === oldRootId) continue;
      
      // Generate unique ID for non-root atoms
      let uniqueId = atom.id;
      const existingIds = new Set(targetInstance.getAtoms().map(a => a.id));
      let counter = 1;
      
      while (existingIds.has(uniqueId)) {
        uniqueId = `${atom.id}_${counter}`;
        counter++;
      }
      
      idMapping.set(atom.id, uniqueId);
      
      const mappedAtom: IAtom = {
        id: uniqueId,
        label: atom.label,
        type: atom.type
      };
      
      targetInstance.addAtom(mappedAtom);
    }
    
    // Add relations with mapped IDs
    for (const relation of sourceInstance.getRelations()) {
      for (const tuple of relation.tuples) {
        const mappedAtoms = tuple.atoms.map(atomId => idMapping.get(atomId) || atomId);
        
        targetInstance.addRelationTuple(relation.name, {
          atoms: mappedAtoms
        });
      }
    }
  }

  private formatError(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }
    return String(error);
  }

  getHelp(): string[] {
    const baseHelp = [
      'ID Allocation Commands (Pyret-style):',
      '  id = expression                 - Assign specific ID to expression result',
      '',
      'Primitive Examples:',
      '  x = 1                           - Assign ID "x" to number 1',
      '  name = "Alice"                  - Assign ID "name" to string "Alice"',
      '  flag = true                     - Assign ID "flag" to boolean true',
    ];
    
    if (this.evaluator) {
      baseHelp.push(
        '',
        'Complex Examples (with external evaluator):',
        '  node = Black(1, 2)              - Assign ID "node" to constructor result',
        '  mylist = [list: 1, 2, 3]        - Assign ID "mylist" to list',
        '  tree = node(1, empty, empty)    - Assign ID "tree" to tree structure'
      );
    } else {
      baseHelp.push(
        '',
        'Note: Complex expressions require external Pyret evaluator',
        '      Only primitive values (numbers, strings, booleans) are supported'
      );
    }
    
    return baseHelp;
  }
}