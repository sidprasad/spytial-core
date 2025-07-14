import { ICommandParser, CommandResult } from './CoreParsers';
import { IInputDataInstance } from '../../../data-instance/interfaces';
import { PyretDataInstance, isPyretDataInstance } from '../../../data-instance/pyret/pyret-data-instance';
import { createReificationHelper, ReificationOptions } from '../../../data-instance/pyret/reification-helper';

/**
 * Parser for Pyret reification commands
 * Supports:
 * - reify                           - Reify the entire instance
 * - reify atom_id                  - Reify a specific atom
 * - reify --format                 - Reify with formatted output
 * - reify --debug                  - Reify with debug comments
 * - show-structure                 - Show the data structure overview
 * - show-schemas                   - Show available type schemas
 */
export class ReificationCommandParser implements ICommandParser {
  canHandle(command: string): boolean {
    const trimmed = command.trim().toLowerCase();
    return trimmed.startsWith('reify') || 
           trimmed.startsWith('show-structure') ||
           trimmed.startsWith('show-schemas');
  }
  
  getPriority(): number {
    return 110; // Higher priority for specific commands
  }
  
  getCommandPatterns(): string[] {
    return [
      'reify',
      'reify atom_id', 
      'reify --format',
      'reify --debug',
      'show-structure',
      'show-schemas'
    ];
  }

  execute(command: string, instance: IInputDataInstance): CommandResult {
    const trimmed = command.trim();
    
    // Only work with PyretDataInstance
    if (!isPyretDataInstance(instance)) {
      return {
        success: false,
        message: 'Reification commands only work with Pyret data instances'
      };
    }

    try {
      if (trimmed.toLowerCase().startsWith('show-structure')) {
        return this.handleShowStructure(instance);
      } else if (trimmed.toLowerCase().startsWith('show-schemas')) {
        return this.handleShowSchemas(instance);
      } else if (trimmed.toLowerCase().startsWith('reify')) {
        return this.handleReify(trimmed, instance);
      }

      return {
        success: false,
        message: 'Unknown reification command'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to execute reification command'
      };
    }
  }

  private handleReify(command: string, instance: PyretDataInstance): CommandResult {
    const args = command.substring(5).trim(); // Remove 'reify'
    
    // Parse options and atom ID
    const options: ReificationOptions = {};
    let atomId: string | undefined;
    
    const parts = args.split(/\s+/).filter(part => part.length > 0);
    
    for (const part of parts) {
      if (part === '--format') {
        options.formatOutput = true;
      } else if (part === '--debug') {
        options.includeDebugComments = true;
      } else if (!part.startsWith('--')) {
        // Assume this is an atom ID
        atomId = part;
      }
    }

    let result: string;
    
    if (atomId) {
      // Reify specific atom
      const atom = instance.getAtoms().find(a => a.id === atomId);
      if (!atom) {
        return {
          success: false,
          message: `Atom '${atomId}' not found`
        };
      }
      
      // For now, use the basic reification method
      try {
        result = instance.reifyAtomById(atomId);
      } catch (error) {
        return {
          success: false,
          message: `Failed to reify atom '${atomId}': ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      
      return {
        success: true,
        action: 'info',
        message: `Reified atom '${atomId}':\n${result}`
      };
    } else {
      // Reify entire instance
      try {
        if (Object.keys(options).length > 0) {
          // Use enhanced reification when ready
          result = instance.reify(); // For now, use basic method
        } else {
          result = instance.reify();
        }
      } catch (error) {
        return {
          success: false,
          message: `Failed to reify instance: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
      
      return {
        success: true,
        action: 'info',
        message: `Reified instance:\n${result}`
      };
    }
  }

  private handleShowStructure(instance: PyretDataInstance): CommandResult {
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();
    const types = instance.getTypes();
    
    // Group atoms by type
    const atomsByType = new Map<string, typeof atoms>();
    atoms.forEach(atom => {
      if (!atomsByType.has(atom.type)) {
        atomsByType.set(atom.type, []);
      }
      atomsByType.get(atom.type)!.push(atom);
    });

    // Build structure overview
    const lines: string[] = [];
    lines.push('Data Structure Overview:');
    lines.push(`  Atoms: ${atoms.length}`);
    lines.push(`  Relations: ${relations.length}`);
    lines.push(`  Types: ${types.length}`);
    lines.push('');

    // Show types and their atoms
    lines.push('Types:');
    for (const [typeName, typeAtoms] of atomsByType.entries()) {
      lines.push(`  ${typeName}: ${typeAtoms.length} atoms`);
      if (typeAtoms.length <= 5) {
        typeAtoms.forEach(atom => {
          lines.push(`    - ${atom.id} (${atom.label})`);
        });
      } else {
        typeAtoms.slice(0, 3).forEach(atom => {
          lines.push(`    - ${atom.id} (${atom.label})`);
        });
        lines.push(`    ... and ${typeAtoms.length - 3} more`);
      }
    }

    lines.push('');
    lines.push('Relations:');
    relations.forEach(relation => {
      lines.push(`  ${relation.name}: ${relation.tuples.length} tuples`);
    });

    return {
      success: true,
      action: 'info',
      message: lines.join('\n')
    };
  }

  private handleShowSchemas(instance: PyretDataInstance): CommandResult {
    // For now, show basic schema information without requiring the helper
    const lines: string[] = [];
    lines.push('Available Type Schemas:');
    lines.push('');

    // Default schemas that would be available
    const defaultSchemas = [
      { typeName: 'Black', argumentFields: ['value', 'left', 'right'], examples: ['Black(5, Leaf(0), Leaf(0))'] },
      { typeName: 'Red', argumentFields: ['value', 'left', 'right'], examples: ['Red(3, Leaf(1), Leaf(2))'] },
      { typeName: 'Leaf', argumentFields: ['value'], examples: ['Leaf(0)'] },
      { typeName: 'Node', argumentFields: ['value', 'left', 'right'], examples: ['Node(10, Leaf(5), Leaf(15))'] },
      { typeName: 'Link', argumentFields: ['first', 'rest'], examples: ['Link(1, empty)'] }
    ];

    defaultSchemas.forEach(schema => {
      lines.push(`${schema.typeName}:`);
      lines.push(`  Arguments: ${schema.argumentFields.join(', ')}`);
      if (schema.examples && schema.examples.length > 0) {
        lines.push(`  Examples:`);
        schema.examples.forEach(example => {
          lines.push(`    ${example}`);
        });
      }
      lines.push('');
    });

    lines.push('Use these schemas to ensure correct constructor argument order during reification.');

    return {
      success: true,
      action: 'info',
      message: lines.join('\n')
    };
  }

  getHelp(): string[] {
    return [
      'Reification Commands:',
      '  reify                    - Convert data back to Pyret constructor notation',
      '  reify atom_id           - Reify a specific atom by its ID',
      '  reify --format          - Reify with formatted output (multi-line)',
      '  reify --debug           - Reify with debug comments for troubleshooting',
      '  show-structure          - Display overview of data structure',
      '  show-schemas            - Show available constructor schemas',
      '',
      'Examples:',
      '  reify                   - Black(5, Red(3, Leaf(1), Leaf(2)), Leaf(7))',
      '  reify --format          - Multi-line formatted output',
      '  reify bla_1            - Reify only the atom with ID "bla_1"',
      '  show-structure         - Show atoms, relations, and types summary'
    ];
  }
}