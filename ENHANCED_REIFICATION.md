# Enhanced Pyret Reification

This document describes the enhanced reification functionality for Pyret data instances in CnD Core.

## Overview

The enhanced Pyret reification system addresses the core issue of determining correct argument order when converting data instances back to Pyret constructor notation, especially when the original object structure is not preserved (e.g., when data is constructed through REPL commands).

## Key Features

### 1. Enhanced Reification with Fallback Mechanisms

The `ReificationHelper` class provides advanced reification capabilities that work even when the original Pyret object structure is missing:

- **Schema-based ordering**: Use predefined type schemas to determine constructor argument order
- **Heuristic-based ordering**: Intelligent fallback using common Pyret patterns (e.g., value, left, right for trees)
- **Original structure preservation**: When available, use the original object's dictionary key order
- **Alphabetical fallback**: Last resort ordering for unknown patterns

### 2. REPL Integration

New REPL commands for interactive reification:

```bash
# Basic reification
reify                    # Convert entire data instance to Pyret code
reify atom_id           # Reify a specific atom by its ID

# Advanced options
reify --format          # Multi-line formatted output
reify --debug           # Include debug comments for troubleshooting

# Data exploration
show-structure          # Display overview of data structure
show-schemas            # Show available type schemas
```

### 3. Type Schema Support

Define constructor argument order for custom types:

```typescript
const schemas: PyretTypeSchema[] = [
  {
    typeName: 'Node',
    argumentFields: ['value', 'left', 'right'],
    examples: ['Node(5, Leaf(0), Leaf(0))']
  },
  {
    typeName: 'Leaf',
    argumentFields: ['value'],
    examples: ['Leaf(42)']
  }
];
```

## Usage Examples

### Basic Reification

```typescript
import { PyretDataInstance } from 'cnd-core';

// From original Pyret object (preserves structure)
const pyretData = {
  dict: { value: 5, left: {...}, right: {...} },
  brands: { "$brandNode": true }
};
const instance = new PyretDataInstance(pyretData);
console.log(instance.reify());
// Output: Node(5, Leaf(3), Leaf(7))
```

### Enhanced Reification with Options

```typescript
import { PyretDataInstance, createReificationHelper } from 'cnd-core';

// Create instance from REPL commands (no original structure)
const instance = new PyretDataInstance(null);
instance.addAtom({ id: 'n1', type: 'Node', label: 'Node$1' });
instance.addAtom({ id: 'v1', type: 'Number', label: '5' });
instance.addRelationTuple('value', { atoms: ['n1', 'v1'], types: ['Node', 'Number'] });

// Use enhanced reification with schema
const options = {
  schemas: [
    { typeName: 'Node', argumentFields: ['value', 'left', 'right'] }
  ],
  formatOutput: true,
  includeDebugComments: true
};

const helper = createReificationHelper(instance, options);
console.log(helper.reify());
// Output: Node(5) (or formatted version)
```

### REPL Commands

```typescript
import { PyretReplInterface } from 'cnd-core';

// In the REPL interface:
// User types: reify
// Output: Node(5, Leaf(3), Leaf(7))

// User types: show-structure
// Output: 
// Data Structure Overview:
//   Atoms: 3
//   Relations: 2
//   Types: 2
// Types:
//   Node: 1 atoms
//     - n1 (Node$1)
//   Leaf: 2 atoms
//     - l1 (Leaf$1)
//     - l2 (Leaf$2)

// User types: show-schemas
// Output:
// Available Type Schemas:
// 
// Node:
//   Arguments: value, left, right
//   Examples:
//     Node(10, Leaf(5), Leaf(15))
```

## Architecture

### ReificationHelper Class

The core enhanced reification functionality:

```typescript
class ReificationHelper {
  constructor(instance: PyretDataInstance, options: ReificationOptions);
  
  // Main reification methods
  reify(): string;
  reifyAtom(atomId: string, visited?: Set<string>): string;
  
  // Schema management
  getSchemas(): PyretTypeSchema[];
  addSchema(schema: PyretTypeSchema): void;
  
  // Internal methods for argument order determination
  private determineArgumentOrder(atom: IAtom): string[];
  private inferArgumentOrderFromRelations(atom: IAtom): string[];
}
```

### ReificationCommandParser

REPL command parser for reification operations:

```typescript
class ReificationCommandParser implements ICommandParser {
  canHandle(command: string): boolean;
  execute(command: string, instance: IInputDataInstance): CommandResult;
  getHelp(): string[];
}
```

### Enhanced PyretDataInstance Methods

New methods added to the existing `PyretDataInstance` class:

```typescript
class PyretDataInstance {
  // Enhanced reification with options
  reifyWithOptions(options?: ReificationOptions): string;
  
  // Reify specific atoms
  reifyAtomById(atomId: string, options?: ReificationOptions): string;
}
```

## Argument Order Determination Strategy

The system uses a layered approach to determine constructor argument order:

1. **Explicit Schema**: If a type schema is provided, use its `argumentFields` array
2. **Original Structure**: If the original Pyret object is preserved, use its dictionary key order
3. **Heuristic Patterns**: Apply common Pyret patterns:
   - `['value', 'left', 'right']` for binary trees
   - `['first', 'rest']` for lists
   - `['data', 'next']` for linked lists
   - Priority ordering: value, data, first, second, third, left, right, rest, next
4. **Alphabetical**: Sort relation names alphabetically as last resort

## Common Pyret Patterns

The system recognizes these common Pyret data structure patterns:

### Binary Trees
```pyret
data BinaryTree:
  | Node(value, left, right)
  | Leaf(value)
end
```

### Lists
```pyret
data List:
  | Link(first, rest)
  | Empty
end
```

### Custom Data Types
```pyret
data Person:
  | person(name, age, address)
end
```

## Integration with Existing Code

The enhanced reification functionality is designed to be backward compatible:

- Existing `reify()` method continues to work as before
- New functionality is opt-in through `reifyWithOptions()` and REPL commands
- Original test suite passes without modification
- Enhanced features are available when needed

## Error Handling

The system gracefully handles various error conditions:

- **Missing atoms**: Returns debug comments or atom ID
- **Circular references**: Prevents infinite recursion with cycle detection
- **Missing schemas**: Falls back to heuristic or alphabetical ordering
- **Invalid commands**: Provides clear error messages in REPL

## Performance Considerations

- **Lazy evaluation**: Enhanced reification is only used when explicitly requested
- **Caching**: Original object structures are preserved for fast reification
- **Efficient patterns**: Common pattern matching uses optimized algorithms
- **Memory efficient**: Minimal additional memory overhead

## Future Enhancements

Potential areas for future development:

1. **Dynamic schema inference**: Learn schemas from successful reifications
2. **Interactive schema building**: REPL commands to define custom schemas
3. **Pattern library**: Expand built-in pattern recognition
4. **Export functionality**: Save reified code to files
5. **Integration with Pyret IDE**: Direct integration with Pyret development tools

## Migration Guide

For existing users upgrading to the enhanced reification:

### No Changes Required
- Existing `instance.reify()` calls continue to work unchanged
- All existing tests pass without modification
- No breaking changes to public APIs

### To Use Enhanced Features
```typescript
// Replace this:
const result = instance.reify();

// With this for enhanced features:
const result = instance.reifyWithOptions({
  schemas: [...], 
  formatOutput: true
});

// Or use the ReificationHelper directly:
const helper = createReificationHelper(instance, options);
const result = helper.reify();
```

### REPL Integration
Simply update your REPL interface to include the new parser:

```typescript
import { ReificationCommandParser } from 'cnd-core';

const terminals = [{
  parsers: [
    new ReificationCommandParser(), // Add this
    // ... other parsers
  ]
}];
```

## Examples and Demos

See the test files for comprehensive examples:
- `tests/enhanced-reification.test.ts` - Core functionality tests
- `tests/reification-commands.test.ts` - REPL command tests

The implementation successfully addresses the original issue of determining correct argument order during reification while maintaining backward compatibility and providing powerful new capabilities for interactive development.