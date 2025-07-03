# Cope and Drag v4.0 Release Notes

This major update of Cope and Drag modularizes the data flow pipeline to make Cope and Drag compatible to any data input. Examples of integrations with Alloy, Racket, DOT can be found in `/demo`.

This major update introduces several new components including:

- [Instance builder](#instance-builder) – an independent component where users can handcraft their own input data instance
- IDataInstance – an interface for defining data instances; unique to each input programming language
- [NoCodeView](#nocodeview) – a standalone React component where users can configure Cope and Drag specifications without writing YAML by hand

## Instance Builder

The `InstanceBuilder` is a reusable, implementation-agnostic React component for constructing `IDataInstance` objects. It provides a user interface for adding and removing atoms (nodes) and relations (edges) from any implementation of `IInputDataInstance`.

### Supported Operations

- Add atoms with ID, label, and type
- Remove atoms (automatically removes related relations)
- Add relation tuples between existing atoms
- Remove specific relation tuples
- Clear all data from the instance

### Usage

```tsx
import React, { useState } from 'react';
import { InstanceBuilder } from 'cnd-core';
import { DotDataInstance } from 'cnd-core/data-instance/dot';

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

### Props

- `instance: IInputDataInstance` - **Required**. The data instance to edit
- `onChange?: (instance: IInputDataInstance) => void` - Callback when the instance changes
- `disabled?: boolean` - Whether the component is disabled (default: false)
- `className?: string` - CSS class name for styling

### Integration with Layout Engines

After using InstanceBuilder to construct your data instance, you can pass it to any layout engine:

```tsx
// Build the instance
<InstanceBuilder instance={myInstance} onChange={handleChange} />

// Use with layout engine
<LayoutEngine instance={myInstance} />
```

This design ensures clean separation between data construction and visualization.

## NoCodeView

This standalone React component refactors the "No Code View" from Cope and Drag v3. Depending on your use case, developers may access this component in our component library and use it (or not use it) in your use case.

### Usage

```tsx
import { NoCodeView } from './NoCodeView/NoCodeView';

const CndLayoutInterface: React.FC = {

    return <NoCodeView 
        yamlValue={yamlValue} 
        constraints={constraints} 
        setConstraints={setConstraints} 
        directives={directives} 
        setDirectives={setDirectives} 
    />;
}
```

### Props

- `yamlValue?: string` (optional) – YAML string of CnD layout spec
- `constraints: ConstraintData[]` – List of CnD constraints
- `setConstraints: (updater: (prev: ConstraintData[]) => ConstraintData[]) => void` – Callback to set constraints
- `directives: DirectiveData[]` – List of CnD directives
- `setDirectives: (updater: (prev: DirectiveData[]) => DirectiveData[]) => void` – Callback to set directives
