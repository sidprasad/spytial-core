import { IAtom, ITuple, IInputDataInstance } from '../../../data-instance/interfaces';

/**
 * Result of executing a command
 */
export interface CommandResult {
  success: boolean;
  message: string;
  action?: 'add' | 'remove' | 'info' | 'help';
  /** Extracted CnD specification (if any) from expressions with _cndspec method */
  extractedCndSpec?: string;
}

/**
 * Base interface for command parsers
 */
export interface ICommandParser {
  /**
   * Parse and execute a command
   * Can return either a synchronous result or a Promise for async operations
   */
  execute(command: string, instance: IInputDataInstance): CommandResult | Promise<CommandResult>;
  
  /**
   * Get help text for this parser
   */
  getHelp(): string[];
  
  /**
   * Check if this parser can handle the given command
   */
  canHandle(command: string): boolean;
  
  /**
   * Get the priority of this parser (higher number = higher priority)
   * Used to resolve conflicts when multiple parsers claim they can handle a command
   */
  getPriority(): number;
  
  /**
   * Get the command patterns this parser recognizes
   * Used for better debugging and maintainability
   */
  getCommandPatterns(): string[];
}

/**
 * Parser for remove commands (sugar syntax)
 * Supports:
 * - remove ID (remove atom by ID)
 * - remove Label:Type (remove atom by label and type)
 * - remove source.relation=target (remove specific relation tuple)
 * - remove relation (remove entire relation)
 */
export class RemoveCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    return trimmed.startsWith('remove ') && trimmed.length > 7;
  }
  
  getPriority(): number {
    return 200; // Higher priority than other parsers to handle remove commands first
  }
  
  getCommandPatterns(): string[] {
    return [
      'remove ID',
      'remove Label:Type',
      'remove source.relation=target',
      'remove relation'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    const args = trimmed.substring(7); // Remove "remove " prefix
    
    try {
      // Pattern 1: remove source.relation=target (specific relation tuple)
      if (args.includes('.') && args.includes('=')) {
        return this.handleRemoveRelationTuple(args, instance);
      }
      
      // Pattern 2: remove Label:Type (atom by label and type)
      if (args.includes(':') && !args.includes('->')) {
        return this.handleRemoveAtomByLabelType(args, instance);
      }
      
      // Pattern 3: remove ID (atom by ID) or relation (entire relation by name)
      // Try atom first, then fallback to relation
      if (/^[^\s:->().]+$/.test(args)) {
        // Try to find atom first
        const atoms = instance.getAtoms();
        const atomToRemove = atoms.find(a => a.id === args);
        
        if (atomToRemove) {
          return this.handleRemoveAtomById(args, instance);
        } else {
          // No atom found, try relation
          const relations = instance.getRelations();
          const relationToRemove = relations.find(r => r.name === args);
          
          if (relationToRemove) {
            return this.handleRemoveRelation(args, instance);
          } else {
            // Neither atom nor relation found
            return {
              success: false,
              message: `Atom or relation not found: ${args}`
            };
          }
        }
      }
      
      return {
        success: false,
        message: `Invalid remove syntax: ${args}`
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove'
      };
    }
  }

  private handleRemoveAtomById(id: string, instance: IInputDataInstance): CommandResult {
    const atoms = instance.getAtoms();
    const atomToRemove = atoms.find(a => a.id === id);
    
    if (!atomToRemove) {
      return {
        success: false,
        message: `Atom not found with ID: ${id}`
      };
    }
    
    instance.removeAtom(atomToRemove.id);
    
    return {
      success: true,
      message: `[${atomToRemove.id}] Removed atom: ${atomToRemove.label}:${atomToRemove.type}`,
      action: 'remove'
    };
  }

  private handleRemoveAtomByLabelType(args: string, instance: IInputDataInstance): CommandResult {
    const [label, type] = args.split(':');
    const atoms = instance.getAtoms();
    const atomToRemove = atoms.find(a => a.label === label.trim() && a.type === type.trim());
    
    if (!atomToRemove) {
      return {
        success: false,
        message: `Atom not found: ${args}`
      };
    }
    
    instance.removeAtom(atomToRemove.id);
    
    return {
      success: true,
      message: `[${atomToRemove.id}] Removed atom: ${atomToRemove.label}:${atomToRemove.type}`,
      action: 'remove'
    };
  }

  private handleRemoveRelationTuple(args: string, instance: IInputDataInstance): CommandResult {
    const match = args.match(/^([^.]+)\.([^=]+)=(.+)$/);
    if (!match) {
      return {
        success: false,
        message: `Invalid relation format: ${args}`
      };
    }
    
    const sourceId = match[1].trim();
    const relationName = match[2].trim();
    const targetId = match[3].trim();
    
    const relation = instance.getRelations().find(r => r.name === relationName);
    if (!relation) {
      return {
        success: false,
        message: `Relation '${relationName}' not found`
      };
    }
    
    const tuple = relation.tuples.find(t => 
      t.atoms.length === 2 && 
      t.atoms[0] === sourceId && 
      t.atoms[1] === targetId
    );
    
    if (!tuple) {
      return {
        success: false,
        message: `Tuple not found: ${sourceId}.${relationName}=${targetId}`
      };
    }
    
    instance.removeRelationTuple(relationName, tuple);
    
    return {
      success: true,
      message: `[${sourceId}.${relationName}=${targetId}] Removed tuple: ${relationName}(${sourceId}, ${targetId})`,
      action: 'remove'
    };
  }

  private handleRemoveRelation(relationName: string, instance: IInputDataInstance): CommandResult {
    const relation = instance.getRelations().find(r => r.name === relationName);
    if (!relation) {
      return {
        success: false,
        message: `Relation '${relationName}' not found`
      };
    }
    
    const tupleCount = relation.tuples.length;
    relation.tuples.slice().forEach(tuple => {
      instance.removeRelationTuple(relationName, tuple);
    });
    
    return {
      success: true,
      message: `[${relationName}] Removed relation '${relationName}' (${tupleCount} tuples)`,
      action: 'remove'
    };
  }

  getHelp(): string[] {
    return [
      'Remove Commands (sugar syntax):',
      '  remove ID                           - Remove atom by ID',
      '  remove Label:Type                   - Remove atom by label and type',
      '  remove source.relation=target       - Remove specific relation tuple',
      '  remove relation                     - Remove entire relation',
      '',
      'Examples:',
      '  remove alice                        - Remove atom with ID "alice"',
      '  remove Alice:Person                 - Remove Alice:Person atom',
      '  remove alice.friend=bob             - Remove friend(alice, bob) tuple',
      '  remove friend                       - Remove entire friend relation'
    ];
  }
}

/**
 * Parser for atom commands (sugar syntax only)
 * Supports implicit syntax that gets desugared to internal add operations:
 * - Label:Type
 * - id=Label:Type (explicit ID)
 */
export class AtomCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Exclude remove commands (handled by RemoveCommandParser)
    if (trimmed.startsWith('remove ')) {
      return false;
    }
    
    // Exclude explicit add commands - everything is sugar syntax
    if (trimmed.startsWith('add ')) {
      return false;
    }
    
    // Exclude utility commands
    const utilityCommands = ['help', 'info', 'status', 'list', 'clear', 'reify'];
    if (utilityCommands.includes(trimmed.toLowerCase())) {
      return false;
    }
    
    // Exclude Pyret list commands (they start with [list:)
    if (trimmed.startsWith('[list:')) {
      return false;
    }
    
    // Exclude dot notation relation commands (x.relation=y)
    if (trimmed.includes('.') && trimmed.includes('=')) {
      return false;
    }
    
    // Exclude constructor notation relation commands (name(x,y))
    if (trimmed.includes('(') && trimmed.includes(')')) {
      return false;
    }
    
    // Pattern 1: Label:Type (implicit add - sugar syntax)
    if (/^[^:]+:.+$/.test(trimmed) && !trimmed.includes('->')) {
      return true;
    }
    
    // Pattern 2: id=Label:Type (implicit add - sugar syntax)
    if (/^[^=]+=.+:.+$/.test(trimmed) && !trimmed.includes('->')) {
      return true;
    }
    
    return false;
  }
  
  getPriority(): number {
    return 100; // Standard priority for core commands
  }
  
  getCommandPatterns(): string[] {
    return [
      'Label:Type',
      'id=Label:Type'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // All commands are now implicit "add" - sugar syntax gets desugared to internal add
    return this.handleAdd(trimmed, instance);
  }

  private handleAdd(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: Label:Type or id=Label:Type
      const match = args.match(/^(?:([^=]+)=)?([^:]+):(.+)$/);
      if (!match) {
        return {
          success: false,
          message: 'Invalid syntax. Use: add Label:Type or add id=Label:Type'
        };
      }

      const [, explicitId, label, type] = match;
      const atomLabel = label.trim();
      const atomType = type.trim();

      if (!atomLabel || !atomType) {
        return {
          success: false,
          message: 'Label and type cannot be empty'
        };
      }

      // Generate ID: Use explicit ID if provided, otherwise try to use the label as the ID
      let atomId = explicitId?.trim() || this.generateAtomId(atomLabel, instance);

      const atom: IAtom = {
        id: atomId,
        label: atomLabel,
        type: atomType
      };

      instance.addAtom(atom);
      
      // Show ID on the left for easy referencing
      let message: string;
      if (explicitId?.trim()) {
        // Explicit ID provided: show ID prominently on the left
        message = `[${atomId}] Added atom: ${atomLabel}:${atomType}`;
      } else {
        // Generated ID: show ID prominently on the left
        message = `[${atomId}] Added atom: ${atomLabel}:${atomType}`;
      }
      
      return {
        success: true,
        message,
        action: 'add'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add atom'
      };
    }
  }


  private generateAtomId(candidateId: string, instance: IInputDataInstance): string {
  const existingIds = new Set(instance.getAtoms().map(a => a.id));

  // If the candidate ID doesn't exist, return it as is
  if (!existingIds.has(candidateId)) {
    return candidateId;
  }

  // Append a number to the candidate ID until a unique ID is found
  let counter = 1;
  let uniqueId = `${candidateId}$${counter}`;
  while (existingIds.has(uniqueId)) {
    counter++;
    uniqueId = `${candidateId}$${counter}`;
  }

  return uniqueId;
}

  getHelp(): string[] {
    return [
      'Atom Commands (sugar syntax):',
      '  Label:Type                   - Add atom with generated ID',
      '  id=Label:Type                - Add atom with explicit ID',
      '',
      'Examples:',
      '  Alice:Person                 - Creates [Alice] Alice:Person',
      '  p1=Alice:Person              - Creates [p1] Alice:Person', 
      '',
      'Note: IDs are shown in [brackets] for easy referencing',
      'All syntax is sugar that gets desugared to internal operations'
    ];
  }
}



/**
 * Parser for batch/multiple commands in one line
 * Supports:
 * - Multiple atoms: add Alice:Person, Bob:Person, Charlie:Person
 * - Atoms + relations: add Alice:Person; add Bob:Person; add friends:Alice->Bob
 * - Mixed operations with semicolon separators
 */
export class BatchCommandParser implements ICommandParser {
  private atomParser = new AtomCommandParser();
  private dotRelationParser = new DotNotationRelationParser();

  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Look for comma-separated atoms: add Type1:Label1, Type2:Label2, ...
    if (this.isCommaSeperatedAtoms(trimmed)) {
      return true;
    }
    
    // Look for semicolon-separated commands: add Alice:Person; add Bob:Person; add friends:Alice->Bob
    if (trimmed.includes(';')) {
      const subCommands = trimmed.split(';').map(cmd => cmd.trim()).filter(cmd => cmd);
      // Check if at least one subcommand can be handled by existing parsers
      return subCommands.length >= 2 && 
             subCommands.some(cmd => 
               this.atomParser.canHandle(cmd) || this.dotRelationParser.canHandle(cmd)
             );
    }
    
    return false;
  }
  
  private isCommaSeperatedAtoms(command: string): boolean {
    // No more explicit add commands - disable comma-separated atoms feature
    // to maintain sugar-only syntax
    return false;
  }
  
  getPriority(): number {
    return 115; // Higher than individual parsers to catch batch commands first
  }
  
  getCommandPatterns(): string[] {
    return [
      'Alice:Person; bob=Bob:Person; alice.friend=bob'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    try {
      // Handle semicolon-separated commands (sugar syntax only)
      if (trimmed.includes(';')) {
        return this.handleSemicolonSeperatedCommands(trimmed, instance);
      }
      
      return {
        success: false,
        message: 'Unable to parse batch command'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to execute batch command'
      };
    }
  }



  private handleSemicolonSeperatedCommands(command: string, instance: IInputDataInstance): CommandResult {
    const subCommands = command.split(';').map(cmd => cmd.trim()).filter(cmd => cmd);
    
    const results: string[] = [];
    const errors: string[] = [];
    let successCount = 0;
    let addCount = 0;
    let removeCount = 0;
    
    for (const subCommand of subCommands) {
      try {
        let result: CommandResult | null = null;
        
        // Try atom parser first
        if (this.atomParser.canHandle(subCommand)) {
          result = this.atomParser.execute(subCommand, instance);
        }
        // Then try dot notation relation parser
        else if (this.dotRelationParser.canHandle(subCommand)) {
          result = this.dotRelationParser.execute(subCommand, instance);
        }
        
        if (result) {
          if (result.success) {
            results.push(result.message);
            successCount++;
            if (result.action === 'add') addCount++;
            if (result.action === 'remove') removeCount++;
          } else {
            errors.push(`"${subCommand}": ${result.message}`);
          }
        } else {
          errors.push(`"${subCommand}": No parser can handle this command`);
        }
      } catch (error) {
        errors.push(`"${subCommand}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    const actionSummary = [];
    if (addCount > 0) actionSummary.push(`${addCount} added`);
    if (removeCount > 0) actionSummary.push(`${removeCount} removed`);
    
    if (successCount === subCommands.length) {
      return {
        success: true,
        message: `Batch command completed (${actionSummary.join(', ')}):\n${results.join('\n')}`,
        action: addCount > 0 ? 'add' : (removeCount > 0 ? 'remove' : 'info')
      };
    } else if (successCount > 0) {
      return {
        success: true,
        message: `Batch command partially completed (${successCount}/${subCommands.length} commands):\n\nSuccessful:\n${results.join('\n')}\n\nErrors:\n${errors.join('\n')}`,
        action: addCount > 0 ? 'add' : (removeCount > 0 ? 'remove' : 'info')
      };
    } else {
      return {
        success: false,
        message: `Batch command failed:\n${errors.join('\n')}`
      };
    }
  }

  getHelp(): string[] {
    return [
      'Batch Commands (sugar syntax):',
      '  command1; command2; command3               - Execute multiple sugar commands',
      '',
      'Examples:',
      '  Alice:Person; bob=Bob:Person; alice.friend=bob',
      '  1:Number; 2:Number; 3:Number',
      '',
      'Note: Semicolon-separated commands support any mix of atom/relation sugar syntax'
    ];
  }
}

/**
 * Parser for dot notation relation commands (Pyret style - sugar syntax only)
 * Supports:
 * - source.relation=target (binary relations only)
 */
export class DotNotationRelationParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Exclude remove commands (handled by RemoveCommandParser)
    if (trimmed.startsWith('remove ')) {
      return false;
    }
    
    // Exclude explicit add commands - everything is sugar syntax
    if (trimmed.startsWith('add ')) {
      return false;
    }
    
    // Handle implicit "add" with dot notation - sugar syntax
    if (trimmed.includes('.') && trimmed.includes('=')) {
      return /^[^.]+\.[^=]+=.+$/.test(trimmed);
    }
    
    return false;
  }
  
  getPriority(): number {
    return 115; // Higher priority than standard relation parser due to specific dot notation
  }
  
  getCommandPatterns(): string[] {
    return [
      'source.relation=target'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // All commands are now implicit "add" - sugar syntax gets desugared to internal add
    return this.handleAdd(trimmed, instance);
  }

  private handleAdd(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: source.relation=target
      const match = args.match(/^([^.]+)\.([^=]+)=(.+)$/);
      if (!match) {
        return {
          success: false,
          message: 'Invalid syntax. Use: source.relation=target'
        };
      }

      const sourceId = match[1].trim();
      const relationName = match[2].trim();
      const targetId = match[3].trim();
      
      if (!sourceId || !relationName || !targetId) {
        return {
          success: false,
          message: 'Source, relation, and target cannot be empty'
        };
      }

      // Validate atoms exist
      const existingAtoms = instance.getAtoms();
      const existingAtomIds = new Set(existingAtoms.map(a => a.id));
      
      if (!existingAtomIds.has(sourceId)) {
        return {
          success: false,
          message: `Source atom '${sourceId}' does not exist`
        };
      }
      
      if (!existingAtomIds.has(targetId)) {
        return {
          success: false,
          message: `Target atom '${targetId}' does not exist`
        };
      }

      // Create tuple for binary relation
      const sourceAtom = existingAtoms.find(a => a.id === sourceId)!;
      const targetAtom = existingAtoms.find(a => a.id === targetId)!;
      
      const tuple: ITuple = {
        atoms: [sourceId, targetId],
        types: [sourceAtom.type, targetAtom.type]
      };

      instance.addRelationTuple(relationName, tuple);
      
      return {
        success: true,
        message: `[${sourceId}.${relationName}=${targetId}] Added relation: ${relationName}(${sourceId}, ${targetId})`,
        action: 'add'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add relation'
      };
    }
  }



  getHelp(): string[] {
    return [
      'Dot Notation Relation Commands (sugar syntax):',
      '  source.relation=target              - Add binary relation',
      '',
      'Examples:',
      '  alice.friend=bob                    - Creates friend(alice, bob)',
      '  alice.knows=charlie                 - Creates knows(alice, charlie)',
      '',
      'Note: Atoms must exist before creating relations',
      'All syntax is sugar that gets desugared to internal operations'
    ];
  }
}