import IEvaluator, {
  EvaluationContext,
  EvaluatorConfig,
  EvaluatorResult,
  IEvaluatorResult,
  SingleValue,
  Tuple,
  ErrorResult
} from "./interfaces";

export interface PythonEvaluatorRuntime {
  run: (expression: string, context: EvaluationContext, config?: EvaluatorConfig) => EvaluatorResult;
}

function isErrorResult(result: EvaluatorResult): result is ErrorResult {
  return typeof result === "object" && result !== null && "error" in result;
}

function isSingleValue(value: unknown): value is SingleValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function singleValueToString(value: SingleValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  throw new Error("Invalid SingleValue type");
}

function getPythonRuntime(context: EvaluationContext): PythonEvaluatorRuntime | null {
  const candidate = context.metadata?.pythonEvaluator ?? context.metadata?.pythonRuntime;
  if (candidate && typeof (candidate as PythonEvaluatorRuntime).run === "function") {
    return candidate as PythonEvaluatorRuntime;
  }
  return null;
}

export class PythonEvaluatorResult implements IEvaluatorResult {
  private result: EvaluatorResult;
  private isErrorResult: boolean;
  private isSingletonResult: boolean;
  private expr: string;

  constructor(result: EvaluatorResult, expr: string) {
    this.result = result;
    this.expr = expr;
    this.isErrorResult = isErrorResult(result);
    this.isSingletonResult = isSingleValue(result);
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
    return !this.isErrorResult && Array.isArray(this.result) && this.result.length === 0;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }

  prettyPrint(): string {
    if (typeof this.result === "string") {
      return this.result;
    }
    if (typeof this.result === "number") {
      return this.result.toString();
    }
    if (typeof this.result === "boolean") {
      return this.result ? "true" : "false";
    }
    if (this.isErrorResult) {
      const errorResult = this.result as ErrorResult;
      return `Error: ${errorResult.error.message}`;
    }

    const tupleStringArray: string[] = [];
    const asTuple = this.result as Tuple[];

    for (let i = 0; i < asTuple.length; i++) {
      const tuple = asTuple[i];
      const tupleString = tuple.map((value) => singleValueToString(value)).join("->");
      tupleStringArray.push(tupleString);
    }

    return tupleStringArray.join(" , ");
  }

  singleResult(): SingleValue {
    if (!this.isSingletonResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead:${pp}`);
    }
    return this.result as SingleValue;
  }

  selectedAtoms(): string[] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${pp}`);
    }

    let selectedElements = (this.result as Tuple[]).filter((element) => element.length > 0);
    if (selectedElements.length === 0) {
      return [];
    }

    selectedElements = selectedElements.filter((element) => element.length === 1);

    const flattened = selectedElements.flat().map((element) => singleValueToString(element));
    return Array.from(new Set(flattened));
  }

  selectedTwoples(): string[][] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);
    }

    const selectedElements = (this.result as Tuple[]).filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    return selectedElements
      .map((element) => [element[0], element[element.length - 1]])
      .map((element) => element.map((e) => singleValueToString(e)));
  }

  selectedTuplesAll(): string[][] {
    if (this.isSingletonResult || this.isErrorResult) {
      const pp = this.prettyPrint();
      throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);
    }

    const selectedElements = (this.result as Tuple[]).filter((element) => element.length > 1);
    if (selectedElements.length === 0) {
      return [];
    }

    return selectedElements.map((element) => element.map((e) => singleValueToString(e)));
  }
}

export class PythonEvaluator implements IEvaluator {
  private context?: EvaluationContext;
  private runtime?: PythonEvaluatorRuntime;
  private ready: boolean = false;
  private evaluatorCache: Map<string, IEvaluatorResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;

  initialize(context: EvaluationContext): void {
    this.context = context;
    const runtime = getPythonRuntime(context);
    if (!runtime) {
      this.ready = false;
      throw new Error("PythonEvaluator requires metadata.pythonEvaluator or metadata.pythonRuntime with a run method");
    }

    this.runtime = runtime;
    this.ready = true;
    this.evaluatorCache.clear();
  }

  isReady(): boolean {
    return this.ready;
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady() || !this.runtime || !this.context) {
      throw new Error("PythonEvaluator is not properly initialized");
    }

    const instanceIndex = config?.instanceIndex ?? 0;
    const cacheKey = JSON.stringify({ expression, instanceIndex });

    if (this.evaluatorCache.has(cacheKey)) {
      const cachedResult = this.evaluatorCache.get(cacheKey)!;
      this.evaluatorCache.delete(cacheKey);
      this.evaluatorCache.set(cacheKey, cachedResult);
      return cachedResult;
    }

    const result = this.runtime.run(expression, this.context, config);
    const wrappedResult = new PythonEvaluatorResult(result, expression);

    if (this.evaluatorCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.evaluatorCache.keys().next().value;
      if (firstKey !== undefined) {
        this.evaluatorCache.delete(firstKey);
      }
    }

    this.evaluatorCache.set(cacheKey, wrappedResult);
    return wrappedResult;
  }

  public dispose(): void {
    this.evaluatorCache.clear();
  }

  public getMemoryStats(): {
    cacheSize: number;
    maxCacheSize: number;
    hasRuntime: boolean;
  } {
    return {
      cacheSize: this.evaluatorCache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      hasRuntime: Boolean(this.runtime)
    };
  }
}
