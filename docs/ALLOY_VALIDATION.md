# Alloy Instance Validation

The `AlloyDataInstance` now includes intelligent validation capabilities that perform static analysis during reification.

## Features

### Type Validation
- **Tuple Arity Checking**: Ensures tuples have the correct number of atoms matching the relation's type signature
- **Type Consistency**: Validates that atoms in tuples match their declared types
- **Atom Existence**: Checks that all referenced atoms actually exist in the instance
- **Type Hierarchy**: Verifies atoms are compatible with expected types considering the type hierarchy

### Multiplicity Analysis
- **One Constraint**: Detects violations of `one` multiplicity (types that should have exactly 1 atom)
- **Abstract Types**: Warns when abstract types have direct instances
- **Builtin Types**: Validates proper usage of builtin types like `Int` and `seq/Int`

### Usage

#### Programmatic Validation

```typescript
import { AlloyDataInstance } from 'spytial-core';

const dataInstance = new AlloyDataInstance(alloyInstance);

// Get validation results
const validation = dataInstance.validate();

if (!validation.isValid) {
  console.log('Validation errors found:');
  validation.issues.forEach(issue => {
    console.log(`[${issue.severity}] ${issue.message}`);
    if (issue.context) {
      console.log('  Context:', issue.context);
    }
  });
}
```

#### Reification with Validation

The `reify()` method automatically performs validation and includes any issues as comments in the output:

```typescript
const reified = dataInstance.reify();
// If validation issues exist, they will be included as comments:
// inst builtinstance {
// -- Validation Results:
// -- Errors (1):
// --   - Atom 'Node99' referenced in relation 'edge' does not exist
// --   Context: {"relation":"edge","atom":"Node99"}
// -- WARNING: Instance has validation errors!
//
// Node = `Node0+`Node1
// edge = (`Node0->`Node99)
// }
```

## Validation Result Structure

```typescript
interface ValidationResult {
  isValid: boolean;  // true if no errors (warnings are allowed)
  issues: ValidationIssue[];
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  context?: {
    type?: string;
    relation?: string;
    atom?: string;
    tuple?: string[];
  };
}
```

## Examples

### Detecting Type Mismatches

```typescript
// Example: Relation expects Person->Person but tuple has Person->Int
// Validation will report:
// ERROR: Type mismatch in relation 'friend' at position 1: expected 'Person', got 'Int'
```

### Detecting Multiplicity Violations

```typescript
// Example: Type declared as 'one' but has 2 atoms
// Validation will report:
// ERROR: Type 'Singleton' is declared as 'one' but has 2 atom(s)
```

### Detecting Non-existent Atoms

```typescript
// Example: Tuple references an atom that doesn't exist
// Validation will report:
// ERROR: Atom 'Node99' referenced in relation 'edge' does not exist
```

## Integration with Development Workflow

1. **During Development**: Use `validate()` to check instance integrity before reification
2. **In Tests**: Assert that instances are valid or check for expected validation errors
3. **In Production**: Include validation results in error reporting for debugging

## Performance

Validation runs during reification by default. For large instances, consider:
- Caching validation results if reifying multiple times
- Running validation separately and only reifying valid instances
- Disabling validation in production if performance is critical (not recommended)
