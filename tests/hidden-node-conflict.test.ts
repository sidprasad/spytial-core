/**
 * Tests for hidden-node conflict detection and reporting.
 *
 * When a hideAtom directive hides a node that is also referenced by a layout constraint
 * (orientation or alignment), the spec is unsatisfiable — the atom cannot be both hidden
 * and placed. The system should:
 * 1. Report the conflict as an error, in an IIS-like table format
 *    (Source Constraints | Diagram Elements)
 * 2. Return a counterfactual layout in which the conflicting hidden atoms are shown
 *    despite the hide (marked on layout.reintroducedNodes; drawn with a dashed outline)
 *    so the conflicting relationships are visible
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

    it('reports a conflict when the hidden atom appears only as a tuple target', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: D
`);

      // D appears only as the target of the (C, D) tuple — target references
      // conflict just like source references do.
      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
    });

    it('returns no error when the hidden atom is not referenced by any constraint', () => {
      const dataWithExtra = {
        ...testData,
        atoms: [...testData.atoms, { id: 'E', type: 'Isolated', label: 'E' }]
      };

      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: Isolated
`, dataWithExtra);

      // E is in no edge tuple, so the hide simply applies.
      expect(result.error).toBeNull();
      expect(result.layout.nodes.map(n => n.id)).not.toContain('E');
      expect(result.layout.reintroducedNodes).toBeUndefined();
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

  describe('Counterfactual layout (hidden atoms shown)', () => {
    it('shows the hidden node in the counterfactual rather than removing it', () => {
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

  describe('Marking of conflicting hidden atoms', () => {
    it('marks the shown-despite-hide atom in layout.reintroducedNodes', () => {
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

    it('reports the shown atoms and the unsatisfiability on the error', () => {
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
      expect(error.reintroducedNodeIds).toContain('B');
      expect(error.message).toContain('cannot both be satisfied');
    });

    it('keeps all constraints in the counterfactual (nothing is silently dropped)', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // The error stands, but the counterfactual keeps every constraint.
      expect(result.error).not.toBeNull();
      // All edge tuples are kept as constraints (A->B, B->C, C->D = 3 orientation constraints).
      expect(result.layout.constraints.length).toBeGreaterThanOrEqual(3);
    });

    it('shows both ends when every atom of a relationship is hidden', () => {
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

  describe('Cyclic constraints', () => {
    const ringData = {
      atoms: [
        { id: 'X', type: 'Node', label: 'X' },
        { id: 'Y', type: 'Node', label: 'Y' },
        { id: 'Z', type: 'Node', label: 'Z' },
      ],
      relations: [
        {
          id: 'next',
          name: 'next',
          types: ['Node', 'Node'],
          tuples: [
            { atoms: ['X', 'Y'], types: ['Node', 'Node'] },
            { atoms: ['Y', 'Z'], types: ['Node', 'Node'] },
            { atoms: ['Z', 'X'], types: ['Node', 'Node'] },
          ]
        }
      ]
    };

    it('reports a hidden-node conflict when a cyclic constraint references a hidden atom', () => {
      const result = createLayout(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
directives:
  - hideAtom:
      selector: Y
`, ringData);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      // The counterfactual shows Y on the cycle despite the hide.
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toContain('Y');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('Y');
      expect(reintroduced).not.toContain('X');
      expect(reintroduced).not.toContain('Z');
    });

    it('produces no error when the hidden atom is not on the cycle', () => {
      const dataWithExtra = {
        ...ringData,
        atoms: [...ringData.atoms, { id: 'W', type: 'Other', label: 'W' }]
      };

      const result = createLayout(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
directives:
  - hideAtom:
      selector: Other
`, dataWithExtra);

      expect(result.error).toBeNull();
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('W');
    });
  });

  describe('Group constraints', () => {
    // group over `edge` (binary selector): key = tuple[0], member = tuple[1]
    // → bucket[A] contains B, bucket[B] contains C, bucket[C] contains D.

    it('reports a hidden-node conflict when a hidden atom is a group member', () => {
      const result = createLayout(`
constraints:
  - group:
      selector: edge
      name: bucket
directives:
  - hideAtom:
      selector: D
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      // The counterfactual shows D inside its group despite the hide.
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toContain('D');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('D');
      expect(result.layout.groups.some(gr => gr.nodeIds.includes('D'))).toBe(true);
    });

    it('does NOT report a conflict when the hidden atom is only a group key', () => {
      // Hiding a binary group's key while keeping the group is a sanctioned
      // pattern (the key is not inside the hull; see inferred-edge draw tests).
      const result = createLayout(`
constraints:
  - group:
      selector: edge
      name: bucket
directives:
  - hideAtom:
      selector: A
`);

      // A is only ever a key (bucket[A]), never a member: no conflict, A stays hidden.
      expect(result.error).toBeNull();
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('A');
      // The group A keyed still exists, containing its member B.
      expect(result.layout.groups.some(gr => gr.nodeIds.includes('B'))).toBe(true);
    });

    it('produces no error when the hidden atom is in no group', () => {
      const dataWithExtra = {
        ...testData,
        atoms: [...testData.atoms, { id: 'E', type: 'Other', label: 'E' }]
      };

      const result = createLayout(`
constraints:
  - group:
      selector: edge
      name: bucket
directives:
  - hideAtom:
      selector: Other
`, dataWithExtra);

      expect(result.error).toBeNull();
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('E');
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

  describe('Counterfactual shows the conflicting relationships', () => {
    it('draws the edges of the shown-despite-hide atom', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
`);

      // The whole point of the counterfactual: the relationships that made the
      // hide unsatisfiable are visible. B touches A->B and B->C.
      const touchingB = result.layout.edges.filter(
        e => e.source.id === 'B' || e.target.id === 'B'
      );
      expect(touchingB.length).toBeGreaterThanOrEqual(2);
      expect(touchingB.some(e => e.source.id === 'A' && e.target.id === 'B')).toBe(true);
      expect(touchingB.some(e => e.source.id === 'B' && e.target.id === 'C')).toBe(true);
    });

    it('leaves reintroducedNodes unset when there is no conflict', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives: []
`);

      expect(result.error).toBeNull();
      expect(result.layout.reintroducedNodes).toBeUndefined();
    });
  });

  describe('Error-slot precedence', () => {
    it('a genuine positional conflict in the counterfactual takes precedence, but the atoms stay marked', () => {
      // right AND left on every edge tuple is contradictory regardless of the hide;
      // the counterfactual pass surfaces that as the (also unsat) primary error.
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
  - orientation:
      selector: edge
      directions: [left]
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('positional-conflict');

      // The hide conflict is still visible on the layout itself.
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('B');
    });
  });

  describe('Negated constraints', () => {
    it('a negated orientation referencing a hidden atom is still a conflict', () => {
      // The tuple-level check runs before negation handling: NOT(A right of B)
      // still places B, so it cannot hold with B hidden.
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
      hold: never
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('B');
    });

    it('a negated cyclic constraint referencing a hidden atom is still a conflict', () => {
      const ringData = {
        atoms: [
          { id: 'X', type: 'Node', label: 'X' },
          { id: 'Y', type: 'Node', label: 'Y' },
          { id: 'Z', type: 'Node', label: 'Z' },
        ],
        relations: [
          {
            id: 'next',
            name: 'next',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['X', 'Y'], types: ['Node', 'Node'] },
              { atoms: ['Y', 'Z'], types: ['Node', 'Node'] },
              { atoms: ['Z', 'X'], types: ['Node', 'Node'] },
            ]
          }
        ]
      };

      const result = createLayout(`
constraints:
  - cyclic:
      selector: next
      direction: clockwise
      hold: never
directives:
  - hideAtom:
      selector: Y
`, ringData);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('Y');
    });

    it('a hidden member of a negated group is NOT a conflict', () => {
      // A negated group asserts non-containment; hiding a member does not
      // contradict it, so the hide simply applies.
      const result = createLayout(`
constraints:
  - group:
      selector: edge
      name: bucket
      hold: never
directives:
  - hideAtom:
      selector: D
`);

      expect(result.error?.type).not.toBe('hidden-node-conflict');
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).not.toContain('D');
      expect(result.layout.reintroducedNodes).toBeUndefined();
    });
  });

  describe('Unary group selectors', () => {
    it('reports a conflict when a hidden atom is a member of a unary group', () => {
      // Unary selector: every Node atom is a member (there is no separate key).
      const result = createLayout(`
constraints:
  - group:
      selector: Node
      name: blob
directives:
  - hideAtom:
      selector: B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toContain('B');
      expect(result.layout.groups.some(gr => gr.nodeIds.includes('B'))).toBe(true);
    });
  });

  describe('Interactions across constraint families', () => {
    it('lists every conflicting source when one hidden atom is referenced by a constraint and a group', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
  - group:
      selector: edge
      name: bucket
directives:
  - hideAtom:
      selector: D
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const error = result.error as HiddenNodeConflictError;
      const sourceKeys = [...error.errorMessages.minimalConflictingConstraints.keys()];
      expect(sourceKeys.some(k => k.includes('OrientationConstraint'))).toBe(true);
      expect(sourceKeys.some(k => k.includes('GroupBySelector'))).toBe(true);
      expect(sourceKeys.some(k => k.includes('hideAtom'))).toBe(true);

      // D is marked exactly once despite conflicting with two sources.
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toEqual(['D']);
      expect(error.reintroducedNodeIds).toEqual(['D']);
    });

    it('carries spec warnings on the counterfactual result (the second pass does not lose them)', () => {
      // The deprecated group-by-field form raises a parse warning AND builds a
      // group whose hidden member conflicts — both must survive the re-run.
      const result = createLayout(`
constraints:
  - group:
      field: edge
      groupOn: 0
      addToGroup: 1
directives:
  - hideAtom:
      selector: D
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const warnings = result.layout.warnings ?? [];
      expect(warnings.length).toBeGreaterThan(0);
      expect(result.warnings?.length).toBe(warnings.length);
    });
  });

  describe('Overlapping hides and shared members', () => {
    it('handles the same atom hidden by two hideAtom directives', () => {
      const result = createLayout(`
constraints:
  - orientation:
      selector: edge
      directions: [right]
directives:
  - hideAtom:
      selector: B
  - hideAtom:
      selector: A + B
`);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      // B is marked exactly once no matter how many selectors hid it.
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced.filter(id => id === 'B')).toEqual(['B']);

      // The table attributes B to the first matching selector.
      const error = result.error as HiddenNodeConflictError;
      const entries = [...error.errorMessages.minimalConflictingConstraints.entries()];
      const hideRows = entries.filter(([key]) => key.includes('hideAtom'));
      expect(hideRows.some(([, descs]) => descs.includes('B is hidden'))).toBe(true);
    });

    it('reintroduces a member shared by two keyed groups into both groups', () => {
      const sharedData = {
        atoms: [
          { id: 'A', type: 'Node', label: 'A' },
          { id: 'B', type: 'Node', label: 'B' },
          { id: 'C', type: 'Node', label: 'C' },
        ],
        relations: [
          {
            id: 'edge',
            name: 'edge',
            types: ['Node', 'Node'],
            tuples: [
              { atoms: ['A', 'C'], types: ['Node', 'Node'] },
              { atoms: ['B', 'C'], types: ['Node', 'Node'] },
            ]
          }
        ]
      };

      const result = createLayout(`
constraints:
  - group:
      selector: edge
      name: bucket
directives:
  - hideAtom:
      selector: C
`, sharedData);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id);
      expect(reintroduced).toEqual(['C']);
      // C is a member of both bucket[A] and bucket[B] in the counterfactual.
      const groupsWithC = result.layout.groups.filter(gr => gr.nodeIds.includes('C'));
      expect(groupsWithC.length).toBe(2);
    });
  });

  describe('Multi-pass convergence (conflicts revealed by re-introduction)', () => {
    it('accumulates conflicts across passes when an aborted first pass hid some of them', () => {
      // Pass 1: hiding B disconnects M, which hideDisconnected then legacy-hides.
      // The r1.r2 orientation references the missing M and aborts constraint
      // generation before the r3 constraint is processed — so Y's conflict is
      // invisible in pass 1. Re-introducing B reconnects M; the next pass reaches
      // r3, finds Y hidden, and the orchestrator must fold that new conflict in.
      const chainData = {
        atoms: [
          { id: 'A', type: 'Node', label: 'A' },
          { id: 'B', type: 'Node', label: 'B' },
          { id: 'M', type: 'Node', label: 'M' },
          { id: 'P', type: 'Node', label: 'P' },
          { id: 'Y', type: 'Node', label: 'Y' },
        ],
        relations: [
          { id: 'r1', name: 'r1', types: ['Node', 'Node'], tuples: [{ atoms: ['A', 'B'], types: ['Node', 'Node'] }] },
          { id: 'r2', name: 'r2', types: ['Node', 'Node'], tuples: [{ atoms: ['B', 'M'], types: ['Node', 'Node'] }] },
          { id: 'r3', name: 'r3', types: ['Node', 'Node'], tuples: [{ atoms: ['P', 'Y'], types: ['Node', 'Node'] }] },
        ]
      };

      const result = createLayout(`
constraints:
  - orientation:
      selector: r1
      directions: [right]
  - orientation:
      selector: r1.r2
      directions: [right]
  - orientation:
      selector: r3
      directions: [right]
directives:
  - hideAtom:
      selector: B
  - hideAtom:
      selector: Y
  - flag: hideDisconnected
`, chainData);

      expect(result.error).not.toBeNull();
      expect(result.error!.type).toBe('hidden-node-conflict');

      // The merged explanation names both conflicting atoms...
      expect(result.error!.message).toContain('B');
      expect(result.error!.message).toContain('Y');

      // ...and the counterfactual shows everything the error talks about.
      const nodeIds = result.layout.nodes.map(n => n.id);
      expect(nodeIds).toEqual(expect.arrayContaining(['A', 'B', 'M', 'P', 'Y']));
      const reintroduced = (result.layout.reintroducedNodes ?? []).map(n => n.id).sort();
      expect(reintroduced).toEqual(['B', 'Y']);
      const error = result.error as HiddenNodeConflictError;
      expect((error.reintroducedNodeIds ?? []).slice().sort()).toEqual(['B', 'Y']);

      // The IIS table covers conflicts from both passes.
      const sourceKeys = [...error.errorMessages.minimalConflictingConstraints.keys()];
      expect(sourceKeys.some(k => k.includes('r1') && !k.includes('r1.r2'))).toBe(true);
      expect(sourceKeys.some(k => k.includes('r3'))).toBe(true);
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
