import { describe, it, expect } from 'vitest';
import { DisjunctiveConstraintSolver } from '../src/layout/disjunctive-solver';
import { Variable, Constraint, Operator, Strength } from 'kiwi.js';

describe('DisjunctiveConstraintSolver', () => {
    describe('Basic Conjunctive Constraints', () => {
        it('should solve simple conjunctive constraints', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // x = 10
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Eq, 10, Strength.required));
            // y = 20
            solver.addConjunctiveConstraint(new Constraint(y, Operator.Eq, 20, Strength.required));
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(x.value()).toBeCloseTo(10, 5);
            expect(y.value()).toBeCloseTo(20, 5);
        });

        it('should detect unsatisfiable conjunctive constraints', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // x = 10
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Eq, 10, Strength.required));
            // x = 20 (conflict with previous constraint)
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Eq, 20, Strength.required));
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(false);
        });

        it('should handle inequality constraints', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // x >= 10
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Ge, 10, Strength.required));
            // y <= 20
            solver.addConjunctiveConstraint(new Constraint(y, Operator.Le, 20, Strength.required));
            // x + y = 30
            solver.addConjunctiveConstraint(new Constraint(x.plus(y), Operator.Eq, 30, Strength.required));
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(x.value()).toBeGreaterThanOrEqual(10);
            expect(y.value()).toBeLessThanOrEqual(20);
            expect(x.value() + y.value()).toBeCloseTo(30, 5);
        });
    });

    describe('Simple Disjunctions', () => {
        it('should solve disjunction with two alternatives', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // (x = 10) OR (x = 20)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 20, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            // Should choose one of the alternatives
            const xVal = x.value();
            expect(xVal === 10 || xVal === 20).toBe(true);
        });

        it('should solve disjunction constrained by conjunctive constraints', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // x >= 15 (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Ge, 15, Strength.required));
            
            // (x = 10) OR (x = 20)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 20, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            // Should choose x = 20 because x = 10 violates x >= 15
            expect(x.value()).toBeCloseTo(20, 5);
        });

        it('should detect when all alternatives in disjunction are unsatisfiable', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // x >= 30 (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Ge, 30, Strength.required));
            
            // (x = 10) OR (x = 20) - both violate x >= 30
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 20, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(false);
        });

        it('should handle disjunction with conjunctive alternatives', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // (x = 10 AND y = 5) OR (x = 20 AND y = 15)
            solver.addDisjunction([
                [
                    new Constraint(x, Operator.Eq, 10, Strength.required),
                    new Constraint(y, Operator.Eq, 5, Strength.required)
                ],
                [
                    new Constraint(x, Operator.Eq, 20, Strength.required),
                    new Constraint(y, Operator.Eq, 15, Strength.required)
                ]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            const xVal = x.value();
            const yVal = y.value();
            
            // Should choose one of the alternatives
            const option1 = Math.abs(xVal - 10) < 0.001 && Math.abs(yVal - 5) < 0.001;
            const option2 = Math.abs(xVal - 20) < 0.001 && Math.abs(yVal - 15) < 0.001;
            expect(option1 || option2).toBe(true);
        });
    });

    describe('Multiple Disjunctions', () => {
        it('should solve multiple independent disjunctions', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // (x = 10) OR (x = 20)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 20, Strength.required)]
            ]);
            
            // (y = 5) OR (y = 15)
            solver.addDisjunction([
                [new Constraint(y, Operator.Eq, 5, Strength.required)],
                [new Constraint(y, Operator.Eq, 15, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            const xVal = x.value();
            const yVal = y.value();
            
            expect(xVal === 10 || xVal === 20).toBe(true);
            expect(yVal === 5 || yVal === 15).toBe(true);
        });

        it('should solve multiple dependent disjunctions', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            
            // x + y = 15 (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(x.plus(y), Operator.Eq, 15, Strength.required));
            
            // (x = 10) OR (x = 5)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 5, Strength.required)]
            ]);
            
            // (y = 5) OR (y = 10)
            solver.addDisjunction([
                [new Constraint(y, Operator.Eq, 5, Strength.required)],
                [new Constraint(y, Operator.Eq, 10, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            const xVal = x.value();
            const yVal = y.value();
            
            // Should choose x=10, y=5 or x=5, y=10
            const option1 = Math.abs(xVal - 10) < 0.001 && Math.abs(yVal - 5) < 0.001;
            const option2 = Math.abs(xVal - 5) < 0.001 && Math.abs(yVal - 10) < 0.001;
            expect(option1 || option2).toBe(true);
            expect(xVal + yVal).toBeCloseTo(15, 5);
        });

        it('should detect conflicting disjunctions', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // x < 15 (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Le, 15, Strength.required));
            
            // (x = 10) OR (x = 12)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 12, Strength.required)]
            ]);
            
            // (x = 20) OR (x = 25) - both violate x <= 15
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 20, Strength.required)],
                [new Constraint(x, Operator.Eq, 25, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty constraint system', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
        });

        it('should throw error for empty disjunction', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            expect(() => {
                solver.addDisjunction([]);
            }).toThrow('Disjunction must have at least one alternative');
        });

        it('should handle disjunction with single alternative', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // Single alternative is equivalent to a conjunctive constraint
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(x.value()).toBeCloseTo(10, 5);
        });

        it('should handle clearing the solver', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Eq, 10, Strength.required));
            
            expect(solver.getConjunctiveConstraintCount()).toBe(1);
            
            solver.clear();
            
            expect(solver.getConjunctiveConstraintCount()).toBe(0);
            expect(solver.getDisjunctionCount()).toBe(0);
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle three alternatives in a disjunction', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            solver.registerVariable('x', x);
            
            // x >= 15
            solver.addConjunctiveConstraint(new Constraint(x, Operator.Ge, 15, Strength.required));
            
            // (x = 10) OR (x = 20) OR (x = 30)
            solver.addDisjunction([
                [new Constraint(x, Operator.Eq, 10, Strength.required)],
                [new Constraint(x, Operator.Eq, 20, Strength.required)],
                [new Constraint(x, Operator.Eq, 30, Strength.required)]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            const xVal = x.value();
            // Should choose 20 or 30 (10 violates x >= 15)
            expect(xVal === 20 || xVal === 30).toBe(true);
        });

        it('should handle complex constraint combinations', () => {
            const solver = new DisjunctiveConstraintSolver();
            
            const x = new Variable('x');
            const y = new Variable('y');
            const z = new Variable('z');
            solver.registerVariable('x', x);
            solver.registerVariable('y', y);
            solver.registerVariable('z', z);
            
            // z = x + y (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(z, Operator.Eq, x.plus(y), Strength.required));
            
            // z = 30 (conjunctive)
            solver.addConjunctiveConstraint(new Constraint(z, Operator.Eq, 30, Strength.required));
            
            // (x = 10 AND y = 20) OR (x = 15 AND y = 15) OR (x = 5 AND y = 25)
            solver.addDisjunction([
                [
                    new Constraint(x, Operator.Eq, 10, Strength.required),
                    new Constraint(y, Operator.Eq, 20, Strength.required)
                ],
                [
                    new Constraint(x, Operator.Eq, 15, Strength.required),
                    new Constraint(y, Operator.Eq, 15, Strength.required)
                ],
                [
                    new Constraint(x, Operator.Eq, 5, Strength.required),
                    new Constraint(y, Operator.Eq, 25, Strength.required)
                ]
            ]);
            
            const result = solver.solve();
            
            expect(result.satisfiable).toBe(true);
            expect(z.value()).toBeCloseTo(30, 5);
            expect(x.value() + y.value()).toBeCloseTo(30, 5);
        });
    });
});
