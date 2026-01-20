import IEvaluator, {
  EvaluationContext,
  EvaluatorConfig,
  EvaluatorResult,
  IEvaluatorResult,
  SingleValue,
  Tuple,
  ErrorResult,
} from './interfaces';
import { IDataInstance } from '../data-instance/interfaces';

function isDataInstance(value: unknown): value is IDataInstance {
  return (
    (value as IDataInstance).getAtoms !== undefined &&
    (value as IDataInstance).getRelations !== undefined &&
    (value as IDataInstance).getTypes !== undefined &&
    (value as IDataInstance).applyProjections !== undefined &&
    (value as IDataInstance).generateGraph !== undefined
  );
}

function isErrorResult(result: EvaluatorResult): result is ErrorResult {
  return (result as ErrorResult).error !== undefined;
}

function isSingleValue(value: unknown): value is SingleValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function singleValueToString(value: SingleValue): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  throw new Error('Invalid SingleValue type');
}

function normalizeArrayResult(raw: unknown[], expression: string): Tuple[] {
  if (raw.length === 0) {
    return [];
  }

  const allArrays = raw.every((item) => Array.isArray(item));
  const noneArrays = raw.every((item) => !Array.isArray(item));

  if (!allArrays && !noneArrays) {
    throw new Error(
      `JavaScript selector ${expression} returned a mixed array. ` +
        'Use an array of singletons or an array of tuples.'
    );
  }

  if (noneArrays) {
    if (!raw.every(isSingleValue)) {
      throw new Error(
        `JavaScript selector ${expression} returned a non-singleton value in an array.`
      );
    }
    return raw.map((value) => [value] as Tuple);
  }

  const tupleArray = raw as unknown[][];
  for (const tuple of tupleArray) {
    if (!Array.isArray(tuple) || tuple.length === 0) {
      throw new Error(
        `JavaScript selector ${expression} returned an invalid tuple. ` +
          'Tuples must be non-empty arrays of singletons.'
      );
    }
    if (!tuple.every(isSingleValue)) {
      throw new Error(
        `JavaScript selector ${expression} returned a tuple with a non-singleton value.`
      );
    }
  }

  return tupleArray as Tuple[];
}

function normalizeEvaluatorResult(
  raw: unknown,
  expression: string,
  maxResults?: number
): EvaluatorResult {
  if (raw instanceof Error) {
    return { error: { message: raw.message, code: 'JS_EVALUATOR_ERROR' } };
  }

  if (raw instanceof Set) {
    raw = Array.from(raw);
  }

  if (isSingleValue(raw)) {
    return raw;
  }

  if (Array.isArray(raw)) {
    const tuples = normalizeArrayResult(raw, expression);
    if (typeof maxResults === 'number' && maxResults >= 0) {
      return tuples.slice(0, maxResults);
    }
    return tuples;
  }

  throw new Error(
    `JavaScript selector ${expression} must return a singleton, ` +
      'an array of singletons, or an array of tuples.'
  );
}

export class JavaScriptEvaluatorResult implements IEvaluatorResult {
  private result: EvaluatorResult;
  private isErrorResultValue: boolean = false;
  private isSingletonResult: boolean = false;
  private expr: string;

  constructor(result: EvaluatorResult, expr: string) {
    this.result = result;
    this.expr = expr;
    this.isErrorResultValue = isErrorResult(result);
    this.isSingletonResult = isSingleValue(result);
  }

  isError(): boolean {
    return this.isErrorResultValue;
  }

  isSingleton(): boolean {
    return this.isSingletonResult;
  }

  getExpression(): string {
    return this.expr;
  }

  noResult(): boolean {
    return !this.isErrorResultValue && Array.isArray(this.result) && this.result.length === 0;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }

  prettyPrint(): string {
    if (typeof this.result === 'string') {
      return this.result;
    }
    if (typeof this.result === 'number') {
      return this.result.toString();
    }
    if (typeof this.result === 'boolean') {
      return this.result ? 'true' : 'false';
    }
    if (this.isErrorResultValue) {
      return `Error: ${this.result.error.message}`;
    }

    const asTuple = this.result as Tuple[];
    const tupleStringArray = asTuple.map((tuple) => tuple.join('->'));
    return tupleStringArray.join(' , ');
  }

  singleResult(): SingleValue {
    if (!this.isSingletonResult) {
      throw new Error(
        `Expected selector ${this.expr} to evaluate to a single value. Instead: ${this.prettyPrint()}`
      );
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (this.isSingletonResult || this.isErrorResultValue) {
      throw new Error(
        `Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${this.prettyPrint()}`
      );
    }

    const asTuple = this.result as Tuple[];
    let selectedElements = asTuple.filter((element) => element.length > 0);
    if (selectedElements.length === 0) {
      return [];
    }

    selectedElements = selectedElements.filter((element) => element.length === 1);
    const flattened = selectedElements.flat().map((element) => singleValueToString(element));
    return Array.from(new Set(flattened));
  }

  selectedTwoples(): string[][] {
    if (this.isSingletonResult || this.isErrorResultValue) {
      throw new Error(
        `Expected selector ${this.expr} to evaluate to values of arity 2. Instead: ${this.prettyPrint()}`
      );
    }

    const asTuple = this.result as Tuple[];
    const selectedElements = asTuple.filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    return selectedElements.map((element) => {
      return [singleValueToString(element[0]), singleValueToString(element[element.length - 1])];
    });
  }

  selectedTuplesAll(): string[][] {
    if (this.isSingletonResult || this.isErrorResultValue) {
      throw new Error(
        `Expected selector ${this.expr} to evaluate to values of arity 2. Instead: ${this.prettyPrint()}`
      );
    }

    const asTuple = this.result as Tuple[];
    const selectedElements = asTuple.filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    return selectedElements.map((element) => element.map((e) => singleValueToString(e)));
  }
}

export class JavaScriptEvaluator implements IEvaluator {
  private context?: EvaluationContext;
  private ready: boolean = false;
  private evaluatorCache: Map<string, IEvaluatorResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  initialize(context: EvaluationContext): void {
    if (!context || context.sourceData === undefined) {
      throw new Error('JavaScriptEvaluator requires a valid EvaluationContext');
    }
    this.context = context;
    this.ready = true;
    this.evaluatorCache.clear();
  }

  isReady(): boolean {
    return this.ready;
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady() || !this.context) {
      throw new Error('JavaScriptEvaluator not initialized');
    }

    const instanceIndex = config?.instanceIndex ?? 0;
    const cacheKey = JSON.stringify({ expression, instanceIndex });

    if (this.evaluatorCache.has(cacheKey)) {
      const cachedResult = this.evaluatorCache.get(cacheKey)!;
      this.evaluatorCache.delete(cacheKey);
      this.evaluatorCache.set(cacheKey, cachedResult);
      return cachedResult;
    }

    const sourceData = this.resolveSourceData(this.context.sourceData, instanceIndex);
    const instance = isDataInstance(sourceData) ? sourceData : undefined;

    const atoms = instance ? instance.getAtoms() : [];
    const relations = instance ? instance.getRelations() : [];
    const types = instance ? instance.getTypes() : [];

    try {
      const rawResult = this.evaluateExpression(expression, {
        context: this.context,
        data: sourceData,
        instance,
        atoms,
        relations,
        types,
        config,
      });

      const normalized = normalizeEvaluatorResult(rawResult, expression, config?.maxResults);
      const wrappedResult = new JavaScriptEvaluatorResult(normalized, expression);

      if (this.evaluatorCache.size >= this.MAX_CACHE_SIZE) {
        const firstKey = this.evaluatorCache.keys().next().value;
        if (firstKey !== undefined) {
          this.evaluatorCache.delete(firstKey);
        }
      }
      this.evaluatorCache.set(cacheKey, wrappedResult);
      return wrappedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorResult: ErrorResult = {
        error: {
          message: `JavaScript selector error for "${expression}": ${message}`,
          code: 'JS_EVALUATOR_ERROR',
        },
      };
      return new JavaScriptEvaluatorResult(errorResult, expression);
    }
  }

  private resolveSourceData(sourceData: EvaluationContext['sourceData'], instanceIndex: number): unknown {
    if (Array.isArray(sourceData)) {
      if (sourceData.length === 0) {
        return undefined;
      }
      if (instanceIndex < 0 || instanceIndex >= sourceData.length) {
        throw new Error(`Instance index ${instanceIndex} is out of range for sourceData`);
      }
      return sourceData[instanceIndex];
    }
    return sourceData;
  }

  private evaluateExpression(
    expression: string,
    scope: {
      context: EvaluationContext;
      data: unknown;
      instance?: IDataInstance;
      atoms: readonly unknown[];
      relations: readonly unknown[];
      types: readonly unknown[];
      config?: EvaluatorConfig;
    }
  ): unknown {
    const args = [
      'context',
      'data',
      'instance',
      'atoms',
      'relations',
      'types',
      'config',
    ];

    const values = [
      scope.context,
      scope.data,
      scope.instance,
      scope.atoms,
      scope.relations,
      scope.types,
      scope.config,
    ];

    try {
      const fn = new Function(
        ...args,
        `"use strict"; return (${expression});`
      ) as (...innerArgs: unknown[]) => unknown;
      return fn(...values);
    } catch (error) {
      const fn = new Function(...args, `"use strict"; ${expression}`) as (
        ...innerArgs: unknown[]
      ) => unknown;
      return fn(...values);
    }
  }
}
