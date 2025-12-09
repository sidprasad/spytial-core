# Selector Synthesis

The `simple-graph-query` library includes a powerful synthesizer that can automatically generate selector expressions from examples. This feature is now exposed through cnd-core's synthesis API.

## ⚠️ Evaluator Compatibility

**Synthesis only works with `SGraphQueryEvaluator`** (the SimpleGraphQuery evaluator). It generates expressions in the simple-graph-query language.

- ✅ **Supported**: `SGraphQueryEvaluator` 
- ❌ **Not Supported**: `ForgeEvaluator` (Forge has its own expression language)

Check compatibility before using:

```typescript
import { isSynthesisSupported, SGraphQueryEvaluator } from 'spytial-core';

const evaluator = new SGraphQueryEvaluator();
evaluator.initialize({ sourceData: myDataInstance });

if (isSynthesisSupported(evaluator)) {
  // Synthesis available
  const selector = synthesizeAtomSelector([...]);
} else {
  // Fall back to manual selector entry
}
```

## Overview

Instead of manually writing complex selector expressions, you can:
1. Provide examples of which atoms/pairs you want to select
2. Let the synthesizer generate the selector expression automatically

The synthesizer uses a CEGIS-style (Counter-Example Guided Inductive Synthesis) approach, exploring the expression grammar (identifiers, set operations, joins, closures) to find an expression matching all examples.

## API Functions

### `synthesizeAtomSelector(examples, maxDepth?)`

Generate a unary selector (for single atoms) from examples.

```typescript
import { synthesizeAtomSelector } from 'spytial-core';

const selector = synthesizeAtomSelector([
  { 
    atoms: [aliceAtom, bobAtom], 
    dataInstance: instance1 
  },
  { 
    atoms: [charlieAtom, dianaAtom], 
    dataInstance: instance2 
  }
], 3); // maxDepth = 3

// Returns e.g., "Student" or "Person & Adult"
```

**Use cases:**
- Alignment constraints: "align left for all Students"
- Color directives: "color red for all Managers"
- Size directives: "size large for important nodes"

### `synthesizeBinarySelector(examples, maxDepth?)`

Generate a binary relation selector (for atom pairs) from examples.

```typescript
import { synthesizeBinarySelector } from 'spytial-core';

const selector = synthesizeBinarySelector([
  { 
    pairs: [[alice, bob], [charlie, diana]], 
    dataInstance: instance1 
  }
], 3);

// Returns e.g., "friend" or "coworker & SameOffice"
```

**Use cases:**
- Orientation constraints: "right(friend)" for all friend relationships
- Layout edges: automatically derive edge relations from visual placement

### `synthesizeAtomSelectorWithExplanation(examples, maxDepth?)`

Same as `synthesizeAtomSelector` but returns detailed provenance showing how subexpressions evaluated.

```typescript
import { synthesizeAtomSelectorWithExplanation } from 'spytial-core';

const result = synthesizeAtomSelectorWithExplanation([
  { atoms: [alice, bob], dataInstance: instance }
]);

console.log(result.expression); // "Student & Adult"
console.log(result.examples[0].why); // Provenance tree
// {
//   kind: 'intersection',
//   expression: '(Student & Adult)',
//   result: Set { 'alice', 'bob' },
//   children: [
//     { kind: 'identifier', expression: 'Student', result: Set { 'alice', 'bob', 'charlie' } },
//     { kind: 'identifier', expression: 'Adult', result: Set { 'alice', 'bob', 'diana' } }
//   ]
// }
```

### Helper Functions

#### `createOrientationConstraint(selector, directions)`

```typescript
import { createOrientationConstraint, synthesizeBinarySelector } from 'spytial-core';

const selector = synthesizeBinarySelector([{ pairs: [[a, b]], dataInstance: inst }]);
const constraint = createOrientationConstraint(selector, ['right', 'below']);
// Returns: "right(friend)\nbelow(friend)"
```

#### `createAlignmentConstraint(selector, alignment)`

```typescript
import { createAlignmentConstraint, synthesizeAtomSelector } from 'spytial-core';

const selector = synthesizeAtomSelector([{ atoms: [a, b, c], dataInstance: inst }]);
const constraint = createAlignmentConstraint(selector, 'left');
// Returns: "align left(Student)"
```

#### `createColorDirective(selector, color)`

```typescript
import { createColorDirective, synthesizeAtomSelector } from 'spytial-core';

const selector = synthesizeAtomSelector([{ atoms: [manager1, manager2], dataInstance: inst }]);
const directive = createColorDirective(selector, '#ff0000');
// Returns: "color #ff0000(Manager)"
```

## Interactive Workflow Example

Here's how you might integrate synthesis into an interactive UI:

```typescript
// User selects nodes in the graph
const selectedNodes = [node1, node2, node3];
const selectedAtoms = selectedNodes.map(n => dataInstance.getAtoms().find(a => a.id === n.id));

try {
  // Synthesize selector from selection
  const result = synthesizeAtomSelectorWithExplanation([{
    atoms: selectedAtoms,
    dataInstance
  }]);
  
  console.log(`Generated selector: ${result.expression}`);
  
  // Show user what the selector matches
  const evaluator = new SGraphQueryEvaluator();
  evaluator.initialize({ sourceData: dataInstance });
  const evalResult = evaluator.evaluate(result.expression);
  console.log(`Selector matches: ${evalResult.selectedAtoms().join(', ')}`);
  
  // User confirms and adds to CnD spec
  const newSpec = `${existingSpec}\ncolor blue(${result.expression})`;
  
} catch (error) {
  if (error instanceof SelectorSynthesisError) {
    console.error('Could not synthesize selector:', error.message);
    // Fall back to manual entry
  }
}
```

## Integration with AlloyInputGraph

For Alloy/Forge workflows, you can add synthesis to the input controls:

```typescript
const graph = document.querySelector('alloy-input-graph');
const api = graph.getInputControlsAPI();

// User selects atoms by clicking
const selectedAtomIds = ['Alice', 'Bob', 'Charlie'];
const atoms = selectedAtomIds.map(id => 
  api.getCurrentAtoms().find(a => a.id === id)
);

// Synthesize selector
const dataInstance = graph.dataInstance; // Access through public property
const selector = synthesizeAtomSelector([{
  atoms: atoms,
  dataInstance: dataInstance
}]);

// Use in CnD spec
const cndSpec = `
#lang forge/cnd

sig Person { friend: set Person }

right(${selector})
color blue(${selector})
`;

graph.setCnDSpec(cndSpec);
```

## Synthesis Parameters

### `maxDepth` (default: 3)

Controls the maximum complexity of generated expressions:
- `1`: Only base identifiers (e.g., "Person")
- `2`: Simple operations (e.g., "Person + Student", "^parent")
- `3`: Complex expressions (e.g., "(Person & Adult) - Manager")
- Higher: More complex but slower synthesis

### Performance Considerations

- Synthesis time grows with `maxDepth` and number of identifiers
- For large schemas, consider filtering available identifiers
- Use explanation mode for debugging synthesis failures
- Cache synthesized selectors for repeated patterns

## Error Handling

```typescript
import { SelectorSynthesisError } from 'spytial-core';

try {
  const selector = synthesizeAtomSelector(examples);
} catch (error) {
  if (error instanceof SelectorSynthesisError) {
    // Common causes:
    // - No shared identifiers across examples
    // - Examples are contradictory
    // - maxDepth too small for required complexity
    console.error('Synthesis failed:', error.message);
  }
}
```

## Future Enhancements

Potential additions:
- UI component for interactive selection → synthesis
- Synthesis history/undo for iterative refinement
- Multi-example synthesis with positive and negative examples
- Constraint suggestion based on graph structure
- Auto-generation of complete CnD specs from visual layouts
