import { describe, it, expect } from 'vitest';
import { ConstraintValidator, PositionalConstraintError } from '../src/layout/constraint-validator';
import { 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
    AlignmentConstraint,
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, AlignConstraint } from '../src/layout/layoutspec';

describe('IIS Correctness', () => {
    
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
    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source: any): LeftConstraint {
        return {
            left,
            right,
            minDistance: 15,
            sourceConstraint: source,
        };
    }

    // Helper to create an alignment constraint
    function createAlignmentConstraint(node1: LayoutNode, node2: LayoutNode, axis: 'x' | 'y', source: any): AlignmentConstraint {
        return {
            node1,
            node2,
            axis,
            sourceConstraint: source,
        };
    }

    it('should verify IIS is truly minimal - cannot remove any constraint', () => {
        // Create a scenario with redundant constraints
        // A < B < C < D, but we also have A < C and A < D (redundant via transitivity)
        const nodeA = createNode('A');
        const nodeB = createNode('B');
        const nodeC = createNode('C');
        const nodeD = createNode('D');

        const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
        const source2 = new RelativeOrientationConstraint(['left'], 'B->C');
        const source3 = new RelativeOrientationConstraint(['left'], 'C->D');
        const source4 = new RelativeOrientationConstraint(['left'], 'A->C');
        const source5 = new RelativeOrientationConstraint(['left'], 'A->D');
        const source6 = new RelativeOrientationConstraint(['left'], 'D->A'); // This creates the cycle!

        const constraints: LeftConstraint[] = [
            createLeftConstraint(nodeA, nodeB, source1),  // A < B
            createLeftConstraint(nodeB, nodeC, source2),  // B < C
            createLeftConstraint(nodeC, nodeD, source3),  // C < D
            createLeftConstraint(nodeA, nodeC, source4),  // A < C (redundant)
            createLeftConstraint(nodeA, nodeD, source5),  // A < D (redundant)
            createLeftConstraint(nodeD, nodeA, source6),  // D < A (creates cycle A < B < C < D < A)
        ];

        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB, nodeC, nodeD],
            edges: [],
            constraints: constraints,
            groups: [],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        // Should fail due to cycle
        expect(error).not.toBeNull();
        expect(error?.type).toBe('positional-conflict');

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            
            // Collect all constraints from the minimal set
            const minimalConstraints: LeftConstraint[] = [];
            for (const [, layoutConstraints] of positionalError.minimalConflictingSet.entries()) {
                minimalConstraints.push(...layoutConstraints as LeftConstraint[]);
            }

            console.log('IIS size:', minimalConstraints.length);
            console.log('IIS constraints:');
            minimalConstraints.forEach(c => {
                console.log(`  ${c.left.id} < ${c.right.id}`);
            });

            // The IIS should include the constraint that was being added (the conflicting one)
            // which should be D < A
            console.log('Conflicting constraint:', 
                positionalError.conflictingConstraint ? 
                `${(positionalError.conflictingConstraint as LeftConstraint).left.id} < ${(positionalError.conflictingConstraint as LeftConstraint).right.id}` : 
                'unknown');

            // The truly minimal IIS should be 4 constraints forming a cycle:
            // A < B, B < C, C < D, D < A
            // The redundant constraints A < C and A < D should NOT be in the IIS
            
            // Verify that the IIS is truly minimal by checking that we cannot
            // remove ANY single constraint and still have a conflict
            for (let i = 0; i < minimalConstraints.length; i++) {
                const reducedSet = [
                    ...minimalConstraints.slice(0, i),
                    ...minimalConstraints.slice(i + 1)
                ];
                
                // Test if reduced set is still conflicting
                const testLayout: InstanceLayout = {
                    nodes: [nodeA, nodeB, nodeC, nodeD],
                    edges: [],
                    constraints: reducedSet,
                    groups: [],
                };
                
                const testValidator = new ConstraintValidator(testLayout);
                const testError = testValidator.validateConstraints();
                
                // If we can remove this constraint and still have a conflict,
                // then the IIS is NOT minimal!
                if (testError !== null) {
                    const removedConstraint = minimalConstraints[i];
                    console.log(`ERROR: IIS is not minimal! Can remove ${removedConstraint.left.id} < ${removedConstraint.right.id} and still have conflict`);
                    expect(testError).toBeNull(); // This should fail if IIS is not minimal
                }
            }
            
            // If we get here, the IIS is truly minimal
            console.log('IIS is verified to be minimal - cannot remove any constraint');
        }
    });

    it('should produce minimal IIS for simple cycle', () => {
        // Simple 3-node cycle: A < B < C < A
        const nodeA = createNode('A');
        const nodeB = createNode('B');
        const nodeC = createNode('C');

        const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
        const source2 = new RelativeOrientationConstraint(['left'], 'B->C');
        const source3 = new RelativeOrientationConstraint(['left'], 'C->A');

        const constraints: LeftConstraint[] = [
            createLeftConstraint(nodeA, nodeB, source1),
            createLeftConstraint(nodeB, nodeC, source2),
            createLeftConstraint(nodeC, nodeA, source3),
        ];

        const layout: InstanceLayout = {
            nodes: [nodeA, nodeB, nodeC],
            edges: [],
            constraints: constraints,
            groups: [],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        expect(error).not.toBeNull();

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            
            const minimalConstraints: LeftConstraint[] = [];
            for (const [, layoutConstraints] of positionalError.minimalConflictingSet.entries()) {
                minimalConstraints.push(...layoutConstraints as LeftConstraint[]);
            }

            // For a simple 3-cycle, the FULL IIS should be exactly 3 constraints
            // But the minimalConflictingSet only contains the "existing" constraints
            // The conflicting constraint is reported separately
            
            // Count total: minimalConflictingSet + conflictingConstraint
            const totalIISSize = minimalConstraints.length + 1; // +1 for conflictingConstraint
            console.log('Total IIS size (including conflicting constraint):', totalIISSize);
            expect(totalIISSize).toBe(3);
            
            console.log('Simple cycle IIS:');
            minimalConstraints.forEach(c => {
                console.log(`  ${c.left.id} < ${c.right.id}`);
            });
        }
    });
});
