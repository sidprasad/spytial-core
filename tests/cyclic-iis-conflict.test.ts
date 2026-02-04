import { describe, it, expect } from 'vitest';
import { ConstraintValidator, PositionalConstraintError } from '../src/layout/constraint-validator';
import { 
    DisjunctiveConstraint, 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
    isLeftConstraint
} from '../src/layout/interfaces';
import { CyclicOrientationConstraint } from '../src/layout/layoutspec';

/**
 * Tests for IIS (Irreducible Infeasible Set) extraction when two cyclic constraints conflict.
 * 
 * Bug reproduction: When two cyclic constraints conflict (e.g., clockwise on `below` and `~below`),
 * the IIS report should include constraints from BOTH cyclic sources, not just one.
 */
describe('Cyclic IIS Conflict', () => {
    // Helper to create a simple node
    function createNode(id: string, label?: string): LayoutNode {
        return {
            id,
            label: label || id,
            color: 'black',
            groups: [],
            attributes: {},
            width: 100,
            height: 60,
            mostSpecificType: 'Node',
            types: ['Node'],
            showLabels: true,
        };
    }

    // Helper to create a left constraint
    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source: CyclicOrientationConstraint): LeftConstraint {
        return {
            left,
            right,
            minDistance: 15,
            sourceConstraint: source,
        };
    }

    it('should include constraints from BOTH cyclic sources when two cyclic constraints conflict', () => {
        // This test simulates a conflict between two cyclic constraints
        // where NO combination of alternatives from both can be satisfied together
        
        const nodeA = createNode('Mouth');
        const nodeB = createNode('Chin');

        // Two cyclic constraints that create incompatible orderings
        const cyclicSource1 = new CyclicOrientationConstraint('clockwise', 'below');
        const cyclicSource2 = new CyclicOrientationConstraint('clockwise', '~below');

        // Cyclic constraint 1: A must be left of B (all alternatives agree)
        const cyclic1Alt1 = [
            createLeftConstraint(nodeA, nodeB, cyclicSource1), // A < B
        ];
        const cyclic1Alt2 = [
            createLeftConstraint(nodeA, nodeB, cyclicSource1), // A < B (same, different rotation)
        ];

        // Cyclic constraint 2: B must be left of A (all alternatives agree) - CONFLICT!
        const cyclic2Alt1 = [
            createLeftConstraint(nodeB, nodeA, cyclicSource2), // B < A
        ];
        const cyclic2Alt2 = [
            createLeftConstraint(nodeB, nodeA, cyclicSource2), // B < A (same, different rotation)
        ];

        const disjunction1 = new DisjunctiveConstraint(cyclicSource1, [cyclic1Alt1, cyclic1Alt2]);
        const disjunction2 = new DisjunctiveConstraint(cyclicSource2, [cyclic2Alt1, cyclic2Alt2]);

        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB],
            edges: [],
            constraints: [],
            groups: [],
            disjunctiveConstraints: [disjunction1, disjunction2],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        // Should fail because the two cyclic constraints conflict
        expect(error).not.toBeNull();
        expect(error?.type).toBe('positional-conflict');

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            
            // The IIS should include constraints from BOTH cyclic sources
            const sources = Array.from(positionalError.minimalConflictingSet.keys());
            
            // Check if both cyclic sources are represented
            const hasSource1 = sources.some(s => s.toHTML().includes('~below'));
            const hasSource2 = sources.some(s => s.toHTML().includes('below') && !s.toHTML().includes('~below'));
            
            // Both sources should be in the IIS because the conflict is between them
            expect(hasSource1).toBe(true);
            expect(hasSource2).toBe(true);
            expect(positionalError.minimalConflictingSet.size).toBe(2);
        }
    });

    it('should show a simpler conflict between two directly opposing cyclic disjunctions', () => {
        // Simpler case: just 2 nodes with conflicting cyclic orderings
        const nodeA = createNode('A');
        const nodeB = createNode('B');

        const cyclicSource1 = new CyclicOrientationConstraint('clockwise', 'relation1');
        const cyclicSource2 = new CyclicOrientationConstraint('clockwise', 'relation2');

        // Cyclic 1 says A must be left of B
        const disjunction1 = new DisjunctiveConstraint(cyclicSource1, [
            [createLeftConstraint(nodeA, nodeB, cyclicSource1)],
        ]);

        // Cyclic 2 says B must be left of A (conflict!)
        const disjunction2 = new DisjunctiveConstraint(cyclicSource2, [
            [createLeftConstraint(nodeB, nodeA, cyclicSource2)],
        ]);

        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB],
            edges: [],
            constraints: [],
            groups: [],
            disjunctiveConstraints: [disjunction1, disjunction2],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        expect(error).not.toBeNull();
        expect(error?.type).toBe('positional-conflict');

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            
            // Count total constraints in the IIS
            let totalConstraints = 0;
            for (const constraints of positionalError.minimalConflictingSet.values()) {
                totalConstraints += constraints.length;
            }
            
            // We expect both constraints (A < B and B < A) to be in the IIS
            expect(totalConstraints).toBe(2);
            
            // And they should come from both sources
            expect(positionalError.minimalConflictingSet.size).toBe(2);
        }
    });
});
