import { describe, it, expect } from 'vitest';
import { Layout as ColaLayout } from 'webcola';
import { JSONDataInstance, IJsonDataInstance } from '../src/data-instance/json-data-instance';
import { parseLayoutSpec } from '../src/layout/layoutspec';
import { LayoutInstance } from '../src/layout/layoutinstance';
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';
import {
  isLeftConstraint,
  isTopConstraint,
  isAlignmentConstraint,
  LayoutConstraint,
} from '../src/layout/interfaces';
import {
  WebColaTranslator,
  WebColaLayout,
  WebColaLayoutOptions,
  NodePositionHint,
  LayoutState,
  NodeWithMetadata,
} from '../src/translators/webcola/webcolatranslator';

/**
 * Test for sequence layout rendering consistency.
 * 
 * When rendering sequences from Alloy, atoms remain roughly the same
 * but tuples (relations) may change. To maintain visual stability, we need
 * a mechanism to pass prior node positions to subsequent renders.
 */

// First state: A -> B
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

// Second state: A -> B -> C (same atoms, different relations)
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

// Third state: only A -> C (removing B from chain)
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

describe('Sequence Layout Consistency', () => {
  describe('WebColaLayoutOptions', () => {
    it('accepts prior state option in translate()', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const evaluator = createEvaluator(instance);
      const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
      const { layout } = layoutInstance.generateLayout(instance);

      const translator = new WebColaTranslator();
      
      // Define prior state with positions and transform
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 200 },
          { id: 'B', x: 300, y: 200 },
          { id: 'C', x: 500, y: 200 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

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
      const { layout } = layoutInstance.generateLayout(instance);

      const translator = new WebColaTranslator();
      
      // Only provide prior state with position for node A
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 200 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

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
      const { layout } = layoutInstance.generateLayout(instance);

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

  describe('Simulated Sequence', () => {
    it('can render sequence with consistent positions', async () => {
      const translator = new WebColaTranslator();

      // First state
      const instance1 = new JSONDataInstance(jsonData1);
      const evaluator1 = createEvaluator(instance1);
      const layoutInstance1 = new LayoutInstance(layoutSpec, evaluator1, 0, true);
      const { layout: layout1 } = layoutInstance1.generateLayout(instance1);
      
      const result1 = await translator.translate(layout1, 800, 600);
      
      // Extract positions from first render and create prior state
      const priorPositions: LayoutState = {
        positions: result1.colaNodes.map(node => ({
          id: node.id,
          x: node.x || 0,
          y: node.y || 0
        })),
        transform: { k: 1, x: 0, y: 0 }
      };

      // Second state with prior positions
      const instance2 = new JSONDataInstance(jsonData2);
      const evaluator2 = createEvaluator(instance2);
      const layoutInstance2 = new LayoutInstance(layoutSpec, evaluator2, 0, true);
      const { layout: layout2 } = layoutInstance2.generateLayout(instance2);
      
      const result2 = await translator.translate(layout2, 800, 600, { priorPositions });

      // Verify nodes exist in second render
      expect(result2.colaNodes).toHaveLength(3);

      // Get nodes from both renders
      const nodesById1 = new Map(result1.colaNodes.map(n => [n.id, n]));
      const nodesById2 = new Map(result2.colaNodes.map(n => [n.id, n]));

      // Verify that shared nodes (A, B, C) start at the same positions in the second render
      for (const priorPos of priorPositions.positions) {
        const node2 = nodesById2.get(priorPos.id);
        expect(node2).toBeDefined();
        expect(node2!.x).toBe(priorPos.x);
        expect(node2!.y).toBe(priorPos.y);
      }
    });

    it('handles atom additions/removals across sequence steps', async () => {
      const translator = new WebColaTranslator();

      // Base state with A, B, C
      const instance1 = new JSONDataInstance(jsonData1);
      const evaluator1 = createEvaluator(instance1);
      const layoutInstance1 = new LayoutInstance(layoutSpec, evaluator1, 0, true);
      const { layout: layout1 } = layoutInstance1.generateLayout(instance1);
      
      const result1 = await translator.translate(layout1, 800, 600);
      
      // Save positions as prior state
      const priorPositions: LayoutState = {
        positions: result1.colaNodes.map(node => ({
          id: node.id,
          x: node.x || 0,
          y: node.y || 0
        })),
        transform: { k: 1, x: 0, y: 0 }
      };

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
      const { layout: layout2 } = layoutInstance2.generateLayout(instance2);
      
      const result2 = await translator.translate(layout2, 800, 600, { priorPositions });

      // Verify all 4 nodes exist
      expect(result2.colaNodes).toHaveLength(4);

      // Existing nodes should have their prior positions
      const nodeA = result2.colaNodes.find(n => n.id === 'A');
      const nodeB = result2.colaNodes.find(n => n.id === 'B');
      const nodeC = result2.colaNodes.find(n => n.id === 'C');
      const nodeD = result2.colaNodes.find(n => n.id === 'D');

      expect(nodeA!.x).toBe(priorPositions.positions.find(p => p.id === 'A')!.x);
      expect(nodeB!.x).toBe(priorPositions.positions.find(p => p.id === 'B')!.x);
      expect(nodeC!.x).toBe(priorPositions.positions.find(p => p.id === 'C')!.x);

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
      const { layout } = layoutInstance.generateLayout(instance);

      const translator = new WebColaTranslator();
      
      const options: WebColaLayoutOptions = {
        priorPositions: {
          positions: [],
          transform: { k: 1, x: 0, y: 0 }
        }
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
      const { layout } = layoutInstance.generateLayout(instance);

      const translator = new WebColaTranslator();
      
      // Prior state with position for a node that doesn't exist in this layout
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 200 },
          { id: 'NonExistentNode', x: 999, y: 999 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

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

  describe('Constraint-aware locking (lockUnconstrainedNodes)', () => {
    // Layout spec with a "right" orientation constraint: A right-of edges
    // produce a Left-constraint between source and target. Combined with
    // jsonData1 (A -> B), this means there is a LeftConstraint(A, B).
    const layoutInstance = (instance: JSONDataInstance) => {
      const evaluator = createEvaluator(instance);
      return new LayoutInstance(layoutSpec, evaluator, 0, true);
    };

    it('keeps both endpoints locked (fixed=1) when prior positions satisfy the constraint', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      // A at (100, 300), B at (400, 300): A is well to the left of B,
      // so the LeftConstraint(A, B) is already satisfied by the seeds.
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 300 },
          { id: 'B', x: 400, y: 300 },
          { id: 'C', x: 250, y: 500 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(layout, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      const nodeA = result.colaNodes.find(n => n.id === 'A')!;
      const nodeB = result.colaNodes.find(n => n.id === 'B')!;
      const nodeC = result.colaNodes.find(n => n.id === 'C')!;

      // A and B both have prior positions and the LeftConstraint(A, B)
      // is satisfied — both should remain locked.
      expect(nodeA.fixed).toBe(1);
      expect(nodeB.fixed).toBe(1);
      // C is unconstrained and has a prior position — also locked.
      expect(nodeC.fixed).toBe(1);
    });

    it('unfixes both endpoints when prior positions violate the constraint', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      // A at (400, 300), B at (100, 300): A is to the RIGHT of B,
      // violating the LeftConstraint(A, B). Both must be unfixed so the
      // solver can repair.
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 400, y: 300 },
          { id: 'B', x: 100, y: 300 },
          { id: 'C', x: 250, y: 500 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(layout, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      const nodeA = result.colaNodes.find(n => n.id === 'A')!;
      const nodeB = result.colaNodes.find(n => n.id === 'B')!;
      const nodeC = result.colaNodes.find(n => n.id === 'C')!;

      // Both endpoints of the violated constraint are unfixed.
      expect(nodeA.fixed).toBe(0);
      expect(nodeB.fixed).toBe(0);
      // C is unaffected — still locked at its prior position.
      expect(nodeC.fixed).toBe(1);
    });

    it('unfixes only the new endpoint when one side lacks a prior position', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      // Only A has a prior position; B is brand-new in this frame.
      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 300 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

      const translator = new WebColaTranslator();
      const result = await translator.translate(layout, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      const nodeA = result.colaNodes.find(n => n.id === 'A')!;
      const nodeB = result.colaNodes.find(n => n.id === 'B')!;

      // A keeps its prior position locked; B (no prior) is unfixed
      // so the solver can position it relative to A.
      expect(nodeA.fixed).toBe(1);
      expect(nodeB.fixed).toBe(0);
    });

    it('preserves legacy behavior when lockUnconstrainedNodes is false', async () => {
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 100, y: 300 },
          { id: 'B', x: 400, y: 300 },
          { id: 'C', x: 250, y: 500 }
        ],
        transform: { k: 1, x: 0, y: 0 }
      };

      const translator = new WebColaTranslator();
      // No lockUnconstrainedNodes flag (defaults to false): legacy mode
      // should unfix every constrained endpoint and never lock anyone.
      const result = await translator.translate(layout, 800, 600, {
        priorPositions,
      });

      const nodeA = result.colaNodes.find(n => n.id === 'A')!;
      const nodeB = result.colaNodes.find(n => n.id === 'B')!;
      const nodeC = result.colaNodes.find(n => n.id === 'C')!;

      // toColaNode never sets fixed=1 when lockUnconstrainedNodes=false,
      // so all nodes start at fixed=0 — and the post-pass leaves them
      // there.
      expect(nodeA.fixed).toBe(0);
      expect(nodeB.fixed).toBe(0);
      expect(nodeC.fixed).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Post-solver constraint satisfaction.
  //
  // The earlier `Constraint-aware locking` block verifies that the
  // *pre-solver* `fixed` flag is set correctly per the satisfied/
  // violated/unknown verdict. That doesn't actually prove WebCola
  // produces a layout that satisfies the original LayoutConstraints —
  // soft anchors (weight=1000) could in principle lose to a near-
  // infeasible constraint set under reduced iterations.
  //
  // These tests run cola.Layout to convergence and assert each original
  // LayoutConstraint is satisfied at the *final* node positions, with
  // both lockUnconstrainedNodes=true (stability) and =false (legacy).
  // ────────────────────────────────────────────────────────────────────
  describe('Post-solver constraint satisfaction', () => {
    /** Tolerance for "satisfied" — generous enough to absorb solver slack. */
    const SAT_TOL = 5;

    /** Same separation math the translator uses (computeHorizontalSeparation). */
    function requiredHorizontalSep(
      n1: NodeWithMetadata,
      n2: NodeWithMetadata,
      minDistance: number
    ): number {
      const w1 = n1.visualWidth ?? n1.width ?? 100;
      const w2 = n2.visualWidth ?? n2.width ?? 100;
      const base = w1 / 2 + w2 / 2 + minDistance;
      const adaptive = Math.min(Math.max(w1, w2) * 0.1, 20);
      return base + adaptive;
    }

    /** Same separation math the translator uses (computeVerticalSeparation). */
    function requiredVerticalSep(
      n1: NodeWithMetadata,
      n2: NodeWithMetadata,
      minDistance: number
    ): number {
      const h1 = n1.visualHeight ?? n1.height ?? 60;
      const h2 = n2.visualHeight ?? n2.height ?? 60;
      const base = h1 / 2 + h2 / 2 + minDistance;
      const adaptive = Math.min(Math.max(h1, h2) * 0.1, 15);
      return base + adaptive;
    }

    /**
     * Run cola.Layout on a translated WebColaLayout. Mirrors the
     * production setup in webcola-cnd-graph.ts (avoidOverlaps,
     * handleDisconnected, reduced iterations) without needing d3 or DOM.
     */
    function runSolver(layout: WebColaLayout): NodeWithMetadata[] {
      const colaLayout = new ColaLayout()
        .linkDistance(150)
        .convergenceThreshold(0.1)
        .avoidOverlaps(true)
        .handleDisconnected(true)
        .nodes(layout.colaNodes as any)
        .links(layout.colaEdges as any)
        .constraints(layout.colaConstraints as any[])
        .size([layout.FIG_WIDTH, layout.FIG_HEIGHT]);

      // Match the reduced-iterations path used in production when
      // prior positions are present (webcola-cnd-graph.ts:1764-1772).
      colaLayout.start(0, 10, 20, 1);

      return layout.colaNodes;
    }

    /**
     * Walk the original LayoutConstraints and assert each is satisfied
     * at the (post-solver) positions of the colaNodes.
     */
    function assertAllConstraintsSatisfied(
      constraints: LayoutConstraint[],
      colaNodes: NodeWithMetadata[],
      tol: number = SAT_TOL
    ): void {
      const byId = new Map(colaNodes.map(n => [n.id, n]));

      for (const c of constraints) {
        if (isLeftConstraint(c)) {
          const left = byId.get(c.left.id)!;
          const right = byId.get(c.right.id)!;
          const required = requiredHorizontalSep(left, right, c.minDistance);
          const actual = (right.x ?? 0) - (left.x ?? 0);
          expect(
            actual + tol,
            `LeftConstraint ${c.left.id} → ${c.right.id}: ` +
              `actual gap ${actual.toFixed(2)} < required ${required.toFixed(2)}`
          ).toBeGreaterThanOrEqual(required);
        } else if (isTopConstraint(c)) {
          const top = byId.get(c.top.id)!;
          const bottom = byId.get(c.bottom.id)!;
          const required = requiredVerticalSep(top, bottom, c.minDistance);
          const actual = (bottom.y ?? 0) - (top.y ?? 0);
          expect(
            actual + tol,
            `TopConstraint ${c.top.id} → ${c.bottom.id}: ` +
              `actual gap ${actual.toFixed(2)} < required ${required.toFixed(2)}`
          ).toBeGreaterThanOrEqual(required);
        } else if (isAlignmentConstraint(c)) {
          const n1 = byId.get(c.node1.id)!;
          const n2 = byId.get(c.node2.id)!;
          const a = c.axis === 'x' ? (n1.x ?? 0) : (n1.y ?? 0);
          const b = c.axis === 'x' ? (n2.x ?? 0) : (n2.y ?? 0);
          expect(
            Math.abs(a - b),
            `AlignmentConstraint(${c.axis}) ${c.node1.id} ↔ ${c.node2.id}: ` +
              `delta ${Math.abs(a - b).toFixed(2)} > tolerance ${tol}`
          ).toBeLessThanOrEqual(tol);
        }
        // BoundingBox / GroupBoundary / others: not enforced by the
        // translator's WebCola path, so nothing to assert here.
      }
    }

    const layoutInstance = (instance: JSONDataInstance) => {
      const evaluator = createEvaluator(instance);
      return new LayoutInstance(layoutSpec, evaluator, 0, true);
    };

    it('locked endpoints stay near prior positions AND constraint stays satisfied (satisfied prior)', async () => {
      // jsonData1 has A→B; layoutSpec puts A left of B. Prior positions
      // already satisfy the LeftConstraint with comfortable slack.
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 200, y: 400 },
          { id: 'B', x: 600, y: 400 },
          { id: 'C', x: 400, y: 200 },
        ],
        transform: { k: 1, x: 0, y: 0 },
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(layout, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      runSolver(webcolaLayout);

      // The constraint must hold at the final positions.
      assertAllConstraintsSatisfied(layout.constraints, webcolaLayout.colaNodes);

      // And locks should have held: the post-solver positions should
      // be near the prior ones for nodes whose constraints were satisfied.
      // Use a generous drift bound (50px) — the lock isn't a hard pin.
      const finalById = new Map(webcolaLayout.colaNodes.map(n => [n.id, n]));
      for (const prior of priorPositions.positions) {
        const finalNode = finalById.get(prior.id)!;
        const drift = Math.hypot(
          (finalNode.x ?? 0) - prior.x,
          (finalNode.y ?? 0) - prior.y
        );
        expect(
          drift,
          `node ${prior.id} drifted ${drift.toFixed(1)}px from its lock target`
        ).toBeLessThanOrEqual(50);
      }
    });

    it('repairs violated constraint at prior positions (both endpoints unfixed)', async () => {
      // Same instance, but prior positions VIOLATE the LeftConstraint:
      // A.x > B.x. Both should be unfixed and the solver should repair.
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 600, y: 400 },
          { id: 'B', x: 200, y: 400 },
          { id: 'C', x: 400, y: 200 },
        ],
        transform: { k: 1, x: 0, y: 0 },
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(layout, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      runSolver(webcolaLayout);

      // The constraint must hold at the final positions.
      assertAllConstraintsSatisfied(layout.constraints, webcolaLayout.colaNodes);
    });

    it('places a new node so all constraints are satisfied (mixed prior)', async () => {
      // Start with A,B; new state has A,B,C plus chain A→B→C.
      // Provide priors only for A and B (C is new). Solver must place C
      // such that LeftConstraint(B,C) and LeftConstraint(A,B) both hold.
      const instance1 = new JSONDataInstance(jsonData1);
      const evaluator1 = createEvaluator(instance1);
      const layoutInstance1 = new LayoutInstance(layoutSpec, evaluator1, 0, true);
      const { layout: layout1 } = layoutInstance1.generateLayout(instance1);
      const translator = new WebColaTranslator();
      const result1 = await translator.translate(layout1, 800, 600);
      const aNode = result1.colaNodes.find(n => n.id === 'A')!;
      const bNode = result1.colaNodes.find(n => n.id === 'B')!;

      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: aNode.x ?? 200, y: aNode.y ?? 400 },
          { id: 'B', x: bNode.x ?? 600, y: bNode.y ?? 400 },
          // C intentionally omitted — it's the "new" node.
        ],
        transform: { k: 1, x: 0, y: 0 },
      };

      const instance2 = new JSONDataInstance(jsonData2);
      const li2 = layoutInstance(instance2);
      const { layout: layout2 } = li2.generateLayout(instance2);

      const webcolaLayout = await translator.translate(layout2, 800, 600, {
        priorPositions,
        lockUnconstrainedNodes: true,
      });

      runSolver(webcolaLayout);

      // Every constraint in the new layout must hold post-solve.
      assertAllConstraintsSatisfied(layout2.constraints, webcolaLayout.colaNodes);
    });

    it('legacy mode (lockUnconstrainedNodes=false) also satisfies constraints', async () => {
      // Sanity check that the legacy path didn't regress.
      const instance = new JSONDataInstance(jsonData1);
      const li = layoutInstance(instance);
      const { layout } = li.generateLayout(instance);

      const priorPositions: LayoutState = {
        positions: [
          { id: 'A', x: 200, y: 400 },
          { id: 'B', x: 600, y: 400 },
          { id: 'C', x: 400, y: 200 },
        ],
        transform: { k: 1, x: 0, y: 0 },
      };

      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(layout, 800, 600, {
        priorPositions,
        // lockUnconstrainedNodes intentionally omitted (false).
      });

      runSolver(webcolaLayout);
      assertAllConstraintsSatisfied(layout.constraints, webcolaLayout.colaNodes);
    });
  });
});
