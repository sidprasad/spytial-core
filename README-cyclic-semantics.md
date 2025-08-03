# Cyclic Constraint Semantics - Usage Guide

This directory contains the formal semantics specification for cyclic constraints in the CnD layout system.

## Files

### 📚 Documentation
- **`docs/cyclic-constraint-semantics.md`** - Complete formal specification with mathematical framework, algorithms, and examples
- **`README-cyclic-semantics.md`** - This usage guide

### 💻 Implementation
- **`src/layout/cyclic-semantics.ts`** - Clean, functional implementation of the translation algorithm
- **`tests/layout/cyclic-semantics.test.ts`** - Comprehensive tests validating the specification

## Quick Start

### Using the Lean Function API

```typescript
import { translateCyclicConstraint, type CyclicConstraint } from './src/layout/cyclic-semantics';

// Define a cyclic constraint
const constraint: CyclicConstraint = {
  direction: 'clockwise',
  fragments: [['A', 'B', 'C']]  // A → B → C → A (cycle)
};

// Translate to positional constraints
const constraintSets = translateCyclicConstraint(constraint);

// Each constraint set represents one possible arrangement (perturbation)
console.log(`Generated ${constraintSets.length} possible arrangements`);

constraintSets.forEach((cs, index) => {
  console.log(`\nArrangement ${index}:`);
  cs.forEach(c => {
    console.log(`  ${c.type}: ${c.node1} → ${c.node2}`);
  });
});
```

### Running the Demonstration

```typescript
import { demonstrateSemantics } from './src/layout/cyclic-semantics';

// Shows complete example with semantic interpretation
demonstrateSemantics();
```

## Key Concepts

### 🔄 Disjunctive Semantics

A cyclic constraint is satisfied if **any** of its generated constraint sets is satisfiable:

```
satisfies(cyclicConstraint) ≡ ∃cs ∈ translateCyclicConstraint(cyclicConstraint) : satisfiable(cs)
```

This creates a **disjunction** (OR) over all possible circular arrangements.

### 🎯 Perturbations

Each fragment generates multiple "perturbations" - different rotational offsets of the same circular arrangement:

- **Perturbation 0**: A at 0°, B at 120°, C at 240°
- **Perturbation 1**: A at 120°, B at 240°, C at 0°  
- **Perturbation 2**: A at 240°, B at 0°, C at 120°

### 📐 Constraint Generation

Each perturbation generates pairwise constraints between all nodes:

- **Left/Right constraints**: Based on x-coordinate differences
- **Above/Below constraints**: Based on y-coordinate differences  
- **Alignment constraints**: When coordinates are nearly equal

## Examples

### Simple Triangle (3 nodes)

```typescript
const triangle: CyclicConstraint = {
  direction: 'clockwise',
  fragments: [['A', 'B', 'C']]
};

// Generates 3 constraint sets (one per perturbation)
const result = translateCyclicConstraint(triangle);
// result.length === 3
```

### Multiple Cycles

```typescript
const multiCycle: CyclicConstraint = {
  direction: 'clockwise',
  fragments: [
    ['A', 'B', 'C'],      // First cycle: 3 perturbations
    ['X', 'Y', 'Z', 'W']  // Second cycle: 4 perturbations
  ]
};

// Generates 7 constraint sets total (3 + 4)
const result = translateCyclicConstraint(multiCycle);
// result.length === 7
```

### Counterclockwise Direction

```typescript
const counterclockwise: CyclicConstraint = {
  direction: 'counterclockwise',
  fragments: [['A', 'B', 'C']]
};

// Fragments are automatically reversed: ['C', 'B', 'A']
// Then perturbations are generated normally
```

## Testing

Run the comprehensive test suite:

```bash
npm run test:run tests/layout/cyclic-semantics.test.ts
```

The tests validate:
- ✅ Correct number of perturbations generated
- ✅ Proper handling of clockwise/counterclockwise directions
- ✅ Pairwise constraint generation for all node pairs
- ✅ Different constraints for different perturbations
- ✅ Valid constraint types and minimum distances
- ✅ Multiple fragment handling
- ✅ Edge cases (single nodes, empty fragments)
- ✅ Mathematical properties and symmetries

## Integration with Existing Code

This specification is designed to complement the existing implementation in `src/layout/layoutinstance.ts`. The key differences:

### Existing Implementation
- Integrated with graph evaluation and constraint solving
- Handles selector evaluation and fragment detection
- Uses backtracking to find satisfying arrangements
- Directly generates CnD layout constraints

### This Specification  
- **Pure functional** approach for clarity
- **Mathematical formalization** of the semantics
- **Clean separation** of concerns
- **Comprehensive documentation** and testing

## Mathematical Foundation

The complete mathematical framework is documented in `docs/cyclic-constraint-semantics.md`, including:

- **Formal definitions** of fragments, perturbations, and constraints
- **Translation algorithms** with complexity analysis
- **Backtracking procedures** for constraint satisfaction
- **Disjunctive semantics** and logical interpretations
- **Worked examples** with specific constraint sets

## Future Work

This formal specification enables:

1. **Verification** - Proving correctness properties of the constraint system
2. **Optimization** - Identifying redundant perturbations or constraint patterns  
3. **Extensions** - Adding new constraint types or optimization strategies
4. **Documentation** - Clear explanation for users and maintainers
5. **Testing** - Comprehensive validation of implementation behavior

---

For the complete technical details, see the full specification in `docs/cyclic-constraint-semantics.md`.