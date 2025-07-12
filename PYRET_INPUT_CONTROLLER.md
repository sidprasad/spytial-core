# PyretInputController Component

The `PyretInputController` is a specialized React component for constructing Pyret data instances with a programming-language-friendly interface. It provides an improved UX over the generic `InstanceBuilder` for working specifically with Pyret programming language constructs.

## Key Features

### Programming-Language Optimized Interface
- **Constructor Dropdowns**: Select from predefined Pyret data types (List, Tree, RBTree, Option)
- **Automatic ID Generation**: IDs are generated automatically with compact display options
- **PyretExpression Support**: Free-form expression input to avoid structured editor pitfalls
- **Real-time Code Generation**: Live preview of generated Pyret code

### Improved UX vs InstanceBuilder
- **Less Click-Heavy**: Dropdown selection instead of manual typing
- **Context-Aware**: Shows only relevant constructors for selected data types
- **Compact Display**: Technical details (IDs) hidden by default
- **Escape Hatches**: Free-form expressions when structured editing becomes limiting

## Usage

### Basic Usage

```tsx
import { PyretInputController } from 'cnd-core';

function MyApp() {
  const handleDataChange = (instance) => {
    console.log('Generated Pyret code:', instance.reify());
  };

  return (
    <PyretInputController 
      onChange={handleDataChange}
    />
  );
}
```

### Advanced Configuration

```tsx
import { PyretInputController } from 'cnd-core';

const config = {
  compactDisplay: true,           // Hide technical details by default
  allowExpressions: true,         // Enable free-form expressions
  autoGenerateIds: true,          // Auto-generate IDs
  showBuiltinTypes: true,         // Show built-in Pyret types
  customTypes: [                  // Add custom data types
    {
      name: 'MyDataType',
      constructors: ['Variant1', 'Variant2'],
      fields: {
        'Variant1': ['field1'],
        'Variant2': ['field1', 'field2']
      }
    }
  ]
};

<PyretInputController 
  config={config}
  onChange={handleDataChange}
  disabled={false}
  className="my-custom-style"
/>
```

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `instance` | `IInputDataInstance` | - | Optional existing data instance to edit |
| `onChange` | `(instance: IInputDataInstance) => void` | - | Callback when the instance changes |
| `config` | `PyretInputControllerConfig` | `{}` | Configuration options |
| `disabled` | `boolean` | `false` | Whether the component is disabled |
| `className` | `string` | `''` | CSS class name for styling |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showBuiltinTypes` | `boolean` | `true` | Show built-in Pyret data types |
| `allowExpressions` | `boolean` | `true` | Allow free-form PyretExpression input |
| `autoGenerateIds` | `boolean` | `true` | Automatically generate IDs |
| `compactDisplay` | `boolean` | `true` | Hide technical details by default |
| `customTypes` | `PyretDataType[]` | `[]` | Custom data types to include |

## Built-in Data Types

The component comes with common Pyret data types:

### List
- `empty` - Empty list
- `link(first, rest)` - List with head and tail

### Tree
- `Leaf(value)` - Tree leaf node
- `Node(value, left, right)` - Tree internal node

### RBTree (Red-Black Tree)
- `Leaf(value)` - RB tree leaf
- `Red(value, left, right)` - Red internal node
- `Black(value, left, right)` - Black internal node

### Option
- `none` - No value
- `some(value)` - Contains a value

## Value Types

The component supports different types of Pyret values:

### PyretConstructor
Structured data with named fields:
```typescript
{
  id: 'node-1',
  name: 'Node',
  type: 'constructor',
  fields: [
    { name: 'value', value: { ... } },
    { name: 'left', value: { ... } },
    { name: 'right', value: { ... } }
  ]
}
```

### PyretPrimitive
Basic values (numbers, strings, booleans):
```typescript
{
  id: 'num-1',
  value: 42,
  type: 'primitive',
  dataType: 'Number'
}
```

### PyretExpression
Free-form Pyret code:
```typescript
{
  id: 'expr-1',
  expression: 'map(fun(x): x + 1 end, [list: 1, 2, 3])',
  type: 'expression'
}
```

### PyretReference
Reference to another value:
```typescript
{
  id: 'ref-1',
  targetId: 'node-1',
  type: 'reference',
  targetName: 'Node'
}
```

## Example: Building a Binary Tree

Here's how to create `Node(5, Leaf(3), Leaf(7))`:

1. **Add first leaf**: Select "Leaf" constructor, set value to 3
2. **Add second leaf**: Select "Leaf" constructor, set value to 7  
3. **Add root node**: Select "Node" constructor
   - Set value to 5
   - Set left to reference first leaf
   - Set right to reference second leaf
4. **Set root**: Click the star (☆) button on the Node to make it the root
5. **View code**: The generated Pyret code appears in the preview panel

## Integration with PyretDataInstance

The component works seamlessly with the existing `PyretDataInstance`:

```tsx
import { PyretInputController, PyretDataInstance } from 'cnd-core';

function MyApp() {
  const [instance, setInstance] = useState(
    () => new PyretDataInstance({ dict: {}, brands: {} })
  );

  return (
    <PyretInputController 
      instance={instance}
      onChange={setInstance}
    />
  );
}
```

## Avoiding HCI Pitfalls

The component addresses common structured editor problems:

1. **Rigid Structure**: PyretExpression provides escape hatch for free-form input
2. **Overwhelming UI**: Compact display mode hides complexity by default
3. **Unfamiliar Interactions**: Uses standard dropdown and form patterns
4. **Limited Extensibility**: Custom types can be added via configuration
5. **No Preview**: Real-time code generation shows immediate results

## Future Enhancement Ideas

- **CodeMirror Integration**: Embed structured editing in code editor
- **Visual Tree Builder**: Drag-and-drop interface for complex structures  
- **Import from Code**: Parse existing Pyret code into structured form
- **Advanced Validation**: Type checking and constraint validation
- **Template System**: Pre-built templates for common patterns