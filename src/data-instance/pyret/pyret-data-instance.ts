import { Graph } from 'graphlib';
import { IInputDataInstance, IAtom, IRelation, ITuple, IType, DataInstanceEventType, DataInstanceEventListener, DataInstanceEvent } from '../interfaces';

/**
 * Pyret Lists and Tables are going to be really tricky here.
 * What about images, or other Pyret representations?
 */


export function generateEdgeId(
    relation: IRelation,
    tuple: ITuple
): string {

    const relationId = relation.id;
    const atoms = tuple.atoms;
    return `${relationId}:${atoms.join('->')}`;
}

/**
 * Pyret data instance implementation for parsing Pyret runtime objects
 * 
 * Handles Pyret's object representation where:
 * - Objects have a `dict` property containing field values
 * - Objects have a `brands` property indicating their type
 * - All dict entries are treated as relations
 * - Cycles are handled gracefully without infinite recursion
 * 
 * @example
 * ```typescript
 * const pyretData = {
 *   dict: { value: 11, left: {...}, right: {...} },
 *   brands: { "$brandtnode989": true }
 * };
 * const instance = new PyretDataInstance(pyretData);
 * ```
 */
export class PyretDataInstance implements IInputDataInstance {

  private atoms = new Map<string, IAtom>();
  private relations = new Map<string, IRelation>();
  private types = new Map<string, IType>();
  private objectToAtomId = new WeakMap<object, string>();
  private atomCounter = 0;

  /** Map to keep track of label counts per type */
  private typeLabelCounters = new Map<string, number>();

  /** Map to store the original Pyret objects with their dict key order */
  private originalObjects = new Map<string, PyretObject>();

  /** Event listeners for data instance changes */
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  private readonly showFunctions: boolean;

  /** Map to store constructor patterns and field order for types */
  private constructorCache = new Map<string, string[]>();

  /** Optional external Pyret evaluator for enhanced features */
  private externalEvaluator: any | null = null;

  /*
    TODO: List handling
    - Handle Pyret Lists and Tables as special cases. They currently show as (link (link (link (link )))) etc.
  */


  /**
   * Creates a PyretDataInstance from a Pyret runtime object
   * 
   * @param pyretData - The root Pyret object to parse, or null/undefined for an empty instance
   * @param showFunctions - Whether to include function/method fields in parsing
   * @param externalEvaluator - Optional external Pyret evaluator for enhanced features
   */
  constructor(pyretData?: PyretObject | null, showFunctions = false, externalEvaluator?: any) {
    this.showFunctions = showFunctions;
    this.externalEvaluator = externalEvaluator || null;
    this.initializeBuiltinTypes();
    if (pyretData) {
      this.parseObjectIteratively(pyretData);
    }
  }

  /**
   * Set an external Pyret evaluator for enhanced features
   * @param evaluator - External Pyret evaluator (e.g., window.__internalRepl)
   */
  setExternalEvaluator(evaluator: any): void {
    this.externalEvaluator = evaluator;
  }

  /**
   * Get the current external evaluator
   */
  getExternalEvaluator(): any | null {
    return this.externalEvaluator;
  }

  /**
   * Cache constructor field order for a type when we successfully parse an original object
   */
  private cacheConstructorPattern(typeName: string, fieldOrder: string[]): void {
    if (!this.constructorCache.has(typeName) && fieldOrder.length > 0) {
      this.constructorCache.set(typeName, [...fieldOrder]);
    }
  }

  /**
   * Get cached constructor pattern for a type
   */
  private getCachedConstructorPattern(typeName: string): string[] | null {
    return this.constructorCache.get(typeName) || null;
  }

  /**
   * Try to rebuild constructor arguments from relations using cached patterns
   * Only uses patterns from previously seen constructor instances - no heuristics
   */
  private tryReconstructFromRelations(atom: IAtom, visited: Set<string>): string {
    // Get all relations where this atom is the source
    const relationMap = new Map<string, string[]>();
    this.relations.forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length >= 2 && tuple.atoms[0] === atom.id) {
          const relationName = relation.name;
          if (!relationMap.has(relationName)) {
            relationMap.set(relationName, []);
          }
          // Skip the source atom, collect target atoms
          relationMap.get(relationName)!.push(...tuple.atoms.slice(1));
        }
      });
    });

    if (relationMap.size === 0) {
      return atom.type; // No relations, just return the type name
    }

    // Try to use cached constructor pattern from previously seen instances
    const cachedPattern = this.getCachedConstructorPattern(atom.type);
    if (cachedPattern) {
      const args: string[] = [];
      for (const fieldName of cachedPattern) {
        const targetIds = relationMap.get(fieldName) || [];
        for (const targetId of targetIds) {
          args.push(this.reifyAtom(targetId, visited));
        }
      }
      if (args.length > 0) {
        return `${atom.type}(${args.join(', ')})`;
      }
    }

    // If no cached pattern, try to infer from other instances of the same type
    // Look for other atoms of the same type that have original objects
    const sameTypeAtoms = Array.from(this.atoms.values()).filter(a => a.type === atom.type);
    for (const sameTypeAtom of sameTypeAtoms) {
      const originalObj = this.originalObjects.get(sameTypeAtom.id);
      if (originalObj && originalObj.dict) {
        const orderedKeys = Object.keys(originalObj.dict);
        this.cacheConstructorPattern(atom.type, orderedKeys);
        
        // Now try again with the cached pattern
        const args: string[] = [];
        for (const fieldName of orderedKeys) {
          const targetIds = relationMap.get(fieldName) || [];
          for (const targetId of targetIds) {
            args.push(this.reifyAtom(targetId, visited));
          }
        }
        if (args.length > 0) {
          return `${atom.type}(${args.join(', ')})`;
        }
        break; // Only need to check one instance since constructors are nominal
      }
    }

    // Final fallback: use sorted field order but print an error
    console.error(`[PyretDataInstance] Could not determine constructor pattern for type '${atom.type}'. Falling back to sorted field order.`);
    
    const relationNames = Array.from(relationMap.keys()).sort(); // Sort for consistency
    const args: string[] = [];
    
    for (const relationName of relationNames) {
      const targetIds = relationMap.get(relationName) || [];
      for (const targetId of targetIds) {
        args.push(this.reifyAtom(targetId, visited));
      }
    }
    
    if (args.length > 0) {
      return `${atom.type}(${args.join(', ')})`;
    }
    
    return atom.type; // Last resort: just the type name
  }
  hasExternalEvaluator(): boolean {
    return this.externalEvaluator !== null;
  }
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

  /**
   * Adds an atom to the instance, updating types accordingly.
   * If the atom already exists, it is replaced.
   * @param atom - The atom to add
   */
  addAtom(atom: IAtom): void {
    this.atoms.set(atom.id, atom);
    this.ensureTypeExists(atom.type);
    const type = this.types.get(atom.type);
    if (type && !type.atoms.some(a => a.id === atom.id)) {
      type.atoms.push(atom);
    }
    
    // Emit event
    this.emitEvent({
      type: 'atomAdded',
      data: { atom }
    });
  }

  /**
   * Removes an atom by id, and removes it from all types and relations.
   * @param id - The atom id to remove
   */
  removeAtom(id: string): void {
    const removedAtom = this.atoms.get(id);
    this.atoms.delete(id);

    // Remove from types
    this.types.forEach(type => {
      type.atoms = type.atoms.filter(atom => atom.id !== id);
    });

    // Remove from all relation tuples
    this.relations.forEach(relation => {
      relation.tuples = relation.tuples.filter(tuple => !tuple.atoms.includes(id));
    });
    
    // Emit event if atom was found
    if (removedAtom) {
      this.emitEvent({
        type: 'atomRemoved',
        data: { atomId: id }
      });
    }
  }


  removeRelationTuple(relationId: string, t: ITuple): void {
    
    // How would we do this?
    const relation = this.relations.get(relationId);
    if (relation) {
      const oldLength = relation.tuples.length;
      relation.tuples = relation.tuples.filter(tuple =>
        !tuple.atoms.every((atomId, index) => atomId === t.atoms[index])
      );
      
      // Emit event if tuple was actually removed
      if (relation.tuples.length < oldLength) {
        this.emitEvent({
          type: 'relationTupleRemoved',
          data: { relationId, tuple: t }
        });
      }
    }
  }

  /**
   * Converts the current data instance back to Pyret constructor notation
   * 
   * If an external evaluator is available, it may provide enhanced type information
   * for more accurate reification in the future.
   * 
   * @returns A string representation of the data in Pyret constructor syntax
   * 
   * @example
   * ```typescript
   * const pyretCode = instance.reify();
   * ```
   */
  reify(): string {
    let result = '';


    // Find referenced atoms
    const referencedAtoms = new Set<string>();
    this.relations.forEach(relation => {
      relation.tuples.forEach(tuple => {
        for (let i = 1; i < tuple.atoms.length; i++) {
          referencedAtoms.add(tuple.atoms[i]);
        }
      });
    });

    // Identify root atoms (not referenced by others, including builtins)
    const rootAtoms = Array.from(this.atoms.values()).filter(atom => !referencedAtoms.has(atom.id));

    if (rootAtoms.length === 0) {
      return result + "/* No root atoms found */";
    }

    // If multiple roots, wrap in a Pyret set
    if (rootAtoms.length > 1) {
      const rootExpressions = rootAtoms.map(atom => this.reifyAtom(atom.id, new Set()));
      return result + `[list-set: ${rootExpressions.join(', ')}]`;
    }

    // If only one root atom, reify it directly
    return result + this.reifyAtom(rootAtoms[0].id, new Set());
  }

  /**
   * Recursively reifies a single atom and its relations, preserving constructor argument order
   * 
   * @param atomId - The atom ID to reify
   * @param visited - Set of visited atom IDs to prevent infinite recursion
   * @returns Pyret constructor notation for this atom
   */
  private reifyAtom(atomId: string, visited: Set<string>): string {


    // TODO: I think this is broken -- it doesn't cache things correctly.

    if (visited.has(atomId)) {
      return `/* cycle: ${atomId} */`;
    }

    const atom = this.atoms.get(atomId);
    if (!atom) {
      return `/* missing atom: ${atomId} */`;
    }

    visited.add(atomId);

    // Handle primitive types
    if (this.isBuiltinType(atom.type)) {
      const result = this.reifyPrimitive(atom);
      visited.delete(atomId);
      return result;
    }

    // Get the original object to preserve key order
    const originalObject = this.originalObjects.get(atomId);

    if (!originalObject || !originalObject.dict) {
      // No original object available - try to reconstruct using cached patterns or heuristics
      visited.delete(atomId);
      return this.tryReconstructFromRelations(atom, visited);
    }

    // Use the original dict key order to maintain constructor argument order
    const orderedKeys = Object.keys(originalObject.dict);
    
    // Cache this constructor pattern for future use
    this.cacheConstructorPattern(atom.type, orderedKeys);
    
    // Check if this looks like a list (all keys are numeric)
    const isListLike = orderedKeys.every(key => /^\d+$/.test(key));
    
    if (isListLike && orderedKeys.length > 0) {
      // Sort numeric keys and extract list items
      const sortedKeys = orderedKeys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      const listItems = sortedKeys.map(key => {
        const targetAtomIds = this.getRelationTargets(atomId, key);
        return targetAtomIds.map(targetId => this.reifyAtom(targetId, visited));
      }).flat();
      
      visited.delete(atomId);
      return `[list: ${listItems.join(', ')}]`;
    }

    // Regular constructor notation with preserved argument order
    const args: string[] = [];
    
    for (const relationName of orderedKeys) {
      const targetAtomIds = this.getRelationTargets(atomId, relationName);
      for (const targetId of targetAtomIds) {
        args.push(this.reifyAtom(targetId, visited));
      }
    }

    visited.delete(atomId);

    if (args.length === 0) {
      return atom.type;
    }

    return `${atom.type}(${args.join(', ')})`;
  }

  /**
   * Reifies primitive values with appropriate Pyret syntax
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
   * Determines if an atom's relations look like a list structure
   * (has numeric indices like "0", "1", "2", etc.)
   */
  private isListLike(relations: Map<string, string[]>): boolean {
    const relationNames = Array.from(relations.keys());
    
    // Check if all relation names are numeric strings
    const numericNames = relationNames.filter(name => /^\d+$/.test(name));
    
    // Must have at least one numeric relation and all relations should be numeric
    return numericNames.length > 0 && numericNames.length === relationNames.length;
  }

  /**
   * Extracts list items in the correct order for Pyret list notation
   */
  private extractListItems(relations: Map<string, string[]>, visited: Set<string>): string[] {
    const items: string[] = [];
    const sortedIndices = Array.from(relations.keys())
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    for (const index of sortedIndices) {
      const targetIds = relations.get(index) || [];
      for (const targetId of targetIds) {
        items.push(this.reifyAtom(targetId, visited));
      }
    }

    return items;
  }

  /**
   * Parses Pyret objects iteratively to avoid stack overflow and handle cycles
   */
  private parseObjectIteratively(rootObject: PyretObject): void {
    const processingQueue: Array<{ obj: PyretObject; parentInfo?: { parentId: string; relationName: string } }> = [
      { obj: rootObject }
    ];

    while (processingQueue.length > 0) {
      const { obj, parentInfo } = processingQueue.shift()!;



      /** 
       * 
       * TODO: N-ary relations, etc for things like lists, tables, etc.
       * 
       * 
       */

      // Skip if we've already processed this object (cycle detection)
      if (this.objectToAtomId.has(obj)) {
        if (parentInfo) {
          const existingAtomId = this.objectToAtomId.get(obj)!;
          this.addRelationTuple(
            parentInfo.relationName,
            { atoms: [parentInfo.parentId, existingAtomId], types: ['PyretObject', 'PyretObject'] }
          );
        }
        continue;
      }

      const atomId = this.createAtomFromObject(obj);

      // Store the original object to preserve dict key order
      this.originalObjects.set(atomId, obj);

      // Cache constructor pattern for this type if it has a dict
      if (obj.dict && typeof obj.dict === 'object') {
        const type = this.extractType(obj);
        const fieldOrder = Object.keys(obj.dict);
        this.cacheConstructorPattern(type, fieldOrder);
      }

      // Add relation from parent if this is not the root object
      if (parentInfo) {
        this.addRelationTuple(
          parentInfo.relationName,
          { atoms: [parentInfo.parentId, atomId], types: ['PyretObject', 'PyretObject'] }
        );
      }

      // Process all dict entries as relations, but skip obvious function/method fields
      if (obj.dict && typeof obj.dict === 'object') {
        Object.entries(obj.dict).forEach(([relationName, fieldValue]) => {
          
          
          // Heuristic: skip fields that look like Pyret methods (object with only a 'name' property)
          if (
            !this.showFunctions &&
            fieldValue &&
            typeof fieldValue === 'object' &&
            'meth' in fieldValue &&
            'full_meth' in fieldValue
          ) {
            // skip this field
            return;
          }
          ////


          if (this.isAtomicValue(fieldValue)) {
            const valueAtomId = this.createAtomFromPrimitive(fieldValue);
            this.addRelationTuple(
              relationName,
              { atoms: [atomId, valueAtomId], types: ['PyretObject', 'PyretObject'] }
            );
          } else if (this.isPyretObject(fieldValue)) {
            processingQueue.push({
              obj: fieldValue,
              parentInfo: { parentId: atomId, relationName }
            });
          }
        });
      }
    }
  }

  /**
   * Creates an atom from a Pyret object and stores the mapping
   */
  private createAtomFromObject(obj: PyretObject): string {
    const type = this.extractType(obj);
    const atomId = this.generateAtomId(type);
    
    const atom: IAtom = {
      id: atomId,
      type,
      label: this.extractLabel(obj)
    };

    this.atoms.set(atomId, atom);
    this.objectToAtomId.set(obj, atomId);
    this.ensureTypeExists(type);

    return atomId;
  }

  /**
   * Creates an atom from a primitive value, reusing existing atoms for the same value
   */
  private createAtomFromPrimitive(value: string | number | boolean): string {
    const type = this.mapPrimitiveType(value);
    const label = String(value);
    
    // Check if we already have an atom for this value
    const existingAtom = Array.from(this.atoms.values())
      .find(atom => atom.label === label && atom.type === type);
    
    if (existingAtom) {
      return existingAtom.id;
    }

    const atomId = this.generateAtomId(type);
    const atom: IAtom = {
      id: atomId,
      type,
      label
    };

    this.atoms.set(atomId, atom);
    this.ensureTypeExists(type);

    return atomId;
  }

  /**
   * Maps JavaScript primitive types to Pyret-appropriate type names
   */
  private mapPrimitiveType(value: string | number | boolean): string {
    switch (typeof value) {
      case 'number': return 'Number';
      case 'string': return 'String';
      case 'boolean': return 'Boolean';
      default: return 'Value';
    }
  }


  /**
   * Extracts the most specific brand name from a Pyret brands object.
   * Returns the brand with the highest trailing number, with prefix and number removed.
   * If no brands have trailing numbers, returns the lexicographically last brand.
   *
   * @param brands - The brands object from a Pyret object
   * @returns The most specific brand name (without $brand and trailing number), or undefined if none found
   */
  private extractMostSpecificBrand(brands: Record<string, boolean>): string | undefined {
    let maxNum = -1;
    let result: string | undefined = undefined;
    let fallbackResult: string | undefined = undefined;

    for (const brand of Object.keys(brands)) {
      // Try pattern with trailing number
      const matchWithNumber = /^\$brand([a-zA-Z_]+)(\d+)$/.exec(brand);
      if (matchWithNumber) {
        const [, name, numStr] = matchWithNumber;
        const num = parseInt(numStr, 10);
        if (num > maxNum) {
          maxNum = num;
          result = name;
        }
      } else {
        // Try pattern without trailing number
        const matchWithoutNumber = /^\$brand_?([a-zA-Z_]+)$/.exec(brand);
        if (matchWithoutNumber) {
          const [, name] = matchWithoutNumber;
          // Use as fallback if no numbered brands found
          if (!fallbackResult || name > fallbackResult) {
            fallbackResult = name;
          }
        }
      }
    }
    
    // Return numbered brand if found, otherwise fallback to non-numbered brand
    return result || fallbackResult;
  }

  /**
   * Extracts the type name from a Pyret object
   */
  private extractType(obj: PyretObject): string {
    // Check for explicit name first
    if (obj.$name && typeof obj.$name === 'string') {
      return obj.$name;
    }

    // Extract from brands
    if (obj.brands && typeof obj.brands === 'object') {
      const brand = this.extractMostSpecificBrand(obj.brands);
      if (brand) {
        return brand;
      }
    }

    return 'PyretObject';
  }

  /**
   * Extracts a display label from a Pyret object, using a per-type counter.
   * Labels will be of the form Type$<num>
   */
  private extractLabel(obj: PyretObject): string {
    if (obj.$name && typeof obj.$name === 'string') {
      return obj.$name;
    }

    const type = this.extractType(obj);

    // Increment the counter for this type
    const current = this.typeLabelCounters.get(type) ?? 0;
    const next = current + 1;
    this.typeLabelCounters.set(type, next);

    return `${type}$${next}`;
  }

  /**
   * Adds a tuple to a relation, creating the relation if it doesn't exist
   */
  addRelationTuple(relationId: string, tuple: ITuple): void {
    // const [sourceId, targetId] = tuple.atoms;

    const sourceId = tuple.atoms[0];
    const targetId = tuple.atoms[tuple.atoms.length - 1];
    const middleAtoms = tuple.atoms.slice(1, -1);

    const sourceAtom = this.atoms.get(sourceId);
    const targetAtom = this.atoms.get(targetId);

    if (!sourceAtom || !targetAtom) {
      console.warn(`Cannot create relation ${relationId}: missing atoms ${sourceId} or ${targetId}`);
      return;
    }

    let relation = this.relations.get(relationId);
    let name = relationId + (middleAtoms.length > 0 ? `[${middleAtoms.join(', ')}]` : '');
    if (!relation) {
      relation = {
        id: relationId,
        name: name,
        types: [sourceAtom.type, targetAtom.type],
        tuples: []
      };
      this.relations.set(relationId, relation);
    }

    // Check for duplicate tuples
    const isDuplicate = relation.tuples.some(t =>
      t.atoms[0] === sourceId && t.atoms[1] === targetId
    );

    if (!isDuplicate) {
      relation.tuples.push(tuple);
      
      // Emit event
      this.emitEvent({
        type: 'relationTupleAdded',
        data: { relationId, tuple }
      });
    }
  }

  /**
   * Ensures a type exists in the types map
   */
  private ensureTypeExists(typeName: string): void {
    if (!this.types.has(typeName)) {
      const type: IType = {
        id: typeName,
        types: [typeName, 'PyretObject'], // All types inherit from PyretObject
        atoms: [],
        isBuiltin: this.isBuiltinType(typeName)
      };
      this.types.set(typeName, type);
    }
  }

  /**
   * Initializes common builtin types
   */
  private initializeBuiltinTypes(): void {
    const builtinTypes = ['Number', 'String', 'Boolean', 'PyretObject'];
    
    builtinTypes.forEach(typeName => {
      const type: IType = {
        id: typeName,
        types: typeName === 'PyretObject' ?  ['PyretObject'] : [typeName, 'PyretObject'], // All types inherit from PyretObject
        atoms: [],
        isBuiltin: true
      };
      this.types.set(typeName, type);
    });
  }

  /**
   * Checks if a type is a builtin type
   */
  private isBuiltinType(typeName: string): boolean {
    return ['Number', 'String', 'Boolean', 'PyretObject'].includes(typeName);
  }

  /**
   * Type guard for atomic values
   */
  private isAtomicValue(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || 
           typeof value === 'number' || 
           typeof value === 'boolean';
  }

  /**
   * Type guard for Pyret objects
   */
  private isPyretObject(obj: unknown): obj is PyretObject {
    return typeof obj === 'object' && 
           obj !== null && 
           ('dict' in obj || 'brands' in obj || '$name' in obj);
  }

  /**
   * Generates a unique atom ID
   */
  private generateAtomId(type?: string): string {
    const prefix = type ? type.toLowerCase().substring(0, 3) : 'atom';
    return `${prefix}_${++this.atomCounter}`;
  }

  // IDataInstance implementation

  getAtoms(): readonly IAtom[] {
    return Array.from(this.atoms.values());
  }

  getRelations(): readonly IRelation[] {
    
    const values = this.relations.values();
    return Array.from(values);
    
    //return Array.from(this.relations.values());

  }

  getTypes(): readonly IType[] {
    // Update type atoms based on current atoms
    this.types.forEach(type => {
      type.atoms = this.getAtoms().filter(atom => atom.type === type.id);
    });
    
    return Array.from(this.types.values());
  }

  getAtomType(atomId: string): IType {
    const atom = this.atoms.get(atomId);
    if (!atom) {
      throw new Error(`Atom with id '${atomId}' not found`);
    }
    
    const type = this.types.get(atom.type);
    if (!type) {
      // Create the type on demand if it doesn't exist
      this.ensureTypeExists(atom.type);
      return this.types.get(atom.type)!;
    }
    
    return type;
  }

  generateGraph(hideDisconnected = false, hideDisconnectedBuiltIns = false): Graph {
    const graph = new Graph({ directed: true, multigraph: true });
    
    // Add all atoms as nodes
    this.getAtoms().forEach(atom => {
      graph.setNode(atom.id, {
        label: atom.label
      });
    });
    
    // Add all relation tuples as edges
    this.getRelations().forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length >= 2) {
          const sourceId = tuple.atoms[0];
          const targetId = tuple.atoms[tuple.atoms.length - 1];
          
          // Include middle atoms in edge label if present
          const middleAtoms = tuple.atoms.slice(1, -1);
          const edgeLabel = middleAtoms.length > 0
            ? `${relation.name}[${middleAtoms.join(', ')}]`
            : relation.name;

            // Generate a unique edge ID
            const edgeId = generateEdgeId(relation, tuple);

          graph.setEdge(sourceId, targetId,  edgeLabel, edgeId );
        }
      });
    });
    
    // Handle disconnected node filtering
    if (hideDisconnected || hideDisconnectedBuiltIns) {
      const nodesToRemove: string[] = [];
      
      graph.nodes().forEach(nodeId => {
        const inEdges = graph.inEdges(nodeId) || [];
        const outEdges = graph.outEdges(nodeId) || [];
        const isDisconnected = inEdges.length === 0 && outEdges.length === 0;
        
        if (isDisconnected) {
          const atom = this.atoms.get(nodeId);
          if (atom) {
            const atomType = this.getAtomType(nodeId);
            const isBuiltin = atomType.isBuiltin;
            
            if (hideDisconnected || (isBuiltin && hideDisconnectedBuiltIns)) {
              nodesToRemove.push(nodeId);
            }
          }
        }
      });
      
      nodesToRemove.forEach(nodeId => graph.removeNode(nodeId));
    }
    
    return graph;
  }

  /**
   * Applies projections to filter the data instance
   */
  applyProjections(atomIds: string[]): PyretDataInstance {
    if (atomIds.length === 0) {
      return this;
    }

    // Create a new instance with filtered data
    const projected = Object.create(PyretDataInstance.prototype) as PyretDataInstance;
    projected.atoms = new Map([...this.atoms].filter(([id]) => atomIds.includes(id)));
    projected.relations = new Map();
    projected.types = new Map();
    projected.atomCounter = projected.atoms.size;

    // Filter relations to only include tuples where all atoms are in the projection
    this.relations.forEach((relation, name) => {
      const filteredTuples = relation.tuples.filter(tuple =>
        tuple.atoms.every(atomId => atomIds.includes(atomId))
      );
      if (filteredTuples.length > 0) {
        projected.relations.set(name, {
          ...relation,
          tuples: filteredTuples
        });
      }
    });

    // Filter types to only include atoms in the projection
    this.types.forEach((type, typeName) => {
      const filteredAtoms = type.atoms.filter(atom => atomIds.includes(atom.id));
      if (filteredAtoms.length > 0) {
        projected.types.set(typeName, {
          ...type,
          atoms: filteredAtoms
        });
      }
    });

    return projected;
  }

  /**
   * Gets target atom IDs for a specific relation from a source atom
   * 
   * @param sourceAtomId - The source atom ID
   * @param relationName - The relation name
   * @returns Array of target atom IDs
   */
  private getRelationTargets(sourceAtomId: string, relationName: string): string[] {
    const targets: string[] = [];
    
    this.relations.forEach(relation => {
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
}

/**
 * Type definitions for Pyret runtime objects
 */
export interface PyretObject {
  dict?: Record<string, unknown>;
  brands?: Record<string, boolean>;
  $name?: string;
  $loc?: unknown[];
  $mut_fields_mask?: unknown[];
  $arity?: number;
  $constructor?: unknown;
  [key: string]: unknown;
}

/**
 * Factory function to create PyretDataInstance from JSON string
 * 
 * @param jsonString - JSON representation of a Pyret object
 * @returns New PyretDataInstance
 * 
 * @example
 * ```typescript
 * const jsonData = '{"dict": {"value": 42}, "brands": {"$brandleaf": true}}';
 * const instance = createPyretDataInstance(jsonData);
 * ```
 */
export const createPyretDataInstance = (jsonString: string): PyretDataInstance => {
  try {
    const pyretData = JSON.parse(jsonString) as PyretObject;
    return new PyretDataInstance(pyretData);
  } catch (error) {
    throw new Error(`Failed to parse Pyret JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Type guard to check if an IInputDataInstance is a PyretDataInstance
 * 
 * @param instance - IInputDataInstance to check
 * @returns True if the instance is a PyretDataInstance
 */
export const isPyretDataInstance = (instance: IInputDataInstance): instance is PyretDataInstance => {
  return instance instanceof PyretDataInstance;
};