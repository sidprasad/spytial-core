import { Graph } from 'graphlib';
import { IDataInstance, IInputDataInstance, IAtom, IRelation, ITuple, IType } from '../interfaces';
import { DataInstanceEventEmitter } from '../data-instance-event-emitter';
import { settleTupleTypes } from '../tuple-types';
import { replit } from './replit';
import { numberPayload, numberSource } from './numbers';
import { isRuntimeNothing, isRuntimeReference, referenceInfo, isCallableField, objectFields, readValueInfo, type PyretValueInfo } from './values';
import { constructorInfo, fieldId, readFieldId } from './identity';
import { assertSameRelationName, relationSignature, tupleKey, uniqueTuples } from '../relation-identity';

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
export interface PyretEvaluationResult {
  /** The raw Pyret JS value (if successful) */
  result?: unknown;
  /** Exception information (if failed) */
  exn?: unknown;
  /** Whether the evaluation was successful */
  success?: boolean;
}

/**
 * An external Pyret evaluator — in practice `window.__internalRepl`, which the
 * Pyret IDE installs.
 *
 * This lived in the REPL's expression parser until that component was removed,
 * but it was never a REPL type: it describes the runtime a `PyretDataInstance`
 * evaluates against, which is why `fromExpression` and `setExternalEvaluator`
 * take one. It sits here now, next to the result type it returns — which this
 * file had already redeclared privately rather than import across that
 * boundary.
 */
export interface PyretEvaluator {
  /**
   * Run a Pyret expression and return the result
   * @param code - Pyret code to evaluate
   * @param sourceLocation - Optional source location identifier
   * @returns Promise that resolves to evaluation result
   */
  run(code: string, sourceLocation?: string): Promise<PyretEvaluationResult>;

  /**
   * Runtime utilities for checking result types
   */
  runtime: {
    isSuccessResult(result: PyretEvaluationResult): boolean;
  };
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
 * - Pyret tables are parsed as semantic relations: each row becomes an n-ary tuple
 * - Non-table arrays are parsed as relations with Array atoms
 * - Nested arrays are supported with intermediate Array atoms
 * - Cycles are handled gracefully without infinite recursion
 * - Primitive idempotency is configurable via constructor options
 * 
 * @example
 * ```typescript
 * // Tree data
 * const pyretData = {
 *   dict: { value: 11, left: {...}, right: {...} },
 *   brands: { "$brandtnode989": true }
 * };
 * const instance1 = new PyretDataInstance(pyretData);
 * 
 * // Table data - creates semantic relational tuples
 * const tableData = {
 *   dict: {
 *     r: {
 *       dict: {
 *         "_header-raw-array": ["origin", "destination"],
 *         "_rows-raw-array": [["PVD", "ORD"], ["ORD", "PVD"]]
 *       },
 *       brands: { "$brandtable168": true }
 *     }
 *   }
 * };
 * const instance2 = new PyretDataInstance(tableData);
 * // Creates relation "row" with tuples: (PVD, ORD), (ORD, PVD)
 * 
 * // Custom idempotency settings
 * const instance3 = new PyretDataInstance(pyretData, {
 *   stringsIdempotent: false,  // Different string instances won't be unified
 *   numbersIdempotent: true,   // Same numbers will be unified
 *   booleansIdempotent: true   // Same booleans will be unified
 * });
 * ```
 */
export class PyretDataInstance extends DataInstanceEventEmitter implements IInputDataInstance {

  private atoms = new Map<string, IAtom>();
  private relations = new Map<string, IRelation>();
  private types = new Map<string, IType>();
  private objectToAtomId = new WeakMap<object, string>();
  private atomCounter = 0;
  /** Opaque relation identities; their names and tuples carry the semantics. */
  private valueRelations = new Map<string, string>();
  private indexAtoms = new Map<number, string>();

  /** Map to keep track of label counts per type */
  private typeLabelCounters = new Map<string, number>();

  /** Map to store the original Pyret objects with their dict key order */
  private originalObjects = new Map<string, PyretObject>();

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
    - Pyret Tables are now parsed as semantic relations (each row becomes an n-ary tuple)
    - Non-table arrays are parsed as structural relations with Array atoms
    - Native Pyret Lists still show as (link (link (link (link )))) etc. and need special handling
  */


  /**
   * Creates a PyretDataInstance from a Pyret runtime object
   * 
   * @param pyretData - The root Pyret object to parse, or null/undefined for an empty instance
   * @param options - Configuration options for primitive handling and other behaviors
   * @param externalEvaluator - Optional external Pyret evaluator for enhanced features
   */
  constructor(pyretData?: PyretObject | unknown[] | number | string | boolean | null, options: PyretInstanceOptions = {}, externalEvaluator?: any) {
    super();
    // Set default options with primitives idempotent by default
    this.options = {
      stringsIdempotent: options.stringsIdempotent ?? true,
      numbersIdempotent: options.numbersIdempotent ?? true,
      booleansIdempotent: options.booleansIdempotent ?? true,
      showFunctions: options.showFunctions ?? false,
    };
    
    this.externalEvaluator = externalEvaluator || null;
    this.initializeBuiltinTypes();
    if (this.isAtomicValue(pyretData)) {
      this.createAtomFromPrimitive(pyretData);
    } else if (pyretData != null) {
      this.parseObjectIteratively(pyretData as PyretObject | unknown[]);
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

  hasExternalEvaluator(): boolean {
    return this.externalEvaluator !== null;
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
   * This is the REPL-equivalent string form: the value is first reconstructed
   * from the relations (`reifyToValue`, which memoizes by atom id so a shared
   * atom becomes one shared object and a cycle becomes a real back-reference),
   * then rendered (`replit`). Supported reference graphs emit bindings and
   * mutable-field updates. The legacy ref-free path repeats shared subtrees
   * and prints a `<cyclic>` marker for synthetic object cycles.
   *
   * @returns A string representation of the data in Pyret constructor syntax
   *
   * @example
   * ```typescript
   * const pyretCode = instance.reify();
   * ```
   */
  reify(): string {
    return replit(this);
  }

  /**
   * Parses Pyret objects iteratively to avoid stack overflow and handle cycles
   */
  private parseObjectIteratively(rootObject: PyretObject | unknown[]): void {
    type Pending = { obj: PyretObject | unknown[]; parentInfo?: { atoms: string[]; relationId: string; relationName?: string } };
    const queue: Pending[] = [{ obj: rootObject }];
    let hasReferences = false;
    const enqueue = (value: unknown, atoms: string[], relationId: string, relationName?: string): void => {
      if (this.isAtomicValue(value)) {
        const target = this.createAtomFromPrimitive(value);
        this.addRelationTuple(relationId, { atoms: [...atoms, target], types: [] }, relationName);
      } else if (Array.isArray(value) || this.isPyretObject(value)) {
        queue.push({ obj: value, parentInfo: { atoms, relationId, relationName } });
      }
    };

    // A queue and WeakMap retain sharing and avoid recursing through live values.
    for (let next = 0; next < queue.length; next++) {
      const { obj, parentInfo } = queue[next];
      let atomId = this.objectToAtomId.get(obj);
      const alreadySeen = atomId !== undefined;
      if (!atomId) atomId = this.createAtomFromObject(obj);
      if (parentInfo) {
        this.addRelationTuple(parentInfo.relationId,
          { atoms: [...parentInfo.atoms, atomId], types: [] }, parentInfo.relationName);
      }
      if (alreadySeen) continue;

      const shape = readValueInfo(this.atoms.get(atomId)!.metadata);
      if (shape?.kind === 'nothing') continue;
      if (shape?.kind === 'reference') {
        hasReferences = true;
        const value = (obj as PyretObject).value;
        if (!this.isAtomicValue(value) && !Array.isArray(value) && !this.isPyretObject(value)) {
          throw new Error('Unsupported Pyret reference target');
        }
        const relationId = this.valueRelationId('reference-target', 'target', ['Reference', 'PyretObject']);
        enqueue(value, [atomId], relationId, 'target');
        continue;
      }
      if (shape?.kind === 'tuple' || shape?.kind === 'raw-array') {
        const values = Array.isArray(obj) ? obj : obj.vals as unknown[];
        for (let index = 0; index < values.length; index++) {
          const relationId = this.valueRelationId('sequence-elements', 'element', ['PyretObject', 'Index', 'PyretObject']);
          enqueue(values[index], [atomId, this.createIndexAtom(index)], relationId, 'element');
        }
        continue;
      }

      const object = obj as PyretObject;
      this.originalObjects.set(atomId, object);
      if (!object.dict || typeof object.dict !== 'object') continue;
      if (this.isPyretTable(object)) {
        this.processTableSemantics(atomId, object);
        continue;
      }
      const info = constructorInfo(object);
      const fields = info?.fields ?? (shape?.kind === 'object' ? shape.fields : Object.keys(object.dict));
      if (!shape) this.cacheConstructorPattern(this.extractType(object), fields);
      fields.forEach((name, position) => {
        const value = object.dict![name];
        if (!this.options.showFunctions && isCallableField(value)) return;
        const relationId = info ? fieldId(info, position)
          : shape?.kind === 'object' ? this.valueRelationId('object-field:' + name, name, ['PyretObject', 'PyretObject']) : name;
        enqueue(value, [atomId], relationId, shape?.kind === 'object' ? name : undefined);
      });
    }
    if (hasReferences) {
      const root = this.atoms.get(this.objectToAtomId.get(rootObject)!)!;
      root.metadata = { ...root.metadata, pyretRoot: { version: 1 } };
    }
  }

  private valueRelationId(key: string, name: string, types: string[]): string {
    let id = this.valueRelations.get(key);
    if (!id) {
      // randomUUID is unavailable on some non-secure browser origins.
      id = globalThis.crypto?.randomUUID?.()
        ?? `relation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${this.valueRelations.size}`;
      this.valueRelations.set(key, id);
      // These relations span containers and heterogeneous values. Declare their
      // common supertype before insertion: settleTupleTypes treats the first
      // inferred signature as a declaration and preserves it on later writes.
      this.relations.set(id, { id, name, types, tuples: [] });
    }
    return id;
  }

  private createIndexAtom(index: number): string {
    const existing = this.indexAtoms.get(index);
    if (existing) return existing;
    const id = this.generateAtomId('Index');
    this.atoms.set(id, { id, type: 'Index', label: String(index), metadata: { pyretIndex: index } });
    this.ensureTypeExists('Index');
    this.indexAtoms.set(index, id);
    return id;
  }

  private valueInfo(obj: PyretObject | unknown[]): PyretValueInfo | undefined {
    if (Array.isArray(obj)) return { version: 1, kind: 'raw-array', length: obj.length };
    if ('$pyretValue' in obj) return readValueInfo({ pyretValue: obj.$pyretValue });
    const ref = referenceInfo(obj);
    if (ref) return ref;
    if (isRuntimeNothing(obj)) return { version: 1, kind: 'nothing' };
    if (Array.isArray(obj.vals)) return { version: 1, kind: 'tuple', length: obj.vals.length };
    if (constructorInfo(obj) || this.isPyretTable(obj)) return undefined;
    if (obj.dict && (typeof obj.updateDict === 'function' || this.extractType(obj) === 'PyretObject')) {
      return { version: 1, kind: 'object', fields: objectFields(obj.dict, this.options.showFunctions) };
    }
    return undefined;
  }

  /**
   * Checks if a Pyret object is a table with semantic data
   */
  private isPyretTable(obj: PyretObject): boolean {
    if (!obj.dict || typeof obj.dict !== 'object') {
      return false;
    }
    
    // Check if it has the table brand
    if (obj.brands && typeof obj.brands === 'object') {
      const hasBrandTable = Object.keys(obj.brands).some(key => key.includes('brandtable'));
      if (!hasBrandTable) {
        return false;
      }
    }
    
    // Check if it has _header-raw-array and _rows-raw-array
    return '_header-raw-array' in obj.dict && '_rows-raw-array' in obj.dict;
  }

  /**
   * Processes a Pyret table to create semantic relational tuples
   * Each row becomes a tuple in a relation
   */
  private processTableSemantics(tableAtomId: string, tableObj: PyretObject): void {
    const dict = tableObj.dict as Record<string, unknown>;
    const headerArray = dict['_header-raw-array'] as unknown[];
    const rowsArray = dict['_rows-raw-array'] as unknown[];
    
    if (!Array.isArray(headerArray) || !Array.isArray(rowsArray)) {
      // Fallback to regular processing if structure is unexpected
      return;
    }
    
    // Extract column names from header
    const columnNames = headerArray.filter(h => typeof h === 'string') as string[];
    
    if (columnNames.length === 0) {
      return;
    }
    
    // Use "row" as the relation name to represent table rows
    const relationName = 'row';
    
    // Process each row as a tuple
    rowsArray.forEach((row) => {
      if (!Array.isArray(row)) {
        return;
      }
      
      // Create atoms for each cell value and collect them as a tuple
      const tupleAtomIds: string[] = [];
      
      row.forEach((cellValue) => {
        if (this.isAtomicValue(cellValue)) {
          const atomId = this.createAtomFromPrimitive(cellValue);
          tupleAtomIds.push(atomId);
        }
      });
      
      // Only create the tuple if we have the expected number of values
      if (tupleAtomIds.length === columnNames.length && tupleAtomIds.length > 0) {
        // Create an n-ary tuple for this row
        this.addRelationTuple(
          relationName,
          { 
            atoms: tupleAtomIds, 
            types: tupleAtomIds.map(() => 'String') // Assuming string types for now
          }
        );
      }
    });
  }

  /**
   * Creates an atom from a Pyret object and stores the mapping
   */
  private createAtomFromObject(obj: PyretObject | unknown[]): string {
    const shape = this.valueInfo(obj);
    const type = shape ? { nothing: 'Nothing', reference: 'Reference', object: 'PyretObject', tuple: 'Tuple', 'raw-array': 'RawArray' }[shape.kind]
      : this.extractType(obj as PyretObject);
    const atomId = this.generateAtomId(type);
    const info = Array.isArray(obj) ? undefined : constructorInfo(obj);
    const atom: IAtom = {
      id: atomId,
      type,
      label: shape ? type : this.extractLabel(obj as PyretObject),
      ...(shape ? { metadata: { pyretValue: shape } }
        : info ? { metadata: { pyret: { version: 1, arity: info.arity,
          ...(info.mutableFields ? { mutableFields: info.mutableFields } : {}) } } } : {})
    };
    this.atoms.set(atomId, atom);
    this.objectToAtomId.set(obj, atomId);
    this.ensureTypeExists(type);
    return atomId;
  }

  /**
   * Creates an atom from a primitive value, optionally reusing existing atoms based on configuration
   */
  private createAtomFromPrimitive(value: unknown): string {
    const numeric = numberPayload(value);
    const type = numeric ? 'Number' : this.mapPrimitiveType(value as string | boolean);
    const label = numeric ? numberSource(numeric) : String(value);
    const metadata = numeric ? { pyretNumber: numeric } : undefined;

    // Check idempotency settings for this type
    const shouldReuse = (type === 'String' && this.options.stringsIdempotent) ||
                       (type === 'Number' && this.options.numbersIdempotent) ||
                       (type === 'Boolean' && this.options.booleansIdempotent);

    if (shouldReuse) {
      // Check if we already have an atom for this value
      const existingAtom = Array.from(this.atoms.values())
        .find(atom => atom.type === type && (numeric
          ? JSON.stringify(atom.metadata?.pyretNumber) === JSON.stringify(numeric)
          : atom.label === label));

      if (existingAtom) {
        return existingAtom.id;
      }
    }

    // Create a new atom
    const atomId = this.generateAtomId(type);
    const atom: IAtom = {
      id: atomId,
      type,
      label,
      ...(metadata ? { metadata } : {})
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
  addRelationTuple(relationId: string, tuple: ITuple, relationName?: string): void {
    // const [sourceId, targetId] = tuple.atoms;

    const sourceId = tuple.atoms[0];
    const targetId = tuple.atoms[tuple.atoms.length - 1];

    const sourceAtom = this.atoms.get(sourceId);
    const targetAtom = this.atoms.get(targetId);

    if (!sourceAtom || !targetAtom) {
      console.warn(`Cannot create relation ${relationId}: missing atoms ${sourceId} or ${targetId}`);
      return;
    }

    let relation = this.relations.get(relationId);
    const name = relationName ?? relation?.name ?? readFieldId(relationId)?.field ?? relationId;
    if (relation) assertSameRelationName(relation, { ...relation, name });

    // `relation.types` is positional — one entry per column — so the tuple is
    // settled against the relation's declared signature rather than merged into
    // it. See settleTupleTypes.
    const settled = settleTupleTypes(tuple, relation, atomId => this.atoms.get(atomId)?.type);

    if (!relation) {
      relation = {
        id: relationId,
        name: name,
        types: settled.relationTypes,
        tuples: []
      };
      this.relations.set(relationId, relation);
    } else {
      relation.types = settled.relationTypes;
    }

    // Check for duplicate tuples
    const isDuplicate = relation.tuples.some(t => tupleKey(t) === tupleKey(tuple));

    if (!isDuplicate) {
      relation.tuples.push(settled.tuple);

      // Emit event
      this.emitEvent({
        type: 'relationTupleAdded',
        data: { relationId, tuple: settled.tuple }
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

  /** Primitive JS values, runtime numeric objects, and structural numeric carriers. */
  private isAtomicValue(value: unknown): boolean {
    return typeof value === 'string' || typeof value === 'boolean' || numberPayload(value) !== undefined;
  }

  /**
   * Type guard for Pyret objects
   */
  private isPyretObject(obj: unknown): obj is PyretObject {
    return typeof obj === 'object' &&
      obj !== null &&
      ('dict' in obj || 'brands' in obj || '$name' in obj || 'vals' in obj || '$pyretValue' in obj || isRuntimeReference(obj));
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
    for (const incoming of pyretInstance.getRelations()) {
      const existing = this.relations.get(incoming.id);
      if (existing) assertSameRelationName(existing, incoming);
    }
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
        existingRelation.tuples = uniqueTuples([...existingRelation.tuples, ...newTuples]);
        existingRelation.types = relationSignature(existingRelation.tuples, existingRelation.types);
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
