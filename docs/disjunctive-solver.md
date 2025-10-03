# Disjunctive Constraint Solver

The `DisjunctiveConstraintSolver` is a constraint solver that extends Kiwi.js to support disjunctive (OR) constraints in addition to conjunctive (AND) constraints.

## Overview

Many layout constraints in CnD, particularly cyclic constraints, are inherently disjunctive in nature. For example, nodes in a cycle can be arranged in multiple valid configurations (perturbations/rotations). Previously, this was handled with ad-hoc backtracking logic. The disjunctive solver provides a clean, systematic approach to handling such constraints.

## Features

- **Conjunctive Constraints**: Uses Kiwi.js for efficient solving of AND constraints
- **Disjunctive Constraints**: Supports OR operations through systematic backtracking search
- **Intelligent Pruning**: Prunes unsatisfiable branches early to improve performance
- **Type-Safe API**: Fully typed TypeScript interface

## Basic Usage

```typescript
import { DisjunctiveConstraintSolver } from 'cnd-core';
import { Variable, Constraint, Operator, Strength } from 'kiwi.js';

const solver = new DisjunctiveConstraintSolver();

// Create variables
const x = new Variable('x');
const y = new Variable('y');

// Register variables
solver.registerVariable('x', x);
solver.registerVariable('y', y);

// Add conjunctive constraints (AND)
solver.addConjunctiveConstraint(
  new Constraint(x.plus(y), Operator.Eq, 30, Strength.required)
);

// Add disjunction (OR): (x = 10 AND y = 20) OR (x = 15 AND y = 15)
solver.addDisjunction([
  [
    new Constraint(x, Operator.Eq, 10, Strength.required),
    new Constraint(y, Operator.Eq, 20, Strength.required)
  ],
  [
    new Constraint(x, Operator.Eq, 15, Strength.required),
    new Constraint(y, Operator.Eq, 15, Strength.required)
  ]
]);

// Solve
const result = solver.solve();
if (result.satisfiable) {
  console.log(`x = ${x.value()}, y = ${y.value()}`);
} else {
  console.log('No solution found');
}
```

## API Reference

### `addConjunctiveConstraint(constraint: KiwiConstraint): void`

Adds a single constraint that must always be satisfied.

### `addConjunctiveConstraints(constraints: ConjunctiveConstraints): void`

Adds multiple constraints that must all be satisfied.

### `addDisjunction(alternatives: DisjunctiveConstraints): void`

Adds a disjunction where at least one alternative must be satisfied. Each alternative is a set of conjunctive constraints.

- `alternatives`: Array of constraint sets, where each set represents one possible alternative

### `registerVariable(name: string, variable: Variable): void`

Registers a Kiwi variable with the solver.

### `solve(): { satisfiable: boolean; variables?: Map<string, Variable>; solver?: Solver }`

Solves the constraint system and returns whether it's satisfiable.

## How It Works

The solver uses a backtracking search algorithm with intelligent pruning:

1. **Base Case**: If there are no disjunctions, it uses Kiwi to solve the conjunctive constraints directly
2. **Recursive Case**: For each disjunction:
   - Try each alternative in order
   - Check if the partial assignment (conjunctive constraints + selected alternatives so far) is satisfiable
   - If satisfiable, recursively try to satisfy remaining disjunctions
   - If unsatisfiable, prune this branch and try the next alternative
3. **Pruning**: The solver checks satisfiability at each step, allowing it to prune unsatisfiable branches early

## Integration with Cyclic Constraints

The disjunctive solver is integrated into `LayoutInstance.applyCyclicConstraints()` to handle cyclic constraint perturbations:

```typescript
// For each cyclic constraint fragment, create a disjunction of all possible perturbations
for (const fragment of constraintFragments) {
  const alternatives = [];
  
  // Each perturbation is an alternative
  for (let perturbation = 0; perturbation < fragmentLength; perturbation++) {
    const layoutConstraints = this.getCyclicConstraintForFragment(
      fragment,
      layoutNodes,
      perturbation,
      sourceConstraint
    );
    
    const kiwiConstraints = convertToKiwiConstraints(layoutConstraints);
    alternatives.push(kiwiConstraints);
  }
  
  // Add the disjunction: (pert1 OR pert2 OR ... OR pertN)
  solver.addDisjunction(alternatives);
}
```

This approach replaces the previous ad-hoc backtracking with a systematic, well-tested solution.

## Performance Considerations

- **Branch Pruning**: The solver prunes unsatisfiable branches as early as possible
- **Incremental Solving**: Kiwi's efficient constraint solver is used for each satisfiability check
- **Complexity**: Worst-case exponential in the number of disjunctions (inherent to the problem), but pruning makes it practical for typical use cases

## Testing

The solver includes comprehensive unit tests covering:
- Simple conjunctive constraints
- Disjunctions with 2-3 alternatives
- Multiple independent and dependent disjunctions
- Conflict detection
- Edge cases (empty systems, single alternatives, etc.)

Run tests with:
```bash
npm run test:run -- tests/disjunctive-solver.test.ts
```

## Future Enhancements

Potential improvements for the solver:

1. **Heuristics**: Add heuristics to choose which alternative to try first (e.g., based on constraint strength)
2. **Incremental Solving**: Cache partial solutions to avoid redundant computation
3. **Parallel Search**: Explore alternatives in parallel for better performance
4. **Conflict-Driven Learning**: Learn from conflicts to avoid similar branches in the future
