import { IAtom, IRelation, IType, IInputDataInstance, ITuple, DataInstanceEventType, DataInstanceEventListener, DataInstanceEvent, IDataInstance } from './interfaces';
import { Graph } from 'graphlib';
/**
 * JSON representation of a data instance for easy serialization/deserialization.
 * This is the format expected from VS Code extensions, web APIs, and other external tools.
 *
 * Shape:
 * - atoms: Array of { id, type, label, labels? }
 * - relations: Array of { id, name, types, tuples: [{ atoms, types }] }
 * - types (optional): Array of { id, types, atoms, isBuiltin } where `types` is the
 *   type hierarchy from most-specific to most-general (self first).
 *
 * @example Minimal instance
 * ```typescript
 * const jsonData: IJsonDataInstance = {
 *   atoms: [
 *     { id: "person1", type: "Person", label: "Alice" },
 *     { id: "person2", type: "Person", label: "Bob" }
 *   ],
 *   relations: [
 *     {
 *       id: "friendship",
 *       name: "friends",
 *       types: ["Person", "Person"],
 *       tuples: [{ atoms: ["person1", "person2"], types: ["Person", "Person"] }]
 *     }
 *   ]
 * };
 * ```
 *
 * For a full, real-world example with explicit type hierarchy, see docs/JSON_DATA_INSTANCE.md.
 */
export interface IJsonDataInstance {
  /** Array of atoms/nodes in the graph */
  atoms: IAtom[];
  /** Array of relations/edges in the graph */
  relations: IRelation[];
  /** Optional type definitions - will be inferred from atoms if not provided */
  types?: IType[];
}

/**
 * Configuration options for normalizing and importing JSON data instances.
 * These options help handle common data quality issues when importing from external sources.
 */
export interface IJsonImportOptions {
  /** 
   * Whether to merge relations with the same name by combining their tuples.
   * Useful when data comes from multiple sources that define the same relation.
   * @default true 
   */
  mergeRelations?: boolean;
  
  /** 
   * Whether to auto-generate missing type definitions from atom types.
   * If false, you must provide explicit type definitions.
   * @default true 
   */
  inferTypes?: boolean;
  
  /** 
   * Whether to validate that all atom references in relation tuples exist.
   * Catches broken references but may fail on incomplete data.
   * @default true 
   */
  validateReferences?: boolean;
  
  /** 
   * Whether to remove duplicate atoms with the same ID, keeping the first occurrence.
   * Helps with data deduplication from multiple sources.
   * @default true 
   */
  deduplicateAtoms?: boolean;
}

/**
 * A data instance implementation that can be created directly from JSON data.
 * 
 * This class provides a convenient way for external tools (VS Code extensions, web APIs, etc.)
 * to create data instances without needing to understand the internal data model specifics.
 * It automatically handles common data quality issues through normalization and validation.
 * 
 * @example Basic usage from JSON string:
 * ```typescript
 * const instance = new JSONDataInstance('{"atoms": [...], "relations": [...]}');
 * ```
 * 
 * @example Usage from JavaScript object:
 * ```typescript
 * const instance = new JSONDataInstance({
 *   atoms: [{ id: "a1", type: "Entity", label: "Alice" }],
 *   relations: []
 * });
 * ```
 * 
 * @example With custom normalization options:
 * ```typescript
 * const instance = new JSONDataInstance(jsonData, {
 *   mergeRelations: false,
 *   validateReferences: false
 * });
 * ```
 */
export class JSONDataInstance implements IInputDataInstance {
  private atoms: IAtom[] = [];
  private relations: IRelation[] = [];
  private types: IType[] = [];
  private errors: string[] = [];
  
  /** Event listeners for data instance changes */
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  /**
   * Create a new JSONDataInstance from JSON data.
   * 
   * @param jsonData - Either a JSON string or a JavaScript object conforming to IJsonDataInstance
   * @param options - Normalization and validation options
   * @throws {SyntaxError} If jsonData is an invalid JSON string
   * @throws {Error} If the data structure is invalid
   */
  constructor(
    jsonData: string | IJsonDataInstance, 
    options: IJsonImportOptions = {}
  ) {
    try {
      // Parse JSON string if needed
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      // Validate basic structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data: expected object with atoms and relations');
      }
      
      if (!Array.isArray(data.atoms)) {
        throw new Error('Invalid data: atoms must be an array');
      }
      
      if (!Array.isArray(data.relations)) {
        throw new Error('Invalid data: relations must be an array');
      }
      
      // Normalize the data
      const normalized = DataInstanceNormalizer.normalize(data, options);
      this.atoms = normalized.atoms;
      this.relations = normalized.relations;
      this.types = normalized.types;
      this.errors = normalized.errors;
      
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Failed to create JSONDataInstance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add an event listener for data instance changes
   */
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  /**
   * Remove an event listener for data instance changes
   */
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emitEvent(event: DataInstanceEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in data instance event listener:', error);
        }
      });
    }
  }

  private isAtomBuiltin(atom: IAtom): boolean {
    // Check if the atom's type is a built-in type
    return false;
  }


  // === IDataInstance Implementation ===

  /**
   * Get the type definition for an atom by its ID.
   * @param id - The atom ID to look up
   * @returns The type definition for the atom
   * @throws {Error} If the atom or its type is not found
   */
  getAtomType(id: string): IType {
    const atom = this.atoms.find(a => a.id === id);
    if (!atom) {
      throw new Error(`Atom with ID '${id}' not found`);
    }
    
    const type = this.types.find(t => t.id === atom.type);
    if (!type) {
      throw new Error(`Type '${atom.type}' not found for atom '${id}'`);
    }
    
    return type;
  }

  /**
   * Get all type definitions in this instance.
   * @returns Read-only array of all types
   */
  getTypes(): readonly IType[] {
    return this.types;
  }

  /**
   * Get all atoms in this instance.
   * @returns Read-only array of all atoms
   */
  getAtoms(): readonly IAtom[] {
    return this.atoms;
  }

  /**
   * Get all relations in this instance.
   * @returns Read-only array of all relations
   */
  getRelations(): readonly IRelation[] {
    return this.relations;
  }

  /**
   * Get the top-level type ID for a given type.
   * The top-level type is the most general type in the hierarchy (last element in types array).
   * 
   * @param typeId - The type ID to look up
   * @returns The top-level type ID
   */
  private getTopLevelTypeId(typeId: string): string {
    const type = this.types.find(t => t.id === typeId);
    if (type && type.types.length > 0) {
      // types array is in ascending order (specific to general), so last is top-level
      return type.types[type.types.length - 1];
    }
    // If no type hierarchy found, the type is its own top-level
    return typeId;
  }

  /**
   * Check if a type is of another type (i.e., is a subtype or the same type).
   * 
   * @param typeId - The type ID to check
   * @param potentialAncestor - The potential ancestor type ID
   * @returns True if typeId is of type potentialAncestor
   */
  private typeIsOfType(typeId: string, potentialAncestor: string): boolean {
    const type = this.types.find(t => t.id === typeId);
    if (!type) {
      // No type definition found - check direct equality
      return typeId === potentialAncestor;
    }
    // Check if potentialAncestor is in the type hierarchy
    return type.types.includes(potentialAncestor);
  }

  /**
   * Apply Alloy-style projections to create a new data instance.
   * 
   * Projection "projects over" specific atoms, removing their types from relation
   * signatures while filtering tuples to only those containing the projected atoms.
   * The projected atoms themselves are removed from the instance (they become implicit).
   * 
   * For example, if you have a relation `access: Person -> File -> Time` and project
   * over `Time0`, the resulting relation becomes `access: Person -> File` containing
   * only tuples where the Time was `Time0`.
   * 
   * @param atomIds - Array of atom IDs to project over. Each atom's top-level type
   *                  must be unique (cannot project over two atoms of the same type).
   * @returns A new JSONDataInstance with projections applied
   * @throws {Error} If multiple atoms of the same top-level type are provided
   */
  applyProjections(atomIds: string[]): IInputDataInstance {
    if (atomIds.length === 0) {
      return this.clone();
    }

    // Build projections map: topLevelType -> atomId
    const projections: Record<string, string> = {};
    for (const atomId of atomIds) {
      const atom = this.atoms.find(a => a.id === atomId);
      if (!atom) {
        throw new Error(`Cannot project over atom '${atomId}': atom not found`);
      }
      const topType = this.getTopLevelTypeId(atom.type);
      if (projections[topType]) {
        throw new Error(
          `Cannot project over '${atomId}' and '${projections[topType]}'. Both are of type '${topType}'`
        );
      }
      projections[topType] = atomId;
    }

    const projectedTypes = Object.keys(projections);
    const projectedAtoms = Object.values(projections);
    const projectedAtomSet = new Set(projectedAtoms);

    // Project types: remove atoms from projected types
    const newTypes: IType[] = this.types.map(type => {
      const isProjected = projectedTypes.some(projectedType =>
        this.typeIsOfType(type.id, projectedType)
      );
      return {
        ...type,
        atoms: isProjected ? [] : type.atoms.filter(a => !projectedAtomSet.has(a.id))
      };
    });

    // Project relations: filter and modify tuples
    const newRelations: IRelation[] = this.relations.map(relation => {
      // Check if any type in this relation is being projected
      const isProjected = relation.types.some(relationType =>
        projectedTypes.some(projectedType =>
          this.typeIsOfType(relationType, projectedType)
        )
      );

      if (!isProjected) {
        // No projection affects this relation, keep as is
        return relation;
      }

      // Find indices of types that are being projected away
      const projectedIndices: number[] = [];
      relation.types.forEach((type, index) => {
        if (projectedTypes.some(projectedType => this.typeIsOfType(type, projectedType))) {
          projectedIndices.push(index);
        }
      });

      // Filter tuples to only those containing a projected atom, then remove projected columns
      const newTuples: ITuple[] = relation.tuples
        .filter(tuple =>
          // Tuple must contain at least one of the projected atoms
          tuple.atoms.some(atomId => projectedAtomSet.has(atomId))
        )
        .map(tuple => ({
          atoms: tuple.atoms.filter((_, index) => !projectedIndices.includes(index)),
          types: tuple.types.filter((_, index) => !projectedIndices.includes(index))
        }))
        // Only keep tuples with arity > 1 after projection (or any remaining atoms)
        .filter(tuple => tuple.atoms.length > 0);

      // Remove projected type indices from relation's types
      const newRelationTypes = relation.types.filter((_, index) => !projectedIndices.includes(index));

      return {
        ...relation,
        types: newRelationTypes,
        tuples: newTuples
      };
    }).filter(r => r.tuples.length > 0 || r.types.length > 0); // Keep relations that still have meaning

    // Filter atoms: remove all atoms of projected types (not just the specific projected atoms)
    const newAtoms = this.atoms.filter(a => {
      const atomTopType = this.getTopLevelTypeId(a.type);
      return !projectedTypes.includes(atomTopType);
    });

    return new JSONDataInstance({
      atoms: newAtoms,
      relations: newRelations,
      types: newTypes
    });
  }

  /**
   * Generate a graphlib Graph representation of this data instance.
   * 
   * This method creates a directed multigraph where:
   * - Each atom becomes a node with its label and type as metadata
   * - Each relation tuple becomes an edge between atoms
   * - Multi-atom tuples (arity > 2) are handled by connecting first to last atom
   * - Disconnected nodes can be optionally filtered out
   * 
   * @param hideDisconnected - Whether to hide atoms with no relations
   * @param hideDisconnectedBuiltIns - Whether to hide disconnected built-in types
   * @returns A graphlib Graph object ready for layout algorithms
   * 
   * @example
   * ```typescript
   * const graph = instance.generateGraph(true, true);
   * // Use with WebCola or other layout algorithms
   * const layout = new cola.Layout().nodes(graph.nodes()).edges(graph.edges());
   * ```
   */
  generateGraph(hideDisconnected: boolean = false, hideDisconnectedBuiltIns: boolean = false): Graph {
    const graph = new Graph({ directed: true, multigraph: true });

    // Step 1: Add all atoms as nodes with their metadata
    this.atoms.forEach(atom => {
      graph.setNode(atom.id, {
        id: atom.id,
        label: atom.label,
        type: atom.type,
        isBuiltin: this.isAtomBuiltin(atom)
      });
    });

    // Step 2: Add all relation tuples as edges
    this.relations.forEach(relation => {
      relation.tuples.forEach((tuple, tupleIndex) => {
        if (tuple.atoms.length >= 2) {
          // For binary relations, connect first to second atom
          // For higher-arity relations, connect first to last atom
          const sourceId = tuple.atoms[0];
          const targetId = tuple.atoms[tuple.atoms.length - 1];
          
          // Create edge label that includes middle atom labels for higher-arity relations
          const middleAtoms = tuple.atoms.slice(1, -1);
          let edgeLabel = relation.name;
          
          if (middleAtoms.length > 0) {
            // Get labels for middle atoms instead of using IDs
            const middleLabels = middleAtoms.map(atomId => {
              const atom = this.atoms.find(a => a.id === atomId);
              return atom ? atom.label : atomId; // Fallback to ID if atom not found
            });
            edgeLabel = `${relation.name}[${middleLabels.join(', ')}]`;
          }

          // Use tuple index to create unique edge names for multigraph
          const edgeName = `${relation.id}_${tupleIndex}`;
          
          graph.setEdge(sourceId, targetId, edgeLabel, edgeName);
        } else if (tuple.atoms.length === 1) {
          // Handle unary relations as self-loops
          const atomId = tuple.atoms[0];
          const edgeName = `${relation.id}_${tupleIndex}`;
          
          graph.setEdge(atomId, atomId, relation.name, edgeName);
        }
      });
    });

    // Step 3: Handle disconnected node filtering
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      const nodesToRemove: string[] = [];
      
      graph.nodes().forEach(nodeId => {
        const inEdges = graph.inEdges(nodeId) || [];
        const outEdges = graph.outEdges(nodeId) || [];
        const isDisconnected = inEdges.length === 0 && outEdges.length === 0;
        
        if (isDisconnected) {
          const nodeData = graph.node(nodeId);
          const isBuiltin = nodeData?.isBuiltin || false;
          
          if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
            nodesToRemove.push(nodeId);
          }
        }
      });
      
      // Remove disconnected nodes
      nodesToRemove.forEach(nodeId => {
        graph.removeNode(nodeId);
      });
    }

    return graph;
  }

  // === IInputDataInstance Implementation ===

  /**
   * Add a new atom to this instance.
   * Automatically creates the atom's type if it doesn't exist.
   * 
   * @param atom - The atom to add
   * @throws {Error} If an atom with the same ID already exists
   */
  addAtom(atom: IAtom): void {
    // Check for duplicates
    if (this.atoms.some(a => a.id === atom.id)) {
      throw new Error(`Atom with ID '${atom.id}' already exists`);
    }
    
    this.atoms.push(atom);
    
    // Add type if it doesn't exist
    let type = this.types.find(t => t.id === atom.type);
    if (!type) {
      type = {
        id: atom.type,
        types: [atom.type],
        atoms: [],
        isBuiltin: false
      };
      this.types.push(type);
    }
    
    // Add atom to type
    type.atoms.push(atom);
    
    // Emit event
    this.emitEvent({
      type: 'atomAdded',
      data: { atom }
    });
  }

  /**
   * Add a new tuple to a relation. Creates the relation if it doesn't exist.
   * 
   * @param relationId - The ID/name of the relation
   * @param tuple - The tuple to add
   * @throws {Error} If any referenced atoms don't exist
   */
  addRelationTuple(relationId: string, tuple: ITuple): void {
    // Validate atom references first
    for (const atomId of tuple.atoms) {
      if (!this.atoms.some(a => a.id === atomId)) {
        throw new Error(`Cannot add tuple: referenced atom '${atomId}' does not exist`);
      }
    }
    
    // Find or create relation
    let relation = this.relations.find(r => r.id === relationId || r.name === relationId);
    if (!relation) {
      relation = {
        id: relationId,
        name: relationId,
        types: [...tuple.types], // Copy the types
        tuples: []
      };
      this.relations.push(relation);
    } else {
      // Merge types if relation exists
      const existingTypes = new Set(relation.types);
      for (const type of tuple.types) {
        if (!existingTypes.has(type)) {
          relation.types.push(type);
        }
      }
    }
    
    relation.tuples.push(tuple);
    
    // Emit event
    this.emitEvent({
      type: 'relationTupleAdded',
      data: { relationId, tuple }
    });
  }

  /**
   * Remove an atom and all references to it in relation tuples.
   * 
   * @param id - The ID of the atom to remove
   * @throws {Error} If the atom doesn't exist
   */
  removeAtom(id: string): void {
    const atomIndex = this.atoms.findIndex(a => a.id === id);
    if (atomIndex === -1) {
      throw new Error(`Cannot remove atom: atom with ID '${id}' not found`);
    }
    
    const atom = this.atoms[atomIndex];
    
    // Remove atom from atoms array
    this.atoms.splice(atomIndex, 1);
    
    // Remove from type
    const type = this.types.find(t => t.id === atom.type);
    if (type) {
      type.atoms = type.atoms.filter(a => a.id !== id);
    }
    
    // Remove from all relation tuples
    for (const relation of this.relations) {
      relation.tuples = relation.tuples.filter(t => !t.atoms.includes(id));
    }
    
    // Emit event
    this.emitEvent({
      type: 'atomRemoved',
      data: { atomId: id }
    });
  }

  /**
   * Remove a specific tuple from a relation.
   * 
   * @param relationId - The ID/name of the relation
   * @param tuple - The tuple to remove (must match exactly)
   * @throws {Error} If the relation doesn't exist
   */
  removeRelationTuple(relationId: string, tuple: ITuple): void {
    const relation = this.relations.find(r => r.id === relationId || r.name === relationId);
    if (!relation) {
      throw new Error(`Cannot remove tuple: relation '${relationId}' not found`);
    }
    
    // Compare tuples by their atom arrays (order-sensitive) for more robust matching
    // This is more reliable than JSON.stringify which can fail due to property order
    const tupleMatches = (t1: ITuple, t2: ITuple): boolean => {
      if (t1.atoms.length !== t2.atoms.length) return false;
      return t1.atoms.every((atom, i) => atom === t2.atoms[i]);
    };
    
    const initialLength = relation.tuples.length;
    relation.tuples = relation.tuples.filter(t => !tupleMatches(t, tuple));
    
    if (relation.tuples.length === initialLength) {
      throw new Error(`Tuple not found in relation '${relationId}'`);
    }
    
    // Emit event
    this.emitEvent({
      type: 'relationTupleRemoved',
      data: { relationId, tuple }
    });
  }

  /**
   * Convert this instance back to its JSON representation.
   * This is useful for serialization or sending data back to external tools.
   * 
   * @returns A plain JavaScript object that can be JSON.stringify'd
   */
  reify(): IJsonDataInstance {
    return {
      atoms: [...this.atoms], // Create copies to prevent mutation
      relations: this.relations.map(r => ({ ...r, tuples: [...r.tuples] })),
      types: this.types.map(t => ({ ...t, atoms: [...t.atoms] }))
    };
  }


  /**
   * Adds data from another IDataInstance to this instance.
   * 
   * @param dataInstance - The data instance to add from.
   * @param unifyBuiltIns - Whether to unify built-in types (reuse existing ones).
   * @returns True if the operation is successful, false otherwise.
   */
  addFromDataInstance(dataInstance: IDataInstance, unifyBuiltIns: boolean): boolean {
    // Validate that the input is an IDataInstance
    if (!dataInstance) {
      return false;
    }

    const reIdMap = new Map<string, string>();

    // Add atoms
    dataInstance.getAtoms().forEach(atom => {
      const isBuiltin = this.isAtomBuiltin(atom);

      if (unifyBuiltIns && isBuiltin) {
        // Check if the built-in atom already exists
        const existingAtom = this.atoms.find(
          existing => existing.type === atom.type && existing.label === atom.label
        );

        if (existingAtom) {
          // Map the original atom ID to the existing atom ID
          reIdMap.set(atom.id, existingAtom.id);
          return; // Skip adding this atom
        }
      }

      // Generate a new ID for the atom to avoid conflicts
      const newId = `atom_${this.atoms.length + 1}`;
      reIdMap.set(atom.id, newId);

      // Add the atom with the new ID
      const newAtom: IAtom = { ...atom, id: newId };
      this.addAtom(newAtom);
    });

    // Add relations
    dataInstance.getRelations().forEach(relation => {
      const newTuples: ITuple[] = relation.tuples.map(tuple => ({
        atoms: tuple.atoms.map(atomId => reIdMap.get(atomId) || atomId),
        types: tuple.types,
      }));

      const existingRelation = this.relations.find(r => r.id === relation.id || r.name === relation.name);
      if (existingRelation) {
        // Merge tuples into the existing relation
        const existingTupleKeys = new Set(existingRelation.tuples.map(t => JSON.stringify(t)));
        newTuples.forEach(tuple => {
          const tupleKey = JSON.stringify(tuple);
          if (!existingTupleKeys.has(tupleKey)) {
            existingRelation.tuples.push(tuple);
            existingTupleKeys.add(tupleKey);
          }
        });
      } else {
        // Add a new relation
        this.relations.push({
          ...relation,
          tuples: newTuples,
        });
      }
    });

    // Add types
    dataInstance.getTypes().forEach(type => {
      const existingType = this.types.find(t => t.id === type.id);
      if (!existingType) {
        // Add the type if it doesn't exist
        this.types.push({
          ...type,
          atoms: type.atoms.map(atom => ({
            ...atom,
            id: reIdMap.get(atom.id) || atom.id,
          })),
        });
      } else {
        // Merge atoms into the existing type
        const existingAtomIds = new Set(existingType.atoms.map(a => a.id));
        type.atoms.forEach(atom => {
          const newId = reIdMap.get(atom.id) || atom.id;
          if (!existingAtomIds.has(newId)) {
            existingType.atoms.push({ ...atom, id: newId });
            existingAtomIds.add(newId);
          }
        });
      }
    });

    return true;
  }

  // === Additional Utility Methods ===

  /**
   * Get any normalization errors that occurred during construction.
   * These are validation warnings/errors that didn't prevent instance creation.
   * 
   * @returns Array of error messages
   */
  getErrors(): string[] {
    return [...this.errors]; // Return copy to prevent mutation
  }

  /**
   * Check if the instance has any validation errors.
   * 
   * @returns true if the instance is valid (no errors), false otherwise
   */
  isValid(): boolean {
    return this.errors.length === 0;
  }

  /**
   * Get statistics about this data instance.
   * Useful for debugging and logging.
   * 
   * @returns Object containing counts and other metadata
   */
  getStatistics(): {
    atomCount: number;
    relationCount: number;
    typeCount: number;
    tupleCount: number;
    errorCount: number;
    hasBuiltinTypes: boolean;
  } {
    return {
      atomCount: this.atoms.length,
      relationCount: this.relations.length,
      typeCount: this.types.length,
      tupleCount: this.relations.reduce((sum, r) => sum + r.tuples.length, 0),
      errorCount: this.errors.length,
      hasBuiltinTypes: this.types.some(t => t.isBuiltin)
    };
  }

  /**
   * Create a deep copy of this instance.
   * Useful for creating modified versions without affecting the original.
   * 
   * @returns A new JSONDataInstance with the same data
   */
  clone(): JSONDataInstance {
    return new JSONDataInstance(this.reify());
  }
}

/**
 * Utility class for normalizing and cleaning JSON data instances.
 * 
 * This class provides static methods to handle common data quality issues
 * when importing data from external sources. Each method can be used independently
 * or as part of the full normalization pipeline.
 * 
 * @example Normalize data manually:
 * ```typescript
 * const cleanedRelations = DataInstanceNormalizer.mergeRelations(rawRelations);
 * const inferredTypes = DataInstanceNormalizer.inferTypes(atoms);
 * ```
 */
export class DataInstanceNormalizer {
  /**
   * Merge relations with the same name by combining their tuples.
   * This is useful when data comes from multiple sources that define the same logical relation.
   * 
   * @param relations - Array of relations to merge
   * @returns Array of merged relations with unique tuples
   * 
   * @example
   * ```typescript
   * const input = [
   *   { id: "rel1", name: "knows", types: ["Person"], tuples: [tuple1] },
   *   { id: "rel2", name: "knows", types: ["Person"], tuples: [tuple2] }
   * ];
   * const merged = DataInstanceNormalizer.mergeRelations(input);
   * // Result: [{ id: "rel1", name: "knows", types: ["Person"], tuples: [tuple1, tuple2] }]
   * ```
   */
  static mergeRelations(relations: IRelation[]): IRelation[] {
    const relationMap = new Map<string, IRelation>();
    
    for (const relation of relations) {
      const existing = relationMap.get(relation.name);
      if (existing) {
        // Merge tuples, avoiding duplicates using JSON comparison
        const existingTupleKeys = new Set(existing.tuples.map(t => JSON.stringify(t)));
        
        for (const tuple of relation.tuples) {
          const tupleKey = JSON.stringify(tuple);
          if (!existingTupleKeys.has(tupleKey)) {
            existing.tuples.push(tuple);
            existingTupleKeys.add(tupleKey);
          }
        }
        
        // Merge types, preserving order and removing duplicates
        const existingTypeSet = new Set(existing.types);
        for (const type of relation.types) {
          if (!existingTypeSet.has(type)) {
            existing.types.push(type);
            existingTypeSet.add(type);
          }
        }
      } else {
        // Create new relation entry with defensive copies
        relationMap.set(relation.name, {
          id: relation.id || relation.name,
          name: relation.name,
          types: [...relation.types],
          tuples: [...relation.tuples]
        });
      }
    }
    
    return Array.from(relationMap.values());
  }

  /**
   * Infer type definitions from atoms when explicit types are not provided.
   * Creates a basic type hierarchy where each type contains itself.
   * 
   * @param atoms - Array of atoms to analyze
   * @returns Array of inferred type definitions
   * 
   * @example
   * ```typescript
   * const atoms = [
   *   { id: "p1", type: "Person", label: "Alice" },
   *   { id: "p2", type: "Person", label: "Bob" },
   *   { id: "c1", type: "Car", label: "Toyota" }
   * ];
   * const types = DataInstanceNormalizer.inferTypes(atoms);
   * // Result: [PersonType, CarType] with atoms grouped by type
   * ```
   */
  static inferTypes(atoms: IAtom[]): IType[] {
    const typeMap = new Map<string, IType>();
    
    for (const atom of atoms) {
      if (!typeMap.has(atom.type)) {
        typeMap.set(atom.type, {
          id: atom.type,
          types: [atom.type], // Simple hierarchy - could be enhanced with inheritance detection
          atoms: [],
          isBuiltin: DataInstanceNormalizer.isBuiltinType(atom.type)
        });
      }
      typeMap.get(atom.type)!.atoms.push(atom);
    }
    
    return Array.from(typeMap.values());
  }

  /**
   * Determine if a type name represents a built-in type.
   * This can be customized based on your domain's built-in types.
   * 
   * @param typeName - The type name to check
   * @returns true if the type is considered built-in
   */
  private static isBuiltinType(typeName: string): boolean {
    const builtinTypes = new Set([
      'String', 'Int', 'Bool', 'seq/Int', 'univ', 'none',
      'Entity', 'Object', 'Node', 'Edge', 'Atom'
    ]);
    return builtinTypes.has(typeName);
  }

  /**
   * Remove duplicate atoms with the same ID, keeping the first occurrence.
   * Useful for deduplicating data from multiple sources.
   * 
   * @param atoms - Array of atoms that may contain duplicates
   * @returns Array of unique atoms (by ID)
   * 
   * @example
   * ```typescript
   * const atoms = [
   *   { id: "a1", type: "Person", label: "Alice" },
   *   { id: "a1", type: "Person", label: "Alice Updated" }, // duplicate
   *   { id: "a2", type: "Person", label: "Bob" }
   * ];
   * const unique = DataInstanceNormalizer.deduplicateAtoms(atoms);
   * // Result: [{ id: "a1", type: "Person", label: "Alice" }, { id: "a2", ... }]
   * ```
   */
  static deduplicateAtoms(atoms: IAtom[]): IAtom[] {
    const atomMap = new Map<string, IAtom>();
    const duplicateIds = new Set<string>();
    
    for (const atom of atoms) {
      if (atomMap.has(atom.id)) {
        duplicateIds.add(atom.id);
      } else {
        atomMap.set(atom.id, atom);
      }
    }
    
    // Log warning if duplicates were found
    if (duplicateIds.size > 0) {
      console.warn(`Found duplicate atoms with IDs: ${Array.from(duplicateIds).join(', ')}`);
    }
    
    return Array.from(atomMap.values());
  }

  /**
   * Validate that all atom references in relation tuples actually exist.
   * This catches broken references and helps identify data integrity issues.
   * 
   * @param atoms - Array of available atoms
   * @param relations - Array of relations to validate
   * @returns Validation result with success status and any error messages
   * 
   * @example
   * ```typescript
   * const validation = DataInstanceNormalizer.validateReferences(atoms, relations);
   * if (!validation.isValid) {
   *   console.error('Validation errors:', validation.errors);
   * }
   * ```
   */
  static validateReferences(
    atoms: IAtom[], 
    relations: IRelation[]
  ): { isValid: boolean; errors: string[] } {
    const atomIds = new Set(atoms.map(a => a.id));
    const errors: string[] = [];
    
    for (const relation of relations) {
      for (let tupleIndex = 0; tupleIndex < relation.tuples.length; tupleIndex++) {
        const tuple = relation.tuples[tupleIndex];
        
        for (let atomIndex = 0; atomIndex < tuple.atoms.length; atomIndex++) {
          const atomId = tuple.atoms[atomIndex];
          if (!atomIds.has(atomId)) {
            errors.push(
              `Relation "${relation.name}" tuple ${tupleIndex} position ${atomIndex}: ` +
              `references unknown atom "${atomId}"`
            );
          }
        }
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Normalize a JSON data instance with the given options.
   * This is the main entry point that orchestrates all normalization steps.
   * 
   * @param jsonData - The raw JSON data to normalize
   * @param options - Normalization options (all default to true)
   * @returns Normalized data with atoms, relations, types, and any validation errors
   * 
   * @example
   * ```typescript
   * const result = DataInstanceNormalizer.normalize(rawData, {
   *   mergeRelations: true,
   *   inferTypes: true,
   *   validateReferences: true,
   *   deduplicateAtoms: true
   * });
   * 
   * if (result.errors.length > 0) {
   *   console.warn('Normalization warnings:', result.errors);
   * }
   * ```
   */
  static normalize(
    jsonData: IJsonDataInstance, 
    options: IJsonImportOptions = {}
  ): { atoms: IAtom[]; relations: IRelation[]; types: IType[]; errors: string[] } {
    // Apply defaults
    const opts: Required<IJsonImportOptions> = {
      mergeRelations: true,
      inferTypes: true,
      validateReferences: true,
      deduplicateAtoms: true,
      ...options
    };

    let atoms = jsonData.atoms || [];
    let relations = jsonData.relations || [];
    let types = jsonData.types || [];
    const errors: string[] = [];

    // Step 1: Deduplicate atoms
    if (opts.deduplicateAtoms && atoms.length > 0) {
      const originalCount = atoms.length;
      atoms = this.deduplicateAtoms(atoms);
      if (atoms.length < originalCount) {
        errors.push(`Removed ${originalCount - atoms.length} duplicate atoms`);
      }
    }

    // Step 2: Merge relations with same name
    if (opts.mergeRelations && relations.length > 0) {
      const originalCount = relations.length;
      relations = this.mergeRelations(relations);
      if (relations.length < originalCount) {
        errors.push(`Merged ${originalCount - relations.length} duplicate relations`);
      }
    }

    // Step 3: Infer types if not provided
    if (opts.inferTypes && types.length === 0 && atoms.length > 0) {
      types = this.inferTypes(atoms);
      errors.push(`Inferred ${types.length} types from atoms`);
    }

    // Step 4: Validate references
    if (opts.validateReferences) {
      const validation = this.validateReferences(atoms, relations);
      errors.push(...validation.errors);
    }

    return { atoms, relations, types, errors };
  }
}
