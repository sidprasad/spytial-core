import IEvaluator from "./interfaces";
import { SimpleGraphQuery} from "simple-graph-query";

import {EvaluationContext, IEvaluatorResult } from "./interfaces";
/**
 * Evaluator is available as SimpleGraphQuery.default
 * 
 * @example
 * ```typescript
 * const Evaluator = SimpleGraphQuery.default;
 * const evaluator = new Evaluator();
 * ```
 */
export class SimpleGraphQueryEvaluator implements IEvaluator {
  private context: EvaluationContext;
  private impl: SimpleGraphQueryEvaluator;


  private ready: boolean = false;

  initialize(context: EvaluationContext): void {

    this.impl = new SimpleGraphQueryEvaluatorImpl();

    this.context = context;
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady()) {
      throw new Error("Evaluator not initialized");
    }
    // Placeholder for actual evaluation logic
    const result: EvaluatorResult = {};
    return new EvaluatorResultWrapper(result, expression);
  }
}


export default SimpleGraphQuery;