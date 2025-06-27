import IEvaluator from "./interfaces";
import Evaluator from "simple-graph-query";

import {EvaluationContext, EvaluatorConfig, IEvaluatorResult } from "./interfaces";
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
  private context: EvaluationContext | undefined;
  private eval: Evaluator;

  constructor() {
    this.eval = new Evaluator();

  }

  private ready: boolean = false;

  initialize(context: EvaluationContext): void {
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

    const result : IEvaluatorResult= this.eval.evaluate(expression, config);
    return result;
  }
}


//export default SimpleGraphQueryEvaluator;