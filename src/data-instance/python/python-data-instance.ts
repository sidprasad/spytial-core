import { Graph } from 'graphlib';
import { IDataInstance, IInputDataInstance, IAtom, IRelation, ITuple, IType, DataInstanceEventType, DataInstanceEventListener, DataInstanceEvent } from '../interfaces';

/**
 * Result of evaluating a Python expression
 */
interface PythonEvaluationResult {
  /** The raw Python value (if successful) */
  result?: unknown;
  /** Exception information (if failed) */
  error?: unknown;
  /** Whether the evaluation was successful */
  success?: boolean;
}

/**
 * Python data instance implementation for parsing Python runtime objects
 * 
 * Handles Python's object representation where:
 * - Objects have attributes accessible via __dict__
 * - Objects have types accessible via __class__.__name__
 * - All attributes are treated as relations
 * - Cycles are handled gracefully without infinite recursion
 * 
 * @example
 * ```typescript
 * const pythonData = {
 *   value: 11,
 *   left: {...},
 *   right: {...},
 *   __class__: { __name__: "TreeNode" }
 * };
 * const instance = new PythonDataInstance(pythonData);
 * ```
 */
export class PythonDataInstance implements IInputDataInstance {

  private atoms = new Map<string, IAtom>();
  private relations = new Map<string, IRelation>();
  private types = new Map<string, IType>();
  private objectToAtomId = new WeakMap<object, string>();
  private atomCounter = 0;

  /** Map to keep track of label counts per type */
  private typeLabelCounters = new Map<string, number>();

  /** Map to store the original Python objects with their attribute order */
  private originalObjects = new Map<string, PythonObject>();

  /** Event listeners for data instance changes */
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  private readonly showPrivateAttributes: boolean;

  /** Optional external Python evaluator for enhanced features */
  private externalEvaluator: any | null = null;

  /**
   * Creates a PythonDataInstance from a Python runtime object
   * 
   * @param pythonData - The root Python object to parse, or null/undefined for an empty instance
   * @param showPrivateAttributes - Whether to include private/dunder attributes in parsing
   * @param externalEvaluator - Optional external Python evaluator for enhanced features
   */
  constructor(pythonData?: PythonObject | null, showPrivateAttributes = false, externalEvaluator?: any) {
    this.showPrivateAttributes = showPrivateAttributes;
    this.externalEvaluator = externalEvaluator || null;
    this.initializeBuiltinTypes();
    if (pythonData) {
      this.parseObjectIteratively(pythonData);
    }
  }

  /**
   * Set an external Python evaluator for enhanced features
   * @param evaluator - External Python evaluator (e.g., pyodide instance)
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
   * Creates a PythonDataInstance from a Python expression.
   * 
   * @param expr - The Python expression to evaluate.
   * @param showPrivateAttributes - Whether to include private/dunder attributes in parsing.
   * @param externalEvaluator - External Python evaluator with a `runPython` method for enhanced features.
   * @returns A new PythonDataInstance created from the evaluated expression.
   * @throws {Error} If the expression cannot be evaluated or parsed.
   */
  static async fromExpression(
    expr: string, 
    showPrivateAttributes = false, 
    externalEvaluator: { runPython: (code: string) => Promise<unknown> }
  ): Promise<PythonDataInstance> {
    // Evaluate the expression using the external evaluator
    const evaluationResult = await PythonDataInstance.evaluateExpression(expr, externalEvaluator);

    if (!evaluationResult.success) {
      throw new Error(`Failed to evaluate Python expression: ${PythonDataInstance.formatError(evaluationResult.error)}`);
    }

    // Check if the result is a primitive value
    if (PythonDataInstance.isPrimitive(evaluationResult.result)) {
      // Create a new instance and add the primitive as an atom
      const instance = new PythonDataInstance(null, showPrivateAttributes, externalEvaluator);
      
      const atomType = typeof evaluationResult.result === 'string' ? 'str' :
                       typeof evaluationResult.result === 'number' ? 'int' : 'bool';
      
      const primitiveAtom = {
        id: `result_${evaluationResult.result}`,
        label: String(evaluationResult.result),
        type: atomType
      };
      
      instance.addAtom(primitiveAtom);
      return instance;
    }

    // For complex objects, create a PythonDataInstance directly from the result
    return new PythonDataInstance(evaluationResult.result as PythonObject, showPrivateAttributes, externalEvaluator);
  }

  /**
   * Evaluates a Python expression using an external evaluator
   * 
   * @param expr - The Python expression to evaluate
   * @param externalEvaluator - External Python evaluator with a `runPython` method
   * @returns Promise resolving to evaluation result
   */
  private static async evaluateExpression(
    expr: string,
    externalEvaluator: { runPython: (code: string) => Promise<unknown> }
  ): Promise<PythonEvaluationResult> {
    try {
      const result = await externalEvaluator.runPython(expr);
      
      return {
        success: true,
        result: result,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown evaluation error',
      };
    }
  }

  /**
   * Checks if a value is a primitive type (string, number, boolean)
   */
  private static isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  /**
   * Format Python evaluation errors for display
   */
  private static formatError(error: any): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      if (error.message) {
        return error.message;
      }

      if (error.toString && typeof error.toString === 'function') {
        return error.toString();
      }
    }

    return String(error);
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
   * Converts the current data instance back to Python constructor notation
   * 
   * @returns A string representation of the data in Python syntax
   * 
   * @example
   * ```typescript
   * const pythonCode = instance.reify();
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
      return result + "# No root atoms found";
    }

    // If multiple roots, wrap in a Python list
    if (rootAtoms.length > 1) {
      const rootExpressions = rootAtoms.map(atom => this.reifyAtom(atom.id, new Set()));
      return result + `[${rootExpressions.join(', ')}]`;
    }

    // If only one root atom, reify it directly
    return result + this.reifyAtom(rootAtoms[0].id, new Set());
  }

  /**
   * Recursively reifies a single atom and its relations
   * 
   * @param atomId - The atom ID to reify
   * @param visited - Set of visited atom IDs to prevent infinite recursion
   * @returns Python syntax for this atom
   */
  private reifyAtom(atomId: string, visited: Set<string>): string {
    if (visited.has(atomId)) {
      return `# cycle: ${atomId}`;
    }

    const atom = this.atoms.get(atomId);
    if (!atom) {
      return `# missing atom: ${atomId}`;
    }

    visited.add(atomId);

    // Handle primitive types
    if (this.isBuiltinType(atom.type)) {
      const result = this.reifyPrimitive(atom);
      visited.delete(atomId);
      return result;
    }

    // Get the original object to preserve attribute order
    const originalObject = this.originalObjects.get(atomId);

    if (!originalObject) {
      // No original object available - try to reconstruct from relations
      visited.delete(atomId);
      return this.tryReconstructFromRelations(atom, visited);
    }

    // Use object attributes to build constructor call
    const args: string[] = [];
    
    // Get all relations where this atom is the source
    this.relations.forEach(relation => {
      relation.tuples.forEach(tuple => {
        if (tuple.atoms.length >= 2 && tuple.atoms[0] === atomId) {
          const targetId = tuple.atoms[1];
          const relationName = relation.name;
          args.push(`${relationName}=${this.reifyAtom(targetId, visited)}`);
        }
      });
    });

    visited.delete(atomId);

    if (args.length === 0) {
      return `${atom.type}()`;
    }

    return `${atom.type}(${args.join(', ')})`;
  }

  /**
   * Try to rebuild constructor arguments from relations
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
          relationMap.get(relationName)!.push(...tuple.atoms.slice(1));
        }
      });
    });

    if (relationMap.size === 0) {
      return `${atom.type}()`; // No relations, just return the type name with empty constructor
    }

    const args: string[] = [];
    relationMap.forEach((targetIds, relationName) => {
      for (const targetId of targetIds) {
        args.push(`${relationName}=${this.reifyAtom(targetId, visited)}`);
      }
    });

    return `${atom.type}(${args.join(', ')})`;
  }

  /**
   * Reifies primitive values with appropriate Python syntax
   */
  private reifyPrimitive(atom: IAtom): string {
    switch (atom.type) {
      case 'str':
        return `"${atom.label.replace(/"/g, '\\"')}"`;
      case 'int':
      case 'float':
        return atom.label;
      case 'bool':
        return atom.label === 'true' || atom.label === 'True' ? 'True' : 'False';
      default:
        return atom.label;
    }
  }

  /**
   * Parses Python objects iteratively to avoid stack overflow and handle cycles
   */
  private parseObjectIteratively(rootObject: PythonObject): void {
    const processingQueue: Array<{ obj: PythonObject; parentInfo?: { parentId: string; relationName: string } }> = [
      { obj: rootObject }
    ];

    while (processingQueue.length > 0) {
      const { obj, parentInfo } = processingQueue.shift()!;

      // Skip if we've already processed this object (cycle detection)
      if (this.objectToAtomId.has(obj)) {
        if (parentInfo) {
          const existingAtomId = this.objectToAtomId.get(obj)!;
          this.addRelationTuple(
            parentInfo.relationName,
            { atoms: [parentInfo.parentId, existingAtomId], types: ['PythonObject', 'PythonObject'] }
          );
        }
        continue;
      }

      const atomId = this.createAtomFromObject(obj);

      // Store the original object
      this.originalObjects.set(atomId, obj);

      // Add relation from parent if this is not the root object
      if (parentInfo) {
        this.addRelationTuple(
          parentInfo.relationName,
          { atoms: [parentInfo.parentId, atomId], types: ['PythonObject', 'PythonObject'] }
        );
      }

      // Process all object attributes as relations
      Object.entries(obj).forEach(([attributeName, attributeValue]) => {
        // Skip private attributes unless explicitly enabled
        if (!this.showPrivateAttributes && attributeName.startsWith('_')) {
          return;
        }

        // Skip special Python attributes
        if (attributeName === '__class__' || attributeName === '__dict__') {
          return;
        }

        if (this.isAtomicValue(attributeValue)) {
          const valueAtomId = this.createAtomFromPrimitive(attributeValue);
          this.addRelationTuple(
            attributeName,
            { atoms: [atomId, valueAtomId], types: ['PythonObject', 'PythonObject'] }
          );
        } else if (this.isPythonObject(attributeValue)) {
          processingQueue.push({
            obj: attributeValue,
            parentInfo: { parentId: atomId, relationName: attributeName }
          });
        }
      });
    }
  }

  /**
   * Creates an atom from a Python object and stores the mapping
   */
  private createAtomFromObject(obj: PythonObject): string {
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
   * Maps JavaScript primitive types to Python-appropriate type names
   */
  private mapPrimitiveType(value: string | number | boolean): string {
    switch (typeof value) {
      case 'number': 
        return Number.isInteger(value) ? 'int' : 'float';
      case 'string': 
        return 'str';
      case 'boolean': 
        return 'bool';
      default: 
        return 'object';
    }
  }

  /**
   * Extracts the type name from a Python object
   */
  private extractType(obj: PythonObject): string {
    // Check for explicit __class__.__name__ first
    if (obj.__class__ && obj.__class__.__name__) {
      return obj.__class__.__name__;
    }

    return 'object';
  }

  /**
   * Extracts a display label from a Python object, using a per-type counter.
   * Labels will be of the form Type_<num>
   */
  private extractLabel(obj: PythonObject): string {
    const type = this.extractType(obj);

    // Increment the counter for this type
    const current = this.typeLabelCounters.get(type) ?? 0;
    const next = current + 1;
    this.typeLabelCounters.set(type, next);

    return `${type}_${next}`;
  }

  /**
   * Adds a tuple to a relation, creating the relation if it doesn't exist
   */
  addRelationTuple(relationId: string, tuple: ITuple): void {
    const sourceId = tuple.atoms[0];
    const targetId = tuple.atoms[tuple.atoms.length - 1];

    const sourceAtom = this.atoms.get(sourceId);
    const targetAtom = this.atoms.get(targetId);

    if (!sourceAtom || !targetAtom) {
      console.warn(`Cannot create relation ${relationId}: missing atoms ${sourceId} or ${targetId}`);
      return;
    }

    let relation = this.relations.get(relationId);
    if (!relation) {
      relation = {
        id: relationId,
        name: relationId,
        types: [sourceAtom.type, targetAtom.type],
        tuples: []
      };
      this.relations.set(relationId, relation);
    }

    // Check for duplicate tuples
    const isDuplicate = relation.tuples.some(t =>
      t.atoms.length === tuple.atoms.length &&
      t.atoms.every((atomId, index) => atomId === tuple.atoms[index])
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
        types: [typeName, 'object'], // All types inherit from object
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
    const builtinTypes = ['int', 'float', 'str', 'bool', 'object'];

    builtinTypes.forEach(typeName => {
      const type: IType = {
        id: typeName,
        types: typeName === 'object' ? ['object'] : [typeName, 'object'],
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
    return ['int', 'float', 'str', 'bool', 'object'].includes(typeName);
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
   * Type guard for Python objects
   */
  private isPythonObject(obj: unknown): obj is PythonObject {
    return typeof obj === 'object' &&
      obj !== null &&
      !Array.isArray(obj);
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
    return Array.from(this.relations.values());
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
          const edgeId = `${relation.id}:${tuple.atoms.join('->')}`;

          graph.setEdge(sourceId, targetId, edgeLabel, edgeId);
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
  applyProjections(atomIds: string[]): PythonDataInstance {
    if (atomIds.length === 0) {
      return this;
    }

    // Create a new instance with filtered data
    const projected = Object.create(PythonDataInstance.prototype) as PythonDataInstance;
    projected.atoms = new Map(Array.from(this.atoms).filter(([id]) => atomIds.includes(id)));
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
   * Adds a PythonDataInstance to this instance, optionally unifying built-in types
   * 
   * @param dataInstance - The PythonDataInstance to add
   * @param unifyBuiltIns - Whether to unify built-in atoms
   * @returns True if the instance was added successfully, false otherwise
   */
  addFromDataInstance(dataInstance: IDataInstance, unifyBuiltIns: boolean): boolean {
    // Must be a PythonDataInstance
    if (!(dataInstance instanceof PythonDataInstance)) {
      return false;
    }

    const pythonInstance = dataInstance as PythonDataInstance;
    const reIdMap = new Map<string, string>();

    // Add atoms
    pythonInstance.getAtoms().forEach(atom => {
      const isBuiltin = this.isBuiltinType(atom.type);

      if (unifyBuiltIns && isBuiltin) {
        // Check if the built-in atom already exists
        const existingAtom = Array.from(this.atoms.values()).find(
          existing => existing.type === atom.type && existing.label === atom.label
        );

        if (existingAtom) {
          // Map the original atom ID to the existing atom ID
          reIdMap.set(atom.id, existingAtom.id);
          return; // Skip adding this atom
        }
      }

      // Generate a new ID for the atom to avoid conflicts
      const newId = this.generateAtomId(atom.type);
      reIdMap.set(atom.id, newId);

      // Add the atom with the new ID
      const newAtom: IAtom = { ...atom, id: newId };
      this.addAtom(newAtom);

      // Preserve the original object mapping
      const originalObject = pythonInstance.originalObjects.get(atom.id);
      if (originalObject) {
        this.originalObjects.set(newId, originalObject);
      }
    });

    // Add types
    pythonInstance.getTypes().forEach(type => {
      if (!this.types.has(type.id)) {
        // Add the type if it doesn't exist
        this.types.set(type.id, {
          ...type,
          atoms: type.atoms.map(atom => ({
            ...atom,
            id: reIdMap.get(atom.id) || atom.id,
          })),
        });
      } else {
        // Merge atoms into the existing type
        const existingType = this.types.get(type.id)!;
        const newAtoms = type.atoms.map(atom => ({
          ...atom,
          id: reIdMap.get(atom.id) || atom.id,
        }));
        existingType.atoms.push(...newAtoms);
      }
    });

    // Add relations
    pythonInstance.getRelations().forEach(relation => {
      const newTuples: ITuple[] = relation.tuples.map(tuple => ({
        atoms: tuple.atoms.map(atomId => reIdMap.get(atomId) || atomId),
        types: tuple.types,
      }));

      const existingRelation = this.relations.get(relation.id);
      if (existingRelation) {
        // Merge tuples into the existing relation
        existingRelation.tuples.push(...newTuples);
      } else {
        // Add a new relation
        this.relations.set(relation.id, {
          ...relation,
          tuples: newTuples,
        });
      }
    });

    return true;
  }
}

/**
 * Type definitions for Python runtime objects
 */
export interface PythonObject {
  [key: string]: unknown;
  __class__?: {
    __name__?: string;
  };
  __dict__?: Record<string, unknown>;
}

/**
 * Factory function to create PythonDataInstance from JSON string
 * 
 * @param jsonString - JSON representation of a Python object
 * @returns New PythonDataInstance
 * 
 * @example
 * ```typescript
 * const jsonData = '{"value": 42, "__class__": {"__name__": "TreeNode"}}';
 * const instance = createPythonDataInstance(jsonData);
 * ```
 */
export const createPythonDataInstance = (jsonString: string): PythonDataInstance => {
  try {
    const pythonData = JSON.parse(jsonString) as PythonObject;
    return new PythonDataInstance(pythonData);
  } catch (error) {
    throw new Error(`Failed to parse Python JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Type guard to check if an IInputDataInstance is a PythonDataInstance
 * 
 * @param instance - IInputDataInstance to check
 * @returns True if the instance is a PythonDataInstance
 */
export const isPythonDataInstance = (instance: IInputDataInstance): instance is PythonDataInstance => {
  return instance instanceof PythonDataInstance;
};