import { ICommandParser, CommandResult } from './CoreParsers';
import { IAtom, ITuple, IInputDataInstance } from '../../../data-instance/interfaces';
import { PyretDataInstance } from '../../../data-instance/pyret/pyret-data-instance';

/**
 * Parser for Pyret-style list commands (sugar syntax)
 * Supports:
 * - [list: 1,2,3,4]:list_of_numbers
 * - [list: atom1,atom2,atom3]:atom_list
 */
export class PyretListParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim();
    
    // No more explicit add/remove - everything is sugar syntax
    if (trimmed.startsWith('add ') || trimmed.startsWith('remove ')) {
      return false;
    }
    
    // Pattern: [list: ...]:type (sugar syntax)
    if (trimmed.startsWith('[list:') && trimmed.includes(']:')) {
      return true;
    }
    
    return false;
  }
  
  getPriority(): number {
    return 120; // Higher priority due to very specific [list: pattern
  }
  
  getCommandPatterns(): string[] {
    return [
      '[list: item1,item2,item3]:type',
      '[list: 1,2,3,4]:numbers'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // All commands are now implicit "add" - sugar syntax gets desugared to internal operations
    return this.handleAdd(trimmed, instance);
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

    // Create the linked list structure
    let currentRest = 'empty'; // Start with the Pyret `empty` as the end of the list

    for (let i = items.length - 1; i >= 0; i--) {
      const currentItem = items[i];

      // Create a `link` atom for the current item
      const linkId = `${listId}-link-${i + 1}`;
      const linkAtom: IAtom = {
        id: linkId,
        label: `link(${currentItem}, ${currentRest})`,
        type: 'link'
      };

      instance.addAtom(linkAtom);

      // Add the `link` relation: link(first, rest)
      const linkTuple: ITuple = {
        atoms: [currentItem, currentRest],
        types: ['Item', 'link']
      };

      try {
        instance.addRelationTuple('link', linkTuple);
      } catch (error) {
        // Relation might already exist
      }

      // Update the currentRest to point to the current link
      currentRest = linkId;
    }

    // Add the top-level list atom pointing to the first link
    const topLevelTuple: ITuple = {
      atoms: [listId, currentRest],
      types: ['List', 'link']
    };

    try {
      instance.addRelationTuple('link', topLevelTuple);
    } catch (error) {
      // Relation might already exist
    }
  }

  getHelp(): string[] {
    return [
      'Pyret List Commands (sugar syntax):',
      '  [list: item1,item2,item3]:list_type    - Add list with items',
      '  [list: 1,2,3,4]:numbers               - Add number list',
      '',
      'This automatically creates:',
      '  - Individual atoms for each item (if they don\'t exist)',
      '  - A list atom containing all items',
      '  - first/rest relations for list structure',
      '',
      'Examples:',
      '  [list: 1,2,3,4]:numberList           - Creates numberList-1 as list ID',
      '  [list: alice,bob,charlie]:personList - Creates personList-1 as list ID',
      '  [list: red,green,blue]:colors        - Creates colors-1 as list ID',
      '',
      'Note: All syntax is sugar that gets desugared to internal operations.',
      'The list type name is used as-is to generate unique list IDs (type-1, type-2, etc.)'
    ];
  }
}

/**
 * Info and help parser for utility commands
 */
export class InfoCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim().toLowerCase();
    const utilityCommands = ['help', 'info', 'status', 'list', 'clear', 'reify', 'list-ids', 'list-edges'];
    return utilityCommands.includes(trimmed);
  }
  
  getPriority(): number {
    return 50; // Lower priority - utility commands should be fallback
  }
  
  getCommandPatterns(): string[] {
    return [
      'help',
      'info', 
      'status',
      'list',
      'list-ids',
      'list-edges',
      'clear',
      'reify'
    ];
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
        
      case 'list-ids':
        return this.listAtomIds(instance);
        
      case 'list-edges':
        return this.listEdgeIds(instance);
        
      case 'clear':
        return this.clearInstance(instance);
        
      case 'reify':
        return this.reifyInstance(instance);
        
      default:
        return {
          success: false,
          message: 'Unknown info command'
        };
    }
  }

  private listAtomIds(instance: IInputDataInstance): CommandResult {
    const atoms = instance.getAtoms();
    
    if (atoms.length === 0) {
      return {
        success: true,
        message: 'No atoms found in instance.',
        action: 'info'
      };
    }
    
    let message = 'Internal Atom IDs:\n\n';
    
    // Group atoms by type for better organization
    const atomsByType = atoms.reduce((acc, atom) => {
      if (!acc[atom.type]) {
        acc[atom.type] = [];
      }
      acc[atom.type].push(atom);
      return acc;
    }, {} as Record<string, typeof atoms>);
    
    Object.entries(atomsByType).forEach(([type, typeAtoms]) => {
      message += `${type}:\n`;
      typeAtoms.forEach(atom => {
        message += `  ID: ${atom.id}  Label: ${atom.label}\n`;
      });
      message += '\n';
    });
    
    message += `Total: ${atoms.length} atoms`;
    
    return {
      success: true,
      message,
      action: 'info'
    };
  }

  private listEdgeIds(instance: IInputDataInstance): CommandResult {
    const relations = instance.getRelations();
    
    if (relations.length === 0) {
      return {
        success: true,
        message: 'No relations/edges found in instance.',
        action: 'info'
      };
    }
    
    let message = 'Internal Edge IDs:\n\n';
    let totalEdges = 0;
    
    relations.forEach(relation => {
      if (relation.tuples.length > 0) {
        message += `Relation: ${relation.name}\n`;
        relation.tuples.forEach((tuple, index) => {
          // Generate edge ID using the same format as PyretDataInstance
          const edgeId = `${relation.name}:${tuple.atoms.join('->')}`;
          message += `  Edge ID: ${edgeId}\n`;
          message += `  Tuple: (${tuple.atoms.join(', ')})\n`;
          totalEdges++;
        });
        message += '\n';
      }
    });
    
    message += `Total: ${totalEdges} edges across ${relations.length} relations`;
    
    return {
      success: true,
      message,
      action: 'info'
    };
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
        // Always show ID prominently on the left for easy referencing
        message += `  [${atom.id}] ${atom.label}:${atom.type}\n`;
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

  private reifyInstance(instance: IInputDataInstance): CommandResult {
    try {
      // Check if this is a PyretDataInstance with reify capability
      if (instance instanceof PyretDataInstance) {
        const reifiedCode = instance.reify();
        return {
          success: true,
          message: `Pyret Constructor Notation:\n\n${reifiedCode}`,
          action: 'info'
        };
      } else {
        // For other data instances, provide a generic representation
        const atoms = instance.getAtoms();
        const relations = instance.getRelations();
        
        let result = 'Data Instance Structure:\n\n';
        
        if (atoms.length > 0) {
          result += 'Atoms:\n';
          atoms.forEach(atom => {
            result += `  [${atom.id}] ${atom.label}:${atom.type}\n`;
          });
          result += '\n';
        }
        
        if (relations.length > 0) {
          result += 'Relations:\n';
          relations.forEach(rel => {
            result += `  ${rel.name}:\n`;
            rel.tuples.forEach(tuple => {
              result += `    (${tuple.atoms.join(', ')})\n`;
            });
          });
        }
        
        return {
          success: true,
          message: result,
          action: 'info'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to reify instance'
      };
    }
  }

  private getGeneralHelp(): string {
    return `REPL Interface Help:

Available commands across all terminals:
  help       - Show this help
  info       - Show instance status  
  status     - Same as info
  list       - List all atoms and relations
  list-ids   - List internal atom IDs grouped by type
  list-edges - List internal edge IDs for all relations
  clear      - Clear entire instance
  reify      - Generate Pyret constructor notation (or generic representation)

Terminal-specific commands vary by terminal type.
Click the "?" button in each terminal header for specific help.`;
  }

  getHelp(): string[] {
    return [
      'Utility Commands:',
      '  help       - Show general help',
      '  info       - Show instance status',
      '  status     - Same as info',
      '  list       - List all contents',
      '  list-ids   - List internal atom IDs',
      '  list-edges - List internal edge IDs', 
      '  clear      - Clear entire instance',
      '  reify      - Generate Pyret constructor notation'
    ];
  }
}