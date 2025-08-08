# Python REPL Integration Example

This document demonstrates how to use the new Python REPL integration added to the cnd-core library.

## Basic Usage

### 1. Simple Python REPL

```html
<!DOCTYPE html>
<html>
<head>
    <title>Python REPL Demo</title>
</head>
<body>
    <!-- Container for the Python REPL -->
    <div id="python-repl-container"></div>
    
    <!-- Load the CnD-Core library -->
    <script src="path/to/cnd-core.global.js"></script>
    
    <script>
        // Mount a basic Python REPL
        CnDCore.mountPythonRepl('python-repl-container');
    </script>
</body>
</html>
```

### 2. Python REPL with External Evaluator (Enhanced Features)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Enhanced Python REPL Demo</title>
    <!-- Include Pyodide for Python runtime -->
    <script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
</head>
<body>
    <div id="enhanced-python-repl"></div>
    
    <script src="path/to/cnd-core.global.js"></script>
    
    <script>
        async function initializePyodide() {
            // Initialize Pyodide
            const pyodide = await loadPyodide();
            
            // Create evaluator wrapper
            const pythonEvaluator = {
                runPython: async (code) => {
                    return pyodide.runPython(code);
                },
                isReady: () => true,
                globals: pyodide.globals
            };
            
            // Mount Python REPL with external evaluator for full Python support
            CnDCore.mountPythonRepl('enhanced-python-repl', {
                externalEvaluator: pythonEvaluator,
                className: 'my-custom-repl'
            });
        }
        
        // Initialize when page loads
        initializePyodide();
    </script>
</body>
</html>
```

### 3. Combined REPL + Visualization

```html
<!DOCTYPE html>
<html>
<head>
    <title>Python REPL with Visualization</title>
    <!-- Include Pyodide for Python runtime -->
    <script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
</head>
<body>
    <div id="repl-with-viz" style="width: 100%; height: 800px;"></div>
    
    <script src="path/to/cnd-core.global.js"></script>
    
    <script>
        // Mount combined REPL and visualization (basic data instance)
        CnDCore.mountReplWithVisualization('repl-with-viz', {
            showLayoutInterface: true,
            replHeight: '400px',
            visualizationHeight: '400px',
            replType: 'python'  // Use Python instead of default
        });
    </script>
</body>
</html>
```

### 4. Complete Integration: Python REPL + External Evaluator + Visualization

This is the most powerful setup, combining all features:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Complete Python Integration with External Evaluator</title>
    <!-- Include Pyodide runtime first -->
    <script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
</head>
<body>
    <!-- Container for Python REPL with external evaluator -->
    <div id="enhanced-python-repl" style="height: 400px; margin-bottom: 20px;"></div>
    
    <!-- Container for layout specification -->
    <div id="layout-interface" style="height: 300px; margin-bottom: 20px;"></div>
    
    <!-- Container for the visualization -->
    <div id="visualization-container" style="height: 600px;"></div>
    
    <script src="path/to/cnd-core.global.js"></script>
    
    <script>
        // Initialize complete Python integration
        async function initializeCompleteIntegration() {
            try {
                // 1. Initialize Pyodide
                const pyodide = await loadPyodide();
                
                // 2. Create evaluator wrapper
                const pythonEvaluator = {
                    runPython: async (code) => {
                        return pyodide.runPython(code);
                    },
                    isReady: () => true,
                    globals: pyodide.globals
                };
                
                // 3. Mount enhanced Python REPL with external evaluator
                CnDCore.mountPythonRepl('enhanced-python-repl', {
                    externalEvaluator: pythonEvaluator,
                    className: 'enhanced-python-repl'
                });
                
                // 4. Mount CnD layout interface
                CnDCore.mountCndLayoutInterface('layout-interface');
                
                // 5. Set up event listeners to sync Python instance with visualization
                window.addEventListener('python-instance-changed', (event) => {
                    const pythonInstance = event.detail.instance;
                    console.log('Python instance changed:', pythonInstance);
                    
                    // Convert PythonDataInstance to general data instance for visualization
                    const atoms = pythonInstance.getAtoms();
                    const relations = pythonInstance.getRelations();
                    
                    // Update visualization system
                    if (window.updateVisualizationFromPython) {
                        window.updateVisualizationFromPython(atoms, relations);
                    }
                    
                    // Log reified code for debugging
                    const pythonCode = pythonInstance.reify();
                    console.log('Current data as Python code:', pythonCode);
                });
                
                console.log('✅ Complete Python integration initialized!');
                
            } catch (error) {
                console.error('⚠️ Failed to initialize Python integration:', error);
                // Fallback to basic REPL without external evaluator
                CnDCore.mountPythonRepl('enhanced-python-repl');
                CnDCore.mountCndLayoutInterface('layout-interface');
            }
        }
        
        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', () => {
            initializeCompleteIntegration();
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
async function initializeCompleteSystem() {
    try {
        // 1. Initialize Pyodide
        const pyodide = await loadPyodide();
        
        // 2. Create evaluator wrapper
        const pythonEvaluator = {
            runPython: async (code) => pyodide.runPython(code),
            isReady: () => true,
            globals: pyodide.globals
        };
        
        // 3. Mount enhanced Python REPL with full language support
        CnDCore.mountPythonRepl('python-repl-container', {
            externalEvaluator: pythonEvaluator,
            className: 'production-python-repl'
        });
        
        // 4. Mount layout interface for CnD constraints
        CnDCore.mountCndLayoutInterface('layout-container', {
            initialIsNoCodeView: true  // Start with visual interface
        });
        
        // 5. Set up real-time synchronization
        setupRealtimeSynchronization();
        
        console.log('✅ Complete Python system initialized with external evaluator');
        
    } catch (error) {
        console.error('Failed to initialize Pyodide:', error);
        
        // Fallback: Use combined component without external evaluator
        CnDCore.mountReplWithVisualization('fallback-container', {
            showLayoutInterface: true,
            replHeight: '350px',
            visualizationHeight: '450px',
            replType: 'python'
        });
        
        console.log('⚠️ Fallback mode: Basic Python REPL + visualization (no external evaluator)');
    }
}

function setupRealtimeSynchronization() {
    // Sync Python instance changes with visualization
    window.addEventListener('python-instance-changed', (event) => {
        const { instance } = event.detail;
        
        // Update visualization system (your webcola-cnd-graph element)
        const graphElement = document.querySelector('webcola-cnd-graph');
        if (graphElement && instance) {
            // Convert Python instance to layout format and update visualization
            updateVisualizationFromPythonInstance(instance);
        }
        
        // Log current state for debugging
        console.log('Data updated:', {
            atoms: instance.getAtoms().length,
            relations: instance.getRelations().length,
            pythonCode: instance.reify()
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
// Get current Python instance
const currentInstance = CnDCore.DataAPI.getCurrentPythonInstance();

// Update instance programmatically
const newInstance = new CnDCore.PythonDataInstance(myPythonData);
CnDCore.DataAPI.updatePythonInstance(newInstance);

// Get Python constructor notation (reify)
const pythonCode = CnDCore.DataAPI.reifyCurrentPythonInstance();
console.log('Current data as Python code:', pythonCode);

// Set external evaluator at runtime
CnDCore.DataAPI.setExternalPythonEvaluator(pythonEvaluator);
```

### Event Handling

```javascript
// Listen for Python instance changes
window.addEventListener('python-instance-changed', (event) => {
    const { instance } = event.detail;
    console.log('Python instance updated:', instance);
    
    // Automatically generate reified code
    const pythonCode = instance.reify();
    console.log('Updated Python code:', pythonCode);
});

// Listen for REPL+visualization changes
window.addEventListener('repl-visualization-changed', (event) => {
    const { instance } = event.detail;
    console.log('Visualization data updated:', instance);
});
```

## Typical Python REPL Commands

With the integration, users can enter Python-style commands:

```python
# Basic variable assignments
x = 1
alice = "Alice"
my_list = [1, 2, 3]

# Object creation (requires external evaluator for full Python support)
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age

alice = Person("Alice", 25)
bob = Person("Bob", 30)

# Relationships using dot notation
alice.friend = bob
bob.age = 25

# Python expressions (requires external evaluator)
numbers = list(range(10))
data = {"users": [alice, bob]}

# Utility commands
help        # Show help
info        # Show current instance status
reify       # Generate Python constructor notation
clear       # Clear the instance
```

## Integration with Existing Python Applications

```javascript
// For existing applications with Pyodide or other Python runtimes
async function integrateWithPythonApp() {
    // Use existing Python runtime
    if (window.pyodide) {
        const pythonEvaluator = {
            runPython: async (code) => window.pyodide.runPython(code),
            isReady: () => true,
            globals: window.pyodide.globals
        };
        
        // Mount enhanced REPL
        CnDCore.mountPythonRepl('data-explorer', {
            externalEvaluator: pythonEvaluator
        });
        
        // Set up bidirectional data flow
        window.addEventListener('python-instance-changed', (event) => {
            const instance = event.detail.instance;
            // Sync with your Python application state
            updateMyPythonApp(instance);
        });
    } else {
        // Fallback to basic REPL without external evaluator
        CnDCore.mountPythonRepl('data-explorer');
    }
}

// Call when page loads
document.addEventListener('DOMContentLoaded', integrateWithPythonApp);
```

## Web-Native Python Evaluators

The Python REPL integration is designed to work with various web-native Python evaluators:

### 1. Pyodide (Recommended)

```javascript
// Pyodide provides full Python standard library support
const pyodide = await loadPyodide();
const evaluator = {
    runPython: async (code) => pyodide.runPython(code),
    isReady: () => true,
    globals: pyodide.globals
};
```

### 2. Brython

```javascript
// Brython provides Python-to-JavaScript compilation
// Setup would depend on Brython's API
const evaluator = {
    runPython: async (code) => {
        // Brython evaluation logic
        return brythonEvaluate(code);
    }
};
```

### 3. Skulpt

```javascript
// Skulpt is another Python-to-JavaScript implementation
const evaluator = {
    runPython: async (code) => {
        return new Promise((resolve, reject) => {
            Sk.misceval.asyncToPromise(() => {
                return Sk.importMainWithBody("<stdin>", false, code, true);
            }).then(resolve).catch(reject);
        });
    }
};
```

## Benefits

1. **Familiar Syntax**: Uses standard Python syntax for variable assignments and expressions
2. **External Evaluator Support**: Full Python language support when evaluator is available
3. **Reify Functionality**: Generate Python constructor notation for examining data structures
4. **State Management**: Singleton state managers for consistent data flow
5. **Event System**: React to changes in Python instances
6. **Backward Compatibility**: Works with existing CnD-Core applications
7. **Flexible Configuration**: Customizable mounting options for different use cases
8. **Web-Native**: Works entirely in the browser without server-side Python dependencies

## Comparison with Pyret Implementation

| Feature | Pyret Implementation | Python Implementation |
|---------|---------------------|----------------------|
| External Evaluator | window.__internalRepl | Pyodide, Brython, etc. |
| Variable Assignment | x = 1 | x = 1 |
| Object Construction | TreeNode(value, left, right) | TreeNode(value=1, left=None) |
| Type System | Brands-based | __class__.__name__ |
| Reification | Pyret constructor syntax | Python constructor syntax |
| Built-in Types | Number, String, Boolean | int, float, str, bool |