# REPL Interface

A terminal-style interface for building data instances with command-line syntax.

## Why REPL Makes Sense

The REPL (Read-Eval-Print Loop) interface provides significant benefits for data exploration and construction:

- **State preservation**: Unlike stateless interfaces, the REPL maintains the current data instance state across commands, allowing for incremental building and exploration
- **Spatial constraints**: Unlike pure direct manipulation, the REPL can enforce constraints and relationships while providing immediate feedback
- **Ergonomic for experienced users**: While visual interfaces may be better for novices, experienced users often prefer the precision and speed of command-line interfaces
- **Composability**: Commands can be combined and scripted, enabling complex data construction workflows
- **Discoverability**: Built-in help system and pattern recognition make it easy to learn available operations
- **Extensibility**: Parser system allows for language-specific extensions and custom command types

The REPL strikes a balance between the immediacy of direct manipulation and the precision of programmatic control.

## Overview

The REPL Interface provides three terminals for interactive data instance construction:

1. **Terminal 1: Elements (Atoms)** - Add/remove atoms with `Label:Type` syntax
2. **Terminal 2: Relations** - Add/remove relations with `name:atom->atom` syntax  
3. **Terminal 3: Extensions** - Language-specific commands (Pyret lists, etc.)

## Features

- **Terminal-style UI** with syntax highlighting and command history
- **Extensible parser system** for different command types
- **Multi-line input** with Ctrl+Enter execution
- **Built-in help system** with `help` commands
- **Language-specific extensions** (Pyret lists, etc.)
- **Real-time validation** and error reporting

## Basic Usage

```tsx
import { ReplInterface } from 'spytial-core';
import { JSONDataInstance } from 'spytial-core';

const instance = new JSONDataInstance({ atoms: [], relations: [] });

function MyApp() {
  return (
    <ReplInterface 
      instance={instance}
      onChange={(updated) => console.log('Instance changed:', updated)}
    />
  );
}
```

## Commands

### Terminal 1: Atoms

```bash
# Add atoms with generated IDs
add Alice:Person
add Bob:Person
add Car1:Vehicle

# Add atoms with explicit IDs  
add p1=Alice:Person
add v1=Toyota:Car

# Remove atoms
remove p1
remove Alice:Person
```

### Terminal 2: Relations

```bash
# Add binary relations
add friends:alice->bob
add owns:alice->car1

# Add ternary relations (n-ary support)
add knows:alice->bob->charlie
add transaction:buyer->seller->item

# Remove specific tuples
remove friends:alice->bob
remove knows:alice->bob->charlie

# Remove entire relations
remove friends
```

### Terminal 3: Extensions

```bash
# Pyret-style lists
add [list: 1,2,3,4]:numbers
add [list: alice,bob,charlie]:people

# This creates:
# - Individual atoms for each item (if they don't exist)
# - A list atom containing all items
# - first/rest relations for list structure
```

### Utility Commands (All Terminals)

```bash
help      # Show available commands
info      # Show instance statistics
status    # Same as info
list      # List all atoms and relations
clear     # Clear entire instance
```

## Extensibility

### Custom Terminal Configurations

```tsx
import { TerminalConfig, AtomCommandParser, RelationCommandParser } from 'spytial-core';

const customTerminals: TerminalConfig[] = [
  {
    id: 'atoms',
    title: 'Custom Atom Terminal',
    description: 'Add/remove atoms',
    parsers: [new AtomCommandParser()],
    placeholder: 'add Entity:Type'
  },
  // ... more terminals
];

<ReplInterface terminals={customTerminals} instance={instance} />
```

### Custom Command Parsers

```tsx
import { ICommandParser, CommandResult } from 'spytial-core';

class CustomParser implements ICommandParser {
  canHandle(command: string): boolean {
    return command.startsWith('custom ');
  }
  
  execute(command: string, instance: IInputDataInstance): CommandResult {
    // Custom command logic
    return { success: true, message: 'Custom command executed' };
  }
  
  getHelp(): string[] {
    return ['custom <args> - Execute custom command'];
  }
}
```

## Props

### ReplInterfaceProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `instance` | `IInputDataInstance` | **required** | Data instance to modify |
| `onChange` | `(instance) => void` | - | Callback when instance changes |
| `disabled` | `boolean` | `false` | Whether interface is disabled |
| `className` | `string` | `''` | CSS class name |
| `terminals` | `TerminalConfig[]` | Default 3 terminals | Custom terminal configurations |

### TerminalConfig

| Prop | Type | Description |
|------|------|-------------|
| `id` | `string` | Unique terminal identifier |
| `title` | `string` | Terminal title displayed in header |
| `description` | `string` | Terminal description |
| `parsers` | `ICommandParser[]` | Command parsers for this terminal |
| `placeholder` | `string` | Placeholder text for input area |

## Styling

The component uses CSS classes with the `repl-` prefix:

```css
.repl-interface { /* Main container */ }
.repl-terminal { /* Individual terminal */ }
.repl-terminal__header { /* Terminal header */ }
.repl-terminal__output { /* Command output area */ }
.repl-terminal__input { /* Command input area */ }
.repl-output-line.success { /* Success messages */ }
.repl-output-line.error { /* Error messages */ }
```

Override these classes to customize the appearance.

## Examples

### Basic Data Instance Building

```tsx
// Start with empty instance
const instance = new JSONDataInstance({ atoms: [], relations: [] });

// Commands in Terminal 1:
add Alice:Person
add Bob:Person
add Charlie:Person

// Commands in Terminal 2:
add friends:Alice->Bob
add friends:Bob->Charlie
add knows:Alice->Charlie

// Result: 3 Person atoms with friendship and knowledge relations
```

### Pyret List Integration

```tsx
// Commands in Terminal 3:
add [list: 1,2,3,4]:numbers
add [list: Alice,Bob]:people

// This automatically creates:
// - Number atoms: 1, 2, 3, 4
// - List atom: numbers-1 
// - Person atoms: Alice, Bob (if they don't exist)
// - List atom: people-1
// - first/rest relations for list structure
```

### External Pyret Evaluator Integration

When an external Pyret evaluator is available (e.g., `window.__internalRepl`), the REPL interface gains enhanced capabilities:

```tsx
import { PyretReplInterface } from 'spytial-core';

// Assuming window.__internalRepl is available from the Pyret environment
const externalEvaluator = window.__internalRepl;

function MyApp() {
  return (
    <PyretReplInterface 
      externalEvaluator={externalEvaluator}
      onChange={(instance) => console.log('Instance changed:', instance)}
    />
  );
}

// With external evaluator, you can use arbitrary Pyret expressions:
// edge("id", "label", 3)
// tree(node(1, empty, empty), node(2, empty, empty))  
// table: name, age row: "Alice", 25 row: "Bob", 30 end
```

### Data Exploration

```tsx
// Utility commands work in all terminals:
status    // Shows: "3 atoms, 2 relations, 3 tuples"
list      // Shows all atoms and relations
help      // Shows available commands
clear     // Removes all data
```

## Integration with Other Components

The REPL Interface works seamlessly with other spytial-core components:

```tsx
import { ReplInterface, InstanceBuilder, LayoutInstance } from 'spytial-core';

function DataBuilderApp() {
  const [instance, setInstance] = useState(new JSONDataInstance({...}));
  const [useRepl, setUseRepl] = useState(true);

  return (
    <div>
      <button onClick={() => setUseRepl(!useRepl)}>
        Switch to {useRepl ? 'Form' : 'REPL'} Interface
      </button>
      
      {useRepl ? (
        <ReplInterface instance={instance} onChange={setInstance} />
      ) : (
        <InstanceBuilder instance={instance} onChange={setInstance} />
      )}
      
      {/* Generate layout from the instance */}
      <LayoutView instance={instance} />
    </div>
  );
}
```

## Complete Integration: Pyret REPL + External Evaluator + Visualization

For production applications, the recommended approach combines all features for a complete data exploration and visualization experience:

### Complete Setup

```tsx
import { 
  PyretReplInterface, 
  CndLayoutInterface, 
  ReplWithVisualization 
} from 'spytial-core';

function CompleteIntegrationApp() {
  const [pyretInstance, setPyretInstance] = useState(new PyretDataInstance());
  const [cndSpec, setCndSpec] = useState('');
  
  // Check for external evaluator
  const externalEvaluator = window.__internalRepl || window.pyretREPLInternal;
  
  if (externalEvaluator) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Enhanced Pyret REPL with full language support */}
        <div style={{ height: '400px' }}>
          <PyretReplInterface
            externalEvaluator={externalEvaluator}
            initialInstance={pyretInstance}
            onChange={setPyretInstance}
          />
        </div>
        
        {/* CnD Layout Interface for constraint specification */}
        <div style={{ height: '300px' }}>
          <CndLayoutInterface
            value={cndSpec}
            onChange={setCndSpec}
            instance={pyretInstance}
          />
        </div>
        
        {/* Visualization area would be integrated here */}
        <div style={{ flex: 1, minHeight: '400px' }}>
          <YourVisualizationComponent 
            instance={pyretInstance}
            layoutSpec={cndSpec}
          />
        </div>
      </div>
    );
  } else {
    // Fallback: Combined component without external evaluator
    return (
      <ReplWithVisualization
        instance={pyretInstance}
        onChange={setPyretInstance}
        showLayoutInterface={true}
        replHeight="350px"
        visualizationHeight="450px"
      />
    );
  }
}
```

### Complete Integration via Mount Functions

For CDN/browser usage, use the mounting functions for easier setup:

```javascript
// Complete integration initialization
function initializeCompleteSystem() {
  const hasExternalEvaluator = !!(window.__internalRepl || window.pyretREPLInternal);
  
  if (hasExternalEvaluator) {
    // Enhanced mode with external evaluator
    CnDCore.mountPyretRepl('pyret-repl-container', {
      externalEvaluator: window.__internalRepl,
      className: 'production-repl'
    });
    
    CnDCore.mountCndLayoutInterface('layout-container', {
      initialIsNoCodeView: true
    });
    
    // Set up real-time synchronization
    setupRealtimeSynchronization();
    
  } else {
    // Fallback mode
    CnDCore.mountReplWithVisualization('fallback-container', {
      showLayoutInterface: true,
      replHeight: '350px',
      visualizationHeight: '450px'
    });
  }
}

function setupRealtimeSynchronization() {
  // Sync Pyret instance changes with visualization
  window.addEventListener('pyret-instance-changed', (event) => {
    const { instance } = event.detail;
    updateVisualizationFromPyretInstance(instance);
  });
  
  // Sync layout changes
  window.addEventListener('cnd-spec-changed', (event) => {
    applyLayoutConstraints(event.detail);
  });
}
```

### Features of Complete Integration

1. **Enhanced Pyret REPL**: Full Pyret language support via external evaluator
2. **Real-time Synchronization**: Changes propagate instantly between components  
3. **Visual Layout Interface**: No-code constraint specification
4. **Graceful Fallback**: Works without external evaluator
5. **Event-driven Architecture**: Components communicate via custom events
6. **Production Ready**: Optimized for real applications

### External Evaluator Commands

With external evaluator available, the REPL supports full Pyret expressions:

```pyret
# Standard data building
Alice:Person
alice.friend = bob

# Full Pyret expressions via external evaluator
edge("node1", "knows", "node2")
tree(node(1, empty, empty), node(2, empty, empty))
table: name, age row: "Alice", 25 row: "Bob", 30 end

# List expressions with proper Pyret semantics
[list: 1, 2, 3, 4]:numbers
[set: "red", "blue", "green"]:colors

# Advanced data structures
graph([list: node("A"), node("B")], [list: edge("A", "B")])
```

### Event System

The complete integration uses a custom event system for coordination:

```javascript
// Listen for Pyret instance changes
window.addEventListener('pyret-instance-changed', (event) => {
  const { instance } = event.detail;
  console.log('Data updated:', {
    atoms: instance.getAtoms().length,
    relations: instance.getRelations().length,
    pyretCode: instance.reify()
  });
});

// Listen for layout specification changes
window.addEventListener('cnd-spec-changed', (event) => {
  const cndSpec = event.detail;
  console.log('Layout constraints updated');
});

// Listen for visualization changes
window.addEventListener('repl-visualization-changed', (event) => {
  const { instance } = event.detail;
  console.log('Visualization data changed');
});
```

This complete integration approach provides a production-ready solution for data exploration, constraint specification, and real-time visualization.