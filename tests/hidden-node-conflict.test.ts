/**
 * Tests for hidden-node conflict detection and reporting.
 * 
 * When a hideAtom directive hides a node that is also referenced by a layout constraint
 * (orientation or alignment), the system should:
 * 1. Report the conflict in an IIS-like table format (Source Constraints | Diagram Elements)
 * 2. Drop the conflicting pairwise constraints from the layout (counterfactual)
 * 3. Still produce a valid layout with the remaining constraints
 */

import { describe, it, expect } from 'vitest';
import { parseLayoutSpec, LayoutInstance } from '../src/layout';
import { isHiddenNodeConflictError, HiddenNodeConflictError } from '../src/layout/constraint-validator';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { SGraphQueryEvaluator } from '../src/evaluators/sgq-evaluator';

describe('Hidden Node Conflict Detection', () => {
  const testData = {
    atoms: [
      { id: 'A', type: 'Node', label: 'A' },
      { id: 'B', type: 'Node', label: 'B' },
      { id: 'C', type: 'Node', label: 'C' },
      { id: 'D', type: 'Node', label: 'D' },
    ],
    relations: [
      {
        id: 'edge',
        name: 'edge',
        types: ['Node', 'Node'],
        tuples: [
          { atoms: ['A', 'B'], types: ['Node', 'Node'] },
          { atoms: ['B', 'C'], types: ['Node', 'Node'] },
          { atoms: ['C', 'D'], types: ['Node', 'Node'] },
        ]
      }
    ]
  };

  function createLayout(yaml: string, data = testData) {
    const layoutSpec = parseLayoutSpec(yaml);
    const dataInstance = new JSONDataInstance(data);
    const evaluator = new SGraphQueryEvaluator();
    evaluator.initialize({ sourceData: dataInstance });
    const layoutInstance = new LayoutInstance(layoutSpec, evaluator, 0, true);
    return layoutInstance.generateLayout(dataInstance);
  }

  describe('Error type and structure', () => {
    it('returns a hidden-node-conflict error when orientation constraint references a hidden node', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
      expect(isHiddenNodeConflictError(result.error)).toBe(true);
    });

    it('returns a hidden-node-conflict error when align constraint references a hidden node', () => {
      const result = createLayout(`
constraints:
  - align:
      selector: edge
      direction: horizontal
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
      expect(isHiddenNodeConflictError(result.error)).toBe(true);
    });

    it('returns no error when hidden nodes are not referenced by any constraint', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: D
`);

      // D is only referenced by C->D, and D is hidden.
      // C->D tuple will be skipped, A->B and B->C are valid.
      // This produces a conflict because D is referenced in edge tuples.
      // Wait — D is in the tuple (C, D), so the orientation constraint
      // DOES reference D as targetNodeId. So there IS a conflict.
      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
    });

    it('returns no error when no hideAtom directive is present', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives: []
`);

      expect(result.error).toBeNull();
    });
  });

  describe('Error messages (IIS-like table format)', () => {
    it('includes errorMessages with the IIS-like table structure', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      expect(error.errorMessages).toBeDefined();
      expect(error.errorMessages.minimalConflictingConstraints).toBeInstanceOf(Map);

      // Should have at least 2 entries in the map:
      // 1. The orientation constraint source → dropped pairwise constraints
      // 2. The hideAtom directive → which nodes it hid
      const entries = [...error.errorMessages.minimalConflictingConstraints.entries()];
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('includes the hideAtom directive in the source constraints', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      const sourceKeys = [...error.errorMessages.minimalConflictingConstraints.keys()];

      // One of the keys should be the hideAtom directive
      const hideAtomKey = sourceKeys.find(key => key.includes('hideAtom'));
      expect(hideAtomKey).toBeDefined();
      expect(hideAtomKey).toContain('B');
    });

    it('includes the orientation constraint in the source constraints', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      const sourceKeys = [...error.errorMessages.minimalConflictingConstraints.keys()];

      // One of the keys should be the orientation constraint
      const orientationKey = sourceKeys.find(key => key.includes('OrientationConstraint'));
      expect(orientationKey).toBeDefined();
      expect(orientationKey).toContain('edge');
    });

    it('lists hidden nodes in the diagram elements for hideAtom entry', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      const entries = [...error.errorMessages.minimalConflictingConstraints.entries()];

      const hideAtomEntry = entries.find(([key]) => key.includes('hideAtom'));
      expect(hideAtomEntry).toBeDefined();
      const [, hiddenDescs] = hideAtomEntry!;
      // Should list "B is hidden"
      expect(hiddenDescs.some(d => d.includes('B') && d.includes('hidden'))).toBe(true);
    });

    it('lists dropped pairwise constraints in the diagram elements for constraint entry', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      const entries = [...error.errorMessages.minimalConflictingConstraints.entries()];

      const constraintEntry = entries.find(([key]) => key.includes('OrientationConstraint'));
      expect(constraintEntry).toBeDefined();
      const [, pairwiseDescs] = constraintEntry!;
      // Should describe the dropped pairwise constraints involving B
      expect(pairwiseDescs.length).toBeGreaterThan(0);
      expect(pairwiseDescs.some(d => d.includes('B'))).toBe(true);
    });
  });

  describe('Counterfactual layout (dropped constraints)', () => {
    it('produces a valid layout with the hidden node removed', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('B');
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('C');
      expect(nodeIds).toContain('D');
    });

    it('retains constraints that do not reference hidden nodes', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // A->B and B->C produce constraints involving B, so they are dropped.
      // C->D does NOT involve B, so it should remain.
      expect(result.layout.constraints.length).toBeGreaterThan(0);
      // The C->D constraint should still be present
      const hasCD = result.layout.constraints.some(c => {
        if ('left' in c && 'right' in c) {
          return (c.left.id === 'C' && c.right.id === 'D') || (c.left.id === 'D' && c.right.id === 'C');
        }
        return false;
      });
      expect(hasCD).toBe(true);
    });

    it('drops all constraints referencing hidden nodes', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // No constraint should reference B
      for (const c of result.layout.constraints) {
        if ('left' in c && 'right' in c) {
          expect(c.left.id).not.toBe('B');
          expect(c.right.id).not.toBe('B');
        }
        if ('top' in c && 'bottom' in c) {
          expect(c.top.id).not.toBe('B');
          expect(c.bottom.id).not.toBe('B');
        }
        if ('node1' in c && 'node2' in c) {
          expect(c.node1.id).not.toBe('B');
          expect(c.node2.id).not.toBe('B');
        }
      }
    });
  });

  describe('Multiple hidden nodes and constraints', () => {
    it('handles multiple hidden nodes referenced by the same constraint', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
  - hideAtom:
      selector: C
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const error = result.error as HiddenNodeConflictError;
      // Both B and C should be reported as hidden
      expect(error.message).toContain('B');
      expect(error.message).toContain('C');

      // Layout should not contain B or C
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('B');
      expect(nodeIds).not.toContain('C');
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('D');
    });

    it('handles hidden node referenced by both orientation and alignment constraints', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
  - align:
      selector: edge
      direction: horizontal
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const error = result.error as HiddenNodeConflictError;
      const sourceKeys = [...error.errorMessages.minimalConflictingConstraints.keys()];

      // Should have entries for: orientation constraint, align constraint, and hideAtom
      expect(sourceKeys.length).toBeGreaterThanOrEqual(3);

      // Both constraint types should be represented
      expect(sourceKeys.some(k => k.includes('OrientationConstraint'))).toBe(true);
      expect(sourceKeys.some(k => k.includes('AlignConstraint'))).toBe(true);
      expect(sourceKeys.some(k => k.includes('hideAtom'))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('handles case where all nodes referenced by a constraint are hidden', () => {
      const twoNodeData = {
        atoms: [
          { id: 'X', type: 'Node', label: 'X' },
          { id: 'Y', type: 'Node', label: 'Y' },
        ],
        relations: [
          {
            id: 'rel',
            name: 'rel',
            types: ['Node', 'Node'],
            tuples: [{ atoms: ['X', 'Y'], types: ['Node', 'Node'] }]
          }
        ]
      };

      const result = createLayout(`
constraints:
  - orientation:
      selector: rel
      directions: [right]
directives:
  - hideAtom:
      selector: Node
`, twoNodeData);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      // All constraints should be dropped
      expect(result.layout.constraints.length).toBe(0);
      // No nodes should remain
      expect(result.layout.nodes.length).toBe(0);
    });

    it('produces valid layout when constraint and hide have disjoint selectors', () => {
      const disjointData = {
        atoms: [
          { id: 'A', type: 'TypeA', label: 'A' },
          { id: 'B', type: 'TypeA', label: 'B' },
          { id: 'X', type: 'TypeB', label: 'X' },
        ],
        relations: [
          {
            id: 'r',
            name: 'r',
            types: ['TypeA', 'TypeA'],
            tuples: [{ atoms: ['A', 'B'], types: ['TypeA', 'TypeA'] }]
          }
        ]
      };

      const result = createLayout(`
constraints:
  - orientation:
      selector: r
      directions: [right]
directives:
  - hideAtom:
      selector: TypeB
`, disjointData);

      // No conflict since the hidden node X is not referenced by the constraint
      expect(result.error).toBeNull();
      expect(result.layout.constraints.length).toBeGreaterThan(0);
    });

    it('hiddenNodes map tracks which selector hid each node', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      expect(error.hiddenNodes).toBeInstanceOf(Map);
      expect(error.hiddenNodes.get('B')).toBe('B');
    });

    it('droppedConstraints map tracks which constraints were dropped', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      expect(error.droppedConstraints).toBeInstanceOf(Map);
      expect(error.droppedConstraints.size).toBeGreaterThan(0);

      // Should have entry for the orientation constraint source
      for (const [key, descs] of error.droppedConstraints) {
        expect(descs.length).toBeGreaterThan(0);
        // All dropped constraints should mention B
        expect(descs.every(d => d.includes('B'))).toBe(true);
      }
    });
  });

  describe('isHiddenNodeConflictError type guard', () => {
    it('returns true for hidden-node-conflict errors', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      expect(isHiddenNodeConflictError(result.error)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isHiddenNodeConflictError(null)).toBe(false);
    });

    it('returns false for non-hidden-node errors', () => {
      expect(isHiddenNodeConflictError({ type: 'positional-conflict' })).toBe(false);
      expect(isHiddenNodeConflictError({ type: 'unknown-constraint' })).toBe(false);
    });
  });
});
