import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { WebColaTranslator } from '../src/translators/webcola/webcolatranslator';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' }
  ],
  relations: [
    {
      id: 'r',
      name: 'r',
      types: ['Type1', 'Type1'],
      tuples: [ { atoms: ['A', 'B'], types: ['Type1', 'Type1'] } ]
    }
  ]
};

const layoutSpecStr = `
constraints:
  - orientation:
      selector: r
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('WebColaTranslator', () => {
  it('translates layout to webcola format', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);

    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance);

    const translator = new WebColaTranslator();
    const result = await translator.translate(layout);

    expect(result.colaNodes).toHaveLength(2);
    expect(result.colaEdges).toHaveLength(1);
    expect(result.colaConstraints.length).toBeGreaterThan(0);
  });
});

