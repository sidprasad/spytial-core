import type { EvaluationContext, EvaluatorConfig, IEvaluatorResult } from './interfaces';
import IEvaluator from './interfaces';
import { ForgeEvaluator } from './forge-evaluator';
import { dotToAlloyXMLString } from '../data-instance/dot/dot-to-alloy-xml';
import { parseAlloyXML } from '../data-instance/alloy/alloy-instance/src/xml';

/**
 * DOT Evaluator
 * Wraps the ForgeEvaluator, translating DOT input to Alloy XML for evaluation.
 */
export class DotEvaluator implements IEvaluator {
  private forgeEvaluator: ForgeEvaluator = new ForgeEvaluator();
  private initialized = false;
  private lastDotSource: string | undefined;

  /**
   * Initialize the evaluator with DOT context.
   * Converts DOT to Alloy XML and initializes the ForgeEvaluator.
   */
  initialize(context: EvaluationContext): void {
    let dotSource: string;
    if (typeof context.sourceData === 'string') {
      dotSource = context.sourceData;
    } else if (typeof context.sourceData === 'object' && context.sourceData.dot) {
      dotSource = String(context.sourceData.dot);
    } else {
      throw new Error('DOT Evaluator requires DOT source as a string or { dot: string } object.');
    }

    const alloyXml = dotToAlloyXMLString(dotSource);

    // Parse the Alloy XML to create proper AlloyDatum structure
    const alloyDatum = parseAlloyXML(alloyXml);

    // Prepare a new context for ForgeEvaluator with parsed data
    const forgeContext: EvaluationContext = {
      ...context,
      sourceData: alloyXml,
      processedData: alloyDatum as unknown as Record<string, unknown>, // Pass the parsed AlloyDatum
      sourceCode: context.sourceCode // Optionally pass through
    };

    this.forgeEvaluator.initialize(forgeContext);
    this.initialized = true;
    this.lastDotSource = dotSource;
  }

  isReady(): boolean {
    return this.initialized && this.forgeEvaluator.isReady();
  }

  evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.isReady()) {
      throw new Error('DotEvaluator is not initialized.');
    }
    return this.forgeEvaluator.evaluate(expression, config);
  }

  validateExpression(expression: string): boolean {
    return this.forgeEvaluator.validateExpression(expression);
  }

  getContextInfo() {
    return {
      ...this.forgeEvaluator.getContextInfo(),
      dotSource: this.lastDotSource,
      dataType: 'dot'
    };
  }

  getCapabilities() {
    const base = this.forgeEvaluator.getCapabilities();
    return {
      ...base,
      language: 'DOT (via Alloy XML)',
      features: [...(base.features || []), 'dot-to-alloy-translation']
    };
  }

  dispose(): void {
    this.forgeEvaluator.dispose();
    this.initialized = false;
    this.lastDotSource = undefined;
  }
}

export default DotEvaluator;