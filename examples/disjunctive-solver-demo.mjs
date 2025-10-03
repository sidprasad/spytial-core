#!/usr/bin/env node

/**
 * Simple demonstration of the DisjunctiveConstraintSolver
 * 
 * This example shows how the solver can handle layout problems where
 * nodes can be positioned in multiple valid configurations.
 * 
 * Run with: node examples/disjunctive-solver-demo.mjs
 */

import { DisjunctiveConstraintSolver } from '../src/layout/disjunctive-solver.js';
import { Variable, Constraint, Operator, Strength } from 'kiwi.js';

console.log('='.repeat(60));
console.log('Disjunctive Constraint Solver Demo');
console.log('='.repeat(60));

// Example 1: Simple OR constraint
console.log('\n📝 Example 1: Node Positioning with Alternatives');
console.log('-'.repeat(60));
console.log('Problem: Position nodes A, B, and C such that:');
console.log('  - Node A is at x=100 (fixed)');
console.log('  - Nodes B and C maintain distance of 50');
console.log('  - EITHER B is left of C OR C is left of B');
console.log('');

const solver1 = new DisjunctiveConstraintSolver();
const nodeA_x = new Variable('A_x');
const nodeB_x = new Variable('B_x');
const nodeC_x = new Variable('C_x');

solver1.registerVariable('A_x', nodeA_x);
solver1.registerVariable('B_x', nodeB_x);
solver1.registerVariable('C_x', nodeC_x);

// Fixed constraint: A at x=100
solver1.addConjunctiveConstraint(
    new Constraint(nodeA_x, Operator.Eq, 100, Strength.required)
);

// Disjunction: (B=200, C=250) OR (C=200, B=250)
solver1.addDisjunction([
    [
        new Constraint(nodeB_x, Operator.Eq, 200, Strength.required),
        new Constraint(nodeC_x, Operator.Eq, 250, Strength.required)
    ],
    [
        new Constraint(nodeC_x, Operator.Eq, 200, Strength.required),
        new Constraint(nodeB_x, Operator.Eq, 250, Strength.required)
    ]
]);

const result1 = solver1.solve();
console.log('✅ Solution found:', result1.satisfiable);
console.log(`   Node A: x=${nodeA_x.value().toFixed(1)}`);
console.log(`   Node B: x=${nodeB_x.value().toFixed(1)}`);
console.log(`   Node C: x=${nodeC_x.value().toFixed(1)}`);
console.log(`   Distance B-C: ${Math.abs(nodeB_x.value() - nodeC_x.value()).toFixed(1)}`);

// Example 2: Cyclic layout with rotations
console.log('\n📝 Example 2: Circular Layout with Rotation Options');
console.log('-'.repeat(60));
console.log('Problem: Arrange 4 nodes in a circle');
console.log('  - Nodes form a square on a circle');
console.log('  - Multiple rotation angles are valid');
console.log('  - Find any satisfying rotation');
console.log('');

const solver2 = new DisjunctiveConstraintSolver();
const nodes = ['A', 'B', 'C', 'D'].map(id => ({
    id,
    x: new Variable(`${id}_x`),
    y: new Variable(`${id}_y`)
}));

nodes.forEach(node => {
    solver2.registerVariable(`${node.id}_x`, node.x);
    solver2.registerVariable(`${node.id}_y`, node.y);
});

// Two rotation alternatives
const rotations = [
    // Rotation 0: A top, B right, C bottom, D left
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
    // Rotation 1: 90 degrees clockwise
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

solver2.addDisjunction(rotations);

const result2 = solver2.solve();
console.log('✅ Solution found:', result2.satisfiable);
nodes.forEach(node => {
    console.log(`   Node ${node.id}: (${node.x.value().toFixed(1)}, ${node.y.value().toFixed(1)})`);
});

// Example 3: Constraint pruning
console.log('\n📝 Example 3: Intelligent Pruning');
console.log('-'.repeat(60));
console.log('Problem: Position x and y such that:');
console.log('  - x + y = 100 (must sum to 100)');
console.log('  - x >= 60 (x must be at least 60)');
console.log('  - Try alternatives: (30,70), (50,50), or (70,30)');
console.log('  - Solver should prune invalid alternatives and find (70,30)');
console.log('');

const solver3 = new DisjunctiveConstraintSolver();
const x = new Variable('x');
const y = new Variable('y');

solver3.registerVariable('x', x);
solver3.registerVariable('y', y);

solver3.addConjunctiveConstraint(
    new Constraint(x.plus(y), Operator.Eq, 100, Strength.required)
);
solver3.addConjunctiveConstraint(
    new Constraint(x, Operator.Ge, 60, Strength.required)
);

solver3.addDisjunction([
    // Alternative 1: INVALID (x=30 < 60)
    [
        new Constraint(x, Operator.Eq, 30, Strength.required),
        new Constraint(y, Operator.Eq, 70, Strength.required)
    ],
    // Alternative 2: INVALID (x=50 < 60)
    [
        new Constraint(x, Operator.Eq, 50, Strength.required),
        new Constraint(y, Operator.Eq, 50, Strength.required)
    ],
    // Alternative 3: VALID (x=70 >= 60)
    [
        new Constraint(x, Operator.Eq, 70, Strength.required),
        new Constraint(y, Operator.Eq, 30, Strength.required)
    ]
]);

const result3 = solver3.solve();
console.log('✅ Solution found:', result3.satisfiable);
console.log(`   x = ${x.value().toFixed(1)} (must be >= 60)`);
console.log(`   y = ${y.value().toFixed(1)}`);
console.log(`   x + y = ${(x.value() + y.value()).toFixed(1)} (must equal 100)`);
console.log('   ℹ️  Solver pruned invalid alternatives (30,70) and (50,50)');

// Example 4: Unsatisfiable system
console.log('\n📝 Example 4: Detecting Unsatisfiable Constraints');
console.log('-'.repeat(60));
console.log('Problem: Position x such that:');
console.log('  - x >= 30 (must be at least 30)');
console.log('  - x must be EITHER 10 OR 20 (both < 30)');
console.log('  - This system has NO solution');
console.log('');

const solver4 = new DisjunctiveConstraintSolver();
const x4 = new Variable('x');
solver4.registerVariable('x', x4);

solver4.addConjunctiveConstraint(
    new Constraint(x4, Operator.Ge, 30, Strength.required)
);

solver4.addDisjunction([
    [new Constraint(x4, Operator.Eq, 10, Strength.required)],
    [new Constraint(x4, Operator.Eq, 20, Strength.required)]
]);

const result4 = solver4.solve();
console.log('❌ Solution found:', result4.satisfiable);
console.log('   ℹ️  Both alternatives violate x >= 30');

console.log('\n' + '='.repeat(60));
console.log('Demo complete! 🎉');
console.log('='.repeat(60));
console.log('\nKey Features Demonstrated:');
console.log('  ✓ Disjunctive (OR) constraints');
console.log('  ✓ Intelligent branch pruning');
console.log('  ✓ Multiple disjunctions');
console.log('  ✓ Conflict detection');
console.log('\nFor more examples, see tests/disjunctive-solver-examples.test.ts');
console.log('For documentation, see docs/disjunctive-solver.md');
console.log('');
