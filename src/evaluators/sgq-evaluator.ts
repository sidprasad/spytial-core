import IEvaluator, {EvaluatorResult} from "./interfaces";
import {SimpleGraphQueryEvaluator, EvaluationResult, ErrorResult} from "simple-graph-query";

import {EvaluationContext, EvaluatorConfig, IEvaluatorResult } from "./interfaces";
import { IDataInstance } from "../data-instance/interfaces";
import {SingleValue, Tuple} from "./interfaces";


function isDataInstance(value: unknown): value is IDataInstance {
    return (value as IDataInstance).getAtoms !== undefined &&
           (value as IDataInstance).getRelations !== undefined &&
           (value as IDataInstance).getTypes !== undefined &&
           (value as IDataInstance).applyProjections !== undefined &&
           (value as IDataInstance).generateGraph !== undefined;
}

function isErrorResult(result: EvaluationResult): result is ErrorResult {
    return (result as ErrorResult).error !== undefined;
}

function isSingleValue(value: unknown): value is SingleValue {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}


function singleValueToString(value: SingleValue): string {
    if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        return value.toString();
    } else if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    throw new Error("Invalid SingleValue type");
}

export class SGQEvaluatorResult implements IEvaluatorResult {
    private result: EvaluationResult;
    private isErrorResult: boolean = false;
    private isSingletonResult: boolean = false;
    private expr: string;

    constructor(result: EvaluationResult, expr: string) {
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
        return !this.isErrorResult && (Array.isArray(this.result) && this.result.length === 0);
    }

    getRawResult(): EvaluatorResult {
        if (this.isErrorResult) {
            const errorResult = this.result as ErrorResult;
            return {
                error: {
                    message: errorResult.error.message,
                    code: 'FORGE_ERROR'
                }
            };
        }
        
        if (this.isSingletonResult) {
            return this.result as SingleValue;
        }
        
        return this.result as Tuple[];
    }

    prettyPrint(): string {
        if (typeof this.result === 'string') {
            return this.result;
        } 
        else if (typeof this.result === 'number') {
            return this.result.toString();
        }
        else if (typeof this.result === 'boolean') {
            return this.result ? "true" : "false";
        }
        else if (this.isErrorResult) {
            let errorResult = this.result as ErrorResult;
            return `Error: ${errorResult.error.message}`;
        }
        else {
            let tupleStringArray: string[] = [];
            let asTuple = this.result as Tuple[];

            // For each tuple in the result, join the elements with a ->
            for (let i = 0; i < asTuple.length; i++) {
                let tuple = asTuple[i];
                let tupleString = tuple.join("->");
                tupleStringArray.push(tupleString);
            }
            // Now join the tuplesStringArray with " , "
            let resultString = tupleStringArray.join(" , ");
            return resultString;
        }
    }

    singleResult(): SingleValue {
        if (!this.isSingletonResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead:${pp}`);
        }
        return this.result as SingleValue;
    }

    selectedAtoms(): string[] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${pp}`);   
        }

        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 0);
        if (selectedElements.length === 0) {
            return [];
        }

        // Now ensure that all selected elements are of arity 1
        selectedElements = selectedElements.filter((element) => element.length === 1);
        /// ... ///

        // Flatten the selected elements
        let flattened = selectedElements.flat().map((element) => singleValueToString(element));

        // Now dedupe the elements
        let uniqueElements = Array.from(new Set(flattened));
        return uniqueElements;
    }

    selectedTwoples(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);   
        }

        // NO ATOMS
        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        // Now get the FIRST AND LAST elements of the selected elements
        let selectedTuples = selectedElements.map((element) => {
            return [element[0], element[element.length - 1]];
        }).map((element) => {
            return element.map((e) => singleValueToString(e));
        });
        return selectedTuples;
    }

    selectedTuplesAll(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);   
        }

        // NO ATOMS
        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        let selectedTuples = selectedElements.map((element) => {
            return element.map((e) => singleValueToString(e));
        });
        return selectedTuples;
    }
}



/**
 * Evaluator is available as SimpleGraphQuery.default
 * 
 * @example
 * ```typescript
 * const Evaluator = SimpleGraphQuery.default;
 * const evaluator = new Evaluator();
 * ```
 */
export class SGraphQueryEvaluator implements IEvaluator {
  private context: EvaluationContext | undefined;
  private eval!: SimpleGraphQueryEvaluator;
  // Cache for evaluator results - lifetime tied to this evaluator instance
  // Using LRU strategy with a maximum size to prevent unbounded growth
  private evaluatorCache: Map<string, IEvaluatorResult> = new Map();
  private readonly MAX_CACHE_SIZE = 1000; // Limit cache to 1000 entries

  constructor() {
   

  }

  private ready: boolean = false;

  initialize(context: EvaluationContext): void {
    this.context = context;


    //console.log("Initializing SimpleGraphQueryEvaluator with context.sourceData:", context.sourceData);

    

    if (!context.sourceData || !isDataInstance(context.sourceData)) {
        //console.log("Invalid context.sourceData:", context.sourceData);
      throw new Error("Invalid context.sourceData: Expected an instance of IDataInstance");
    }


    const id : IDataInstance = context.sourceData as IDataInstance;
    this.eval = new SimpleGraphQueryEvaluator(id);
    //console.log("SimpleGraphQueryEvaluator initialized with context:", context);
    this.ready = true;
    
    // Clear cache on initialization
    this.evaluatorCache.clear();
  }

  isReady(): boolean {
    return this.ready;
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady()) {
      throw new Error("Evaluator not initialized");
    }

    // Create cache key using JSON.stringify for robustness
    const instanceIndex = config?.instanceIndex ?? 0;
    const cacheKey = JSON.stringify({ expression, instanceIndex });
    
    // Check cache first - if found, delete and re-add to move to end (LRU)
    if (this.evaluatorCache.has(cacheKey)) {
      const cachedResult = this.evaluatorCache.get(cacheKey)!;
      // Move to end of map for LRU tracking
      this.evaluatorCache.delete(cacheKey);
      this.evaluatorCache.set(cacheKey, cachedResult);
      return cachedResult;
    }

    const result = this.eval.evaluateExpression(expression);


    // Now we need to wrap the result in our IEvaluatorResult interface
    const wrappedResult = new SGQEvaluatorResult(result, expression);
    
    // Implement LRU eviction: if cache is at max size, remove oldest entry
    if (this.evaluatorCache.size >= this.MAX_CACHE_SIZE) {
      // Maps maintain insertion order, so first key is oldest
      const firstKey = this.evaluatorCache.keys().next().value;
      if (firstKey !== undefined) {
        this.evaluatorCache.delete(firstKey);
      }
    }
    
    // Store in cache
    this.evaluatorCache.set(cacheKey, wrappedResult);
    
    return wrappedResult;
  }

  /**
   * Disposes of resources and clears caches to help with garbage collection.
   * Should be called when the evaluator is no longer needed.
   */
  public dispose(): void {
    // Clear the evaluator cache which can hold many result objects
    this.evaluatorCache.clear();
    
    // Clear the data instance reference
    this.dataInstance = null as any;
  }

  /**
   * Returns memory usage statistics for this evaluator.
   * Useful for monitoring and debugging memory consumption.
   * 
   * @returns Object containing memory-related metrics
   */
  public getMemoryStats(): {
    cacheSize: number;
    maxCacheSize: number;
    hasDataInstance: boolean;
  } {
    return {
      cacheSize: this.evaluatorCache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      hasDataInstance: !!this.dataInstance
    };
  }
}


//export default SimpleGraphQueryEvaluator;