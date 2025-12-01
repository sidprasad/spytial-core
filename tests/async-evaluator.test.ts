import { describe, it, expect, vi } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstanceAsync } from '../src/layout/layoutinstance';
import { setupLayoutAsync } from '../src/layout';
import { 
  IEvaluatorAsync, 
  IEvaluatorResult, 
  EvaluationContext, 
  EvaluatorConfig,
  isEvaluatorSync,
  isEvaluatorAsync
} from '../src/evaluators/interfaces';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

/**
 * Mock async evaluator that wraps SGraphQueryEvaluator with async methods
 */
class MockAsyncEvaluator implements IEvaluatorAsync {
  private syncEvaluator: SGraphQueryEvaluator;
  private _isReady = false;

  constructor() {
    this.syncEvaluator = new SGraphQueryEvaluator();
  }

  async initializeAsync(context: EvaluationContext): Promise<void> {
    // Simulate async initialization (e.g., network delay)
    await new Promise(resolve => setTimeout(resolve, 10));
    this.syncEvaluator.initialize(context);
    this._isReady = true;
  }

  isReady(): boolean {
    return this._isReady;
  }

  async evaluateAsync(expression: string, config?: EvaluatorConfig): Promise<IEvaluatorResult> {
    // Simulate async evaluation (e.g., network delay)
    await new Promise(resolve => setTimeout(resolve, 5));
    return this.syncEvaluator.evaluate(expression, config);
  }
}

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

const jsonDataDisconnected: IJsonDataInstance = {
  atoms: [
    { id: 'A', type: 'Type1', label: 'A' },
    { id: 'B', type: 'Type1', label: 'B' },
    { id: 'C', type: 'Type1', label: 'C' }
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

const layoutSpecDisconnected = `
constraints:
  - orientation:
      selector: A->C
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);
const layoutSpecDisconnectedNodes = parseLayoutSpec(layoutSpecDisconnected);

async function createAsyncEvaluator(instance: JSONDataInstance): Promise<MockAsyncEvaluator> {
  const evaluator = new MockAsyncEvaluator();
  await evaluator.initializeAsync({ sourceData: instance });
  return evaluator;
}

describe('IEvaluatorAsync Interface', () => {
  describe('Type Guards', () => {
    it('isEvaluatorSync returns true for sync evaluators', () => {
      const syncEvaluator = new SGraphQueryEvaluator();
      expect(isEvaluatorSync(syncEvaluator)).toBe(true);
    });

    it('isEvaluatorAsync returns true for async evaluators', () => {
      const asyncEvaluator = new MockAsyncEvaluator();
      expect(isEvaluatorAsync(asyncEvaluator)).toBe(true);
    });

    it('isEvaluatorSync returns false for async evaluators', () => {
      const asyncEvaluator = new MockAsyncEvaluator();
      expect(isEvaluatorSync(asyncEvaluator)).toBe(false);
    });

    it('isEvaluatorAsync returns false for sync evaluators', () => {
      const syncEvaluator = new SGraphQueryEvaluator();
      expect(isEvaluatorAsync(syncEvaluator)).toBe(false);
    });
  });

  describe('MockAsyncEvaluator', () => {
    it('initializes asynchronously', async () => {
      const instance = new JSONDataInstance(jsonData);
      const evaluator = new MockAsyncEvaluator();
      
      expect(evaluator.isReady()).toBe(false);
      await evaluator.initializeAsync({ sourceData: instance });
      expect(evaluator.isReady()).toBe(true);
    });

    it('evaluates expressions asynchronously', async () => {
      const instance = new JSONDataInstance(jsonData);
      const evaluator = await createAsyncEvaluator(instance);
      
      const result = await evaluator.evaluateAsync('r');
      expect(result).toBeDefined();
      expect(result.selectedTwoples()).toEqual([['A', 'B']]);
    });
  });
});

describe('LayoutInstanceAsync', () => {
  it('generates layout from data asynchronously', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = await createAsyncEvaluator(instance);

    const layoutInstance = new LayoutInstanceAsync(layoutSpec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayoutAsync(instance, {});

    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.constraints.length).toBeGreaterThan(0);
  });

  it('adds alignment edges for disconnected nodes with orientation constraints', async () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = await createAsyncEvaluator(instance);

    const layoutInstance = new LayoutInstanceAsync(layoutSpecDisconnectedNodes, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayoutAsync(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
    expect(layout.constraints.length).toBeGreaterThan(0);

    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).toContain('r');
    expect(edgeLabels).toContain('_alignment_A_C_');
  });

  it('does not add alignment edges when addAlignmentEdges is false', async () => {
    const instance = new JSONDataInstance(jsonDataDisconnected);
    const evaluator = await createAsyncEvaluator(instance);

    const layoutInstance = new LayoutInstanceAsync(layoutSpecDisconnectedNodes, evaluator, 0, false);
    const { layout } = await layoutInstance.generateLayoutAsync(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(1);
    expect(layout.constraints.length).toBeGreaterThan(0);

    const edgeLabels = layout.edges.map(e => e.label);
    expect(edgeLabels).not.toContain('_alignment_A_C_');
  });

  it('applies color to inferred edges when specified', async () => {
    const dataWithTransitiveRelation: IJsonDataInstance = {
      atoms: [
        { id: 'A', type: 'Node', label: 'A' },
        { id: 'B', type: 'Node', label: 'B' },
        { id: 'C', type: 'Node', label: 'C' }
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['A', 'B'], types: ['Node', 'Node'] },
            { atoms: ['B', 'C'], types: ['Node', 'Node'] }
          ]
        }
      ]
    };

    const specWithInferredEdge = `
directives:
  - inferredEdge:
      name: reachable
      selector: next.next
      color: '#ff0000'
`;

    const instance = new JSONDataInstance(dataWithTransitiveRelation);
    const evaluator = await createAsyncEvaluator(instance);
    const spec = parseLayoutSpec(specWithInferredEdge);

    const layoutInstance = new LayoutInstanceAsync(spec, evaluator, 0, true);
    const { layout } = await layoutInstance.generateLayoutAsync(instance, {});

    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges.length).toBeGreaterThanOrEqual(3);

    const inferredEdge = layout.edges.find(e => e.id.includes('_inferred_') && e.id.includes('reachable'));
    expect(inferredEdge).toBeDefined();
    expect(inferredEdge?.color).toBe('#ff0000');
  });
});

describe('setupLayoutAsync', () => {
  it('generates layout using async evaluator', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = await createAsyncEvaluator(instance);

    const result = await setupLayoutAsync(layoutSpecStr, instance, evaluator, {});

    expect(result.layout.nodes).toHaveLength(2);
    expect(result.layout.edges).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it('parses YAML spec string when provided', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = await createAsyncEvaluator(instance);

    const yamlSpec = `
constraints:
  - orientation:
      selector: r
      directions:
        - below
`;

    const result = await setupLayoutAsync(yamlSpec, instance, evaluator, {});

    expect(result.layout.nodes).toHaveLength(2);
    expect(result.layout.constraints.length).toBeGreaterThan(0);
  });

  it('accepts parsed LayoutSpec object', async () => {
    const instance = new JSONDataInstance(jsonData);
    const evaluator = await createAsyncEvaluator(instance);

    const result = await setupLayoutAsync(layoutSpec, instance, evaluator, {});

    expect(result.layout.nodes).toHaveLength(2);
    expect(result.layout.constraints.length).toBeGreaterThan(0);
  });
});

describe('Async vs Sync Consistency', () => {
  it('async and sync layout generation produce equivalent results', async () => {
    const instance = new JSONDataInstance(jsonData);
    
    // Sync evaluator and layout
    const syncEvaluator = new SGraphQueryEvaluator();
    syncEvaluator.initialize({ sourceData: instance });
    const { LayoutInstance } = await import('../src/layout/layoutinstance');
    const syncLayoutInstance = new LayoutInstance(layoutSpec, syncEvaluator);
    const syncResult = syncLayoutInstance.generateLayout(instance, {});
    
    // Async evaluator and layout
    const asyncEvaluator = await createAsyncEvaluator(instance);
    const asyncLayoutInstance = new LayoutInstanceAsync(layoutSpec, asyncEvaluator);
    const asyncResult = await asyncLayoutInstance.generateLayoutAsync(instance, {});
    
    // Compare results
    expect(asyncResult.layout.nodes.length).toBe(syncResult.layout.nodes.length);
    expect(asyncResult.layout.edges.length).toBe(syncResult.layout.edges.length);
    expect(asyncResult.layout.constraints.length).toBe(syncResult.layout.constraints.length);
    
    // Compare node IDs
    const syncNodeIds = syncResult.layout.nodes.map(n => n.id).sort();
    const asyncNodeIds = asyncResult.layout.nodes.map(n => n.id).sort();
    expect(asyncNodeIds).toEqual(syncNodeIds);
  });
});
