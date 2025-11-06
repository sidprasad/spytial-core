# InstanceBuilder Component

The `InstanceBuilder` is a reusable, implementation-agnostic React component for constructing `IDataInstance` objects. It provides a user interface for adding and removing atoms (nodes) and relations (edges) from any implementation of `IInputDataInstance`.

## Key Features

- **Implementation Agnostic**: Works with any `IInputDataInstance` implementation (DotDataInstance, AlloyDataInstance, etc.)
- **No Internal State**: The component operates directly on the provided instance via props
- **Parent-Controlled**: The parent component manages the instance and receives change notifications
- **Input-Only**: Focuses solely on data input/editing, not visualization or layout
- **Accessible**: Includes proper ARIA labels and keyboard navigation support

## Usage

```tsx
import React, { useState } from 'react';
import { InstanceBuilder } from 'spytial-core';
import { DotDataInstance } from 'spytial-core/data-instance/dot';

const MyApp: React.FC = () => {
  const [instance, setInstance] = useState(
    () => new DotDataInstance('digraph G {}')
  );

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    console.log('Instance updated');
    // Instance is already modified in place, trigger re-render if needed
    setInstance(newInstance);
  };

  return (
    <InstanceBuilder
      instance={instance}
      onChange={handleInstanceChange}
      disabled={false}
      className="my-custom-style"
    />
  );
};
```

## Props

- `instance: IInputDataInstance` - **Required**. The data instance to edit
- `onChange?: (instance: IInputDataInstance) => void` - Callback when the instance changes
- `disabled?: boolean` - Whether the component is disabled (default: false)
- `className?: string` - CSS class name for styling

## Architecture

The InstanceBuilder follows these principles:

1. **Separation of Concerns**: Only handles input/editing, not layout or rendering
2. **Generic Interface**: Works with any `IInputDataInstance` implementation
3. **Direct Manipulation**: Operates directly on the provided instance
4. **Event-Driven**: Notifies parent components of changes via callbacks

## Supported Operations

- Add atoms with ID, label, and type
- Remove atoms (automatically removes related relations)
- Add relation tuples between existing atoms
- Remove specific relation tuples
- Clear all data from the instance

## Integration with Layout Engines

After using InstanceBuilder to construct your data instance, you can pass it to any layout engine:

```tsx
// Build the instance
<InstanceBuilder instance={myInstance} onChange={handleChange} />

// Use with layout engine
<LayoutEngine instance={myInstance} />
```

This design ensures clean separation between data construction and visualization.
