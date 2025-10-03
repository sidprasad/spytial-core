import { describe, it, expect } from 'vitest';
import { DisjunctiveConstraintSolver } from '../src/layout/disjunctive-solver';
import { Variable, Constraint, Operator, Strength } from 'kiwi.js';

describe('Disjunctive Solver - Realistic Examples', () => {
    describe('Layout Positioning Example', () => {
        it('should solve node positioning with multiple valid configurations', () => {
            // Scenario: We have 3 nodes that need to be positioned.
            // Node A must be at x=100
            // Nodes B and C must maintain x-distance of 50
            // BUT: Either (B left of C) OR (C left of B)
            
            const solver = new DisjunctiveConstraintSolver();
            
            const nodeA_x = new Variable('A_x');
            const nodeB_x = new Variable('B_x');
            const nodeC_x = new Variable('C_x');
            
            solver.registerVariable('A_x', nodeA_x);
            solver.registerVariable('B_x', nodeB_x);
            solver.registerVariable('C_x', nodeC_x);
            
            // Conjunctive constraint: A at x=100
            solver.addConjunctiveConstraint(
                new Constraint(nodeA_x, Operator.Eq, 100, Strength.required)
            );
            
            // Disjunction: (B at 200 AND C at 250) OR (C at 200 AND B at 250)
            solver.addDisjunction([
                [
                    new Constraint(nodeB_x, Operator.Eq, 200, Strength.required),
                    new Constraint(nodeC_x, Operator.Eq, 250, Strength.required)
                ],
                [
                    new Constraint(nodeC_x, Operator.Eq, 200, Strength.required),
                    new Constraint(nodeB_x, Operator.Eq, 250, Strength.required)
                ]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(nodeA_x.value()).toBeCloseTo(100, 5);
            
            // One of the two configurations should be chosen
            const config1 = Math.abs(nodeB_x.value() - 200) < 0.001 && Math.abs(nodeC_x.value() - 250) < 0.001;
            const config2 = Math.abs(nodeC_x.value() - 200) < 0.001 && Math.abs(nodeB_x.value() - 250) < 0.001;
            
            expect(config1 || config2).toBe(true);
        });
    });

    describe('Cyclic Layout Example', () => {
        it('should solve circular arrangement with rotation options', () => {
            // Scenario: 4 nodes in a circle, but we can rotate the circle
            // All nodes must maintain relative distances
            // Each rotation is a valid alternative
            
            const solver = new DisjunctiveConstraintSolver();
            
            const nodes = ['A', 'B', 'C', 'D'].map(id => ({
                id,
                x: new Variable(`${id}_x`),
                y: new Variable(`${id}_y`)
            }));
            
            nodes.forEach(node => {
                solver.registerVariable(`${node.id}_x`, node.x);
                solver.registerVariable(`${node.id}_y`, node.y);
            });
            
            // Create alternatives for different rotations
            const rotations = [
                // Rotation 0: A at (0,100), B at (100,0), C at (0,-100), D at (-100,0)
                [
                    new Constraint(nodes[0].x, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[0].y, Operator.Eq, 100, Strength.required),
                    new Constraint(nodes[1].x, Operator.Eq, 100, Strength.required),
                    new Constraint(nodes[1].y, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[2].x, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[2].y, Operator.Eq, -100, Strength.required),
                    new Constraint(nodes[3].x, Operator.Eq, -100, Strength.required),
                    new Constraint(nodes[3].y, Operator.Eq, 0, Strength.required)
                ],
                // Rotation 1: Shifted by 90 degrees
                [
                    new Constraint(nodes[0].x, Operator.Eq, 100, Strength.required),
                    new Constraint(nodes[0].y, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[1].x, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[1].y, Operator.Eq, -100, Strength.required),
                    new Constraint(nodes[2].x, Operator.Eq, -100, Strength.required),
                    new Constraint(nodes[2].y, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[3].x, Operator.Eq, 0, Strength.required),
                    new Constraint(nodes[3].y, Operator.Eq, 100, Strength.required)
                ]
            ];
            
            solver.addDisjunction(rotations);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            
            // Check that one of the rotations was selected
            // by verifying nodes are approximately at expected positions
            const rotation0Match = 
                Math.abs(nodes[0].x.value() - 0) < 0.001 &&
                Math.abs(nodes[0].y.value() - 100) < 0.001;
            
            const rotation1Match = 
                Math.abs(nodes[0].x.value() - 100) < 0.001 &&
                Math.abs(nodes[0].y.value() - 0) < 0.001;
            
            expect(rotation0Match || rotation1Match).toBe(true);
        });
    });

    describe('Constraint Conflict Resolution', () => {
        it('should prune unsatisfiable alternatives and find valid solution', () => {
            // Scenario: We have constraints that eliminate some alternatives
            // but one alternative should still work
            
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // Conjunctive: x + y = 100
            solver.addConjunctiveConstraint(
                new Constraint(x.plus(y), Operator.Eq, 100, Strength.required)
            );
            
            // Conjunctive: x >= 60 (this will prune some alternatives)
            solver.addConjunctiveConstraint(
                new Constraint(x, Operator.Ge, 60, Strength.required)
            );
            
            // Disjunction with 3 alternatives, only one is valid
            solver.addDisjunction([
                // Alternative 1: x=30, y=70 (INVALID: x < 60)
                [
                    new Constraint(x, Operator.Eq, 30, Strength.required),
                    new Constraint(y, Operator.Eq, 70, Strength.required)
                ],
                // Alternative 2: x=50, y=50 (INVALID: x < 60)
                [
                    new Constraint(x, Operator.Eq, 50, Strength.required),
                    new Constraint(y, Operator.Eq, 50, Strength.required)
                ],
                // Alternative 3: x=70, y=30 (VALID)
                [
                    new Constraint(x, Operator.Eq, 70, Strength.required),
                    new Constraint(y, Operator.Eq, 30, Strength.required)
                ]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(x.value()).toBeCloseTo(70, 5);
            expect(y.value()).toBeCloseTo(30, 5);
        });
    });

    describe('Multiple Disjunctions with Dependencies', () => {
        it('should solve complex layout with interdependent disjunctions', () => {
            // Scenario: Two groups of nodes with position alternatives
            // that must work together
            
            const solver = new DisjunctiveConstraintSolver();
            
            const leftNode = new Variable('left');
            const rightNode = new Variable('right');
            const topNode = new Variable('top');
            const bottomNode = new Variable('bottom');
            
            solver.registerVariable('left', leftNode);
            solver.registerVariable('right', rightNode);
            solver.registerVariable('top', topNode);
            solver.registerVariable('bottom', bottomNode);
            
            // Conjunctive: maintain certain distances
            solver.addConjunctiveConstraint(
                new Constraint(rightNode, Operator.Ge, leftNode.plus(50), Strength.required)
            );
            solver.addConjunctiveConstraint(
                new Constraint(bottomNode, Operator.Ge, topNode.plus(50), Strength.required)
            );
            
            // Disjunction 1: horizontal positions
            solver.addDisjunction([
                [
                    new Constraint(leftNode, Operator.Eq, 0, Strength.required),
                    new Constraint(rightNode, Operator.Eq, 100, Strength.required)
                ],
                [
                    new Constraint(leftNode, Operator.Eq, 50, Strength.required),
                    new Constraint(rightNode, Operator.Eq, 150, Strength.required)
                ]
            ]);
            
            // Disjunction 2: vertical positions  
            solver.addDisjunction([
                [
                    new Constraint(topNode, Operator.Eq, 0, Strength.required),
                    new Constraint(bottomNode, Operator.Eq, 100, Strength.required)
                ],
                [
                    new Constraint(topNode, Operator.Eq, 50, Strength.required),
                    new Constraint(bottomNode, Operator.Eq, 150, Strength.required)
                ]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            
            // Verify that a valid combination was chosen
            expect(rightNode.value()).toBeGreaterThanOrEqual(leftNode.value() + 50);
            expect(bottomNode.value()).toBeGreaterThanOrEqual(topNode.value() + 50);
        });
    });
});
