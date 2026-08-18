import alasql from 'alasql';
import IEvaluator, {
  EvaluationContext,
  EvaluatorConfig,
  IEvaluatorResult,
  EvaluatorResult,
  Tuple
} from '../../evaluator-contracts';
import { IDataInstance, IAtom, IRelation, ITuple, isDataInstance } from '../../data-instance/interfaces';
import { BaseEvaluatorResult } from './base-evaluator-result';

function isSQLErrorResult(result: EvaluatorResult): boolean {
  return typeof result === 'object' &&
         result !== null &&
         'error' in result &&
         typeof (result as { error: unknown }).error === 'object';
}

/**
 * Result wrapper for SQL evaluator results that implements IEvaluatorResult
 */
export class SQLEvaluatorResult extends BaseEvaluatorResult {
  constructor(result: EvaluatorResult, expr: string) {
    super(result, expr, isSQLErrorResult(result));
  }

  // The SQL result is already in the neutral EvaluatorResult shape, so no
  // error normalization is needed — return it untouched.
  getRawResult(): EvaluatorResult {
    return this.result;
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

  // Internal table names are prefixed with '_' to avoid collision with user relation names
  private static readonly ATOMS_TABLE = '_atoms';
  private static readonly ATOM_TYPES_TABLE = '_atom_types';
  private static readonly TYPES_TABLE = '_types';

  /**
   * Clear all tables created by this evaluator
   */
  private clearTables(): void {
    // Drop tables that we might have created
    try {
      this.db.exec(`DROP TABLE IF EXISTS ${SQLEvaluator.ATOMS_TABLE}`);
      this.db.exec(`DROP TABLE IF EXISTS ${SQLEvaluator.ATOM_TYPES_TABLE}`);
      this.db.exec(`DROP TABLE IF EXISTS ${SQLEvaluator.TYPES_TABLE}`);
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
    // Create _atoms table (stores most specific type)
    // Prefixed with '_' to avoid collision with user relations named 'atoms'
    this.db.exec(`CREATE TABLE ${SQLEvaluator.ATOMS_TABLE} (id STRING, type STRING, label STRING)`);
    this.tableSchemas.push({
      name: SQLEvaluator.ATOMS_TABLE,
      columns: ['id', 'type', 'label'],
      description: 'All atoms in the instance (type = most specific type)'
    });

    // Create _atom_types junction table (stores ALL types including inherited)
    this.db.exec(`CREATE TABLE ${SQLEvaluator.ATOM_TYPES_TABLE} (atom_id STRING, type STRING)`);
    this.tableSchemas.push({
      name: SQLEvaluator.ATOM_TYPES_TABLE,
      columns: ['atom_id', 'type'],
      description: 'Junction table: all types for each atom (includes inherited types)'
    });

    const atoms: IAtom[] = [...dataInstance.getAtoms()];
    for (const atom of atoms) {
      // Insert into _atoms table with most specific type
      this.db.exec(`INSERT INTO ${SQLEvaluator.ATOMS_TABLE} VALUES (?, ?, ?)`, [atom.id, atom.type, atom.label]);
      
      // Get full type hierarchy and insert into _atom_types
      try {
        const atomType = dataInstance.getAtomType(atom.id);
        if (atomType && atomType.types) {
          // Insert a row for each type in the hierarchy
          for (const type of atomType.types) {
            this.db.exec(`INSERT INTO ${SQLEvaluator.ATOM_TYPES_TABLE} VALUES (?, ?)`, [atom.id, type]);
          }
        } else {
          // Fallback: just use the atom's declared type
          this.db.exec(`INSERT INTO ${SQLEvaluator.ATOM_TYPES_TABLE} VALUES (?, ?)`, [atom.id, atom.type]);
        }
      } catch {
        // Fallback: just use the atom's declared type
        this.db.exec(`INSERT INTO ${SQLEvaluator.ATOM_TYPES_TABLE} VALUES (?, ?)`, [atom.id, atom.type]);
      }
    }

    // Create _types table
    this.db.exec(`CREATE TABLE ${SQLEvaluator.TYPES_TABLE} (id STRING, isBuiltin BOOLEAN, hierarchy STRING)`);
    this.tableSchemas.push({
      name: SQLEvaluator.TYPES_TABLE,
      columns: ['id', 'isBuiltin', 'hierarchy'],
      description: 'All types in the instance'
    });

    const types = dataInstance.getTypes();
    for (const type of types) {
      this.db.exec(`INSERT INTO ${SQLEvaluator.TYPES_TABLE} VALUES (?, ?, ?)`, [
        type.id, 
        type.isBuiltin, 
        JSON.stringify(type.types)
      ]);
    }

    this.createRelationTables(dataInstance.getRelations());
  }

  /**
   * Give every relation NAME one table.
   *
   * The name is the relation: two records that share a name are one relation
   * whose tuples sit together, exactly how the selector evaluator resolves
   * them (`foo` there is every tuple named `foo`). Building a table per
   * RECORD instead made two relations named `foo` — an ordinary thing for a
   * host language to produce — collide on `CREATE TABLE foo` and take
   * initialize() down with them.
   */
  private createRelationTables(relations: readonly IRelation[]): void {
    const byName = new Map<string, IRelation[]>();
    for (const relation of relations) {
      const group = byName.get(relation.name);
      if (group) group.push(relation);
      else byName.set(relation.name, [relation]);
    }

    // Distinct names can still sanitize down to one identifier (`a-b` and
    // `a.b` both become `a_b`). Those are NOT one relation, so the second
    // gets its own table rather than being merged into the first or throwing.
    const taken = new Set<string>([
      SQLEvaluator.ATOMS_TABLE,
      SQLEvaluator.ATOM_TYPES_TABLE,
      SQLEvaluator.TYPES_TABLE,
    ]);

    for (const [name, group] of byName) {
      const base = this.sanitizeTableName(name);
      let tableName = base;
      for (let n = 2; taken.has(tableName); n++) tableName = `${base}_${n}`;
      taken.add(tableName);
      this.createRelationTable(name, tableName, group);
    }
  }

  /**
   * Build one table for one relation name.
   *
   * The table's width comes from the TUPLES, never from `relation.types.length`
   * — that list is only a summary of the columns, and it is empty on a ragged
   * relation (see IRelation). Reading it as the arity is what used to write a
   * three-atom tuple into a two-column table and drop the third atom in
   * silence.
   *
   * A RAGGED relation — one name holding tuples of different width, which a
   * host language produces whenever two unrelated things have a field of the
   * same name — gets a wider table than any single tuple fills:
   *
   *   arity           how many atoms this row actually has
   *   src, tgt        first and last: the same (first, last) reduction
   *                   generateGraph draws and `selectedTwoples()` returns, so
   *                   the ordinary "show me the edges" query keeps working
   *                   across arities without a COALESCE over the elem columns
   *   elem_0..elem_n  the whole tuple, NULL past this row's own width
   *
   * Relations whose tuples agree on a width keep the shape they always had.
   */
  private createRelationTable(name: string, tableName: string, group: IRelation[]): void {
    const tuples = group.flatMap(relation => relation.tuples);
    const arities = new Set(tuples.map(tuple => tuple.atoms.length));
    const ragged = arities.size > 1;

    // With no tuples to measure, fall back to the declared summary so an
    // empty-but-declared relation still gets a queryable 0-row table.
    const width = arities.size > 0
      ? Math.max(...arities)
      : (group.find(relation => relation.types.length > 0)?.types.length ?? 0);

    // No columns at all, and `CREATE TABLE t ()` is a SQL parse error. Nothing
    // is lost: an empty relation with no signature has nothing to query.
    if (width === 0) {
      return;
    }

    let columns: string[];
    if (ragged) {
      columns = ['arity', 'src', 'tgt', ...Array.from({ length: width }, (_, i) => `elem_${i}`)];
    } else if (width === 1) {
      columns = ['atom'];
    } else if (width === 2) {
      columns = ['src', 'tgt'];
    } else {
      columns = Array.from({ length: width }, (_, i) => `elem_${i}`);
    }
    columns = columns.map(col => this.sanitizeColumnName(col));

    const arityColumn = ragged ? this.sanitizeColumnName('arity') : null;
    const columnDefs = columns
      .map(col => `${col} ${col === arityColumn ? 'INTEGER' : 'STRING'}`)
      .join(', ');
    this.db.exec(`CREATE TABLE ${tableName} (${columnDefs})`);

    this.tableSchemas.push({
      name: tableName,
      columns: columns,
      description: ragged
        ? `Relation: ${name} (ragged, arities ${[...arities].sort((a, b) => a - b).join(', ')})`
        : `Relation: ${name} (arity ${width})`
    });

    const placeholders = columns.map(() => '?').join(', ');
    for (const tuple of tuples) {
      const row = ragged ? SQLEvaluator.raggedRow(tuple, width) : tuple.atoms;
      this.db.exec(`INSERT INTO ${tableName} VALUES (${placeholders})`, row);
    }
  }

  /** `arity, src, tgt`, then the tuple's atoms padded to `width` with NULL. */
  private static raggedRow(tuple: ITuple, width: number): (string | number | null)[] {
    const atoms = tuple.atoms;
    return [
      atoms.length,
      atoms[0],
      atoms[atoms.length - 1],
      ...Array.from({ length: width }, (_, i) => atoms[i] ?? null),
    ];
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
