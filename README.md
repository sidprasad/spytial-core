# spytial-core

A tree-shakable TypeScript implementation of `spytial`, usable for language integration.
- **Client-side only**: No Node.js dependencies and tree-shakable.
- **Custom Elements** for easy embedding in web apps


---

## Installation

```bash
npm install spytial-core
```

- [View on npm](https://www.npmjs.com/package/spytial-core)

---

## CDN

You can use the browser bundle directly from a CDN:

- **jsDelivr:**  
  [`https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js`](https://cdn.jsdelivr.net/npm/spytial-core/dist/browser/spytial-core-complete.global.js)
- **unpkg:**  
  [`https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js`](https://unpkg.com/spytial-core/dist/browser/spytial-core-complete.global.js)

---

## Key APIs

### AlloyInputGraph

A custom element for creating and editing Alloy instances with type-aware validation. Designed for Forge/Alloy workflows where input controls need to be mounted separately from the graph visualization.

#### Features
- **Mountable Controls**: Input controls can be placed anywhere (React drawer, sidebar, modal)
- **Type Validation**: Validates atom types against the Alloy type hierarchy
- **Arity Validation**: Ensures relation tuples have the correct number of atoms
- **Validation at Reify**: Errors are caught when converting to Forge INST syntax

#### Basic Usage

```html
<!-- In your HTML -->
<alloy-input-graph id="my-graph" width="800" height="600"></alloy-input-graph>
<div id="controls-drawer"></div>
```

```javascript
// Initialize with a data instance
const graph = document.querySelector('#my-graph');
const dataInstance = CndCore.createEmptyAlloyDataInstance();
graph.setDataInstance(dataInstance);

// Get the API for external controls
const api = graph.getInputControlsAPI();

// Mount controls panel in a drawer/sidebar
const panel = new CndCore.AlloyInputControlsPanel(api);
document.getElementById('controls-drawer').appendChild(panel.getElement());
```

#### Programmatic API

```javascript
const api = graph.getInputControlsAPI();

// Add atoms with type validation
await api.addAtom('Person', 'Alice');
await api.addAtom('Person', 'Bob');

// Add relation tuples (validates arity and types)
await api.addRelationTuple('friend', ['Person0', 'Person1']);

// Validate the instance
const validation = api.validateInstance();
if (!validation.valid) {
  console.log('Errors:', validation.errors);
}

// Reify to Forge INST syntax (validates first)
const result = api.reifyInstance();
if (result.success) {
  console.log(result.result); // Forge INST syntax string
} else {
  console.log('Validation errors:', result.errors);
}

// Export as JSON
const json = api.exportJSON();

// Subscribe to changes
const unsubscribe = api.onInstanceChange(() => {
  console.log('Instance changed!');
});
```

#### AlloyInputControlsAPI Interface

| Method | Description |
|--------|-------------|
| `getAvailableTypes()` | Get types from the schema |
| `getAvailableRelations()` | Get relations from the schema |
| `getCurrentAtoms()` | Get current atoms in the instance |
| `addAtom(type, label)` | Add an atom with type validation |
| `addRelationTuple(relationId, atomIds)` | Add a tuple with arity/type validation |
| `removeAtom(atomId)` | Remove an atom |
| `removeRelationTuple(relationId, atomIds)` | Remove a tuple |
| `validateInstance()` | Validate against schema, returns `AlloyValidationResult` |
| `reifyInstance()` | Convert to Forge INST (validates first) |
| `exportJSON()` | Export instance as JSON |
| `onInstanceChange(callback)` | Subscribe to changes, returns unsubscribe function |

#### Validation Error Types

- `type-mismatch`: Atom type doesn't match expected relation type
- `arity-mismatch`: Tuple has wrong number of atoms for relation
- `unknown-relation`: Relation not found in schema
- `unknown-type`: Atom type not found in schema
- `duplicate-atom`: Atom ID already exists

#### Events

The `<alloy-input-graph>` element fires these events:

- `atom-added`: `{ atom: IAtom }`
- `atom-removed`: `{ atomId: string }`
- `relation-added`: `{ relationId: string, tuple: ITuple }`
- `relation-removed`: `{ relationId: string, tuple: ITuple }`
- `validation-error`: `{ errors: AlloyValidationError[] }`
- `instance-validated`: `{ result: AlloyValidationResult }`

---

## Demos

See the `webcola-demo/` directory for working examples:

- `webcola-demo.html` - Main WebCola visualization demo
- `alloy-input-demo.html` - AlloyInputGraph with mountable controls
- `webcola-integrated-demo.html` - Integrated React components
- `webcola-tla-demo.html` - TLA+ visualization demo

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---
