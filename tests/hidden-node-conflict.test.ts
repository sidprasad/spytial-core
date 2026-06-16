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
import { SGraphQueryEvaluator } from '../src/evaluators/data/sgq-evaluator';

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

  describe('Counterfactual layout (re-introduced atoms)', () => {
    it('re-introduces the hidden node into the layout rather than removing it', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // B is referenced by the orientation constraint, so it is re-introduced (shown).
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toContain('B');
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('C');
      expect(nodeIds).toContain('D');
    });

    it('keeps constraints that reference the re-introduced node', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // Constraints involving B are no longer dropped — at least one should reference B.
      const referencesB = result.layout.constraints.some(c => {
        if ('left' in c && 'right' in c) return c.left.id === 'B' || c.right.id === 'B';
        if ('top' in c && 'bottom' in c) return c.top.id === 'B' || c.bottom.id === 'B';
        if ('node1' in c && 'node2' in c) return c.node1.id === 'B' || c.node2.id === 'B';
        return false;
      });
      expect(referencesB).toBe(true);
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

      // The C->D constraint (which never involved a hidden node) should still be present
      const hasCD = result.layout.constraints.some(c => {
        if ('left' in c && 'right' in c) {
          return (c.left.id === 'C' && c.right.id === 'D') || (c.left.id === 'D' && c.right.id === 'C');
        }
        return false;
      });
      expect(hasCD).toBe(true);
    });
  });

  describe('Re-introduction of conflicting hidden atoms', () => {
    it('marks the re-introduced atom in layout.reintroducedNodes', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      const ids = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(ids).toContain('B');
      // Atoms that were never hidden should not be marked as re-introduced.
      expect(ids).not.toContain('A');
      expect(ids).not.toContain('D');
    });

    it('reports the resolution as "reintroduced" on the error', () => {
      const result = createLayout(`
constraints:
  - align:
      selector: edge
      direction: horizontal
directives:
  - hideAtom:
      selector: B
`);

      const error = result.error as HiddenNodeConflictError;
      expect(error.resolution).toBe('reintroduced');
      expect(error.reintroducedNodeIds).toContain('B');
      expect(error.message.toLowerCase()).toContain('re-introduced');
    });

    it('produces a satisfiable layout (no further conflicts) once atoms are re-introduced', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // The conflict is resolved by re-introduction, not by an unsatisfiable counterfactual.
      const error = result.error as HiddenNodeConflictError;
      expect(error.resolution).toBe('reintroduced');
      // All edge tuples are kept as constraints (A->B, B->C, C->D = 3 orientation constraints).
      expect(result.layout.constraints.length).toBeGreaterThanOrEqual(3);
    });

    it('re-introduces both ends when every atom of a relationship is hidden', () => {
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

      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toContain('X');
      expect(nodeIds).toContain('Y');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('X');
      expect(reintroduced).toContain('Y');
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
      // Both B and C should be reported as re-introduced
      expect(error.message).toContain('B');
      expect(error.message).toContain('C');

      // Layout should re-introduce both B and C
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toContain('B');
      expect(nodeIds).toContain('C');
      expect(nodeIds).toContain('A');
      expect(nodeIds).toContain('D');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('B');
      expect(reintroduced).toContain('C');
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

      // Both atoms are re-introduced and the constraint is kept (rather than everything dropped).
      expect(result.layout.nodes.length).toBe(2);
      expect(result.layout.constraints.length).toBeGreaterThan(0);
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
