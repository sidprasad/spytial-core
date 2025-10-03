# CND Core Examples

This directory contains example code demonstrating key features of the CND Core library.

## Disjunctive Constraint Solver Demo

The disjunctive constraint solver allows you to express constraints with OR operations, such as:
- `(constraint1) AND (constraint2) AND ((constraint3) OR (constraint4))`

### Running the Demo

**Note:** This demo requires building the project first, as it imports from the built distribution.

```bash
# Build the project
npm run build:browser

# Run the demo (requires Node.js with ES modules support)
node examples/disjunctive-solver-demo.mjs
```

### What the Demo Shows

The demo includes 4 examples:

1. **Node Positioning with Alternatives**: Shows how to express that nodes can be in multiple valid positions
2. **Circular Layout with Rotations**: Demonstrates handling cyclic constraints with different rotation options
3. **Intelligent Pruning**: Shows how the solver efficiently prunes unsatisfiable alternatives
4. **Unsatisfiable System Detection**: Demonstrates how the solver detects when no solution exists

### Expected Output

```
============================================================
Disjunctive Constraint Solver Demo
============================================================

📝 Example 1: Node Positioning with Alternatives
------------------------------------------------------------
Problem: Position nodes A, B, and C such that:
  - Node A is at x=100 (fixed)
  - Nodes B and C maintain distance of 50
  - EITHER B is left of C OR C is left of B

✅ Solution found: true
   Node A: x=100.0
   Node B: x=200.0
   Node C: x=250.0
   Distance B-C: 50.0

...
```

## More Examples

For additional examples and test cases, see:
- `tests/disjunctive-solver.test.ts` - Unit tests covering core functionality
- `tests/disjunctive-solver-examples.test.ts` - Realistic layout scenarios
- `docs/disjunctive-solver.md` - Full documentation and API reference

## Contributing Examples

If you have a useful example that demonstrates CND Core features, please consider contributing it!

1. Create your example file in this directory
2. Add documentation explaining what it demonstrates
3. Update this README with information about your example
4. Submit a pull request

Make sure your example:
- Is well-commented
- Demonstrates a specific feature or use case
- Can be run independently
- Includes expected output or results
