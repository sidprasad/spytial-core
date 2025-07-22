# Pyret REPL Integration Example

This document demonstrates how to use the new Pyret REPL integration added to `react-component-integration.tsx`.

## Basic Usage

### 1. Simple Pyret REPL

```html
<!DOCTYPE html>
<html>
<head>
    <title>Pyret REPL Demo</title>
</head>
<body>
    <!-- Container for the Pyret REPL -->
    <div id="pyret-repl-container"></div>
    
    <!-- Load the CnD-Core library -->
    <script src="path/to/react-component-integration.global.js"></script>
    
    <script>
        // Mount a basic Pyret REPL
        CnDCore.mountPyretRepl('pyret-repl-container');
    </script>
</body>
</html>
```

### 2. Pyret REPL with External Evaluator (Enhanced Features)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Pyret REPL Demo</title>
    <!-- Include Pyret's runtime first -->
    <script src="path/to/pyret-runtime.js"></script>
</head>
<body>
    <div id="enhanced-pyret-repl"></div>
    
    <script src="path/to/react-component-integration.global.js"></script>
    
    <script>
        // Mount Pyret REPL with external evaluator for full Pyret support
        CnDCore.mountPyretRepl('enhanced-pyret-repl', {
            externalEvaluator: window.__internalRepl, // Assumes Pyret runtime is loaded
            className: 'my-custom-repl'
        });
    </script>
</body>
</html>
```

### 3. Combined REPL + Visualization

```html
<!DOCTYPE html>
<html>
<head>
    <title>Pyret REPL with Visualization</title>
</head>
<body>
    <div id="repl-with-viz" style="width: 100%; height: 800px;"></div>
    
    <script src="path/to/react-component-integration.global.js"></script>
    
    <script>
        // Mount combined REPL and visualization
        CnDCore.mountReplWithVisualization('repl-with-viz', {
            showLayoutInterface: true,
            replHeight: '400px',
            visualizationHeight: '400px'
        });
    </script>
</body>
</html>
```

## Advanced Usage

### Programmatic Instance Management

```javascript
// Get current Pyret instance
const currentInstance = CnDCore.DataAPI.getCurrentPyretInstance();

// Update instance programmatically
const newInstance = new CnDCore.PyretDataInstance(myPyretData);
CnDCore.DataAPI.updatePyretInstance(newInstance);

// Get Pyret constructor notation (reify)
const pyretCode = CnDCore.DataAPI.reifyCurrentPyretInstance();
console.log('Current data as Pyret code:', pyretCode);

// Set external evaluator at runtime
CnDCore.DataAPI.setExternalPyretEvaluator(window.__internalRepl);
```

### Event Handling

```javascript
// Listen for Pyret instance changes
window.addEventListener('pyret-instance-changed', (event) => {
    const { instance } = event.detail;
    console.log('Pyret instance updated:', instance);
    
    // Automatically generate reified code
    const pyretCode = instance.reify();
    console.log('Updated Pyret code:', pyretCode);
});

// Listen for REPL+visualization changes
window.addEventListener('repl-visualization-changed', (event) => {
    const { instance } = event.detail;
    console.log('Visualization data updated:', instance);
});
```

## Typical Pyret REPL Commands

With the integration, users can enter Pyret-style commands:

```pyret
# Basic atoms
Alice:Person
Bob:Person

# Relations using dot notation
alice.friend = bob
bob.age = 25

# Pyret expressions (requires external evaluator)
edge("1", "knows", "2")
[list: 1, 2, 3, 4]:numbers

# Utility commands
help        # Show help
info        # Show current instance status
reify       # Generate Pyret constructor notation
clear       # Clear the instance
```

## Integration with Existing Pyret Applications

```javascript
// For existing Pyret applications with their own evaluator
function integrateWithPyretApp() {
    // Wait for Pyret runtime to be ready
    if (window.__internalRepl) {
        // Mount enhanced REPL
        CnDCore.mountPyretRepl('data-explorer', {
            externalEvaluator: window.__internalRepl
        });
        
        // Set up bidirectional data flow
        window.addEventListener('pyret-instance-changed', (event) => {
            const instance = event.detail.instance;
            // Sync with your Pyret application state
            updateMyPyretApp(instance);
        });
    } else {
        // Fallback to basic REPL without external evaluator
        CnDCore.mountPyretRepl('data-explorer');
    }
}

// Call when page loads
document.addEventListener('DOMContentLoaded', integrateWithPyretApp);
```

## Mount All Components at Once

```javascript
// Mount everything including Pyret components
const results = CnDCore.mountAllComponentsWithPyret();
console.log('Mount results:', results);
// Results will be:
// {
//   layoutInterface: true,
//   instanceBuilder: true, 
//   errorModal: true,
//   pyretRepl: true,
//   replWithVisualization: true
// }
```

## Benefits

1. **Ergonomic API**: Simple function calls to mount complex React components
2. **External Evaluator Support**: Full Pyret language support when evaluator is available
3. **Reify Functionality**: Generate Pyret constructor notation for examining data structures and brands
4. **State Management**: Singleton state managers for consistent data flow
5. **Event System**: React to changes in Pyret instances
6. **Backward Compatibility**: Works with existing CnD-Core applications
7. **Flexible Configuration**: Customizable mounting options for different use cases