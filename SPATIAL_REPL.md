# Spatial REPL: Multi-Language Support

This document describes the enhanced spatial REPL functionality that supports JavaScript, Python, and Pyret programming languages for interactive data visualization.

## Overview

The spatial REPL provides a two-way programming environment where:
- **REPL on the left**: Write code to manipulate data structures
- **Diagram on the right**: See real-time visual representation of your data
- **Two-way communication**: Changes in either panel update the other via JSONDataInstance events

## Supported Languages

### 🟨 JavaScript
Full JavaScript support with ES6+ features:
- **Native JavaScript expressions**: Arrays, objects, functions
- **Array methods**: `map()`, `filter()`, `reduce()`, etc.
- **Math utilities**: `Math.max()`, `Math.min()`, `Math.abs()`
- **Object operations**: `Object.keys()`, `Object.values()`
- **Console debugging**: `console.log()` with REPL prefix
- **Data creation**: `atom()`, `relation()` functions

**Example Usage:**
```javascript
// Create data structures
atom('alice', 'User', 'Alice Smith')
atom('bob', 'User', 'Bob Jones')
relation('r1', 'follows', 'alice', 'bob')

// Process arrays
[1, 2, 3, 4, 5].map(x => x * x)
[1, 2, 3, 4, 5].filter(x => x % 2 === 0)

// Math operations
Math.max(10, 20, 30)
Object.keys({name: 'Alice', age: 25})
```

### 🐍 Python
Python-like syntax with familiar constructs:
- **Built-in functions**: `len()`, `sum()`, `range()`, `max()`, `min()`, `abs()`
- **List comprehensions**: `[x for x in range(10) if x % 2 == 0]`
- **Python data types**: `list()`, `dict()`, `tuple()`, `set()`
- **Python operators**: `**` (power), `//` (floor division)
- **Python constants**: `True`, `False`, `None`
- **Print function**: `print()` with Python-style formatting
- **Data creation**: `atom()`, `relation()` functions

**Example Usage:**
```python
# Create data structures
atom('alice', 'User', 'Alice')
relation('r1', 'follows', 'alice', 'bob')

# Python built-ins
len([1, 2, 3, 4, 5])
sum(range(1, 11))
max(10, 20, 30)

# List comprehensions
[x**2 for x in range(5)]
[x for x in range(10) if x % 2 == 0]

# Python output
print('Hello, Spatial REPL!')
```

### 🎯 Pyret
Original Pyret language support with external evaluator integration:
- **External evaluator**: Uses `window.__internalRepl` when available
- **Pyret expressions**: Full Pyret language support
- **CnD specification extraction**: Automatic extraction from `_cndspec` methods
- **Data structures**: Pyret lists, tables, trees
- **Pattern matching**: Pyret's powerful pattern matching

## Components

### MultiLanguageCombinedInputComponent
The main component that provides the spatial REPL interface:

```tsx
import { MultiLanguageCombinedInputComponent } from 'cnd-core';

<MultiLanguageCombinedInputComponent
  language="javascript" // or "python" or "pyret"
  cndSpec="nodes:\n  - { id: User, type: atom }"
  height="800px"
  showLayoutInterface={true}
  autoApplyLayout={true}
  onLanguageChange={(lang) => console.log('Language:', lang)}
  onInstanceChange={(instance) => console.log('Data:', instance)}
/>
```

### Language-Specific REPL Interfaces
Individual REPL components for each language:

```tsx
import { 
  JavaScriptReplInterface, 
  PythonReplInterface, 
  PyretReplInterface 
} from 'cnd-core';

// JavaScript REPL
<JavaScriptReplInterface
  onChange={(instance) => console.log('JS data:', instance)}
/>

// Python REPL  
<PythonReplInterface
  onChange={(instance) => console.log('Python data:', instance)}
/>

// Pyret REPL
<PyretReplInterface
  externalEvaluator={window.__internalRepl}
  onChange={(instance) => console.log('Pyret data:', instance)}
/>
```

## Evaluators

### JavaScriptEvaluator
- **Safe execution**: Uses Function constructor instead of eval()
- **Timeout support**: Configurable evaluation timeout
- **Error handling**: Comprehensive error catching and reporting
- **Result formatting**: Converts results to appropriate display format

### PythonEvaluator
- **Syntax preprocessing**: Converts Python syntax to JavaScript
- **Built-in simulation**: Implements Python built-ins in JavaScript
- **List comprehension support**: Converts list comprehensions to map/filter
- **Python formatting**: Results displayed in Python style

### PyretEvaluator
- **External integration**: Works with Pyret runtime when available
- **CnD extraction**: Automatic CnD specification extraction
- **Fallback mode**: Graceful degradation without external evaluator

## Event System

The spatial REPL uses an event-driven architecture for real-time synchronization:

```javascript
// Listen for data instance changes
window.addEventListener('spatial-repl-layout-updated', (event) => {
  const { layout, spec, instance } = event.detail;
  console.log('Spatial REPL updated:', { layout, spec, instance });
});

// Listen for language changes
component.onLanguageChange = (language) => {
  console.log('Language switched to:', language);
};
```

## Data Instance Communication

All languages communicate through standardized data instance interfaces:

```typescript
interface IInputDataInstance {
  getAtoms(): IAtom[];
  getRelations(): IRelation[];
  addAtom(atom: IAtom): void;
  addRelation(relation: IRelation): void;
  addEventListener(type: string, listener: Function): void;
  removeEventListener(type: string, listener: Function): void;
}
```

## Integration Examples

### HTML/CDN Usage
```html
<div id="spatial-repl"></div>
<script src="https://cdn.jsdelivr.net/npm/cnd-core/dist/browser/cnd-core-complete.global.js"></script>
<script>
CndCore.mountMultiLanguageCombinedInput({
  containerId: 'spatial-repl',
  language: 'javascript',
  cndSpec: 'nodes:\n  - { id: User, type: atom }',
  height: '800px'
});
</script>
```

### React Integration
```tsx
import { useState } from 'react';
import { MultiLanguageCombinedInputComponent } from 'cnd-core';

function App() {
  const [language, setLanguage] = useState('javascript');
  
  return (
    <MultiLanguageCombinedInputComponent
      language={language}
      onLanguageChange={setLanguage}
      height="100vh"
    />
  );
}
```

## Testing

Comprehensive test coverage for all evaluators:
- **JavaScript Evaluator**: 22 tests covering all language features
- **Python Evaluator**: 35 tests covering Python constructs
- **Integration Tests**: Component integration and event handling

## Demo Files

- `spatial-repl-javascript-demo.html`: JavaScript spatial REPL showcase
- `spatial-repl-python-demo.html`: Python spatial REPL showcase  
- `multi-language-spatial-repl-demo.html`: Complete multi-language demo

## Architecture

The spatial REPL architecture follows these principles:
1. **Separation of Concerns**: Each language has its own evaluator
2. **Event-Driven Communication**: Components communicate via events
3. **Data Instance Abstraction**: Common interface for all data types
4. **Layout Integration**: CnD specification drives visual layout
5. **Real-time Synchronization**: Changes propagate instantly

This implementation fulfills the original issue requirement for "REPL on the left, Diagram on the right" with "communication via JSONDataInstance" while extending support to JavaScript and Python programming languages.