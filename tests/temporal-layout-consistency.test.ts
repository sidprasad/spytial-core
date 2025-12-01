import { describe, it, expect } from 'vitest';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';
import { WebColaTranslator, WebColaLayoutOptions, NodePositionHint } from '../src/translators/webcola/webcolatranslator';

/**
 * Test for temporal Alloy rendering consistency.
 * 
 * When rendering temporal sequences from Alloy, atoms remain roughly the same
 * but tuples (relations) may change. To maintain visual stability, we need
 * a mechanism to pass prior node positions to subsequent renders.
 */

// First temporal state: A -> B
const jsonData1: IJsonDataInstance = {
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
      tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }]
    }
  ]
};

// Second temporal state: A -> B -> C (same atoms, different relations)
const jsonData2: IJsonDataInstance = {
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

// Third temporal state: only A -> C (removing B from sequence)
const jsonData3: IJsonDataInstance = {
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
      tuples: [{ atoms: ['A', 'C'], types: ['Node', 'Node'] }]
    }
  ]
};

const layoutSpecStr = `
constraints:
  - orientation:
      selector: next
      directions:
        - right
`;

const layoutSpec = parseLayoutSpec(layoutSpecStr);

function createEvaluator(instance: JSONDataInstance) {
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: instance });
  return evaluator;
}

describe('Temporal Layout Consistency', () => {
  describe('WebColaLayoutOptions', () => {
    it('accepts prior positions option in translate()', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      const translator = new WebColaTranslator();
      
      // Define prior positions
      const priorPositions: NodePositionHint[] = [
        { id: 'A', x: 100, y: 200 },
        { id: 'B', x: 300, y: 200 },
        { id: 'C', x: 500, y: 200 }
      ];

      const options: WebColaLayoutOptions = {
        priorPositions
      };

      const result = await translator.translate(layout, 800, 600, options);

      // Verify nodes exist
      expect(result.colaNodes).toHaveLength(3);
      
      // Verify nodes with prior positions use those positions
      const nodeA = result.colaNodes.find(n => n.id === 'A');
      const nodeB = result.colaNodes.find(n => n.id === 'B');
      const nodeC = result.colaNodes.find(n => n.id === 'C');

      expect(nodeA).toBeDefined();
      expect(nodeB).toBeDefined();
      expect(nodeC).toBeDefined();

      // Nodes should start at the prior positions
      expect(nodeA!.x).toBe(100);
      expect(nodeA!.y).toBe(200);
      expect(nodeB!.x).toBe(300);
      expect(nodeB!.y).toBe(200);
      expect(nodeC!.x).toBe(500);
      expect(nodeC!.y).toBe(200);
    });

    it('uses DAGRE positions for nodes without prior positions', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      const translator = new WebColaTranslator();
      
      // Only provide prior position for node A
      const priorPositions: NodePositionHint[] = [
        { id: 'A', x: 100, y: 200 }
      ];

      const options: WebColaLayoutOptions = {
        priorPositions
      };

      const result = await translator.translate(layout, 800, 600, options);

      const nodeA = result.colaNodes.find(n => n.id === 'A');
      const nodeB = result.colaNodes.find(n => n.id === 'B');

      // A should use prior position
      expect(nodeA!.x).toBe(100);
      expect(nodeA!.y).toBe(200);

      // B should use DAGRE-computed position (not default center)
      // DAGRE positions will vary, but they shouldn't be the default center (400, 300)
      expect(nodeB).toBeDefined();
      // B's position will be computed by DAGRE, just verify it exists
      expect(typeof nodeB!.x).toBe('number');
      expect(typeof nodeB!.y).toBe('number');
    });

    it('falls back to defaults when no prior positions or DAGRE available', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      const translator = new WebColaTranslator();
      
      // No prior positions
      const result = await translator.translate(layout, 800, 600);

      // All nodes should have positions (computed by DAGRE)
      for (const node of result.colaNodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
      }
    });
  });

  describe('Simulated Temporal Sequence', () => {
    it('can render temporal sequence with consistent positions', async () => {
      const translator = new WebColaTranslator();

      // First temporal state
      const instance1 = new JSONDataInstance(jsonData1);
      const evaluator1 = createEvaluator(instance1);
      const layoutInstance1 = new LayoutInstance(layoutSpec, evaluator1, 0, true);
      const { layout: layout1 } = layoutInstance1.generateLayout(instance1, {});
      
      const result1 = await translator.translate(layout1, 800, 600);
      
      // Extract positions from first render
      const priorPositions: NodePositionHint[] = result1.colaNodes.map(node => ({
        id: node.id,
        x: node.x || 0,
        y: node.y || 0
      }));

      // Second temporal state with prior positions
      const instance2 = new JSONDataInstance(jsonData2);
      const evaluator2 = createEvaluator(instance2);
      const layoutInstance2 = new LayoutInstance(layoutSpec, evaluator2, 0, true);
      const { layout: layout2 } = layoutInstance2.generateLayout(instance2, {});
      
      const result2 = await translator.translate(layout2, 800, 600, { priorPositions });

      // Verify nodes exist in second render
      expect(result2.colaNodes).toHaveLength(3);

      // Get nodes from both renders
      const nodesById1 = new Map(result1.colaNodes.map(n => [n.id, n]));
      const nodesById2 = new Map(result2.colaNodes.map(n => [n.id, n]));

      // Verify that shared nodes (A, B, C) start at the same positions in the second render
      for (const priorPos of priorPositions) {
        const node2 = nodesById2.get(priorPos.id);
        expect(node2).toBeDefined();
        expect(node2!.x).toBe(priorPos.x);
        expect(node2!.y).toBe(priorPos.y);
      }
    });

    it('handles atom additions/removals in temporal sequence', async () => {
      const translator = new WebColaTranslator();

      // Base state with A, B, C
      const instance1 = new JSONDataInstance(jsonData1);
      const evaluator1 = createEvaluator(instance1);
      const layoutInstance1 = new LayoutInstance(layoutSpec, evaluator1, 0, true);
      const { layout: layout1 } = layoutInstance1.generateLayout(instance1, {});
      
      const result1 = await translator.translate(layout1, 800, 600);
      
      // Save positions
      const priorPositions: NodePositionHint[] = result1.colaNodes.map(node => ({
        id: node.id,
        x: node.x || 0,
        y: node.y || 0
      }));

      // New state with a new atom D
      const jsonDataWithNewAtom: IJsonDataInstance = {
        atoms: [
          { id: 'A', type: 'Node', label: 'A' },
          { id: 'B', type: 'Node', label: 'B' },
          { id: 'C', type: 'Node', label: 'C' },
          { id: 'D', type: 'Node', label: 'D' } // New atom
        ],
        relations: [
          {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['A', 'B'], types: ['Node', 'Node'] },
              { atoms: ['C', 'D'], types: ['Node', 'Node'] }
            ]
          }
        ]
      };

      const instance2 = new JSONDataInstance(jsonDataWithNewAtom);
      const evaluator2 = createEvaluator(instance2);
      const layoutInstance2 = new LayoutInstance(layoutSpec, evaluator2, 0, true);
      const { layout: layout2 } = layoutInstance2.generateLayout(instance2, {});
      
      const result2 = await translator.translate(layout2, 800, 600, { priorPositions });

      // Verify all 4 nodes exist
      expect(result2.colaNodes).toHaveLength(4);

      // Existing nodes should have their prior positions
      const nodeA = result2.colaNodes.find(n => n.id === 'A');
      const nodeB = result2.colaNodes.find(n => n.id === 'B');
      const nodeC = result2.colaNodes.find(n => n.id === 'C');
      const nodeD = result2.colaNodes.find(n => n.id === 'D');

      expect(nodeA!.x).toBe(priorPositions.find(p => p.id === 'A')!.x);
      expect(nodeB!.x).toBe(priorPositions.find(p => p.id === 'B')!.x);
      expect(nodeC!.x).toBe(priorPositions.find(p => p.id === 'C')!.x);

      // New node D should have a position (computed by DAGRE)
      expect(typeof nodeD!.x).toBe('number');
      expect(typeof nodeD!.y).toBe('number');
    });
  });

  describe('Edge cases', () => {
    it('handles empty prior positions array', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      const translator = new WebColaTranslator();
      
      const options: WebColaLayoutOptions = {
        priorPositions: []
      };

      const result = await translator.translate(layout, 800, 600, options);

      // Should still work and use DAGRE positions
      expect(result.colaNodes).toHaveLength(3);
      for (const node of result.colaNodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
      }
    });

    it('ignores prior positions for non-existent nodes', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance, {});

      const translator = new WebColaTranslator();
      
      // Prior position for a node that doesn't exist in this layout
      const priorPositions: NodePositionHint[] = [
        { id: 'A', x: 100, y: 200 },
        { id: 'NonExistentNode', x: 999, y: 999 }
      ];

      const options: WebColaLayoutOptions = {
        priorPositions
      };

      const result = await translator.translate(layout, 800, 600, options);

      // Only 3 nodes should exist (A, B, C)
      expect(result.colaNodes).toHaveLength(3);
      
      // A should still use its prior position
      const nodeA = result.colaNodes.find(n => n.id === 'A');
      expect(nodeA!.x).toBe(100);
      expect(nodeA!.y).toBe(200);

      // NonExistentNode should not be in the result
      const nonExistent = result.colaNodes.find(n => n.id === 'NonExistentNode');
      expect(nonExistent).toBeUndefined();
    });
  });
});
