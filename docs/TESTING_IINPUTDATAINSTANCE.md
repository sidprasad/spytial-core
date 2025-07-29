# IInputDataInstance Testing Guide

This document explains how to use the comprehensive test suite for `IInputDataInstance` implementations.

## Test Files

### `tests/input-data-instance.test.ts`
This is the main comprehensive test suite with 48 tests covering all aspects of the `IInputDataInstance` interface:

- **Adding/Removing Atoms**: Tests for `addAtom()` and `removeAtom()` with validation and edge cases
- **Adding/Removing Relations**: Tests for `addRelationTuple()` and `removeRelationTuple()` with referential integrity
- **Event System**: Tests for `addEventListener()` and `removeEventListener()` functionality
- **Data Instance Combination**: Tests for `addFromDataInstance()` with built-in unification options
- **Type Management**: Tests for automatic type creation and `getAtomType()`
- **Data Integrity**: Tests for projections, graph generation, and reification
- **Edge Cases**: Tests for special characters, unicode, large datasets, and error conditions

### `tests/cross-implementation.test.ts`
This file demonstrates how the tests can work across different implementations:

- Tests with `PyretDataInstance`
- Tests with `JSONDataInstance`
- Interface consistency validation

## Running Tests for Your Implementation

To test a new `IInputDataInstance` implementation, follow these patterns:

### 1. Basic Implementation Test

```typescript
import { describe, it, expect } from 'vitest';
import { YourDataInstance } from '../src/data-instance/your-implementation';
import { IInputDataInstance, IAtom, ITuple } from '../src/data-instance/interfaces';

describe('YourDataInstance Implementation', () => {
  function createEmptyInstance(): IInputDataInstance {
    // Create your empty instance here
    return new YourDataInstance(/* your parameters */);
  }

  it('should support basic atom operations', () => {
    const instance = createEmptyInstance();
    
    const testAtom: IAtom = { id: 'test1', type: 'TestType', label: 'Test Atom' };
    instance.addAtom(testAtom);
    
    const atoms = instance.getAtoms();
    expect(atoms.length).toBeGreaterThanOrEqual(1);
    
    const addedAtom = atoms.find(a => a.label === 'Test Atom');
    expect(addedAtom).toBeDefined();
  });
  
  // Add more specific tests for your implementation
});
```

### 2. Reusing the Comprehensive Test Suite

You can adapt the main test suite to work with your implementation by modifying the factory functions:

```typescript
// In your test file
function createEmptyInstance(): IInputDataInstance {
  return new YourDataInstance(/* empty state */);
}

function createInstanceWithData(data: YourDataFormat): IInputDataInstance {
  return new YourDataInstance(data);
}
```

Then copy the test structure from `input-data-instance.test.ts` and replace the factory functions.

### 3. Interface Consistency Test

Add your implementation to the cross-implementation tests:

```typescript
it('should have consistent interface for YourDataInstance', () => {
  testIInputDataInstanceInterface(() => new YourDataInstance(/* empty */));
});
```

## Key Test Categories

### Atom Operations
- Adding single and multiple atoms
- Handling duplicate IDs (should throw error)
- Automatic type creation
- Removing atoms and cleanup of references

### Relation Operations
- Adding tuples to new and existing relations
- Type merging for relations
- Validation of atom references
- Exact tuple matching for removal

### Event System
- Event emission for all data changes
- Multiple listeners support
- Listener removal
- Error handling in listeners

### Data Combination
- Combining two data instances
- ID conflict resolution
- Built-in type unification
- Relation merging

### Type Management
- Automatic type inference
- Type-atom relationships
- Type retrieval by atom ID

### Data Integrity
- Referential integrity on atom removal
- Graph generation validation
- Projection functionality
- Round-trip reification

### Edge Cases
- Special characters in IDs
- Empty strings and unicode
- Large datasets (performance)
- Error conditions and validation

## Performance Expectations

The test suite includes performance validation:
- Adding 1000 atoms should complete in under 1 second
- All operations should maintain O(n) or better complexity where possible

## Implementation Requirements

For tests to pass, your implementation must:

1. **Implement all interface methods** correctly
2. **Maintain referential integrity** (removing atoms removes them from relations)
3. **Support the event system** with proper event emission
4. **Handle ID conflicts** when combining instances
5. **Validate atom references** in relation tuples
6. **Support projections** that filter data correctly
7. **Generate valid graphs** using the graphlib library
8. **Provide reification** back to your source format

## Example: Testing with Alloy Implementation

```typescript
describe('AlloyDataInstance Tests', () => {
  function createEmptyAlloyInstance(): IInputDataInstance {
    const emptyAlloyData = "sig Empty {}"; // Empty Alloy model
    return new AlloyDataInstance(emptyAlloyData);
  }

  // Copy test patterns from input-data-instance.test.ts
  // Adapt factory functions and expected behaviors for Alloy
});
```

## Notes for Implementation Authors

- **Event System**: Make sure to emit events for all data changes
- **ID Generation**: When combining instances, generate unique IDs to avoid conflicts
- **Type Inference**: Automatically create types when atoms are added
- **Error Handling**: Throw descriptive errors for invalid operations
- **Performance**: Optimize for common operations (add/remove atoms and relations)

This test suite ensures that all `IInputDataInstance` implementations behave consistently and correctly, making them interchangeable in the cnd-core ecosystem.