import IEvaluator from "../../evaluator-contracts";
// simple-graph-query ships a CJS bundle with an __esModule marker, which puts
// its API in a different place depending on who loads it: plain Node exposes
// module.exports as the namespace's `.default` (its lexer can't see the
// bundle's named exports), while bundlers that honor __esModule surface the
// named exports on the namespace itself. Import the namespace and pick
// whichever side actually has the API, so this module loads correctly both
// bundled (browser IIFE, ./evaluator) and external (dist/esm in plain Node).
// Types are erased, so they stay ordinary type imports (class aliased — the
// destructured const needs the plain name in value space).
import * as sgqNamespace from "simple-graph-query";
import type {
    SimpleGraphQueryEvaluator as SimpleGraphQueryEvaluatorType,
    EvaluationResult,
    ErrorResult,
    Diagnostic,
} from "simple-graph-query";
const sgq: any = (sgqNamespace as any).SimpleGraphQueryEvaluator ? sgqNamespace : (sgqNamespace as any).default;
const { SimpleGraphQueryEvaluator } = sgq;
export { JSONDataInstance } from "../../data-instance/json-data-instance";

// Also surface SQG's static analyzer and by-example (FOIL-style) synthesizers on the
// ./evaluator entry, so headless consumers — e.g. spytial.suggest's tier-2 bridge —
// can reach the cheap static gate and the selector synthesizer through the same
// windowless module they already require for evaluation, with no second import and no
// browser globals. Runtime values only; the types ride along in the generated .d.ts.
export const {
    analyzeForgeExpression,
    synthesizeSelector,
    synthesizeBinaryRelation,
    synthesizeBinaryRelationWithWhy,
    synthesizeSelectorWithWhy,
} = sgq as {
    analyzeForgeExpression: typeof sgqNamespace.analyzeForgeExpression;
    synthesizeSelector: typeof sgqNamespace.synthesizeSelector;
    synthesizeBinaryRelation: typeof sgqNamespace.synthesizeBinaryRelation;
    synthesizeBinaryRelationWithWhy: typeof sgqNamespace.synthesizeBinaryRelationWithWhy;
    synthesizeSelectorWithWhy: typeof sgqNamespace.synthesizeSelectorWithWhy;
};

import {EvaluationContext, EvaluatorConfig, IEvaluatorResult } from "../../evaluator-contracts";
import { IDataInstance, isDataInstance } from "../../data-instance/interfaces";
import { BaseEvaluatorResult } from "./base-evaluator-result";


function isErrorResult(result: EvaluationResult): result is ErrorResult {
    return (result as ErrorResult).error !== undefined;
}

export class SGQEvaluatorResult extends BaseEvaluatorResult {
    /**
     * Advisory diagnostics raised while evaluating `expr` — today only
     * `unresolved-name`, which evaluates to the empty set rather than failing.
     *
     * These live on the *result*, not on the evaluator, and that placement is
     * load-bearing. `SGraphQueryEvaluator` memoizes whole `SGQEvaluatorResult`
     * objects, so keeping diagnostics here means a cache hit replays them. A
     * drain-once channel on the evaluator (a `getLastDiagnostics()`, or an array
     * the reader empties) would report on the first evaluation and go silent on
     * every one after — which is precisely the failure this whole feature exists
     * to prevent. simple-graph-query hit the identical bug twice internally.
     */
    private readonly diagnostics: readonly Diagnostic[];

    constructor(result: EvaluationResult, expr: string, diagnostics: readonly Diagnostic[] = []) {
        super(result, expr, isErrorResult(result));
        this.diagnostics = diagnostics;
    }

    getDiagnostics(): readonly Diagnostic[] {
        return this.diagnostics;
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
  private eval!: SimpleGraphQueryEvaluatorType;
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

    // Take the diagnostics-bearing entry point, and cache them *with* the value.
    // An unresolved name evaluates to the empty set, so a typo and a legitimately
    // empty set are indistinguishable from the value alone — the diagnostic is
    // the only thing that tells them apart.
    const { value, diagnostics } = this.eval.evaluateExpressionWithDiagnostics(expression);

    // Now we need to wrap the result in our IEvaluatorResult interface
    const wrappedResult = new SGQEvaluatorResult(value, expression, diagnostics);
    
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
      hasDataInstance: false
    };
  }
}


//export default SimpleGraphQueryEvaluator;