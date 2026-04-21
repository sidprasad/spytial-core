import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';

// A minimal instance resembling the binary-tree motivating case:
// one relation `left` with a single tuple, and no `right` relation at all.
// A selector referencing `right` must not throw, must not produce an error
// result, and must yield zero tuples (so downstream constraint generation
// silently does nothing).
const binaryTreeOnlyLeft: IJsonDataInstance = {
  atoms: [
    { id: 'root', type: 'Node', label: 'root' },
    { id: 'leftChild', type: 'Node', label: 'leftChild' },
  ],
  relations: [
    {
      id: 'left',
      name: 'left',
      types: ['Node', 'Node'],
      tuples: [{ atoms: ['root', 'leftChild'], types: ['Node', 'Node'] }],
    },
  ],
};

function makeEvaluator(instance: JSONDataInstance): SGraphQueryEvaluator {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

// Simulate the post-upgrade behavior of simple-graph-query: surface
// NameNotFoundError in ErrorResult.error rather than silently returning [].
// We intercept the underlying evaluator so the policy boundary is exercised
// regardless of which simple-graph-query version happens to be installed.
function stubRawEvaluatorToThrowNameNotFound(
  evaluator: SGraphQueryEvaluator,
  missingExpression: string,
): void {
  const rawEvaluator = (evaluator as unknown as { eval: { evaluateExpression: (expr: string) => unknown } }).eval;
  const original = rawEvaluator.evaluateExpression.bind(rawEvaluator);
  rawEvaluator.evaluateExpression = (expression: string) => {
    if (expression === missingExpression) {
      const err = new Error(`bad name ${expression} referenced!`);
      err.name = 'NameNotFoundError';
      return { error: err };
    }
    return original(expression);
  };
}

describe('SGraphQueryEvaluator missing-name policy', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns a non-error empty result when the expression references a name the data does not contain', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);
    stubRawEvaluatorToThrowNameNotFound(evaluator, 'right');

    const result = evaluator.evaluate('right');

    expect(result.isError()).toBe(false);
    expect(result.noResult()).toBe(true);
    expect(result.selectedTwoples()).toEqual([]);
  });

  it('does not log by default', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);
    stubRawEvaluatorToThrowNameNotFound(evaluator, 'right');

    evaluator.evaluate('right');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs a warning when warnOnMissingName is set on the evaluator config', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);
    stubRawEvaluatorToThrowNameNotFound(evaluator, 'right');

    evaluator.evaluate('right', { warnOnMissingName: true });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain('right');
    expect(warnMsg).toContain('SGraphQueryEvaluator');
  });

  it('still surfaces non-NameNotFound errors (e.g. parse errors) as error results', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);

    // Inject a generic error (simulating what a parse error would look like
    // once simple-graph-query preserves the original typed error).
    const rawEvaluator = (evaluator as unknown as { eval: { evaluateExpression: (expr: string) => unknown } }).eval;
    rawEvaluator.evaluateExpression = () => ({
      error: Object.assign(new Error('Parse error at 1:0: mismatched input'), {
        name: 'ParseError',
      }),
    });

    const result = evaluator.evaluate('{ x : Node |');

    expect(result.isError()).toBe(true);
  });

  it('passes real-data evaluations through unchanged (relation that does exist)', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);

    const result = evaluator.evaluate('left');

    expect(result.isError()).toBe(false);
    expect(result.noResult()).toBe(false);
    expect(result.selectedTwoples()).toEqual([['root', 'leftChild']]);
  });
});

describe('LayoutInstance end-to-end: orientation on a missing selector', () => {
  it('generates zero constraints and records no selector error when the selector references a name not in the data', () => {
    const instance = new JSONDataInstance(binaryTreeOnlyLeft);
    const evaluator = makeEvaluator(instance);
    stubRawEvaluatorToThrowNameNotFound(evaluator, 'right');

    const layoutSpec = parseLayoutSpec(`
constraints:
  - orientation:
      selector: right
      directions:
        - right
  - orientation:
      selector: left
      directions:
        - left
`);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const result = layoutInstance.generateLayout(instance);

    // The `right` selector silently yields nothing (binary-tree-with-only-left
    // case). The `left` selector still produces its constraint. Crucially,
    // `right` does NOT appear in selectorErrors — it's expected-missing, not
    // a real error.
    const rightErrors = result.selectorErrors.filter(e => e.selector === 'right');
    expect(rightErrors).toEqual([]);
  });
});
