import { ICommandParser, CommandResult } from './CoreParsers';
import { IAtom, ITuple, IInputDataInstance } from '../../../data-instance/interfaces';

/**
 * Parser for Pyret-style list commands
 * Supports:
 * - add [list: 1,2,3,4]:list_of_numbers
 * - add [list: atom1,atom2,atom3]:atom_list
 */
export class PyretListParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    return trimmed.startsWith('add [list:') || 
           (trimmed.startsWith('remove ') && !trimmed.includes('->') && !trimmed.includes(':'));
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
      message: 'Unknown Pyret list command'
    };
  }

  private handleAdd(args: string, instance: IInputDataInstance): CommandResult {
    try {
      // Parse: [list: item1,item2,item3]:type
      // Expected format: add [list: 1,2,3,4]:numbers
      // Creates individual atoms for each item + a list atom + list relations
      const match = args.match(/^\[list:\s*([^\]]+)\]:(.+)$/);
      if (!match) {
        return {
          success: false,
          message: 'Invalid syntax. Use: add [list: item1,item2,item3]:type'
        };
      }

      const [, itemsStr, listTypeName] = match;
      const items = itemsStr.split(',').map(item => item.trim()).filter(item => item);
      const listType = listTypeName.trim();
      
      if (items.length === 0) {
        return {
          success: false,
          message: 'List cannot be empty'
        };
      }

      // Determine item type based on the list contents:
      // Case 1: All numeric items (e.g., "1,2,3,4") -> Number type
      // Case 2: All existing atom IDs (e.g., "alice,bob") -> Use existing atom type  
      // Case 3: All quoted items (e.g., "red","green","blue") -> String type
      // Case 4: Mixed or new items -> Default to String type
      let itemType = 'String'; // default fallback
      const existingAtoms = instance.getAtoms();
      const existingAtomIds = new Set(existingAtoms.map(a => a.id));
      
      // Check if all items are numbers
      if (items.every(item => /^\d+$/.test(item))) {
        itemType = 'Number';
      } 
      // Check if all items are quoted strings
      else if (items.every(item => /^".*"$/.test(item))) {
        itemType = 'String';
        // Remove quotes from items for processing
        for (let i = 0; i < items.length; i++) {
          items[i] = items[i].slice(1, -1); // Remove first and last character (quotes)
        }
      }
      // Check if all items are existing atoms
      else if (items.every(item => existingAtomIds.has(item))) {
        // Use the type of the first atom as the item type
        const firstAtom = existingAtoms.find(a => a.id === items[0]);
        itemType = firstAtom?.type || 'Entity';
      }

      const results: string[] = [];
      const atomsAdded: string[] = [];

      // Step 1: Create individual atoms for each list item
      // - If item already exists as an atom, skip creation
      // - If item is new, create an atom with the determined itemType
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (!existingAtomIds.has(item)) {
          const atom: IAtom = {
            id: item,
            label: item,
            type: itemType
          };
          
          try {
            instance.addAtom(atom);
            atomsAdded.push(item);
            existingAtomIds.add(item);
          } catch (error) {
            // Item might already exist, that's ok - continue processing
          }
        }
      }

      // Step 2: Create the list atom that contains all items
      // The list ID is generated to be unique (e.g., "numbers-1", "people-1")
      const listId = this.generateListId(instance, listType);
      const listAtom: IAtom = {
        id: listId,
        label: `[${items.join(', ')}]`,
        type: listType
      };
      
      instance.addAtom(listAtom);
      atomsAdded.push(listId);

      // Step 3: Create Pyret-style list relations (first, rest, etc.)
      // This establishes the structural relationships for list traversal
      this.addListRelations(instance, listId, items);

      const addedCount = atomsAdded.length;
      const relationCount = items.length > 0 ? items.length : 0; // first + rest relations
      
      return {
        success: true,
        message: `Added Pyret list: ${listId} with ${items.length} items (${addedCount} atoms, ${relationCount} relations)`,
        action: 'add'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add Pyret list'
      };
    }
  }

  private handleRemove(args: string, instance: IInputDataInstance): CommandResult {
    // For now, just support removing by list ID
    const listId = args.trim();
    
    try {
      // Find the list atom
      const listAtom = instance.getAtoms().find(a => a.id === listId);
      if (!listAtom) {
        return {
          success: false,
          message: `List '${listId}' not found`
        };
      }

      // Remove list-related relations first
      const relations = instance.getRelations();
      let removedRelations = 0;
      
      for (const relation of relations) {
        if (relation.name === 'first' || relation.name === 'rest') {
          const tuplesToRemove = relation.tuples.filter(t => t.atoms.includes(listId));
          for (const tuple of tuplesToRemove) {
            instance.removeRelationTuple(relation.name, tuple);
            removedRelations++;
          }
        }
      }

      // Remove the list atom
      instance.removeAtom(listId);
      
      return {
        success: true,
        message: `Removed Pyret list: ${listId} (1 atom, ${removedRelations} relations)`,
        action: 'remove'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to remove Pyret list'
      };
    }
  }

  private generateListId(instance: IInputDataInstance, typeName: string): string {
    const existingIds = new Set(instance.getAtoms().map(a => a.id));
    let counter = 1;
    let candidateId = `${typeName}-${counter}`;
    
    while (existingIds.has(candidateId)) {
      counter++;
      candidateId = `${typeName}-${counter}`;
    }
    
    return candidateId;
  }

  private addListRelations(instance: IInputDataInstance, listId: string, items: string[]): void {
    if (items.length === 0) return;

    // Add first relation: list -> first_item
    const firstTuple: ITuple = {
      atoms: [listId, items[0]],
      types: ['List', 'Item'] // Generic types
    };
    
    try {
      instance.addRelationTuple('first', firstTuple);
    } catch (error) {
      // Relation might already exist
    }

    // Add rest relations for nested structure
    if (items.length > 1) {
      // For simplicity, create a chain of rest relations
      for (let i = 0; i < items.length - 1; i++) {
        const restTuple: ITuple = {
          atoms: [items[i], items[i + 1]],
          types: ['Item', 'Item']
        };
        
        try {
          instance.addRelationTuple('rest', restTuple);
        } catch (error) {
          // Relation might already exist
        }
      }
    }
  }

  getHelp(): string[] {
    return [
      'Pyret List Commands:',
      '  add [list: item1,item2,item3]:list_type    - Add list with items',
      '  add [list: 1,2,3,4]:numbers               - Add number list',
      '  remove list_id                            - Remove list by ID',
      '',
      'This automatically creates:',
      '  - Individual atoms for each item (if they don\'t exist)',
      '  - A list atom containing all items',
      '  - first/rest relations for list structure',
      '',
      'Examples:',
      '  add [list: 1,2,3,4]:numberList           - Creates numberList-1 as list ID',
      '  add [list: alice,bob,charlie]:personList - Creates personList-1 as list ID',
      '  add [list: red,green,blue]:colors        - Creates colors-1 as list ID',
      '  remove numberList-1                      - Remove specific list instance',
      '',
      'Note: The list type name is used as-is to generate unique list IDs (type-1, type-2, etc.)',
      'You control the naming - use singular, plural, or any descriptive name you prefer.'
    ];
  }
}

/**
 * Info and help parser for utility commands
 */
export class InfoCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim().toLowerCase();
    return trimmed === 'help' || trimmed === 'info' || trimmed === 'status' || 
           trimmed === 'list' || trimmed === 'clear';
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim().toLowerCase();
    
    switch (trimmed) {
      case 'help':
        return {
          success: true,
          message: this.getGeneralHelp(),
          action: 'help'
        };
        
      case 'info':
      case 'status':
        return this.getStatus(instance);
        
      case 'list':
        return this.listContents(instance);
        
      case 'clear':
        return this.clearInstance(instance);
        
      default:
        return {
          success: false,
          message: 'Unknown info command'
        };
    }
  }

  private getStatus(instance: IInputDataInstance): CommandResult {
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();
    const tupleCount = relations.reduce((sum, r) => sum + r.tuples.length, 0);
    
    const typeStats = atoms.reduce((acc, atom) => {
      acc[atom.type] = (acc[atom.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const relationStats = relations.reduce((acc, rel) => {
      acc[rel.name] = rel.tuples.length;
      return acc;
    }, {} as Record<string, number>);
    
    let message = `Instance Status:\n`;
    message += `  Atoms: ${atoms.length}\n`;
    message += `  Relations: ${relations.length}\n`;
    message += `  Tuples: ${tupleCount}\n\n`;
    
    if (Object.keys(typeStats).length > 0) {
      message += `Types:\n`;
      Object.entries(typeStats).forEach(([type, count]) => {
        message += `  ${type}: ${count}\n`;
      });
      message += '\n';
    }
    
    if (Object.keys(relationStats).length > 0) {
      message += `Relations:\n`;
      Object.entries(relationStats).forEach(([name, count]) => {
        message += `  ${name}: ${count} tuples\n`;
      });
    }
    
    return {
      success: true,
      message,
      action: 'info'
    };
  }

  private listContents(instance: IInputDataInstance): CommandResult {
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();
    
    let message = 'Instance Contents:\n\n';
    
    if (atoms.length > 0) {
      message += 'Atoms:\n';
      atoms.forEach(atom => {
        message += `  ${atom.id} (${atom.label}:${atom.type})\n`;
      });
      message += '\n';
    }
    
    if (relations.length > 0) {
      message += 'Relations:\n';
      relations.forEach(rel => {
        message += `  ${rel.name}:\n`;
        rel.tuples.forEach(tuple => {
          message += `    (${tuple.atoms.join(', ')})\n`;
        });
      });
    }
    
    if (atoms.length === 0 && relations.length === 0) {
      message += 'Empty instance - no atoms or relations defined.';
    }
    
    return {
      success: true,
      message,
      action: 'info'
    };
  }

  private clearInstance(instance: IInputDataInstance): CommandResult {
    try {
      // Remove all atoms (this should cascade to remove relations)
      const atomIds = instance.getAtoms().map(a => a.id);
      atomIds.forEach(id => instance.removeAtom(id));
      
      return {
        success: true,
        message: `Cleared instance (removed ${atomIds.length} atoms)`,
        action: 'remove'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to clear instance'
      };
    }
  }

  private getGeneralHelp(): string {
    return `REPL Interface Help:

Available commands across all terminals:
  help     - Show this help
  info     - Show instance status  
  status   - Same as info
  list     - List all atoms and relations
  clear    - Clear entire instance

Terminal-specific commands vary by terminal type.
Click the "?" button in each terminal header for specific help.`;
  }

  getHelp(): string[] {
    return [
      'Utility Commands:',
      '  help     - Show general help',
      '  info     - Show instance status',
      '  status   - Same as info',
      '  list     - List all contents',
      '  clear    - Clear entire instance'
    ];
  }
}