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
    return trimmed.startsWith('add ') || trimmed.startsWith('remove ');
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
      message: 'Unknown atom command'
    };
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
      
      return {
        success: true,
        message: `Added atom: ${atomId} (${atomLabel}:${atomType})`,
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
      
      return {
        success: true,
        message: `Removed atom: ${atomToRemove.id} (${atomToRemove.label}:${atomToRemove.type})`,
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
      'Atom Commands:',
      '  add Label:Type           - Add atom with generated ID',
      '  add id=Label:Type        - Add atom with explicit ID',
      '  remove ID                - Remove atom by ID',
      '  remove Label:Type        - Remove atom by label and type',
      '',
      'Examples:',
      '  add Alice:Person',
      '  add p1=Alice:Person',
      '  remove p1',
      '  remove Alice:Person'
    ];
  }
}

/**
 * Parser for relation commands
 * Supports:
 * - add name:atom->atom (binary)
 * - add name:atom->atom->atom (ternary, etc.)
 * - remove name:atom->atom...
 */
export class RelationCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    return (trimmed.startsWith('add ') || trimmed.startsWith('remove ')) && 
           trimmed.includes('->');
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
      // Parse: name:atom->atom->...
      const colonIndex = args.indexOf(':');
      if (colonIndex === -1) {
        return {
          success: false,
          message: 'Invalid syntax. Use: add name:atom1->atom2->...'
        };
      }

      const relationName = args.substring(0, colonIndex).trim();
      const atomChain = args.substring(colonIndex + 1).trim();
      
      if (!relationName) {
        return {
          success: false,
          message: 'Relation name cannot be empty'
        };
      }

      // Split by ->
      const atomIds = atomChain.split('->').map(id => id.trim()).filter(id => id);
      
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
      // Parse: name:atom->atom->... or just name (removes all tuples)
      const colonIndex = args.indexOf(':');
      
      if (colonIndex === -1) {
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

      const relationName = args.substring(0, colonIndex).trim();
      const atomChain = args.substring(colonIndex + 1).trim();
      
      // Split by ->
      const atomIds = atomChain.split('->').map(id => id.trim()).filter(id => id);
      
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
      '  add name:atom1->atom2              - Add binary relation',
      '  add name:atom1->atom2->atom3       - Add ternary relation',
      '  remove name:atom1->atom2           - Remove specific tuple',
      '  remove name                        - Remove entire relation',
      '',
      'Examples:',
      '  add friends:alice->bob',
      '  add knows:alice->bob->charlie',
      '  remove friends:alice->bob',
      '  remove friends'
    ];
  }
}