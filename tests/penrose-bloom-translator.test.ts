import { describe, expect, it } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { PenroseBloomTranslator } from '../src/translators/penrose/penrose-bloom-translator';

const jsonData: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Person', label: 'Alice' },
    { id: 'B', type: 'Person', label: 'Bob' },
  ],
  relations: [
    {
      id: 'friend',
      name: 'friend',
      types: ['Person', 'Person'],
      tuples: [{ atoms: ['A', 'B'], types: ['Person', 'Person'] }],
    },
  ],
};

const layoutSpecStr = `
constraints:
  - orientation:
      selector: friend
      directions:
        - right
`;

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('PenroseBloomTranslator', () => {
  it('generates a JS-friendly bloom-like spec from layout output', () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = createEvaluator(instance);
    const layoutSpec = parseLayoutSpec(layoutSpecStr);
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    const { layout } = layoutInstance.generateLayout(instance);

    const translator = new PenroseBloomTranslator();
    const result = translator.translate(layout, 900, 500);

    expect(result.spec.canvas).toEqual({ width: 900, height: 500 });
    expect(result.spec.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'A', label: 'Alice', type: 'Person' }),
        expect.objectContaining({ id: 'B', label: 'Bob', type: 'Person' }),
      ]),
    );
    expect(result.spec.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'A', target: 'B', relation: 'friend' }),
      ]),
    );
    expect(result.spec.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'leftOf', left: 'A', right: 'B', minDistance: 5 }),
      ]),
    );

    expect(result.moduleSource).toContain('export const bloomSpec =');
    expect(result.moduleSource).toContain('"kind": "leftOf"');
  });
});
