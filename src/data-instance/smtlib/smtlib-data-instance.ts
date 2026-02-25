/**
 * @fileoverview
 * Full-featured SMT-LIB data instance implementation for CND-Core.
 * Implements IDataInstance interface to provide layout processing capabilities
 * for SMT-LIB models. Designed for client-side use, fully typed, and tree-shakable.
 */

import type { IDataInstance, IAtom, IType, IRelation, ITuple } from '../interfaces';
import { Graph } from 'graphlib';

/**
 * SMT-LIB model representation parsed from model text
 * Contains all information needed for layout processing
 */
export interface SmtLibModel {
  /** Unique model identifier */
  readonly id: string;
  
  /** Function and constant definitions */
  readonly definitions: readonly SmtLibDefinition[];
  
  /** Sort (type) declarations */
  readonly sorts: readonly SmtLibSort[];
  
  /** Additional model metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * SMT-LIB function or constant definition
 * Represents define-fun statements in the model
 */
export interface SmtLibDefinition {
  /** Function/constant name */
  readonly name: string;
  
  /** Function parameters (empty for constants) */
  readonly parameters: readonly SmtLibParameter[];
  
  /** Return sort/type */
  readonly sort: string;
  
  /** Function body expression */
  readonly body: string;
  
  /** Whether this is a constant (no parameters) */
  readonly isConstant: boolean;
  
  /** Variable dependencies found in the body */
  readonly dependencies: readonly string[];
}

/**
 * SMT-LIB function parameter
 * Represents typed parameters in function definitions
 */
export interface SmtLibParameter {
  /** Parameter name */
  readonly name: string;
  
  /** Parameter sort/type */
  readonly sort: string;
}

/**
 * SMT-LIB sort (type) declaration
 * Represents both built-in and user-defined sorts
 */
export interface SmtLibSort {
  /** Sort name */
  readonly name: string;
  
  /** Sort arity (number of type parameters) */
  readonly arity: number;
  
  /** Whether this is a built-in SMT-LIB sort */
  readonly isBuiltin: boolean;
  
  /** Parent sort if this extends another sort */
  readonly parentSort?: string;
}

/**
 * Configuration for SMT-LIB model parsing and processing
 * Controls how SMT-LIB concepts map to layout concepts
 */
export interface SmtLibConfig {
  /** Whether to include built-in sorts as types */
  readonly includeBuiltinSorts: boolean;
  
  /** Whether to create dependency relations between definitions */
  readonly createDependencyRelations: boolean;
  
  /** Whether to treat function applications as atoms */
  readonly treatApplicationsAsAtoms: boolean;
  
  /** Prefix for generated relation names */
  readonly relationPrefix: string;
}

/**
 * Default configuration for SMT-LIB processing
 */
export const DEFAULT_SMTLIB_CONFIG: SmtLibConfig = {
  includeBuiltinSorts: true,
  createDependencyRelations: true,
  treatApplicationsAsAtoms: false,
  relationPrefix: 'smtlib_'
} as const;

/**
 * SMT-LIB data instance implementation
 * Provides IDataInstance interface for SMT-LIB models to enable
 * layout processing and graph generation
 */
export class SmtLibDataInstance implements IDataInstance {
  private readonly model: SmtLibModel;
  private readonly config: SmtLibConfig;
  
  // Caches for performance optimization
  private readonly typeCache = new Map<string, IType>();
  private readonly atomCache = new Map<string, IAtom>();
  private readonly relationCache = new Map<string, IRelation>();
  private readonly tupleCache: ITuple[] = [];
  
  /**
   * Create SMT-LIB data instance from parsed model
   * 
   * @param model - Parsed SMT-LIB model structure
   * @param config - Optional configuration for processing
   */
  constructor(model: SmtLibModel, config: Partial<SmtLibConfig> = {}) {
    this.model = model;
    this.config = { ...DEFAULT_SMTLIB_CONFIG, ...config };
    this.initializeCaches();
  }

  /**
   * Get type information for a specific atom
   * 
   * @param atomId - Atom identifier
   * @returns Type information or undefined if atom not found
   */
  public getAtomType(atomId: string): IType  {
    const atom = this.atomCache.get(atomId);
    
    if (!atom) {
      throw new Error(`Atom with ID '${atomId}' not found in SMT-LIB model.`);
    }

    const type = this.typeCache.get(atom.type);
    if (!type) {
      throw new Error(`Type '${atom.type}' not found for atom '${atomId}'.`);
    }
    return type;
  }

  /**
   * Get all types defined in this instance
   * Includes both SMT-LIB sorts and inferred types
   * 
   * @returns Array of all types
   */
  public getTypes(): readonly IType[] {
    return Array.from(this.typeCache.values());
  }

  /**
   * Get all atoms in this instance
   * Includes constants, variables, and function applications
   * 
   * @returns Array of all atoms
   */
  public getAtoms(): readonly IAtom[] {
    return Array.from(this.atomCache.values());
  }

  /**
   * Get all relations in this instance
   * Includes functions and dependency relations
   * 
   * @returns Array of all relations
   */
  public getRelations(): readonly IRelation[] {
    return Array.from(this.relationCache.values());
  }

  /**
   * Get all tuples in this instance
   * Represents function applications and dependencies
   * 
   * @returns Array of all tuples
   */
  public getTuples(): readonly ITuple[] {
    return [...this.tupleCache];
  }

  /**
   * Apply projections to filter the instance
   * Creates a new instance with only the specified atoms
   * 
   * @param atomIds - Array of atom IDs to include
   * @returns New filtered SMT-LIB data instance
   */
  public applyProjections(atomIds: string[]): IDataInstance {
    const atomIdSet = new Set(atomIds);
    
    // Filter definitions to only include those in the projection
    const filteredDefinitions = this.model.definitions.filter(def => 
      atomIdSet.has(def.name) || 
      def.dependencies.some(dep => atomIdSet.has(dep))
    );
    
    // Create filtered model
    const filteredModel: SmtLibModel = {
      ...this.model,
      id: `${this.model.id}_projected`,
      definitions: filteredDefinitions
    };
    
    return new SmtLibDataInstance(filteredModel, this.config);
  }

  /**
   * Generate graph representation for layout and visualization
   * Compatible with GraphLib and layout systems
   * 
   * @param hideDisconnected - Whether to hide disconnected nodes
   * @param hideDisconnectedBuiltIns - Whether to hide disconnected built-ins
   * @returns Graph representation suitable for layout processing
   */
  public  generateGraph(
    hideDisconnected: boolean = false,
    hideDisconnectedBuiltIns: boolean = false
  ): Graph {
    const graph = new Graph({ directed: true });
    
    // Add nodes for all atoms
    for (const atom of this.getAtoms()) {
      const nodeData = {
        id: atom.id,
        type: atom.type,
        name: atom.id,
        isBuiltin: this.isBuiltinAtom(atom)
      };
      
      graph.setNode(atom.id, nodeData);
    }
    
    // Add edges for all tuples
    for (const tuple of this.getTuples()) {
      if (tuple.atoms.length >= 2) {
        const [source, target] = tuple.atoms;
        
        const edgeData = {
          type: 'dependency'
        };
        
        graph.setEdge(source, target, edgeData);
      }
    }
    
    // Filter disconnected nodes if requested
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      this.filterDisconnectedNodes(graph, hideDisconnected, hideDisconnectedBuiltIns);
    }
    
    return graph;
  }

  /**
   * Initialize all internal caches from the model
   * Processes definitions to create types, atoms, relations, and tuples
   */
  private initializeCaches(): void {
    // Add built-in types first
    this.addBuiltinTypes();
    
    // Add custom sorts as types
    for (const sort of this.model.sorts) {
      if (!this.typeCache.has(sort.name)) {
        this.typeCache.set(sort.name, {
          id: sort.name,
          types: sort.parentSort ? [sort.parentSort, sort.name] : [sort.name],
          atoms: [], // Will be populated later
          isBuiltin: sort.isBuiltin
        });
      }
    }
    
    // Process all definitions
    for (const definition of this.model.definitions) {
      this.processDefinition(definition);
    }
    
    // Create dependency tuples if configured
    if (this.config.createDependencyRelations) {
      this.createDependencyTuples();
    }
  }

  /**
   * Add built-in SMT-LIB types to the type cache
   */
  private addBuiltinTypes(): void {
    if (!this.config.includeBuiltinSorts) return;
    
    const builtinTypes: SmtLibSort[] = [
      { name: 'Int', arity: 0, isBuiltin: true },
      { name: 'Bool', arity: 0, isBuiltin: true },
      { name: 'Real', arity: 0, isBuiltin: true },
      { name: 'String', arity: 0, isBuiltin: true },
      { name: 'Array', arity: 2, isBuiltin: true }
    ];
    
    for (const type of builtinTypes) {
      this.typeCache.set(type.name, {
        id: type.name,
        types: [type.name],
        atoms: [], // Will be populated later
        isBuiltin: type.isBuiltin
      });
    }
  }

  /**
   * Process a single definition to create atoms and relations
   * 
   * @param definition - SMT-LIB definition to process
   */
  private processDefinition(definition: SmtLibDefinition): void {
    if (definition.isConstant) {
      // Constants become atoms
      this.atomCache.set(definition.name, {
        id: definition.name,
        type: definition.sort
      });
    } else {
      // Functions become relations
      const parameterTypes = definition.parameters.map(param => param.sort);
      const relationName = this.config.relationPrefix + definition.name;
      
      this.relationCache.set(relationName, {
        id: relationName,
        name: relationName,
        types: [...parameterTypes, definition.sort],
        tuples: [] // Will be populated later if needed
      });
      
      // Function name also becomes an atom if configured
      if (this.config.treatApplicationsAsAtoms) {
        this.atomCache.set(definition.name, {
          id: definition.name,
          type: 'Function'
        });
      }
    }
  }

  /**
   * Create dependency tuples between definitions
   * Maps variable dependencies to relation tuples
   */
  private createDependencyTuples(): void {
    const dependencyRelationName = this.config.relationPrefix + 'depends';
    
    // Create dependency relation if it doesn't exist
    if (!this.relationCache.has(dependencyRelationName)) {
      this.relationCache.set(dependencyRelationName, {
        id: dependencyRelationName,
        name: dependencyRelationName,
        types: ['String', 'String'], // source and target names
        tuples: [] // Will be populated below
      });
    }
    
    // Create tuples for each dependency
    for (const definition of this.model.definitions) {
      for (const dependency of definition.dependencies) {
        this.tupleCache.push({
          atoms: [dependency, definition.name],
          types: ['String', 'String']
        });
      }
    }
  }

  /**
   * Check if an atom represents a built-in entity
   * 
   * @param atom - Atom to check
   * @returns True if atom is built-in
   */
  private isBuiltinAtom(atom: IAtom): boolean {
    const type = this.typeCache.get(atom.type);
    return type?.isBuiltin ?? false;
  }

  /**
   * Filter disconnected nodes from the graph
   * 
   * @param graph - Graph to filter
   * @param hideDisconnected - Whether to hide all disconnected nodes
   * @param hideDisconnectedBuiltIns - Whether to hide disconnected built-ins
   */
  private filterDisconnectedNodes(
    graph: Graph, 
    hideDisconnected: boolean, 
    hideDisconnectedBuiltIns: boolean
  ): void {
    const nodesToRemove: string[] = [];
    
    for (const nodeId of graph.nodes()) {
      const nodeData = graph.node(nodeId);
      const isDisconnected = graph.inEdges(nodeId)?.length === 0 && 
                            graph.outEdges(nodeId)?.length === 0;
      
      if (isDisconnected) {
        if (hideDisconnected || (hideDisconnectedBuiltIns && nodeData.isBuiltin)) {
          nodesToRemove.push(nodeId);
        }
      }
    }
    
    for (const nodeId of nodesToRemove) {
      graph.removeNode(nodeId);
    }
  }
}

/**
 * Parse SMT-LIB model text into structured representation
 * Extracts definitions, sorts, and dependencies
 * 
 * @param modelText - SMT-LIB model as string
 * @param modelId - Optional model identifier
 * @returns Parsed SMT-LIB model structure
 * @throws {Error} When model text is invalid or malformed
 * 
 * @example
 * ```typescript
 * const modelText = `
 * (model
 *   (define-fun x () Int 5)
 *   (define-fun y () Int (+ x 10))
 * )`;
 * const model = parseSmtLibModel(modelText);
 * ```
 */
export function parseSmtLibModel(modelText: string, modelId?: string): SmtLibModel {
  const definitions: SmtLibDefinition[] = [];
  const sorts: SmtLibSort[] = [];
  
  try {
    // Extract define-fun statements with enhanced regex
    const defineFunRegex = /\(define-fun\s+((?:\|[^|]+\||[^\s()]+))\s*\(([^)]*)\)\s*([^\s()]+)\s+([^)]+(?:\([^)]*\))*[^)]*)\)/gs;
    let match: RegExpExecArray | null;
    
    while ((match = defineFunRegex.exec(modelText)) !== null) {
      const [, rawName, paramsStr, sort, body] = match;
      
      // Clean up name (remove pipe quotes if present)
      const name = rawName.replace(/^\||\|$/g, '');
      
      // Parse parameters
      const parameters = parseParameters(paramsStr);
      
      // Extract dependencies from body
      const dependencies = extractDependencies(body, name);
      
      definitions.push({
        name,
        parameters,
        sort,
        body: body.trim(),
        isConstant: parameters.length === 0,
        dependencies: Array.from(dependencies)
      });
    }
    
    // Extract sort declarations if present
    const sortRegex = /\(declare-sort\s+(\w+)\s+(\d+)\)/g;
    let sortMatch: RegExpExecArray | null;
    
    while ((sortMatch = sortRegex.exec(modelText)) !== null) {
      const [, name, arityStr] = sortMatch;
      sorts.push({
        name,
        arity: parseInt(arityStr, 10),
        isBuiltin: false
      });
    }
    
    return {
      id: modelId ?? 'smtlib-model',
      definitions,
      sorts
    };
    
  } catch (error) {
    throw new Error(`Failed to parse SMT-LIB model: ${(error as Error).message}`);
  }
}

/**
 * Parse parameter string into structured parameters
 * Handles both simple and pipe-quoted parameter names
 * 
 * @param paramsStr - Parameter string from define-fun
 * @returns Array of structured parameters
 */
function parseParameters(paramsStr: string): SmtLibParameter[] {
  if (!paramsStr.trim()) {
    return [];
  }
  
  const parameters: SmtLibParameter[] = [];
  
  // Enhanced parameter parsing to handle pipe-quoted names
  const paramRegex = /\(?\s*((?:\|[^|]+\||[^\s()]+))\s+([^\s()]+)\s*\)?/g;
  let paramMatch: RegExpExecArray | null;
  
  while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
    const rawName = paramMatch[1];
    const sort = paramMatch[2];
    
    // Clean up parameter name
    const name = rawName.replace(/^\||\|$/g, '');
    
    parameters.push({ name, sort });
  }
  
  return parameters;
}

/**
 * Extract variable dependencies from an expression
 * Finds all non-builtin identifiers that this expression depends on
 * 
 * @param expression - SMT-LIB expression to analyze
 * @param currentName - Name of current definition (to avoid self-reference)
 * @returns Set of dependency names
 */
function extractDependencies(expression: string, currentName: string): Set<string> {
  const dependencies = new Set<string>();
  
  // Enhanced regex to handle both regular and pipe-quoted identifiers
  const identifierRegex = /(?:\|([^|]+)\||([a-zA-Z_][a-zA-Z0-9_]*))/g;
  let match: RegExpExecArray | null;
  
  while ((match = identifierRegex.exec(expression)) !== null) {
    const identifier = match[1] || match[2]; // Pipe-quoted or regular
    
    // Skip built-ins, self-references, and invalid identifiers
    if (identifier && 
        identifier !== currentName && 
        !isBuiltinIdentifier(identifier) &&
        !isNumericLiteral(identifier)) {
      dependencies.add(identifier);
    }
  }
  
  return dependencies;
}

/**
 * Check if identifier is a built-in SMT-LIB function or constant
 * 
 * @param identifier - Identifier to check
 * @returns True if identifier is built-in
 */
function isBuiltinIdentifier(identifier: string): boolean {
  const builtins = new Set([
    // Core types
    'Int', 'Bool', 'Real', 'String', 'Array',
    // Boolean constants
    'true', 'false',
    // Arithmetic operators
    '+', '-', '*', '/', 'div', 'mod', 'abs', 'rem',
    // Comparison operators
    '=', '<', '>', '<=', '>=', 'distinct',
    // Boolean logic
    'and', 'or', 'not', 'xor', '=>', 'ite',
    // Array operations
    'select', 'store',
    // String operations
    'str.len', 'str.++', 'str.substr', 'str.contains', 'str.indexof',
    // Quantifiers
    'forall', 'exists',
    // Control structures
    'let', 'assert', 'check-sat', 'get-model'
  ]);
  
  return builtins.has(identifier);
}

/**
 * Check if string represents a numeric literal
 * 
 * @param str - String to check
 * @returns True if string is numeric
 */
function isNumericLiteral(str: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(str);
}

/**
 * Create SMT-LIB data instance from model text
 * Convenience function for parsing and creating instance in one step
 * 
 * @param modelText - SMT-LIB model as string
 * @param config - Optional configuration for processing
 * @param modelId - Optional model identifier
 * @returns SMT-LIB data instance implementing IDataInstance
 * 
 * @example
 * ```typescript
 * const modelText = createExampleSmtLibModel();
 * const dataInstance = createSmtLibDataInstance(modelText);
 * 
 * // Use with layout system
 * const layout = layoutInstance.generateLayout(dataInstance);
 * ```
 */
export function createSmtLibDataInstance(
  modelText: string, 
  config?: Partial<SmtLibConfig>,
  modelId?: string
): IDataInstance {
  const model = parseSmtLibModel(modelText, modelId);
  return new SmtLibDataInstance(model, config);
}


/**
 * Type guard to check if a data instance is an SMT-LIB instance
 * 
 * @param instance - Data instance to check
 * @returns True if instance is SmtLibDataInstance
 */
export function isSmtLibDataInstance(instance: IDataInstance): instance is SmtLibDataInstance {
  return instance instanceof SmtLibDataInstance;
}