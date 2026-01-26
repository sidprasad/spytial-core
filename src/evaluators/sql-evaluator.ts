import IEvaluator, {
  EvaluationContext,
  EvaluatorConfig,
  EvaluatorResult,
  IEvaluatorResult,
  SingleValue,
  Tuple,
  ErrorResult
} from './interfaces';
import { IDataInstance } from '../data-instance/interfaces';

interface SqlTable {
  columns: string[];
  rows: Record<string, SingleValue>[];
}

interface SqlCondition {
  column: string;
  value: SingleValue;
}

interface SqlQuery {
  table: string;
  columns: string[] | '*';
  where: SqlCondition[];
  limit?: number;
  aggregate?: {
    type: 'count';
    column?: string;
  };
}

function isDataInstance(value: unknown): value is IDataInstance {
  return (value as IDataInstance).getAtoms !== undefined &&
    (value as IDataInstance).getRelations !== undefined &&
    (value as IDataInstance).getTypes !== undefined &&
    (value as IDataInstance).applyProjections !== undefined &&
    (value as IDataInstance).generateGraph !== undefined;
}

function isErrorResult(result: EvaluatorResult): result is ErrorResult {
  return typeof result === 'object' && result !== null && 'error' in result;
}

function isSingleValue(value: unknown): value is SingleValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function singleValueToString(value: SingleValue): string {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'number') {
    return value.toString();
  }
  return value ? 'true' : 'false';
}

function relationColumnName(position: number, typeId: string): string {
  if (position === 0) {
    return `source_${typeId}`;
  }
  if (position === 1) {
    return `target_${typeId}`;
  }
  return `arg${position}_${typeId}`;
}

export class SqlEvaluatorResult implements IEvaluatorResult {
  private readonly result: EvaluatorResult;
  private readonly expr: string;
  private readonly errorResult: boolean;
  private readonly singletonResult: boolean;

  constructor(result: EvaluatorResult, expr: string) {
    this.result = result;
    this.expr = expr;
    this.errorResult = isErrorResult(result);
    this.singletonResult = isSingleValue(result);
  }

  prettyPrint(): string {
    if (this.singletonResult) {
      return singleValueToString(this.result as SingleValue);
    }

    if (this.errorResult) {
      const errorResult = this.result as ErrorResult;
      return `Error: ${errorResult.error.message}`;
    }

    const tuples = this.result as Tuple[];
    const tupleStrings = tuples.map((tuple) => tuple.map((item) => singleValueToString(item)).join('->'));
    return tupleStrings.join(' , ');
  }

  noResult(): boolean {
    return !this.errorResult && Array.isArray(this.result) && this.result.length === 0;
  }

  singleResult(): SingleValue {
    if (!this.singletonResult) {
      throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead:${this.prettyPrint()}`);
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (this.singletonResult || this.errorResult) {
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${this.prettyPrint()}`);
    }

    const tuples = this.result as Tuple[];
    const selected = tuples.filter((tuple) => tuple.length > 0);
    if (selected.length === 0) {
      return [];
    }

    const arityOne = selected.filter((tuple) => tuple.length === 1);
    const flattened = arityOne.flat().map((value) => singleValueToString(value));
    return Array.from(new Set(flattened));
  }

  selectedTwoples(): string[][] {
    if (this.singletonResult || this.errorResult) {
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${this.prettyPrint()}`);
    }

    const tuples = this.result as Tuple[];
    const selected = tuples.filter((tuple) => tuple.length > 1);
    if (selected.length === 0) {
      return [];
    }

    return selected.map((tuple) => {
      const first = tuple[0];
      const last = tuple[tuple.length - 1];
      return [singleValueToString(first), singleValueToString(last)];
    });
  }

  selectedTuplesAll(): string[][] {
    if (this.singletonResult || this.errorResult) {
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${this.prettyPrint()}`);
    }

    const tuples = this.result as Tuple[];
    const selected = tuples.filter((tuple) => tuple.length > 1);
    if (selected.length === 0) {
      return [];
    }

    return selected.map((tuple) => tuple.map((value) => singleValueToString(value)));
  }

  isError(): boolean {
    return this.errorResult;
  }

  isSingleton(): boolean {
    return this.singletonResult;
  }

  getExpression(): string {
    return this.expr;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }
}

export class SqlEvaluator implements IEvaluator {
  private context: EvaluationContext | undefined;
  private tables: Map<string, SqlTable> = new Map();
  private ready = false;
  private evaluatorCache: Map<string, IEvaluatorResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  initialize(context: EvaluationContext): void {
    this.context = context;

    if (!context.sourceData || !isDataInstance(context.sourceData)) {
      throw new Error('Invalid context.sourceData: Expected an instance of IDataInstance');
    }

    this.loadDataInstance(context.sourceData);
    this.ready = true;
    this.evaluatorCache.clear();
  }

  isReady(): boolean {
    return this.ready;
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady()) {
      throw new Error('SqlEvaluator is not properly initialized');
    }

    const instanceIndex = config?.instanceIndex ?? 0;
    const cacheKey = JSON.stringify({ expression, instanceIndex });

    if (this.evaluatorCache.has(cacheKey)) {
      const cachedResult = this.evaluatorCache.get(cacheKey)!;
      this.evaluatorCache.delete(cacheKey);
      this.evaluatorCache.set(cacheKey, cachedResult);
      return cachedResult;
    }

    const rawResult = this.executeQuery(expression);
    const wrappedResult = new SqlEvaluatorResult(rawResult, expression);

    if (this.evaluatorCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.evaluatorCache.keys().next().value;
      if (firstKey !== undefined) {
        this.evaluatorCache.delete(firstKey);
      }
    }

    this.evaluatorCache.set(cacheKey, wrappedResult);
    return wrappedResult;
  }

  dispose(): void {
    this.evaluatorCache.clear();
    this.tables.clear();
    this.context = undefined;
    this.ready = false;
  }

  public getMemoryStats(): {
    cacheSize: number;
    maxCacheSize: number;
    hasDataInstance: boolean;
  } {
    return {
      cacheSize: this.evaluatorCache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      hasDataInstance: this.context?.sourceData !== undefined
    };
  }

  private executeQuery(expression: string): EvaluatorResult {
    try {
      const query = this.parseQuery(expression);
      return this.executeParsedQuery(query);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: {
          message,
          code: 'SQL_ERROR',
          details: {
            expression
          }
        }
      };
    }
  }

  private executeParsedQuery(query: SqlQuery): EvaluatorResult {
    const table = this.tables.get(query.table);
    if (!table) {
      return {
        error: {
          message: `Unknown table: ${query.table}`,
          code: 'SQL_ERROR'
        }
      };
    }

    let rows = table.rows;
    if (query.where.length > 0) {
      const missingColumns = query.where.filter((condition) => !table.columns.includes(condition.column));
      if (missingColumns.length > 0) {
        return {
          error: {
            message: `Unknown column(s) in WHERE clause: ${missingColumns.map((c) => c.column).join(', ')}`,
            code: 'SQL_ERROR'
          }
        };
      }

      rows = rows.filter((row) =>
        query.where.every((condition) => {
          const rowValue = row[condition.column];
          return String(rowValue) === String(condition.value);
        })
      );
    }

    if (query.aggregate?.type === 'count') {
      if (query.aggregate.column) {
        if (!table.columns.includes(query.aggregate.column)) {
          return {
            error: {
              message: `Unknown column in COUNT(): ${query.aggregate.column}`,
              code: 'SQL_ERROR'
            }
          };
        }
        const column = query.aggregate.column;
        const count = rows.filter((row) => row[column] !== undefined).length;
        return count;
      }
      return rows.length;
    }

    const columns = query.columns === '*' ? table.columns : query.columns;
    const unknownColumns = columns.filter((column) => !table.columns.includes(column));
    if (unknownColumns.length > 0) {
      return {
        error: {
          message: `Unknown column(s) in SELECT clause: ${unknownColumns.join(', ')}`,
          code: 'SQL_ERROR'
        }
      };
    }
    const limitedRows = query.limit !== undefined ? rows.slice(0, query.limit) : rows;

    if (columns.length === 1 && limitedRows.length === 1) {
      return limitedRows[0][columns[0]];
    }

    return limitedRows.map((row) => columns.map((column) => row[column]));
  }

  private loadDataInstance(dataInstance: IDataInstance): void {
    const types = dataInstance.getTypes();
    const relations = dataInstance.getRelations();

    for (const type of types) {
      const rows = type.atoms.map((atom) => ({ id: atom.id }));
      this.tables.set(type.id, {
        columns: ['id'],
        rows
      });
    }

    for (const relation of relations) {
      if (relation.types.length === 0) {
        continue;
      }

      const columns = relation.types.map((typeId, index) => relationColumnName(index, typeId));
      const rows = relation.tuples.map((tuple) => {
        const row: Record<string, SingleValue> = {};
        tuple.atoms.forEach((atomId, index) => {
          row[columns[index]] = atomId;
        });
        return row;
      });
      this.tables.set(relation.name, { columns, rows });
    }
  }

  private parseQuery(expression: string): SqlQuery {
    const trimmed = expression.trim().replace(/;$/, '');
    const match = trimmed.match(
      /^select\s+(.+?)\s+from\s+([^\s]+)(?:\s+where\s+(.+?))?(?:\s+limit\s+(\d+))?\s*$/i
    );

    if (!match) {
      throw new Error('Unsupported SQL expression. Expected SELECT ... FROM ...');
    }

    const [, selectPart, tableName, wherePart, limitPart] = match;
    const parsedColumns = this.parseSelectPart(selectPart.trim());

    const whereConditions = wherePart ? this.parseWherePart(wherePart.trim()) : [];
    const limit = limitPart ? Number.parseInt(limitPart, 10) : undefined;

    return {
      table: tableName,
      columns: parsedColumns.columns,
      where: whereConditions,
      limit,
      aggregate: parsedColumns.aggregate
    };
  }

  private parseSelectPart(selectPart: string): { columns: string[] | '*'; aggregate?: SqlQuery['aggregate'] } {
    const countMatch = selectPart.match(/^count\s*\(\s*(\*|[A-Za-z0-9_-]+)\s*\)\s*$/i);
    if (countMatch) {
      const column = countMatch[1];
      return {
        columns: ['count'],
        aggregate: {
          type: 'count',
          column: column === '*' ? undefined : column
        }
      };
    }

    if (selectPart === '*') {
      return { columns: '*' };
    }

    const columns = selectPart
      .split(',')
      .map((column) => column.trim())
      .filter((column) => column.length > 0);

    if (columns.length === 0) {
      throw new Error('No columns specified in SELECT clause');
    }

    return { columns };
  }

  private parseWherePart(wherePart: string): SqlCondition[] {
    const conditions = wherePart.split(/\s+and\s+/i);
    return conditions.map((condition) => this.parseCondition(condition.trim()));
  }

  private parseCondition(condition: string): SqlCondition {
    const match = condition.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) {
      throw new Error(`Unsupported WHERE condition: ${condition}`);
    }

    const [, column, rawValue] = match;
    const value = this.parseValue(rawValue.trim());
    return { column, value };
  }

  private parseValue(rawValue: string): SingleValue {
    if ((rawValue.startsWith("'") && rawValue.endsWith("'")) ||
      (rawValue.startsWith('"') && rawValue.endsWith('"'))) {
      const unquoted = rawValue.slice(1, -1).replace(/''/g, "'");
      return unquoted;
    }

    if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      return Number(rawValue);
    }

    if (/^(true|false)$/i.test(rawValue)) {
      return rawValue.toLowerCase() === 'true';
    }

    return rawValue;
  }
}
