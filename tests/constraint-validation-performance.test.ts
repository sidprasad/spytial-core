import { describe, it, expect } from 'vitest';
import { ConstraintValidator } from '../src/layout/constraint-validator';
import { 
    DisjunctiveConstraint, 
    InstanceLayout, 
    LayoutNode, 
    LeftConstraint,
    TopConstraint,
    LayoutGroup,
    ImplicitConstraint
} from '../src/layout/interfaces';
import { RelativeOrientationConstraint, GroupByField } from '../src/layout/layoutspec';

describe('Constraint Validation Performance', () => {
    
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
    function createLeftConstraint(left: LayoutNode, right: LayoutNode, source: RelativeOrientationConstraint | ImplicitConstraint | GroupByField): LeftConstraint {
        return {
            left,
            right,
            minDistance: 15,
            sourceConstraint: source,
        };
    }

    // Helper to create a top constraint
    function createTopConstraint(top: LayoutNode, bottom: LayoutNode, source: RelativeOrientationConstraint): TopConstraint {
        return {
            top,
            bottom,
            minDistance: 15,
            sourceConstraint: source,
        };
    }

    describe('Caching Benefits', () => {
        it('should handle repeated constraint evaluations efficiently', () => {
            // Create a layout with many nodes and disjunctive constraints
            const nodes: LayoutNode[] = [];
            for (let i = 0; i < 20; i++) {
                nodes.push(createNode(`node${i}`));
            }

            const source = new RelativeOrientationConstraint(['left'], 'ordering');
            
            // Create disjunctive constraints that will cause backtracking
            const disjunctions: DisjunctiveConstraint[] = [];
            
            // Create 5 disjunctions, each with 4 alternatives
            for (let i = 0; i < 5; i++) {
                const alternatives: LeftConstraint[][] = [];
                const node1 = nodes[i * 2];
                const node2 = nodes[i * 2 + 1];
                const node3 = nodes[Math.min(i * 2 + 2, nodes.length - 1)];
                
                // 4 alternatives: different orderings
                alternatives.push([createLeftConstraint(node1, node2, source)]);
                alternatives.push([createLeftConstraint(node2, node1, source)]);
                alternatives.push([createLeftConstraint(node1, node3, source)]);
                alternatives.push([createLeftConstraint(node3, node1, source)]);
                
                disjunctions.push(new DisjunctiveConstraint(source, alternatives));
            }

            const layout: InstanceLayout = {
                nodes,
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const startTime = performance.now();
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();
            const endTime = performance.now();
            
            const duration = endTime - startTime;

            // With caching, this should complete reasonably fast
            // Without caching, this would be significantly slower due to repeated conversions
            expect(error).toBeNull();
            expect(duration).toBeLessThan(100); // Should complete in under 100ms
            console.log(`Validation with 5 disjunctions (4 alternatives each) completed in ${duration.toFixed(2)}ms`);
        });
    });

    describe('Early Termination Benefits', () => {
        it('should skip obviously conflicting alternatives quickly', () => {
            const nodeA = createNode('A');
            const nodeB = createNode('B');
            const nodeC = createNode('C');

            const source1 = new RelativeOrientationConstraint(['left'], 'A->B');
            const source2 = new RelativeOrientationConstraint(['left'], 'conflicting');

            // Conjunctive constraint: A < B
            const conjunctive = createLeftConstraint(nodeA, nodeB, source1);

            // Create disjunctive with an alternative that obviously conflicts (B < A)
            // This should be detected early without full solver clone/restore
            const alternative1 = [createLeftConstraint(nodeB, nodeA, source2)]; // Conflicts!
            const alternative2 = [createLeftConstraint(nodeA, nodeC, source2)]; // OK
            
            const disjunction = new DisjunctiveConstraint(
                source2,
                [alternative1, alternative2]
            );

            const layout: InstanceLayout = {
                nodes: [nodeA, nodeB, nodeC],
                edges: [],
                constraints: [conjunctive],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const startTime = performance.now();
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();
            const endTime = performance.now();

            const duration = endTime - startTime;

            // Should succeed by choosing alternative2
            expect(error).toBeNull();
            
            // Should be very fast due to early termination of alternative1
            expect(duration).toBeLessThan(50);
            console.log(`Early termination test completed in ${duration.toFixed(2)}ms`);
        });
    });

    describe('Alternative Ordering Benefits', () => {
        it('should try simpler alternatives first', () => {
            const nodes: LayoutNode[] = [];
            for (let i = 0; i < 10; i++) {
                nodes.push(createNode(`node${i}`));
            }

            const source = new RelativeOrientationConstraint(['left'], 'ordering');

            // Create a disjunction with alternatives of varying complexity
            // The simplest one (1 constraint) should be tried first
            const simpleAlternative = [
                createLeftConstraint(nodes[0], nodes[1], source)
            ];
            
            const complexAlternative = [
                createLeftConstraint(nodes[0], nodes[2], source),
                createLeftConstraint(nodes[2], nodes[3], source),
                createLeftConstraint(nodes[3], nodes[4], source),
                createLeftConstraint(nodes[4], nodes[5], source),
            ];

            const disjunction = new DisjunctiveConstraint(
                source,
                [complexAlternative, simpleAlternative] // Complex first in original order
            );

            const layout: InstanceLayout = {
                nodes,
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: [disjunction],
            };

            const startTime = performance.now();
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();
            const endTime = performance.now();

            const duration = endTime - startTime;

            expect(error).toBeNull();
            
            // Should be fast because simpler alternative is tried first and succeeds
            expect(duration).toBeLessThan(30);
            console.log(`Alternative ordering test completed in ${duration.toFixed(2)}ms`);
            
            // Verify the simple alternative was chosen
            expect(layout.constraints.length).toBe(1);
        });
    });

    describe('Large Scale Stress Test', () => {
        it('should handle many groups efficiently', () => {
            // Create a scenario with many groups to test the optimization
            // for "LOTS of groups" mentioned in the issue
            const nodes: LayoutNode[] = [];
            const groups: LayoutGroup[] = [];
            
            // Create 50 nodes
            for (let i = 0; i < 50; i++) {
                nodes.push(createNode(`node${i}`));
            }

            // Create 10 groups with 5 nodes each
            for (let g = 0; g < 10; g++) {
                const groupNodes: string[] = [];
                for (let n = 0; n < 5; n++) {
                    const nodeIndex = g * 5 + n;
                    if (nodeIndex < nodes.length) {
                        groupNodes.push(nodes[nodeIndex].id);
                    }
                }
                
                const groupSource = new GroupByField(
                    'group' + g,
                    `field${g}`,
                    `value${g}`
                );
                
                groups.push({
                    name: `group${g}`,
                    nodeIds: groupNodes,
                    sourceConstraint: groupSource
                });
            }

            const layout: InstanceLayout = {
                nodes,
                edges: [],
                constraints: [],
                groups,
                // Group bounding box constraints will be generated automatically
            };

            const startTime = performance.now();
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();
            const endTime = performance.now();

            const duration = endTime - startTime;

            // Should not error (or if it does, we still measure performance)
            // The key is that it should complete in reasonable time
            expect(duration).toBeLessThan(5000); // 5 seconds max for this scale
            
            console.log(`Large scale test (50 nodes, 10 groups) completed in ${duration.toFixed(2)}ms`);
            console.log(`Error: ${error ? error.message : 'none'}`);
        });

        it('should handle complex backtracking scenarios', () => {
            // Create a complex backtracking scenario to test optimization effectiveness
            const nodes: LayoutNode[] = [];
            for (let i = 0; i < 15; i++) {
                nodes.push(createNode(`node${i}`));
            }

            const source = new RelativeOrientationConstraint(['left'], 'complex');

            // Create 6 disjunctions with 3 alternatives each
            // This creates a search space of 3^6 = 729 possible combinations
            const disjunctions: DisjunctiveConstraint[] = [];
            
            for (let i = 0; i < 6; i++) {
                const node1 = nodes[i * 2];
                const node2 = nodes[i * 2 + 1];
                const node3 = nodes[Math.min((i + 1) * 2, nodes.length - 1)];
                
                const alternatives: LeftConstraint[][] = [
                    [createLeftConstraint(node1, node2, source)],
                    [createLeftConstraint(node2, node3, source)],
                    [createLeftConstraint(node1, node3, source)],
                ];
                
                disjunctions.push(new DisjunctiveConstraint(source, alternatives));
            }

            const layout: InstanceLayout = {
                nodes,
                edges: [],
                constraints: [],
                groups: [],
                disjunctiveConstraints: disjunctions,
            };

            const startTime = performance.now();
            const validator = new ConstraintValidator(layout);
            const error = validator.validateConstraints();
            const endTime = performance.now();

            const duration = endTime - startTime;

            // With optimizations, this should complete quickly despite large search space
            // Without optimizations, this could take much longer
            expect(duration).toBeLessThan(500); // Should complete in under 500ms
            
            console.log(`Complex backtracking (6 disjunctions, 3^6 = 729 combinations) completed in ${duration.toFixed(2)}ms`);
            console.log(`Result: ${error ? 'Conflict detected' : 'Satisfiable solution found'}`);
        });
    });
});
