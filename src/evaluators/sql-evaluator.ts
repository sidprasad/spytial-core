import alasql from 'alasql';
import IEvaluator, { 
  EvaluationContext, 
  EvaluatorConfig, 
  IEvaluatorResult, 
  EvaluatorResult,
  SingleValue,
  Tuple
} from './interfaces';
import { IDataInstance, IAtom, IRelation } from '../data-instance/interfaces';

/**
 * Type guard to check if a value is an IDataInstance
 */
function isDataInstance(value: unknown): value is IDataInstance {
  return (value as IDataInstance).getAtoms !== undefined &&
         (value as IDataInstance).getRelations !== undefined &&
         (value as IDataInstance).getTypes !== undefined &&
         (value as IDataInstance).applyProjections !== undefined &&
         (value as IDataInstance).generateGraph !== undefined;
}

/**
 * Type guard to check if a value is a SingleValue
 */
function isSingleValue(value: unknown): value is SingleValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Convert a SingleValue to string representation
 */
function singleValueToString(value: SingleValue): string {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  throw new Error('Invalid SingleValue type');
}

/**
 * Result wrapper for SQL evaluator results that implements IEvaluatorResult
 */
export class SQLEvaluatorResult implements IEvaluatorResult {
  private result: EvaluatorResult;
  private isErrorResult: boolean = false;
  private isSingletonResult: boolean = false;
  private expr: string;

  constructor(result: EvaluatorResult, expr: string) {
    this.result = result;
    this.expr = expr;
    this.isErrorResult = this.checkIsError(result);
    this.isSingletonResult = isSingleValue(result);
  }

  private checkIsError(result: EvaluatorResult): boolean {
    return typeof result === 'object' && 
           result !== null && 
           'error' in result &&
           typeof (result as { error: unknown }).error === 'object';
  }

  isError(): boolean {
    return this.isErrorResult;
  }

  isSingleton(): boolean {
    return this.isSingletonResult;
  }

  getExpression(): string {
    return this.expr;
  }

  noResult(): boolean {
    return !this.isErrorResult && (Array.isArray(this.result) && this.result.length === 0);
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }

  prettyPrint(): string {
    if (typeof this.result === 'string') {
      return this.result;
    } 
    else if (typeof this.result === 'number') {
      return this.result.toString();
    }
    else if (typeof this.result === 'boolean') {
      return this.result ? 'true' : 'false';
    }
    else if (this.isErrorResult) {
      const errorResult = this.result as { error: { message: string } };
      return `Error: ${errorResult.error.message}`;
    }
    else {
      const tupleStringArray: string[] = [];
      const asTuple = this.result as Tuple[];

      for (let i = 0; i < asTuple.length; i++) {
        const tuple = asTuple[i];
        const tupleString = tuple.join('->');
        tupleStringArray.push(tupleString);
      }
      const resultString = tupleStringArray.join(' , ');
      return resultString;
    }
  }

  singleResult(): SingleValue {
    if (!this.isSingletonResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead: ${pp}`);
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${pp}`);   
    }

    const asTuple = this.result as Tuple[];

    let selectedElements = asTuple.filter((element) => element.length > 0);
    if (selectedElements.length === 0) {
      return [];
    }

    // Filter to only elements of arity 1
    selectedElements = selectedElements.filter((element) => element.length === 1);

    // Flatten the selected elements
    const flattened = selectedElements.flat().map((element) => singleValueToString(element));

    // Dedupe the elements
    const uniqueElements = Array.from(new Set(flattened));
    return uniqueElements;
  }

  selectedTwoples(): string[][] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead: ${pp}`);   
    }

    const asTuple = this.result as Tuple[];

    const selectedElements = asTuple.filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    // Get the FIRST AND LAST elements of the selected elements
    const selectedTuples = selectedElements.map((element) => {
      return [element[0], element[element.length - 1]];
    }).map((element) => {
      return element.map((e) => singleValueToString(e));
    });
    return selectedTuples;
  }

  selectedTuplesAll(): string[][] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2+. Instead: ${pp}`);   
    }

    const asTuple = this.result as Tuple[];

    const selectedElements = asTuple.filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    const selectedTuples = selectedElements.map((element) => {
      return element.map((e) => singleValueToString(e));
    });
    return selectedTuples;
  }
}

/**
 * Table schema information for the SQL evaluator
 */
interface TableSchema {
  name: string;
  columns: string[];
  description: string;
}

/**
 * SQLEvaluator - An IEvaluator implementation that supports SQL syntax
 * 
 * This evaluator converts IDataInstance data into SQL tables and uses AlaSQL
 * to execute SQL queries against them.
 * 
 * ## Table Structure
 * 
 * The evaluator creates the following tables from an IDataInstance:
 * 
 * ### `atoms` table
 * Contains all atoms in the instance:
 * - `id` (string): The unique identifier of the atom
 * - `type` (string): The type of the atom
 * - `label` (string): The display label of the atom
 * 
 * ### `types` table
 * Contains all types in the instance:
 * - `id` (string): The unique identifier of the type
 * - `isBuiltin` (boolean): Whether this is a built-in type
 * - `hierarchy` (string): JSON array of the type hierarchy
 * 
 * ### Relation tables
 * For each relation in the instance, a table is created with the relation's name
 * (sanitized for SQL). The columns are:
 * - For unary relations: `atom` (string)
 * - For binary relations: `src` (string), `tgt` (string)
 * - For n-ary relations: `elem_0`, `elem_1`, ..., `elem_n` (strings)
 * 
 * ## Example Queries
 * 
 * ```sql
 * -- Get all atoms
 * SELECT * FROM atoms
 * 
 * -- Get atoms of a specific type
 * SELECT id FROM atoms WHERE type = 'Person'
 * 
 * -- Get all tuples from a relation
 * SELECT * FROM friends
 * 
 * -- Join atoms with relations
 * SELECT a.label, b.label 
 * FROM friends f 
 * JOIN atoms a ON f.src = a.id 
 * JOIN atoms b ON f.tgt = b.id
 * ```
 * 
 * @example
 * ```typescript
 * const evaluator = new SQLEvaluator();
 * evaluator.initialize({ sourceData: myDataInstance });
 * 
 * // Query all atoms of type 'Person'
 * const result = evaluator.evaluate("SELECT id FROM atoms WHERE type = 'Person'");
 * console.log(result.selectedAtoms()); // ['Person0', 'Person1', ...]
 * ```
 */
export class SQLEvaluator implements IEvaluator {
  private context: EvaluationContext | undefined;
  private ready: boolean = false;
  // Use a dedicated database instance to avoid cross-talk between evaluators
  private db: InstanceType<typeof alasql.Database>;
  private tableSchemas: TableSchema[] = [];
  
  // Cache for evaluator results
  private evaluatorCache: Map<string, IEvaluatorResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  constructor() {
    // Create a new isolated AlaSQL database instance for this evaluator
    // This prevents cross-talk between multiple evaluator instances
    this.db = new alasql.Database();
  }

  /**
   * Initialize the evaluator with an IDataInstance
   * Creates SQL tables from the data instance structure
   */
  initialize(context: EvaluationContext): void {
    this.context = context;

    if (!context.sourceData || !isDataInstance(context.sourceData)) {
      throw new Error('Invalid context.sourceData: Expected an instance of IDataInstance');
    }

    const dataInstance: IDataInstance = context.sourceData as IDataInstance;
    
    // Clear any existing tables and cache
    this.clearTables();
    this.evaluatorCache.clear();
    this.tableSchemas = [];

    // Create tables from the data instance
    this.createTablesFromDataInstance(dataInstance);
    
    this.ready = true;
  }

  /**
   * Clear all tables created by this evaluator
   */
  private clearTables(): void {
    // Drop tables that we might have created
    try {
      this.db.exec('DROP TABLE IF EXISTS atoms');
      this.db.exec('DROP TABLE IF EXISTS types');
      // Drop any relation tables
      for (const schema of this.tableSchemas) {
        this.db.exec(`DROP TABLE IF EXISTS ${this.sanitizeTableName(schema.name)}`);
      }
    } catch {
      // Ignore errors when dropping tables
    }
  }

  /**
   * Sanitize a name to be a valid SQL identifier
   */
  private sanitizeTableName(name: string): string {
    // Replace invalid characters with underscores
    // SQL identifiers typically allow letters, digits, and underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it doesn't start with a digit
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    
    // Avoid SQL reserved words by prefixing with 'rel_' if it's a relation
    const reservedWords = ['select', 'selected', 'from', 'where', 'join', 'table', 'index', 'order', 'group', 'by', 'having', 'union', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'int', 'string', 'boolean', 'source', 'target', 'key', 'value', 'count', 'read', 'top', 'path', 'deleted', 'work', 'offset'];
    if (reservedWords.includes(sanitized.toLowerCase())) {
      sanitized = 'rel_' + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Sanitize a column name to be a valid SQL identifier
   */
  private sanitizeColumnName(name: string): string {
    // Replace invalid characters with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it doesn't start with a digit
    if (/^[0-9]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    
    // Avoid SQL reserved words by prefixing with 'col_'
    const reservedWords = ['select', 'from', 'where', 'join', 'table', 'index', 'order', 'group', 'by', 'having', 'union', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 'int', 'string', 'boolean', 'source', 'target', 'key', 'value', 'count', 'read', 'top', 'path', 'deleted', 'work', 'offset'];
    if (reservedWords.includes(sanitized.toLowerCase())) {
      sanitized = 'col_' + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Create SQL tables from an IDataInstance
   */
  private createTablesFromDataInstance(dataInstance: IDataInstance): void {
    // Create atoms table
    this.db.exec('CREATE TABLE atoms (id STRING, type STRING, label STRING)');
    this.tableSchemas.push({
      name: 'atoms',
      columns: ['id', 'type', 'label'],
      description: 'All atoms in the instance'
    });

    const atoms: IAtom[] = [...dataInstance.getAtoms()];
    for (const atom of atoms) {
      this.db.exec('INSERT INTO atoms VALUES (?, ?, ?)', [atom.id, atom.type, atom.label]);
    }

    // Create types table
    this.db.exec('CREATE TABLE types (id STRING, isBuiltin BOOLEAN, hierarchy STRING)');
    this.tableSchemas.push({
      name: 'types',
      columns: ['id', 'isBuiltin', 'hierarchy'],
      description: 'All types in the instance'
    });

    const types = dataInstance.getTypes();
    for (const type of types) {
      this.db.exec('INSERT INTO types VALUES (?, ?, ?)', [
        type.id, 
        type.isBuiltin, 
        JSON.stringify(type.types)
      ]);
    }

    // Create relation tables
    const relations: readonly IRelation[] = dataInstance.getRelations();
    for (const relation of relations) {
      this.createRelationTable(relation);
    }
  }

  /**
   * Create a table for a specific relation
   */
  private createRelationTable(relation: IRelation): void {
    const tableName = this.sanitizeTableName(relation.name);
    const arity = relation.types.length;

    // Determine column names based on arity
    // Use simple names that won't conflict with SQL reserved words
    let columns: string[];
    if (arity === 1) {
      columns = ['atom'];
    } else if (arity === 2) {
      columns = ['src', 'tgt'];
    } else {
      columns = Array.from({ length: arity }, (_, i) => `elem_${i}`);
    }

    // Sanitize column names
    columns = columns.map(col => this.sanitizeColumnName(col));

    // Create the table
    const columnDefs = columns.map(col => `${col} STRING`).join(', ');
    this.db.exec(`CREATE TABLE ${tableName} (${columnDefs})`);
    
    this.tableSchemas.push({
      name: tableName,
      columns: columns,
      description: `Relation: ${relation.name} (arity ${arity})`
    });

    // Insert tuples
    const placeholders = columns.map(() => '?').join(', ');
    for (const tuple of relation.tuples) {
      this.db.exec(`INSERT INTO ${tableName} VALUES (${placeholders})`, tuple.atoms);
    }
  }

  /**
   * Check if the evaluator is initialized and ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get the table schemas for introspection
   */
  getTableSchemas(): TableSchema[] {
    return [...this.tableSchemas];
  }

  /**
   * Evaluate a SQL expression against the data instance
   * 
   * @param expression - SQL query to execute
   * @param config - Optional configuration
   * @returns Wrapped result with convenience methods
   */
  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady()) {
      throw new Error('Evaluator not initialized');
    }

    // Create cache key
    const instanceIndex = config?.instanceIndex ?? 0;
    const cacheKey = JSON.stringify({ expression, instanceIndex });

    // Check cache first
    if (this.evaluatorCache.has(cacheKey)) {
      const cachedResult = this.evaluatorCache.get(cacheKey)!;
      // Move to end of map for LRU tracking
      this.evaluatorCache.delete(cacheKey);
      this.evaluatorCache.set(cacheKey, cachedResult);
      return cachedResult;
    }

    try {
      const rawResult = this.db.exec(expression);
      const result = this.convertResult(rawResult);
      const wrappedResult = new SQLEvaluatorResult(result, expression);

      // Implement LRU eviction
      if (this.evaluatorCache.size >= this.MAX_CACHE_SIZE) {
        const firstKey = this.evaluatorCache.keys().next().value;
        if (firstKey !== undefined) {
          this.evaluatorCache.delete(firstKey);
        }
      }

      // Store in cache
      this.evaluatorCache.set(cacheKey, wrappedResult);

      return wrappedResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorResult: EvaluatorResult = {
        error: {
          message: `SQL Error: ${errorMessage}`,
          code: 'SQL_ERROR'
        }
      };
      return new SQLEvaluatorResult(errorResult, expression);
    }
  }

  /**
   * Convert AlaSQL result to our EvaluatorResult format
   */
  private convertResult(rawResult: unknown): EvaluatorResult {
    // Handle null/undefined
    if (rawResult === null || rawResult === undefined) {
      return [];
    }

    // Handle single values
    if (typeof rawResult === 'string' || typeof rawResult === 'number' || typeof rawResult === 'boolean') {
      return rawResult;
    }

    // Handle arrays (typical SELECT result)
    if (Array.isArray(rawResult)) {
      if (rawResult.length === 0) {
        return [];
      }

      // Check if it's an array of objects (typical SQL result)
      if (typeof rawResult[0] === 'object' && rawResult[0] !== null) {
        // Convert array of objects to array of tuples
        return rawResult.map(row => {
          const values = Object.values(row as Record<string, unknown>);
          return values.map(v => {
            if (typeof v === 'string') return v;
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v;
            return String(v);
          }) as Tuple;
        });
      }

      // It's already a simple array
      return rawResult as Tuple[];
    }

    // Handle single object result
    if (typeof rawResult === 'object') {
      const values = Object.values(rawResult as Record<string, unknown>);
      return [values.map(v => {
        if (typeof v === 'string') return v;
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v;
        return String(v);
      }) as Tuple];
    }

    return [];
  }

  /**
   * Disposes of resources and clears caches
   */
  public dispose(): void {
    this.clearTables();
    this.evaluatorCache.clear();
    this.tableSchemas = [];
    this.ready = false;
  }

  /**
   * Returns memory usage statistics for this evaluator
   */
  public getMemoryStats(): {
    cacheSize: number;
    maxCacheSize: number;
    tableCount: number;
  } {
    return {
      cacheSize: this.evaluatorCache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      tableCount: this.tableSchemas.length
    };
  }
}
