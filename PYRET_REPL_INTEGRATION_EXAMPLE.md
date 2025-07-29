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
    <!-- Include Pyret's runtime for external evaluator -->
    <script src="path/to/pyret-runtime.js"></script>
</head>
<body>
    <div id="repl-with-viz" style="width: 100%; height: 800px;"></div>
    
    <script src="path/to/react-component-integration.global.js"></script>
    
    <script>
        // Mount combined REPL and visualization (basic data instance)
        CnDCore.mountReplWithVisualization('repl-with-viz', {
            showLayoutInterface: true,
            replHeight: '400px',
            visualizationHeight: '400px'
        });
    </script>
</body>
</html>
```

### 4. Complete Integration: Pyret REPL + External Evaluator + Visualization

This is the most powerful setup, combining all features:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Complete Pyret Integration with External Evaluator</title>
    <!-- Include Pyret's runtime first -->
    <script src="path/to/pyret-runtime.js"></script>
</head>
<body>
    <!-- Container for Pyret REPL with external evaluator -->
    <div id="enhanced-pyret-repl" style="height: 400px; margin-bottom: 20px;"></div>
    
    <!-- Container for layout specification -->
    <div id="layout-interface" style="height: 300px; margin-bottom: 20px;"></div>
    
    <!-- Container for the visualization -->
    <div id="visualization-container" style="height: 600px;"></div>
    
    <script src="path/to/react-component-integration.global.js"></script>
    
    <script>
        // Wait for Pyret runtime to be ready
        function initializeCompleteIntegration() {
            if (window.__internalRepl) {
                // 1. Mount enhanced Pyret REPL with external evaluator
                CnDCore.mountPyretRepl('enhanced-pyret-repl', {
                    externalEvaluator: window.__internalRepl,
                    className: 'enhanced-pyret-repl'
                });
                
                // 2. Mount CnD layout interface
                CnDCore.mountCndLayoutInterface('layout-interface');
                
                // 3. Set up event listeners to sync Pyret instance with visualization
                window.addEventListener('pyret-instance-changed', (event) => {
                    const pyretInstance = event.detail.instance;
                    console.log('Pyret instance changed:', pyretInstance);
                    
                    // Convert PyretDataInstance to regular data instance for visualization
                    // This bridges the Pyret REPL with the general visualization system
                    const atoms = pyretInstance.getAtoms();
                    const relations = pyretInstance.getRelations();
                    
                    // Update visualization system
                    if (window.updateVisualizationFromPyret) {
                        window.updateVisualizationFromPyret(atoms, relations);
                    }
                    
                    // Log reified code for debugging
                    const pyretCode = pyretInstance.reify();
                    console.log('Current data as Pyret code:', pyretCode);
                });
                
                console.log('✅ Complete Pyret integration initialized!');
            } else {
                console.warn('⚠️ Pyret runtime not ready, falling back to basic integration');
                // Fallback to basic REPL without external evaluator
                CnDCore.mountPyretRepl('enhanced-pyret-repl');
                CnDCore.mountCndLayoutInterface('layout-interface');
            }
        }
        
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', () => {
            // Give time for Pyret runtime to initialize
            setTimeout(initializeCompleteIntegration, 1000);
        });
    </script>
</body>
</html>
```

## Advanced Usage

### Complete Integration: All Features Together

For production use, you typically want the complete setup with external evaluator support, layout interface, and visualization:

```javascript
// Complete initialization function that coordinates all components
function initializeCompleteSystem() {
    // 1. Check for external evaluator
    const hasExternalEvaluator = !!(window.__internalRepl || window.pyretREPLInternal);
    
    if (hasExternalEvaluator) {
        // 2. Mount enhanced Pyret REPL with full language support
        CnDCore.mountPyretRepl('pyret-repl-container', {
            externalEvaluator: window.__internalRepl || window.pyretREPLInternal,
            className: 'production-pyret-repl'
        });
        
        // 3. Mount layout interface for CnD constraints
        CnDCore.mountCndLayoutInterface('layout-container', {
            initialIsNoCodeView: true  // Start with visual interface
        });
        
        // 4. Set up real-time synchronization
        setupRealtimeSynchronization();
        
        console.log('✅ Complete Pyret system initialized with external evaluator');
    } else {
        // Fallback: Use combined component without external evaluator
        CnDCore.mountReplWithVisualization('fallback-container', {
            showLayoutInterface: true,
            replHeight: '350px',
            visualizationHeight: '450px'
        });
        
        console.log('⚠️ Fallback mode: Basic REPL + visualization (no external evaluator)');
    }
}

function setupRealtimeSynchronization() {
    // Sync Pyret instance changes with visualization
    window.addEventListener('pyret-instance-changed', (event) => {
        const { instance } = event.detail;
        
        // Update visualization system (your webcola-cnd-graph element)
        const graphElement = document.querySelector('webcola-cnd-graph');
        if (graphElement && instance) {
            // Convert Pyret instance to layout format and update visualization
            updateVisualizationFromPyretInstance(instance);
        }
        
        // Log current state for debugging
        console.log('Data updated:', {
            atoms: instance.getAtoms().length,
            relations: instance.getRelations().length,
            pyretCode: instance.reify()
        });
    });
    
    // Sync layout changes back to visualization
    window.addEventListener('cnd-spec-changed', (event) => {
        console.log('Layout specification changed, applying constraints...');
        // Your layout application logic here
        if (window.applyLayoutConstraints) {
            window.applyLayoutConstraints(event.detail);
        }
    });
}
```

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