import { IAtom, ITuple, IInputDataInstance } from '../../../data-instance/interfaces';

/**
 * Result of executing a command
 */
export interface CommandResult {
  success: boolean;
  message: string;
  action?: 'add' | 'remove' | 'info' | 'help';
}

/**
 * Base interface for command parsers
 */
export interface ICommandParser {
  /**
   * Parse and execute a command
   */
  execute(command: string, instance: IInputDataInstance): CommandResult;
  
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
 * Parser for atom commands
 * Supports:
 * - add Label:Type
 * - remove Label:Type
 * - add id=Label:Type (explicit ID)
 */
export class AtomCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Handle explicit add/remove commands
    if (trimmed.startsWith('add ') || trimmed.startsWith('remove ')) {
      const args = trimmed.substring(trimmed.indexOf(' ') + 1);
      
      // Exclude Pyret list commands (they start with [list:)
      if (args.startsWith('[list:')) {
        return false;
      }
      
      // Exclude relation commands (they have parentheses or dot notation)
      if (args.includes('(') && args.includes(')')) {
        return false;
      }
      
      if (args.includes('.') && args.includes('=')) {
        return false;
      }
      
      // Pattern 1: add/remove Label:Type
      if (/^[^:]+:.+$/.test(args) && !args.includes('->')) {
        return true;
      }
      
      // Pattern 2: add/remove id=Label:Type 
      if (/^[^=]+=.+:.+$/.test(args) && !args.includes('->')) {
        return true;
      }
      
      // Pattern 3: remove by ID only (single word, no : or -> or () or .)
      if (trimmed.startsWith('remove ') && /^[^\s:->().]+$/.test(args)) {
        return true;
      }
      
      return false;
    }
    
    // Handle implicit "add" - commands without add/remove prefix
    // These should be atom commands by default unless they look like other command types
    
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
    
    // Pattern 1: Label:Type (implicit add)
    if (/^[^:]+:.+$/.test(trimmed) && !trimmed.includes('->')) {
      return true;
    }
    
    // Pattern 2: id=Label:Type (implicit add)
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
      'id=Label:Type', 
      'add Label:Type',
      'add id=Label:Type', 
      'remove Label:Type',
      'remove id'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // Handle explicit add/remove commands
    if (trimmed.startsWith('add ')) {
      return this.handleAdd(trimmed.substring(4), instance);
    } else if (trimmed.startsWith('remove ')) {
      return this.handleRemove(trimmed.substring(7), instance);
    }
    
    // Handle implicit "add" commands
    else {
      return this.handleAdd(trimmed, instance);
    }
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

  private handleRemove(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: Label:Type or just ID
      const atoms = instance.getAtoms();
      
      // Try to find by ID first
      let atomToRemove = atoms.find(a => a.id === args.trim());
      
      // If not found by ID, try Label:Type format
      if (!atomToRemove) {
        const match = args.match(/^([^:]+):(.+)$/);
        if (match) {
          const [, label, type] = match;
          atomToRemove = atoms.find(a => 
            a.label.trim() === label.trim() && a.type.trim() === type.trim()
          );
        }
      }

      if (!atomToRemove) {
        return {
          success: false,
          message: `Atom not found: ${args}`
        };
      }

      instance.removeAtom(atomToRemove.id);
      
      // Show ID prominently on the left for easy referencing
      const message = `[${atomToRemove.id}] Removed atom: ${atomToRemove.label}:${atomToRemove.type}`;
      
      return {
        success: true,
        message,
        action: 'remove'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove atom'
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
      'Atom Commands (implicit "add"):',
      '  Label:Type                   - Add atom with generated ID',
      '  id=Label:Type                - Add atom with explicit ID',
      '  add Label:Type               - Explicit add atom with generated ID',
      '  add id=Label:Type            - Explicit add atom with explicit ID',
      '  remove ID                    - Remove atom by ID',
      '  remove Label:Type            - Remove atom by label and type',
      '',
      'Examples:',
      '  Alice:Person                 - Creates [Alice] Alice:Person',
      '  p1=Alice:Person              - Creates [p1] Alice:Person', 
      '  remove p1                    - Remove by ID',
      '  remove Alice:Person          - Remove by label and type',
      '',
      'Note: IDs are shown in [brackets] for easy referencing'
    ];
  }
}

/**
 * Parser for relation commands
 * Supports:
 * - add name(atom1, atom2) (binary)
 * - add name(atom1, atom2, atom3) (ternary, etc.)
 * - remove name(atom1, atom2...)
 */
export class RelationCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    if (!trimmed.startsWith('add ') && !trimmed.startsWith('remove ')) {
      return false;
    }
    
    const args = trimmed.substring(trimmed.indexOf(' ') + 1);
    
    // Pattern: name(atom1, atom2, ...) or just name (for remove all)
    if (args.includes('(') && args.includes(')')) {
      // Validate format: name(atom1, atom2, ...)
      return /^[^(]+\([^)]+\)$/.test(args);
    }
    
    // For remove, also allow just relation name (removes entire relation)
    if (trimmed.startsWith('remove ') && /^[^\s()]+$/.test(args)) {
      // Check if it's a known relation name by pattern (could be improved with context)
      return true; // Allow single words for remove - will be validated during execution
    }
    
    return false;
  }
  
  getPriority(): number {
    return 110; // Higher priority than atoms due to more specific () pattern
  }
  
  getCommandPatterns(): string[] {
    return [
      'add name(atom1, atom2)',
      'add name(atom1, atom2, atom3)',
      'remove name(atom1, atom2)',
      'remove name'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    if (trimmed.startsWith('add ')) {
      return this.handleAdd(trimmed.substring(4), instance);
    } else if (trimmed.startsWith('remove ')) {
      return this.handleRemove(trimmed.substring(7), instance);
    }
    
    return {
      success: false,
      message: 'Unknown relation command'
    };
  }

  private handleAdd(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: name(atom1, atom2, ...)
      const match = args.match(/^([^(]+)\(([^)]+)\)$/);
      if (!match) {
        return {
          success: false,
          message: 'Invalid syntax. Use: add name(atom1, atom2, ...)'
        };
      }

      const relationName = match[1].trim();
      const atomsString = match[2].trim();
      
      if (!relationName) {
        return {
          success: false,
          message: 'Relation name cannot be empty'
        };
      }

      // Split by commas
      const atomIds = atomsString.split(',').map(id => id.trim()).filter(id => id);
      
      if (atomIds.length < 2) {
        return {
          success: false,
          message: 'At least 2 atoms required for a relation'
        };
      }

      // Validate all atoms exist
      const existingAtoms = instance.getAtoms();
      const existingAtomIds = new Set(existingAtoms.map(a => a.id));
      
      for (const atomId of atomIds) {
        if (!existingAtomIds.has(atomId)) {
          return {
            success: false,
            message: `Atom '${atomId}' does not exist`
          };
        }
      }

      // Create tuple
      const tuple: ITuple = {
        atoms: atomIds,
        types: atomIds.map(id => {
          const atom = existingAtoms.find(a => a.id === id);
          return atom?.type || 'unknown';
        })
      };

      instance.addRelationTuple(relationName, tuple);
      
      return {
        success: true,
        message: `Added relation: ${relationName}(${atomIds.join(', ')})`,
        action: 'add'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add relation'
      };
    }
  }

  private handleRemove(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: name(atom1, atom2, ...) or just name (removes all tuples)
      const match = args.match(/^([^(]+)\(([^)]+)\)$/);
      
      if (!match) {
        // Remove entire relation
        const relationName = args.trim();
        const relation = instance.getRelations().find(r => r.name === relationName);
        
        if (!relation) {
          return {
            success: false,
            message: `Relation '${relationName}' not found`
          };
        }

        // Remove all tuples
        const tupleCount = relation.tuples.length;
        relation.tuples.slice().forEach(tuple => {
          instance.removeRelationTuple(relationName, tuple);
        });
        
        return {
          success: true,
          message: `Removed relation '${relationName}' (${tupleCount} tuples)`,
          action: 'remove'
        };
      }

      const relationName = match[1].trim();
      const atomsString = match[2].trim();
      
      // Split by commas
      const atomIds = atomsString.split(',').map(id => id.trim()).filter(id => id);
      
      // Find matching tuple
      const relation = instance.getRelations().find(r => r.name === relationName);
      if (!relation) {
        return {
          success: false,
          message: `Relation '${relationName}' not found`
        };
      }

      const tuple = relation.tuples.find(t => 
        t.atoms.length === atomIds.length &&
        t.atoms.every((atomId, index) => atomId === atomIds[index])
      );

      if (!tuple) {
        return {
          success: false,
          message: `Tuple not found in relation '${relationName}'`
        };
      }

      instance.removeRelationTuple(relationName, tuple);
      
      return {
        success: true,
        message: `Removed tuple: ${relationName}(${atomIds.join(', ')})`,
        action: 'remove'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove relation'
      };
    }
  }

  getHelp(): string[] {
    return [
      'Relation Commands:',
      '  add name(atom1, atom2)              - Add binary relation',
      '  add name(atom1, atom2, atom3)       - Add ternary relation',
      '  remove name(atom1, atom2)           - Remove specific tuple',
      '  remove name                         - Remove entire relation',
      '',
      'Examples:',
      '  add friends(alice, bob)',
      '  add knows(alice, bob, charlie)',
      '  remove friends(alice, bob)',
      '  remove friends'
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
  private relationParser = new RelationCommandParser();

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
               this.atomParser.canHandle(cmd) || this.relationParser.canHandle(cmd)
             );
    }
    
    return false;
  }
  
  private isCommaSeperatedAtoms(command: string): boolean {
    // Pattern: add Label1:Type1, Label2:Type2, Label3:Type3
    if (!command.startsWith('add ')) return false;
    
    const args = command.substring(4).trim();
    
    // Must contain commas
    if (!args.includes(',')) return false;
    
    // Split by commas and check if each part looks like Label:Type
    const parts = args.split(',').map(part => part.trim());
    if (parts.length < 2) return false;
    
    // At least some parts should match the atom pattern for this to be considered a batch atom command
    // This allows for some invalid parts that will be handled during execution
    const validParts = parts.filter(part => {
      return /^([^=]+=)?[^:]+:.+$/.test(part) && !part.includes('->') && !part.includes('(') && !part.includes(')');
    });
    
    // At least half of the parts should be valid atom patterns
    return validParts.length >= Math.ceil(parts.length / 2);
  }
  
  getPriority(): number {
    return 115; // Higher than individual parsers to catch batch commands first
  }
  
  getCommandPatterns(): string[] {
    return [
      'add Label1:Type1, Label2:Type2, Label3:Type3',
      'add id1=Label1:Type1, id2=Label2:Type2',
      'add Alice:Person; add Bob:Person; add friends(Alice, Bob)',
      'add Alice:Person; remove Bob:Person'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    try {
      // Handle comma-separated atoms
      if (this.isCommaSeperatedAtoms(trimmed)) {
        return this.handleCommaSeperatedAtoms(trimmed, instance);
      }
      
      // Handle semicolon-separated commands
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

  private handleCommaSeperatedAtoms(command: string, instance: IInputDataInstance): CommandResult {
    const args = command.substring(4).trim(); // Remove 'add '
    const atomSpecs = args.split(',').map(spec => spec.trim());
    
    const results: string[] = [];
    const errors: string[] = [];
    let successCount = 0;
    
    for (const atomSpec of atomSpecs) {
      const atomCommand = `add ${atomSpec}`;
      try {
        const result = this.atomParser.execute(atomCommand, instance);
        if (result.success) {
          results.push(result.message);
          successCount++;
        } else {
          errors.push(`${atomSpec}: ${result.message}`);
        }
      } catch (error) {
        errors.push(`${atomSpec}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    if (successCount === atomSpecs.length) {
      return {
        success: true,
        message: `Added ${successCount} atoms:\n${results.join('\n')}`,
        action: 'add'
      };
    } else if (successCount > 0) {
      return {
        success: true,
        message: `Added ${successCount}/${atomSpecs.length} atoms:\n${results.join('\n')}\n\nErrors:\n${errors.join('\n')}`,
        action: 'add'
      };
    } else {
      return {
        success: false,
        message: `Failed to add atoms:\n${errors.join('\n')}`
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
        // Then try relation parser
        else if (this.relationParser.canHandle(subCommand)) {
          result = this.relationParser.execute(subCommand, instance);
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
      'Batch Commands:',
      '  add Label1:Type1, Label2:Type2, ...        - Add multiple atoms',
      '  add id1=Label1:Type1, id2=Label2:Type2     - Add multiple atoms with IDs',
      '  command1; command2; command3               - Execute multiple commands',
      '',
      'Examples:',
      '  add Alice:Person, Bob:Person, Charlie:Person',
      '  add p1=Alice:Person, p2=Bob:Person',
      '  add Alice:Person; add Bob:Person; add friends(Alice, Bob)',
      '  add Alice:Person; remove Bob:Person',
      '',
      'Note: Semicolon-separated commands support any mix of atom/relation commands'
    ];
  }
}

/**
 * Parser for dot notation relation commands (Pyret style)
 * Supports:
 * - source.relation=target (binary relations only)
 * - remove source.relation=target
 * - remove relation (removes entire relation)
 */
export class DotNotationRelationParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // Handle explicit add/remove commands with dot notation
    if (trimmed.startsWith('add ') || trimmed.startsWith('remove ')) {
      const args = trimmed.substring(trimmed.indexOf(' ') + 1);
      
      // Pattern: source.relation=target
      if (args.includes('.') && args.includes('=')) {
        return /^[^.]+\.[^=]+=.+$/.test(args);
      }
      
      // For remove, also allow just relation name
      if (trimmed.startsWith('remove ') && /^[^\s().]+$/.test(args) && !args.includes(':')) {
        return true;
      }
      
      return false;
    }
    
    // Handle implicit "add" with dot notation
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
      'source.relation=target',
      'add source.relation=target',
      'remove source.relation=target',
      'remove relation'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // Handle explicit add/remove commands
    if (trimmed.startsWith('add ')) {
      return this.handleAdd(trimmed.substring(4), instance);
    } else if (trimmed.startsWith('remove ')) {
      return this.handleRemove(trimmed.substring(7), instance);
    }
    
    // Handle implicit "add" commands
    else {
      return this.handleAdd(trimmed, instance);
    }
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

  private handleRemove(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: source.relation=target or just relation name
      const match = args.match(/^([^.]+)\.([^=]+)=(.+)$/);
      
      if (!match) {
        // Remove entire relation
        const relationName = args.trim();
        const relation = instance.getRelations().find(r => r.name === relationName);
        
        if (!relation) {
          return {
            success: false,
            message: `Relation '${relationName}' not found`
          };
        }

        // Remove all tuples
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

      const sourceId = match[1].trim();
      const relationName = match[2].trim();
      const targetId = match[3].trim();
      
      // Find matching tuple
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
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove relation'
      };
    }
  }

  getHelp(): string[] {
    return [
      'Dot Notation Relation Commands (implicit "add"):',
      '  source.relation=target              - Add binary relation',
      '  add source.relation=target          - Explicit add binary relation',
      '  remove source.relation=target       - Remove specific tuple',
      '  remove relation                     - Remove entire relation',
      '',
      'Examples:',
      '  alice.friend=bob                    - Creates friend(alice, bob)',
      '  alice.knows=charlie                 - Creates knows(alice, charlie)',
      '  remove alice.friend=bob             - Remove specific tuple',
      '  remove friend                       - Remove entire friend relation',
      '',
      'Note: Atoms must exist before creating relations'
    ];
  }
}