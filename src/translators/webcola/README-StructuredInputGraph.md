# StructuredInputGraph Component

The `StructuredInputGraph` is a web component that inherits from `WebColaCnDGraph` and adds structured input capabilities for creating and managing graph data with CnD specifications.

## Features

- **Inherits from WebColaCnDGraph**: All existing functionality for graph visualization and edge creation
- **CnD Spec-driven Input**: Parses CnD specifications to extract available atom types
- **Structured Atom Creation**: Block-based interface for adding atoms with type selection
- **Auto-generated IDs**: Automatically generates unique atom IDs (e.g., "Person-1", "Person-2")
- **User-provided Labels**: Users enter descriptive labels for atoms
- **Type Hierarchy Support**: Automatically constructs type hierarchies from CnD specs
- **JSON Export**: Export complete data instances as IDataInstance JSON
- **Event System**: Comprehensive events for integration with other components

## Usage

### HTML

```html
<structured-input-graph 
    id="my-graph"
    cnd-spec="..."
    show-export="true"
    style="width: 100%; height: 600px;">
</structured-input-graph>
```

### JavaScript

```javascript
const graph = document.getElementById('my-graph');

// Set CnD specification
const cndSpec = `
nodes:
  - { id: "Person", type: "Person", color: "#FF6B35", size: 20 }
  - { id: "Entity", type: "Entity", color: "#4CAF50", size: 15 }
edges:
  - { id: "friend", type: "friend", color: "#E91E63", width: 3 }
constraints: []
directives:
  - type: "hideDisconnected"
    value: false
`;

graph.setCnDSpec(cndSpec);

// Set data instance
const dataInstance = new window.CndCore.JSONDataInstance({
    atoms: [],
    relations: [],
    types: []
});
graph.setDataInstance(dataInstance);

// Listen for events
graph.addEventListener('atom-added', (event) => {
    console.log('Atom added:', event.detail.atom);
});

graph.addEventListener('data-exported', (event) => {
    console.log('Data exported:', event.detail.data);
});
```

## Attributes

- `cnd-spec`: CnD specification string (YAML/JSON format)
- `data-instance`: Initial data instance (optional)
- `show-export`: Whether to show export functionality (default: true)

## Events

- `atom-added`: Fired when a new atom is added via structured input
  - `event.detail: { atom: IAtom }`
- `data-exported`: Fired when data is exported
  - `event.detail: { data: string, format: 'json' }`
- `spec-parsed`: Fired when CnD spec is successfully parsed
  - `event.detail: { spec: ParsedCnDSpec }`
- `edge-creation-requested`: Inherited from WebColaCnDGraph
- `edge-modification-requested`: Inherited from WebColaCnDGraph

## API Methods

### setCnDSpec(spec: string)
Set the CnD specification string. This will parse the spec and update the available atom types.

### setDataInstance(instance: IInputDataInstance)
Set the data instance for the graph. The component will listen for changes and update accordingly.

### getDataInstance(): IInputDataInstance | null
Get the current data instance.

### getParsedSpec(): ParsedCnDSpec | null
Get the parsed CnD specification with extracted type information.

## Demo

See `webcola-demo/structured-input-demo.html` for a complete working example with:
- Multiple CnD specifications to test with
- Atom creation with different types
- JSON export functionality
- Event handling examples

## CnD Spec Format

The component expects CnD specifications in YAML format with `nodes` and `edges` sections:

```yaml
nodes:
  - { id: "TypeName", type: "TypeName", color: "#FF6B35", size: 20 }
edges:
  - { id: "relationName", type: "relationName", color: "#E91E63", width: 3 }
constraints: []
directives:
  - type: "hideDisconnected"
    value: false
```

## Type Extraction

The component automatically extracts:
- **Atom types** from the `nodes` section `type` field
- **Relation types** from the `edges` section `type` field
- **Type hierarchies** (future enhancement)

## Integration

The component integrates seamlessly with:
- Existing WebColaCnDGraph functionality
- IInputDataInstance implementations (JSONDataInstance, AlloyDataInstance, etc.)
- React components via event handling
- CnD layout systems