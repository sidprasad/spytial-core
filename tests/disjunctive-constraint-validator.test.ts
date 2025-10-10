import { describe, it, expect } from 'vitest';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { 
    DisjunctiveConstraint, 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
    TopConstraint,
    ImplicitConstraint
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint } from '../src/layout/layoutspec';

describe('DisjunctiveConstraintValidator', () => {
    
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
    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source?: RelativeOrientationConstraint): LeftConstraint {
        const defaultSource = new RelativeOrientationConstraint(['left'], `${left.id}->${right.id}`);
        return {
            left,
            right,
            minDistance: 15,
            sourceConstraint: source || defaultSource,
        };
    }

    // Helper to create a top constraint
    function createTopConstraint(top: LayoutNode, bottom: LayoutNode, source?: RelativeOrientationConstraint): TopConstraint {
        const defaultSource = new RelativeOrientationConstraint(['above'], `${top.id}->${bottom.id}`);
        return {
            top,
            bottom,
            minDistance: 15,
            sourceConstraint: source || defaultSource,
        };
    }

    describe('Chosen Alternatives Tracking', () => {
        it('should track chosen alternatives in added_constraints', () => {
            // Create nodes
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');

            const sourceConstraint = new RelativeOrientationConstraint(['left'], 'A->B->C');

            // Create a disjunctive constraint with 2 alternatives
            const alternative1 = [
                createLeftConstraint(nodeA, nodeB, sourceConstraint),
                createLeftConstraint(nodeB, nodeC, sourceConstraint),
            ];

            const alternative2 = [
                createLeftConstraint(nodeB, nodeC, sourceConstraint),
                createLeftConstraint(nodeC, nodeA, sourceConstraint),
            ];

            const disjunction = new DisjunctiveConstraint(
                sourceConstraint,
                [alternative1, alternative2]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            // Should succeed
            expect(error).toBeNull();

            // The layout constraints should now include the chosen alternative
            // (either alternative1 or alternative2, whichever is satisfiable)
            expect(layout.constraints.length).toBeGreaterThan(0);
            
            // The chosen constraints should be from one of the alternatives
            const chosenConstraints = layout.constraints;
            const containsAlternative1 = alternative1.every(c => chosenConstraints.includes(c));
            const containsAlternative2 = alternative2.every(c => chosenConstraints.includes(c));
            
            // Exactly one alternative should be chosen
            expect(containsAlternative1 || containsAlternative2).toBe(true);
            expect(containsAlternative1 && containsAlternative2).toBe(false);
        });

        it('should include chosen alternatives in final layout constraints', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');

            const sourceConstraint = new RelativeOrientationConstraint(['left'], 'A->B');

            const alternative1 = [createLeftConstraint(nodeA, nodeB, sourceConstraint)];
            const alternative2 = [createLeftConstraint(nodeB, nodeA, sourceConstraint)];

            const disjunction = new DisjunctiveConstraint(
                sourceConstraint,
                [alternative1, alternative2]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const initialConstraintCount = layout.constraints.length;
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
            
            // Constraint count should increase by at least the chosen alternative's size
            expect(layout.constraints.length).toBeGreaterThan(initialConstraintCount);
        });

        it('should handle multiple disjunctions and track all chosen alternatives', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');
            const nodeD = createNode('D');

            const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
            const source2 = new RelativeOrientationConstraint(['above'], 'C->D');

            // First disjunction: A-B relationship
            const disjunction1 = new DisjunctiveConstraint(
                source1,
                [
                    [createLeftConstraint(nodeA, nodeB, source1)],
                    [createLeftConstraint(nodeB, nodeA, source1)],
                ]
            );

            // Second disjunction: C-D relationship
            const disjunction2 = new DisjunctiveConstraint(
                source2,
                [
                    [createTopConstraint(nodeC, nodeD, source2)],
                    [createTopConstraint(nodeD, nodeC, source2)],
                ]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC, nodeD],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [disjunction1, disjunction2],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
            
            // Should have constraints from both disjunctions
            // (1 from each disjunction's chosen alternative)
            expect(layout.constraints.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Backtracking with Conjunctive Constraints', () => {
        it('should respect conjunctive constraints when choosing alternatives', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');

            const conjunctiveSource = new RelativeOrientationConstraint(['left'], 'A->C');
            const disjunctiveSource = new RelativeOrientationConstraint(['left'], 'B placement');

            // Conjunctive: A must be left of C
            const conjunctiveConstraint = createLeftConstraint(nodeA, nodeC, conjunctiveSource);

            // Disjunctive: Try different positions for B
            const alternative1 = [
                createLeftConstraint(nodeA, nodeB, disjunctiveSource),
                createLeftConstraint(nodeB, nodeC, disjunctiveSource),
            ]; // A < B < C (satisfiable with A < C)

            const alternative2 = [
                createLeftConstraint(nodeC, nodeB, disjunctiveSource),
                createLeftConstraint(nodeB, nodeA, disjunctiveSource),
            ]; // C < B < A (conflicts with A < C)

            const disjunction = new DisjunctiveConstraint(
                disjunctiveSource,
                [alternative2, alternative1] // Try failing one first
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC],
                edges: [],
                constraints: [conjunctiveConstraint],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
            
            // Should have chosen alternative1 (A < B < C) because alternative2 conflicts
            const finalConstraints = layout.constraints;
            const hasAlternative1Constraints = alternative1.every(c => 
                finalConstraints.some(fc => 
                    fc.sourceConstraint === c.sourceConstraint &&
                    (fc as LeftConstraint).left?.id === (c as LeftConstraint).left?.id &&
                    (fc as LeftConstraint).right?.id === (c as LeftConstraint).right?.id
                )
            );
            
            expect(hasAlternative1Constraints).toBe(true);
        });

        it('should fail if no alternative is compatible with conjunctive constraints', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');

            const conjunctiveSource = new RelativeOrientationConstraint(['left'], 'A->B');
            const disjunctiveSource = new RelativeOrientationConstraint(['left'], 'conflicting');

            // Conjunctive: A must be left of B
            const conjunctiveConstraint = createLeftConstraint(nodeA, nodeB, conjunctiveSource);

            // Disjunctive: B must be left of A (conflicts!)
            const alternative1 = [createLeftConstraint(nodeB, nodeA, disjunctiveSource)];

            const disjunction = new DisjunctiveConstraint(
                disjunctiveSource,
                [alternative1]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB],
                edges: [],
                constraints: [conjunctiveConstraint],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            // Should fail because alternative conflicts with conjunctive constraint
            expect(error).not.toBeNull();
            expect(error?.type).toBe('positional-conflict');
        });
    });

    describe('Empty and Edge Cases', () => {
        it('should handle empty disjunctive constraints array', () => {
            const nodeA = createNode('A');
            const layout: InstanceLayout = {
                nodes: [nodeA],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
        });

        it('should handle undefined disjunctive constraints', () => {
            const nodeA = createNode('A');
            const layout: InstanceLayout = {
                nodes: [nodeA],
                edges: [],
                constraints: [],
                groups: [],
                // disjunctiveConstraints is undefined
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
        });

        it('should handle disjunction with single alternative', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');

            const source = new RelativeOrientationConstraint(['left'], 'A->B');
            const alternative = [createLeftConstraint(nodeA, nodeB, source)];

            const disjunction = new DisjunctiveConstraint(source, [alternative]);

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB],
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            expect(error).toBeNull();
            expect(layout.constraints).toContain(alternative[0]);
        });
    });

    describe('IIS Extraction with Deepest Path Selection', () => {
        it('should use the alternative that went deepest for conflict analysis', () => {
            // Setup: Create a scenario where different alternatives fail at different depths
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');
            const nodeD = createNode('D');

            // Conjunctive constraints that form: A < B
            const conjunctiveSource = new RelativeOrientationConstraint(['left'], 'A->B');
            const conjunctiveConstraint = createLeftConstraint(nodeA, nodeB, conjunctiveSource);

            const disjunctiveSource = new RelativeOrientationConstraint(['left'], 'alternative placement');

            // Alternative 1: Fails immediately (B < A conflicts with A < B)
            const alternative1 = [
                createLeftConstraint(nodeB, nodeA, disjunctiveSource),
            ];

            // Alternative 2: Makes more progress (adds 2 constraints before failing)
            // A < C (succeeds), C < D (succeeds), D < B (succeeds), B < A (fails creating cycle)
            const alternative2 = [
                createLeftConstraint(nodeA, nodeC, disjunctiveSource),
                createLeftConstraint(nodeC, nodeD, disjunctiveSource),
                createLeftConstraint(nodeD, nodeB, disjunctiveSource),
                createLeftConstraint(nodeB, nodeA, disjunctiveSource),
            ];

            const disjunction = new DisjunctiveConstraint(
                disjunctiveSource,
                [alternative1, alternative2]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC, nodeD],
                edges: [],
                constraints: [conjunctiveConstraint],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            // Should fail because no alternative is satisfiable
            expect(error).not.toBeNull();
            expect(error?.type).toBe('positional-conflict');
            
            // The error should reference the alternative that went deepest (alternative2)
            // which added 3 constraints successfully before the 4th failed
            if (error && 'minimalConflictingSet' in error) {
                const disjunctiveConstraints = error.minimalConflictingSet.get(disjunctiveSource);
                expect(disjunctiveConstraints).toBeDefined();
                // Should contain all constraints from alternative2 (the one that went deepest)
                // which has 4 constraints total
                expect(disjunctiveConstraints?.length).toBe(4);
            }
        });

        it('should track progress by local constraints when recursion depth is same', () => {
            // Setup: Multiple alternatives that fail locally but at different points
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');

            // Conjunctive: A < C
            const conjunctiveSource = new RelativeOrientationConstraint(['left'], 'A->C');
            const conjunctiveConstraint = createLeftConstraint(nodeA, nodeC, conjunctiveSource);

            const disjunctiveSource = new RelativeOrientationConstraint(['left'], 'B placement');

            // Alternative 1: Fails on first constraint (C < A conflicts with A < C)
            const alternative1 = [
                createLeftConstraint(nodeC, nodeA, disjunctiveSource),
            ];

            // Alternative 2: Adds one constraint successfully, then fails on second
            // (A < B succeeds, but then B < A conflicts with A < B)
            const alternative2 = [
                createLeftConstraint(nodeA, nodeB, disjunctiveSource),
                createLeftConstraint(nodeB, nodeA, disjunctiveSource),
            ];

            const disjunction = new DisjunctiveConstraint(
                disjunctiveSource,
                [alternative1, alternative2]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC],
                edges: [],
                constraints: [conjunctiveConstraint],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();

            // Should fail
            expect(error).not.toBeNull();
            expect(error?.type).toBe('positional-conflict');

            // The error should use alternative2 (which added more local constraints)
            if (error && 'minimalConflictingSet' in error) {
                const disjunctiveConstraints = error.minimalConflictingSet.get(disjunctiveSource);
                expect(disjunctiveConstraints).toBeDefined();
                // Should contain constraints from alternative2
                expect(disjunctiveConstraints?.length).toBeGreaterThanOrEqual(1);
            }
        });
    });
});
