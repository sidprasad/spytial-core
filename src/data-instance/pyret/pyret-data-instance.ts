import { Graph } from 'graphlib';
import { IDataInstance, IInputDataInstance, IAtom, IRelation, ITuple, IType, DataInstanceEventType, DataInstanceEventListener, DataInstanceEvent } from '../interfaces';

/**
 * Configuration options for primitive value idempotency in PyretDataInstance
 */
export interface PyretInstanceOptions {
  /** Whether to make string values idempotent (reuse atoms for same string values) */
  stringsIdempotent?: boolean;
  /** Whether to make number values idempotent (reuse atoms for same number values) */
  numbersIdempotent?: boolean;
  /** Whether to make boolean values idempotent (reuse atoms for same boolean values) */
  booleansIdempotent?: boolean;
  /** Whether to include function/method fields in parsing */
  showFunctions?: boolean;
}

/**
 * Result of evaluating a Pyret expression
 */
interface PyretEvaluationResult {
  /** The raw Pyret JS value (if successful) */
  result?: unknown;
  /** Exception information (if failed) */
  exn?: unknown;
  /** Whether the evaluation was successful */
  success?: boolean;
}

/** Global constructor cache entry with pattern and instantiation priority */
interface ConstructorCacheEntry {
  pattern: string[];
  instantiation: number;
}

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
 * - Primitive idempotency is configurable via constructor options
 * 
 * @example
 * ```typescript
 * const pyretData = {
 *   dict: { value: 11, left: {...}, right: {...} },
 *   brands: { "$brandtnode989": true }
 * };
 * 
 * // Create with default options (all primitives idempotent)
 * const instance1 = new PyretDataInstance(pyretData);
 * 
 * // Create with custom idempotency settings
 * const instance2 = new PyretDataInstance(pyretData, {
 *   stringsIdempotent: false,  // Different string instances won't be unified
 *   numbersIdempotent: true,   // Same numbers will be unified
 *   booleansIdempotent: true   // Same booleans will be unified
 * });
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

  /** Configuration options for primitive handling */
  private readonly options: Required<PyretInstanceOptions>;

  /** Global map to store constructor patterns and field order for types across all instances */
  private static globalConstructorCache = new Map<string, ConstructorCacheEntry>();

  /** Global counter for instantiation priority - higher numbers mean newer/higher priority */
  private static instantiationCounter = 0;

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
   * @param options - Configuration options for primitive handling and other behaviors
   * @param externalEvaluator - Optional external Pyret evaluator for enhanced features
   */
  constructor(pyretData?: PyretObject | null, options: PyretInstanceOptions = {}, externalEvaluator?: any) {
    // Set default options with primitives idempotent by default
    this.options = {
      stringsIdempotent: options.stringsIdempotent ?? true,
      numbersIdempotent: options.numbersIdempotent ?? true,
      booleansIdempotent: options.booleansIdempotent ?? true,
      showFunctions: options.showFunctions ?? false,
    };
    
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
   * Get the current primitive idempotency configuration
   */
  getOptions(): Required<PyretInstanceOptions> {
    return { ...this.options };
  }

  /**
   * Cache constructor field order for a type when we successfully parse an original object
   * This now uses a global cache with instantiation-based priority where newer patterns
   * can override older ones for the same constructor name
   */
  private cacheConstructorPattern(typeName: string, fieldOrder: string[]): void {
    if (fieldOrder.length === 0) return;

    const currentEntry = PyretDataInstance.globalConstructorCache.get(typeName);
    const newInstantiation = ++PyretDataInstance.instantiationCounter;

    // Always cache if no entry exists, or if we want to allow newer patterns to override
    // For now, we always update to give priority to newer constructor patterns
    if (!currentEntry || newInstantiation > currentEntry.instantiation) {
      PyretDataInstance.globalConstructorCache.set(typeName, {
        pattern: [...fieldOrder],
        instantiation: newInstantiation
      });
    }
  }

  /**
   * Get cached constructor pattern for a type from the global cache
   */
  private getCachedConstructorPattern(typeName: string): string[] | null {
    const entry = PyretDataInstance.globalConstructorCache.get(typeName);
    return entry ? entry.pattern : null;
  }

  /**
   * Get the global constructor cache (for debugging or advanced use cases)
   * Returns a map of type names to their patterns
   */
  static getGlobalConstructorCache(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [typeName, entry] of PyretDataInstance.globalConstructorCache) {
      result.set(typeName, [...entry.pattern]);
    }
    return result;
  }

  /**
   * Get the global constructor cache with instantiation info (for debugging)
   * Returns the raw cache with instantiation numbers
   */
  static getGlobalConstructorCacheWithPriority(): Map<string, ConstructorCacheEntry> {
    return new Map(PyretDataInstance.globalConstructorCache);
  }

  /**
   * Clear the global constructor cache (for testing or reset scenarios)
   */
  static clearGlobalConstructorCache(): void {
    PyretDataInstance.globalConstructorCache.clear();
  }

  /**
   * Creates a PyretDataInstance from a Pyret expression.
   * 
   * @param expr - The Pyret expression to evaluate.
   * @param options - Configuration options for primitive handling and other behaviors
   * @param externalEvaluator - External Pyret evaluator with a `run` method for enhanced features.
   * @returns A new PyretDataInstance created from the evaluated expression.
   * @throws {Error} If the expression cannot be evaluated or parsed.
   */
  static async fromExpression(
    expr: string, 
    options: PyretInstanceOptions = {},
    externalEvaluator: { run: (code: string) => Promise<unknown> }
  ): Promise<PyretDataInstance> {
    // Evaluate the expression using the external evaluator
    const evaluationResult = await PyretDataInstance.evaluateExpression(expr, externalEvaluator);

    if (!evaluationResult.success) {
      throw new Error(`Failed to evaluate Pyret expression: ${PyretDataInstance.formatError(evaluationResult.exn)}`);
    }

    // Check if the result is a primitive value
    if (PyretDataInstance.isPrimitive(evaluationResult.result)) {
      // Create a new instance and add the primitive as an atom
      const instance = new PyretDataInstance(null, options, externalEvaluator);
      
      const atomType = typeof evaluationResult.result === 'string' ? 'String' :
                       typeof evaluationResult.result === 'number' ? 'Number' : 'Boolean';
      
      const primitiveAtom = {
        id: `result_${evaluationResult.result}`,
        label: String(evaluationResult.result),
        type: atomType
      };
      
      instance.addAtom(primitiveAtom);
      return instance;
    }

    // For complex objects, create a PyretDataInstance directly from the result
    return new PyretDataInstance(evaluationResult.result as PyretObject, options, externalEvaluator);
  }

  /**
   * Evaluates a Pyret expression using an external evaluator
   * 
   * @param expr - The Pyret expression to evaluate
   * @param externalEvaluator - External Pyret evaluator with a `run` method
   * @returns Promise resolving to evaluation result
   */
  private static async evaluateExpression(
    expr: string,
    externalEvaluator: { run: (code: string) => Promise<unknown> }
  ): Promise<PyretEvaluationResult> {
    try {
      const result = await externalEvaluator.run(expr);

      // Step 1: Look for "exn" key at any level - if found, it's a failure
      const exnValue = PyretDataInstance.findKeyAtAnyLevel(result, 'exn');
      if (exnValue !== undefined) {
        return {
          success: false,
          exn: exnValue,
        };
      }
      
      // Step 2: Look for "answer" key at any level - if found, process it
      const answerValue = PyretDataInstance.findKeyAtAnyLevel(result, 'answer');
      if (answerValue !== undefined) {
        return {
          success: true,
          result: answerValue,
        };
      }

      // Step 3: Check if the result is a primitive value directly
      if (PyretDataInstance.isPrimitive(result)) {
        return {
          success: true,
          result: result,
        };
      }

      // If we can't find an answer or exn, return failure
      return {
        success: false,
        exn: 'Unable to find answer or exn in evaluation result',
      };
      
    } catch (error) {
      return {
        success: false,
        exn: error instanceof Error ? error.message : 'Unknown evaluation error',
      };
    }
  }

  /**
   * Recursively searches for a key at any level in an object
   */
  private static findKeyAtAnyLevel(obj: unknown, keyName: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }
    
    // Check if this object has the key directly
    if (keyName in (obj as Record<string, unknown>)) {
      return (obj as Record<string, unknown>)[keyName];
    }
    
    // Recursively search in nested objects and arrays
    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        const found = PyretDataInstance.findKeyAtAnyLevel(value, keyName);
        if (found !== undefined) {
          return found;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Checks if a value is a primitive type (string, number, boolean)
   */
  private static isPrimitive(value: unknown): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }

  /**
   * Format Pyret evaluation errors for display
   */
  private static formatError(error: any): string {
    if (!error) {
      return 'Unknown error';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      // Try to extract useful error information from Pyret error objects
      const errorObj = error;

      if (errorObj.message) {
        return errorObj.message;
      }

      if (errorObj.toString && typeof errorObj.toString === 'function') {
        return errorObj.toString();
      }
    }

    return String(error);
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


    // TODO: This is still broken. Need to understand what is going on here!!

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
            !this.options.showFunctions &&
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
          } else if (Array.isArray(fieldValue)) {
            // Handle arrays: create atoms/relations for each element
            this.processArrayField(atomId, relationName, fieldValue, processingQueue);
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
   * Processes an array field value by creating relations for each element
   * Handles both arrays of primitives and arrays of objects/nested arrays
   * 
   * @param parentAtomId - The parent atom ID
   * @param relationName - The name of the relation
   * @param arrayValue - The array to process
   * @param processingQueue - The queue for objects that need further processing
   */
  private processArrayField(
    parentAtomId: string,
    relationName: string,
    arrayValue: unknown[],
    processingQueue: Array<{ obj: PyretObject; parentInfo?: { parentId: string; relationName: string } }>
  ): void {
    arrayValue.forEach((element, index) => {
      if (this.isAtomicValue(element)) {
        // Create an atom for the primitive value
        const elementAtomId = this.createAtomFromPrimitive(element);
        // Create a relation tuple from parent to this element
        this.addRelationTuple(
          relationName,
          { atoms: [parentAtomId, elementAtomId], types: ['PyretObject', 'PyretObject'] }
        );
      } else if (Array.isArray(element)) {
        // Nested array: create an intermediate atom to represent the array
        const arrayAtomId = this.generateAtomId('Array');
        const arrayAtom: IAtom = {
          id: arrayAtomId,
          type: 'Array',
          label: `Array[${index}]`
        };
        this.atoms.set(arrayAtomId, arrayAtom);
        this.ensureTypeExists('Array');
        
        // Create relation from parent to this array
        this.addRelationTuple(
          relationName,
          { atoms: [parentAtomId, arrayAtomId], types: ['PyretObject', 'PyretObject'] }
        );
        
        // Recursively process the nested array elements
        this.processArrayField(arrayAtomId, 'element', element, processingQueue);
      } else if (this.isPyretObject(element)) {
        // Pyret object in array: add to processing queue
        processingQueue.push({
          obj: element,
          parentInfo: { parentId: parentAtomId, relationName }
        });
      }
    });
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
   * Creates an atom from a primitive value, optionally reusing existing atoms based on configuration
   */
  private createAtomFromPrimitive(value: string | number | boolean | { n: number; d: number }): string {
    // Handle rational numbers
    let actualValue: string | number | boolean;
    if (this.isRationalNumber(value)) {
      actualValue = this.rationalToDecimal(value);
    } else {
      actualValue = value;
    }

    const type = this.mapPrimitiveType(actualValue);
    const label = String(actualValue);

    // Check idempotency settings for this type
    const shouldReuse = (type === 'String' && this.options.stringsIdempotent) ||
                       (type === 'Number' && this.options.numbersIdempotent) ||
                       (type === 'Boolean' && this.options.booleansIdempotent);

    if (shouldReuse) {
      // Check if we already have an atom for this value
      const existingAtom = Array.from(this.atoms.values())
        .find(atom => atom.label === label && atom.type === type);

      if (existingAtom) {
        return existingAtom.id;
      }
    }

    // Create a new atom
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
        types: typeName === 'PyretObject' ? ['PyretObject'] : [typeName, 'PyretObject'], // All types inherit from PyretObject
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
   * Type guard for Pyret rational number objects
   * Pyret represents rational numbers as objects with 'n' (numerator) and 'd' (denominator) properties
   */
  private isRationalNumber(value: unknown): value is { n: number; d: number } {
    return typeof value === 'object' &&
      value !== null &&
      'n' in value &&
      'd' in value &&
      typeof (value as { n: unknown }).n === 'number' &&
      typeof (value as { d: unknown }).d === 'number';
  }

  /**
   * Converts a Pyret rational number object to a decimal number
   */
  private rationalToDecimal(rational: { n: number; d: number }): number {
    return rational.n / rational.d;
  }

  /**
   * Type guard for atomic values
   * Now includes Pyret rational numbers
   */
  private isAtomicValue(value: unknown): value is string | number | boolean | { n: number; d: number } {
    return typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      this.isRationalNumber(value);
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

  /**
   * Generates a graphlib Graph representation of this data instance.
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
          
          // Create edge label that includes middle atom labels for higher-arity relations
          const middleAtoms = tuple.atoms.slice(1, -1);
          let edgeLabel = relation.name;
          
          if (middleAtoms.length > 0) {
            // Get labels for middle atoms instead of using IDs
            const middleLabels = middleAtoms.map(atomId => {
              const atom = this.atoms.get(atomId);
              return atom ? atom.label : atomId; // Fallback to ID if atom not found
            });
            edgeLabel = `${relation.name}[${middleLabels.join(', ')}]`;
          }

          // Generate a unique edge ID
          const edgeId = generateEdgeId(relation, tuple);
          
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


  /**
   * Adds a PyretDataInstance to this instance, optionally unifying built-in types
   * 
   * @param dataInstance - The PyretDataInstance to add
   * @param unifyBuiltIns - Whether to unify built-in atoms
   * @returns True if the instance was added successfully, false otherwise
   */
  addFromDataInstance(dataInstance: IDataInstance, unifyBuiltIns: boolean): boolean {
    // Must be a PyretDataInstance
    if (!(dataInstance instanceof PyretDataInstance)) {
      return false;
    }

    const pyretInstance = dataInstance as PyretDataInstance;
    const reIdMap = new Map<string, string>();

    // Add atoms
    pyretInstance.getAtoms().forEach(atom => {
      const isBuiltin = this.isBuiltinType(atom.type);

      if (unifyBuiltIns && isBuiltin) {
        // Use this instance's idempotency settings to decide whether to unify
        const shouldUnify = (atom.type === 'String' && this.options.stringsIdempotent) ||
                           (atom.type === 'Number' && this.options.numbersIdempotent) ||
                           (atom.type === 'Boolean' && this.options.booleansIdempotent);

        if (shouldUnify) {
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
      }

      // Generate a new ID for the atom to avoid conflicts
      const newId = this.generateAtomId(atom.type);
      reIdMap.set(atom.id, newId);

      // Add the atom with the new ID
      const newAtom: IAtom = { ...atom, id: newId };
      this.addAtom(newAtom);

      // Preserve the original object mapping
      const originalObject = pyretInstance.originalObjects.get(atom.id);
      if (originalObject) {
        this.originalObjects.set(newId, originalObject);
      }
    });

    // Add types
    pyretInstance.getTypes().forEach(type => {
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
    pyretInstance.getRelations().forEach(relation => {
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
 * @param options - Configuration options for primitive handling and other behaviors
 * @returns New PyretDataInstance
 * 
 * @example
 * ```typescript
 * const jsonData = '{"dict": {"value": 42}, "brands": {"$brandleaf": true}}';
 * const instance = createPyretDataInstance(jsonData, { stringsIdempotent: false });
 * ```
 */
export const createPyretDataInstance = (
  jsonString: string, 
  options: PyretInstanceOptions = {}
): PyretDataInstance => {
  try {
    const pyretData = JSON.parse(jsonString) as PyretObject;
    return new PyretDataInstance(pyretData, options);
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