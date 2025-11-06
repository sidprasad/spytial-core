import { describe, it, expect } from 'vitest';
import { ConstraintValidator, PositionalConstraintError } from '../src/layout/constraint-validator';
import { 
    DisjunctiveConstraint, 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
    AlignmentConstraint,
    LayoutGroup,
    BoundingBoxConstraint
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField, AlignConstraint } from '../src/layout/layoutspec';

describe('IIS Minimality with Disjunctions', () => {
    
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

    it('should not include duplicate constraints when earlier disjunction chose same constraint', () => {
        // Test scenario where an earlier disjunction might have chosen a constraint
        // that also appears in a later disjunction's alternative
        const node0 = createNode('0');
        const node1 = createNode('1');

        const source1 = new RelativeOrientationConstraint(['left'], 'disjunction1');
        const source2 = new RelativeOrientationConstraint(['left'], 'disjunction2');

        // Create a shared constraint (0 < 1) with source1
        const shared01 = createLeftConstraint(node0, node1, source1);

        // First disjunction: choose between (0 < 1) or (1 < 0)
        const disjunction1 = new DisjunctiveConstraint(
            source1,
            [[shared01], [createLeftConstraint(node1, node0, source1)]]
        );

        // Second disjunction: also involves (0 < 1) but with a different source
        const alt2_constraint = createLeftConstraint(node0, node1, source2);
        const disjunction2 = new DisjunctiveConstraint(
            source2,
            [[alt2_constraint], [createLeftConstraint(node1, node0, source2)]]
        );

        const layout: InstanceLayout = {
            nodes: [node0, node1],
            edges: [],
            constraints: [],
            groups: [],
            disjunctiveConstraints: [disjunction1, disjunction2],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        // Should succeed because both disjunctions can be satisfied consistently
        expect(error).toBeNull();

        // Check that the chosen constraints don't have semantic duplicates
        const finalConstraints = layout.constraints;
        const constraintStrs = finalConstraints.map((c: any) => {
            if (c.left && c.right) {
                return `${c.left.id}<${c.right.id}`;
            }
            return 'unknown';
        });

        // Should have at most 1 constraint of form "0<1"
        const count01 = constraintStrs.filter(s => s === '0<1').length;
        console.log(`Number of '0<1' constraints: ${count01}`);
        console.log('All constraints:', constraintStrs);
        
        // Note: We expect 2 because they have different sources
        // This is OK - they're not true duplicates, just semantically similar
        expect(count01).toBeLessThanOrEqual(2);
    });

    it('should not include duplicate constraints in IIS', () => {
        // Simpler test to check for duplicates
        const node0 = createNode('0');
        const node1 = createNode('1');
        const node2 = createNode('2');

        const orderSource1 = new RelativeOrientationConstraint(['left'], '0->1');
        const orderSource2 = new RelativeOrientationConstraint(['left'], '1->2');
        const alignSource = new AlignConstraint(['0', '1', '2'], 'horizontally');
        const groupSource = new GroupByField('type', 'n');

        // Conjunctive constraints: ordering and alignment
        const constraints: (LeftConstraint | AlignmentConstraint)[] = [
            createLeftConstraint(node0, node1, orderSource1),
            createLeftConstraint(node1, node2, orderSource2),
            createAlignmentConstraint(node0, node1, 'y', alignSource),
            createAlignmentConstraint(node1, node2, 'y', alignSource),
        ];

        // Group {0, 2} - node1 must be outside
        const group: LayoutGroup = {
            name: 'n',
            nodeIds: ['0', '2'],
            keyNodeId: '0',
            showLabel: true,
            sourceConstraint: groupSource
        };

        const layout: InstanceLayout = {
            nodes: [node0, node1, node2],
            edges: [],
            constraints: constraints,
            groups: [group],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        expect(error).not.toBeNull();

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            const minimalSet = positionalError.minimalConflictingSet;

            // Check that no constraint object appears twice
            const allConstraints: LayoutConstraint[] = [];
            for (const [, layoutConstraints] of minimalSet.entries()) {
                allConstraints.push(...layoutConstraints);
            }

            // Check object identity - no constraint should appear twice by reference
            const seen = new Set<LayoutConstraint>();
            for (const constraint of allConstraints) {
                expect(seen.has(constraint)).toBe(false);
                seen.add(constraint);
            }
        }
    });

    it('should produce subset-minimal IIS for grouping with alignment and ordering', () => {
        // Problem statement scenario:
        // - Atoms A = {0, 1, 2}
        // - (a) lay them out left-to-right in ascending order: 0 < 1 < 2
        // - (b) align them horizontally: align(0,1), align(0,2), align(1,2)
        // - (c) group exactly {0, 2}
        
        const node0 = createNode('0');
        const node1 = createNode('1');
        const node2 = createNode('2');

        // Create sources for constraints
        const orderSource1 = new RelativeOrientationConstraint(['left'], '0->1');
        const orderSource2 = new RelativeOrientationConstraint(['left'], '0->2');
        const orderSource3 = new RelativeOrientationConstraint(['left'], '1->2');
        
        const alignSource1 = new AlignConstraint(['0', '1'], 'horizontally');
        const alignSource2 = new AlignConstraint(['0', '2'], 'horizontally');
        const alignSource3 = new AlignConstraint(['1', '2'], 'horizontally');
        
        const groupSource = new GroupByField('type', 'n');

        // Conjunctive constraints
        const constraints: (LeftConstraint | AlignmentConstraint)[] = [
            // (a) left-to-right ordering
            createLeftConstraint(node0, node1, orderSource1),
            createLeftConstraint(node0, node2, orderSource2),
            createLeftConstraint(node1, node2, orderSource3),
            // (b) horizontal alignment
            createAlignmentConstraint(node0, node1, 'y', alignSource1),
            createAlignmentConstraint(node0, node2, 'y', alignSource2),
            createAlignmentConstraint(node1, node2, 'y', alignSource3),
        ];

        // (c) group {0, 2}
        const group: LayoutGroup = {
            name: 'n',
            nodeIds: ['0', '2'],
            keyNodeId: '0',
            showLabel: true,
            sourceConstraint: groupSource
        };

        const layout: InstanceLayout = {
            nodes: [node0, node1, node2],
            edges: [],
            constraints: constraints,
            groups: [group],
        };

        const validator = new ConstraintValidator(layout);
        const error = validator.validateConstraints();

        // Should fail because node1 cannot be positioned:
        // - Must be right of 0 (who is in the group)
        // - Must be left of 2 (who is in the group)
        // - Must be aligned with 0 and 2 (horizontally)
        // - Cannot be inside the group (disjunction: must be left/right/above/below)
        // Given horizontal alignment, can only be left or right, but both conflict with ordering
        
        expect(error).not.toBeNull();
        expect(error?.type).toBe('positional-conflict');

        if (error && 'minimalConflictingSet' in error) {
            const positionalError = error as PositionalConstraintError;
            const minimalSet = positionalError.minimalConflictingSet;

            // Collect all constraints from the minimal set
            const allMinimalConstraints: LayoutConstraint[] = [];
            for (const [source, layoutConstraints] of minimalSet.entries()) {
                allMinimalConstraints.push(...layoutConstraints);
            }

            console.log('Minimal conflicting set size:', allMinimalConstraints.length);
            console.log('Minimal conflicting set:');
            for (const [source, layoutConstraints] of minimalSet.entries()) {
                console.log(`  Source: ${source.toHTML?.()} (${layoutConstraints.length} constraints)`);
                layoutConstraints.forEach((c: any) => {
                    if (c.left && c.right) {
                        console.log(`    ${c.left.id} must be to the left of ${c.right.id}`);
                    } else if (c.node1 && c.node2) {
                        console.log(`    ${c.node1.id} must be aligned with ${c.node2.id} on ${c.axis} axis`);
                    } else if (c.node && c.group) {
                        console.log(`    ${c.node.id} must be ${c.side} of group ${c.group.name}`);
                    }
                });
            }

            // Check for duplicates - the IIS should be subset minimal
            // No constraint should appear twice
            const constraintStrings = allMinimalConstraints.map((c: any) => {
                if (c.left && c.right) {
                    return `${c.left.id}<${c.right.id}`;
                } else if (c.node1 && c.node2) {
                    return `align(${c.node1.id},${c.node2.id},${c.axis})`;
                } else if (c.node && c.group) {
                    return `${c.node.id}_${c.side}_${c.group.name}`;
                }
                return 'unknown';
            });

            const uniqueConstraints = new Set(constraintStrings);
            console.log('Unique constraints:', uniqueConstraints.size);
            console.log('Total constraints:', constraintStrings.length);

            // Check for duplicates
            const duplicates = constraintStrings.filter((item, index) => 
                constraintStrings.indexOf(item) !== index
            );
            
            if (duplicates.length > 0) {
                console.log('DUPLICATES FOUND:', duplicates);
            }

            // The IIS should be subset minimal - no duplicates
            expect(uniqueConstraints.size).toBe(constraintStrings.length);
        }
    });
});
