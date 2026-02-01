# Multiple Evaluator Support

SpyTial-core now supports using multiple evaluators in a single layout specification. This allows you to mix different selector syntaxes (SGQ, SQL, Forge) in the same layout.

## Overview

The layout system can work with multiple evaluator implementations:
- **SGQ (Simple Graph Query)**: Default evaluator with simple selector syntax like `friend`, `Person`, `A->B`
- **SQL**: SQL-based queries using `SELECT` statements
- **Forge**: Forge/Alloy expression syntax

## Usage

### Basic Setup with Evaluator Registry

```typescript
import {
  LayoutInstance,
  parseLayoutSpec,
  EvaluatorRegistry,
  EvaluatorType,
  SGraphQueryEvaluator,
  SQLEvaluator
} from 'spytial-core';

// Create data instance
const dataInstance = new JSONDataInstance({
  atoms: [
    { id: 'Alice', type: 'Person', label: 'Alice' },
    { id: 'Bob', type: 'Person', label: 'Bob' },
    { id: 'TechCorp', type: 'Company', label: 'TechCorp' }
  ],
  relations: [
    {
      id: 'friend',
      name: 'friend',
      types: ['Person', 'Person'],
      tuples: [{ atoms: ['Alice', 'Bob'], types: ['Person', 'Person'] }]
    },
    {
      id: 'worksAt',
      name: 'worksAt',
      types: ['Person', 'Company'],
      tuples: [
        { atoms: ['Alice', 'TechCorp'], types: ['Person', 'Company'] },
        { atoms: ['Bob', 'TechCorp'], types: ['Person', 'Company'] }
      ]
    }
  ]
});

// Create evaluator registry
const registry = new EvaluatorRegistry();

// Register SGQ evaluator (default)
const sgqEvaluator = new SGraphQueryEvaluator();
sgqEvaluator.initialize({ sourceData: dataInstance });
registry.register(EvaluatorType.SGQ, sgqEvaluator);
registry.setDefault(EvaluatorType.SGQ);

// Register SQL evaluator
const sqlEvaluator = new SQLEvaluator();
sqlEvaluator.initialize({ sourceData: dataInstance });
registry.register(EvaluatorType.SQL, sqlEvaluator);

// Use registry with LayoutInstance
const layoutSpec = parseLayoutSpec(specString);
const layoutInstance = new LayoutInstance(layoutSpec, registry);
const { layout } = layoutInstance.generateLayout(dataInstance, {});
```

### Backward Compatibility

The system maintains backward compatibility with single-evaluator usage:

```typescript
// Legacy mode - still works
const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: dataInstance });

const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
```

## Layout Specification Syntax

### Specifying Evaluator Type

Add an `evaluatorType` field to any constraint or directive that uses a selector:

```yaml
constraints:
  - orientation:
      selector: "SELECT src, tgt FROM friend"
      evaluatorType: sql
      directions:
        - right

directives:
  - atomColor:
      selector: "SELECT id FROM _atoms WHERE type = 'Person'"
      evaluatorType: sql
      value: "#FF0000"
```

### Supported Evaluator Types

- `sgq` or `simplegraphquery` - Simple Graph Query evaluator (default)
- `sql` - SQL evaluator
- `forge` - Forge expression evaluator

Case-insensitive: `SQL`, `sql`, and `Sql` all work.

## Examples

### Example 1: Mixed Evaluators in Constraints and Directives

```yaml
constraints:
  - orientation:
      # Uses SGQ (default)
      selector: friend
      directions:
        - right
  - orientation:
      # Uses SQL evaluator
      selector: "SELECT src, tgt FROM worksAt"
      evaluatorType: sql
      directions:
        - below

directives:
  - atomColor:
      # Uses SGQ (default)
      selector: Person
      value: "#0000FF"
  - atomColor:
      # Uses SQL evaluator
      selector: "SELECT id FROM _atoms WHERE type = 'Company'"
      evaluatorType: sql
      value: "#00FF00"
```

### Example 2: Tag Directives with Different Evaluators

```yaml
directives:
  - tag:
      # toTag uses SGQ (default)
      toTag: Person
      name: company
      # value uses SQL evaluator
      value: "SELECT tgt FROM worksAt WHERE src IN (SELECT id FROM _atoms WHERE type = 'Person')"
      valueEvaluatorType: sql
```

### Example 3: Edge Styling with SQL Filters

```yaml
directives:
  - edgeColor:
      field: friend
      # Selector uses SGQ (default)
      selector: Person
      # Filter uses SQL evaluator
      filter: "SELECT src, tgt FROM friend WHERE src = 'Alice'"
      filterEvaluatorType: sql
      value: "#FF00FF"
```

### Example 4: Group By with SQL

```yaml
constraints:
  - group:
      # Uses SQL evaluator for grouping
      selector: "SELECT src, tgt FROM worksAt"
      evaluatorType: sql
      name: company
      addEdge: false
```

## When to Use Multiple Evaluators

### Use SQL Evaluator When:
- You need complex aggregations (COUNT, GROUP BY, etc.)
- You want to leverage SQL's powerful filtering capabilities
- Your team is more familiar with SQL syntax
- You need to join or filter across multiple relations

### Use SGQ (Default) When:
- You want simple, concise selector syntax
- You're working with graph-like queries
- You need path expressions (e.g., `friend.friend`)
- Performance is critical (SGQ is optimized for graph queries)

### Use Forge Evaluator When:
- Working with Forge/Alloy models
- Need Forge-specific syntax features
- Converting existing Forge visualizations

## Fallback Behavior

If a specified evaluator type is not registered, the system falls back to the default evaluator:

```typescript
const registry = new EvaluatorRegistry();
// Only register SGQ
registry.register(EvaluatorType.SGQ, sgqEvaluator);
registry.setDefault(EvaluatorType.SGQ);

// This will fall back to SGQ even though SQL is specified
const spec = `
directives:
  - atomColor:
      selector: "SELECT id FROM _atoms"
      evaluatorType: sql
      value: "#FF0000"
`;
```

## API Reference

### EvaluatorRegistry

```typescript
class EvaluatorRegistry implements IEvaluatorRegistry {
  // Register an evaluator
  register(type: EvaluatorType, evaluator: IEvaluator): void;
  
  // Get an evaluator by type
  get(type: EvaluatorType): IEvaluator | undefined;
  
  // Get the default evaluator
  getDefault(): IEvaluator;
  
  // Set the default evaluator type
  setDefault(type: EvaluatorType): void;
  
  // Check if evaluator is registered
  has(type: EvaluatorType): boolean;
}
```

### EvaluatorType Enum

```typescript
enum EvaluatorType {
  SGQ = 'sgq',
  SQL = 'sql',
  FORGE = 'forge'
}
```

## Notes

- Each evaluator must be initialized with the same data instance
- Evaluator types are case-insensitive in YAML
- The default evaluator is used when no type is specified
- All existing code continues to work without modifications (backward compatible)
