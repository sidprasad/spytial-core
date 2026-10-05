import { describe, expect, it } from 'vitest';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator, analyzeForgeExpression } from '../src/evaluators/data/sgq-evaluator';

// Exercise SGQ 3.3's builtin through core's evaluator adapter and analyzer export.
const instance = new JSONDataInstance({
  atoms: [
    { id: 'z', type: 'Person', label: 'Alice' },
    { id: 'a', type: 'Person', label: 'Bob' },
    { id: 'b', type: 'Person', label: 'Bob' },
  ],
  relations: [],
});

function evaluate(expression: string) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  const result = evaluator.evaluate(expression);
  expect(result.isError()).toBe(false);
  return result;
}

describe('SGQ lexCompare integration', () => {
  it('compares strings through the core adapter', () => {
    expect(evaluate('lexCompare["apple", "banana"]').singleResult()).toBe(-1);
  });

  it('selects pairs by labels independently of atom ID order', () => {
    expect(evaluate('{x, y: Person | lexCompare[@:x, @:y] < 0}').selectedTwoples().map(t => t.join('->')).sort())
      .toEqual(['z->a', 'z->b']);
  });

  it('recognizes the builtin through core\'s static analyzer export', () => {
    expect(analyzeForgeExpression('lexCompare["apple", "banana"] < 0').status).toBe('tautology');
  });
});
