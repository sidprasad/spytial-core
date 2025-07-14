import { IAtom, IRelation, IInputDataInstance } from '../interfaces';
import { PyretDataInstance, PyretObject } from './pyret-data-instance';

/**
 * Schema for defining constructor argument order for Pyret types
 */
export interface PyretTypeSchema {
  /** Type name (constructor name) */
  typeName: string;
  /** Ordered list of field names that should appear as constructor arguments */
  argumentFields: string[];
  /** Optional examples of valid constructor calls for this type */
  examples?: string[];
}

/**
 * Options for reification process
 */
export interface ReificationOptions {
  /** Type schemas to help determine argument order */
  schemas?: PyretTypeSchema[];
  /** Whether to use heuristics for argument ordering when schema is missing */
  useHeuristics?: boolean;
  /** Whether to include debug comments in output */
  includeDebugComments?: boolean;
  /** Whether to format output with proper indentation */
  formatOutput?: boolean;
}

/**
 * Helper class for enhanced Pyret reification with fallback mechanisms
 * 
 * This class provides advanced reification capabilities that work even when
 * the original Pyret object structure is not preserved (e.g., when data is
 * constructed through REPL commands).
 */
export class ReificationHelper {
  private instance: PyretDataInstance;
  private options: ReificationOptions;
  private schemaMap: Map<string, PyretTypeSchema>;

  constructor(instance: PyretDataInstance, options: ReificationOptions = {}) {
    this.instance = instance;
    this.options = {
      useHeuristics: true,
      includeDebugComments: false,
      formatOutput: false,
      ...options
    };
    
    // Build schema map for quick lookup
    this.schemaMap = new Map();
    if (options.schemas) {
      options.schemas.forEach(schema => {
        this.schemaMap.set(schema.typeName, schema);
      });
    }
  }

  /**
   * Enhanced reification that works with missing original structure
   */
  reify(): string {
    const rootAtoms = this.findRootAtoms();
    
    if (rootAtoms.length === 0) {
      return this.options.includeDebugComments 
        ? "/* No root atoms found */" 
        : "";
    }

    // If multiple roots, wrap in a list or return multiple expressions
    if (rootAtoms.length > 1) {
      const rootExpressions = rootAtoms.map(atom => this.reifyAtom(atom.id, new Set()));
      if (this.options.formatOutput) {
        return `[list:\n  ${rootExpressions.join(',\n  ')}\n]`;
      }
      return `[list: ${rootExpressions.join(', ')}]`;
    }

    return this.reifyAtom(rootAtoms[0].id, new Set());
  }

  /**
   * Reify a specific atom by ID, useful for partial reification
   */
  reifyAtom(atomId: string, visited: Set<string> = new Set()): string {
    if (visited.has(atomId)) {
      return this.options.includeDebugComments 
        ? `/* cycle: ${atomId} */` 
        : atomId;
    }

    const atom = this.instance.getAtoms().find(a => a.id === atomId);
    if (!atom) {
      return this.options.includeDebugComments 
        ? `/* missing atom: ${atomId} */` 
        : atomId;
    }

    visited.add(atomId);

    // Handle primitive types
    if (this.isBuiltinType(atom.type)) {
      const result = this.reifyPrimitive(atom);
      visited.delete(atomId);
      return result;
    }

    // Try to get argument order from multiple sources
    const argumentOrder = this.determineArgumentOrder(atom);
    const args = this.buildConstructorArguments(atom, argumentOrder, visited);

    visited.delete(atomId);

    if (args.length === 0) {
      return atom.type;
    }

    if (this.options.formatOutput && args.length > 2) {
      const indentedArgs = args.map(arg => `  ${arg}`).join(',\n');
      return `${atom.type}(\n${indentedArgs}\n)`;
    }

    return `${atom.type}(${args.join(', ')})`;
  }

  /**
   * Get available type schemas
   */
  getSchemas(): PyretTypeSchema[] {
    return Array.from(this.schemaMap.values());
  }

  /**
   * Add a new type schema
   */
  addSchema(schema: PyretTypeSchema): void {
    this.schemaMap.set(schema.typeName, schema);
  }

  /**
   * Determine argument order for a constructor using multiple strategies
   */
  private determineArgumentOrder(atom: IAtom): string[] {
    // Strategy 1: Use explicit schema if available
    const schema = this.schemaMap.get(atom.type);
    if (schema) {
      return schema.argumentFields;
    }

    // Strategy 2: Use original object key order if preserved
    const originalObject = (this.instance as any).originalObjects?.get(atom.id);
    if (originalObject?.dict) {
      return Object.keys(originalObject.dict);
    }

    // Strategy 3: Use heuristics based on relation patterns
    if (this.options.useHeuristics) {
      return this.inferArgumentOrderFromRelations(atom);
    }

    // Strategy 4: Fallback to alphabetical order
    return this.getAtomRelationNames(atom).sort();
  }

  /**
   * Infer argument order using heuristics
   */
  private inferArgumentOrderFromRelations(atom: IAtom): string[] {
    const relationNames = this.getAtomRelationNames(atom);
    
    // Common Pyret patterns
    const commonOrderings = [
      ['value', 'left', 'right'], // Binary tree pattern
      ['first', 'rest'], // List pattern
      ['data', 'next'], // Linked list pattern
      ['value', 'children'], // General tree pattern
      ['x', 'y'], // Coordinate pattern
      ['name', 'value'], // Named value pattern
    ];

    // Try to match known patterns
    for (const pattern of commonOrderings) {
      const matchedFields = pattern.filter(field => relationNames.includes(field));
      if (matchedFields.length === relationNames.length && matchedFields.length > 1) {
        return pattern.filter(field => relationNames.includes(field));
      }
    }

    // If no pattern matches, use a sensible heuristic ordering
    const priorityOrder = ['value', 'data', 'first', 'second', 'third', 'left', 'right', 'rest', 'next'];
    const ordered = [];
    const remaining = [...relationNames];

    // Add fields in priority order
    for (const priority of priorityOrder) {
      const index = remaining.indexOf(priority);
      if (index !== -1) {
        ordered.push(priority);
        remaining.splice(index, 1);
      }
    }

    // Add remaining fields alphabetically
    ordered.push(...remaining.sort());
    
    return ordered;
  }

  /**
   * Build constructor arguments in the specified order
   */
  private buildConstructorArguments(atom: IAtom, argumentOrder: string[], visited: Set<string>): string[] {
    const args: string[] = [];
    
    for (const relationName of argumentOrder) {
      const targetAtomIds = this.getRelationTargets(atom.id, relationName);
      for (const targetId of targetAtomIds) {
        args.push(this.reifyAtom(targetId, visited));
      }
    }

    return args;
  }

  /**
   * Find root atoms (atoms not referenced by other atoms)
   */
  private findRootAtoms(): IAtom[] {
    const referencedAtoms = new Set<string>();
    
    this.instance.getRelations().forEach(relation => {
      relation.tuples.forEach(tuple => {
        // Skip the first atom (source), mark others as referenced
        for (let i = 1; i < tuple.atoms.length; i++) {
          referencedAtoms.add(tuple.atoms[i]);
        }
      });
    });

    return this.instance.getAtoms()
      .filter(atom => !referencedAtoms.has(atom.id) && !this.isBuiltinType(atom.type));
  }

  /**
   * Get relation names that start from a specific atom
   */
  private getAtomRelationNames(atom: IAtom): string[] {
    const relationNames = new Set<string>();
    
    this.instance.getRelations().forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms[0] === atom.id) {
          relationNames.add(relation.name);
        }
      });
    });
    
    return Array.from(relationNames);
  }

  /**
   * Get target atom IDs for a specific relation from a source atom
   */
  private getRelationTargets(sourceAtomId: string, relationName: string): string[] {
    const targets: string[] = [];
    
    this.instance.getRelations().forEach(relation => {
      if (relation.name === relationName) {
        relation.tuples.forEach(tuple => {
          if (tuple.atoms[0] === sourceAtomId && tuple.atoms.length >= 2) {
            targets.push(tuple.atoms[1]);
          }
        });
      }
    });
    
    return targets;
  }

  /**
   * Reify primitive values with appropriate Pyret syntax
   */
  private reifyPrimitive(atom: IAtom): string {
    switch (atom.type) {
      case 'String':
        return `"${atom.label.replace(/"/g, '\\"')}"`;
      case 'Number':
        return atom.label;
      case 'Boolean':
        return atom.label;
      default:
        return atom.label;
    }
  }

  /**
   * Check if a type is a builtin type
   */
  private isBuiltinType(typeName: string): boolean {
    return ['Number', 'String', 'Boolean', 'PyretObject'].includes(typeName);
  }
}

/**
 * Factory function to create a ReificationHelper with common Pyret schemas
 */
export function createReificationHelper(
  instance: PyretDataInstance, 
  options: ReificationOptions = {}
): ReificationHelper {
  const defaultSchemas: PyretTypeSchema[] = [
    {
      typeName: 'Black',
      argumentFields: ['value', 'left', 'right'],
      examples: ['Black(5, Leaf(0), Leaf(0))']
    },
    {
      typeName: 'Red',
      argumentFields: ['value', 'left', 'right'],
      examples: ['Red(3, Leaf(1), Leaf(2))']
    },
    {
      typeName: 'Leaf',
      argumentFields: ['value'],
      examples: ['Leaf(0)']
    },
    {
      typeName: 'Node',
      argumentFields: ['value', 'left', 'right'],
      examples: ['Node(10, Leaf(5), Leaf(15))']
    },
    {
      typeName: 'Link',
      argumentFields: ['first', 'rest'],
      examples: ['Link(1, empty)']
    }
  ];

  const mergedOptions = {
    ...options,
    schemas: [...(options.schemas || []), ...defaultSchemas]
  };

  return new ReificationHelper(instance, mergedOptions);
}