# Cope and Drag v4.0 Release Notes

This major update of Cope and Drag modularizes the data flow pipeline to make Cope and Drag compatible to any data input. Examples of integrations with Alloy, Racket, DOT can be found in `/demo`.

This major update introduces several new components including:

- [Instance builder](#instance-builder) – an independent component where users can handcraft their own input data instance
- IDataInstance – an interface for defining data instances; unique to each input programming language
- [NoCodeView](#nocodeview) – a standalone React component where users can configure Cope and Drag specifications without writing YAML by hand
- [ErrorMessageModal](#errormessagemodal) – a standalone React component that displays error messages and manages error states

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

- `yamlValue?: string` – YAML string of CnD layout spec
- `constraints: ConstraintData[]` – List of CnD constraints
- `setConstraints: (updater: (prev: ConstraintData[]) => ConstraintData[]) => void` – Callback to set constraints
- `directives: DirectiveData[]` – List of CnD directives
- `setDirectives: (updater: (prev: DirectiveData[]) => DirectiveData[]) => void` – Callback to set directives

## ErrorMessageModal

The ErrorMessageModal is a React component for displaying structured error messages in Cope and Drag applications. It provides a unified interface for showing constraint conflicts, parse errors, and group overlap errors with detailed context and interactive highlighting.

### Supported Error Types

- Constraint Conflicts – Shows positional constraint conflicts with source constraint mapping
- Parse Errors – Displays YAML/specification parsing errors with source context
- Group Overlap Errors – Reports when layout groups have overlapping nodes
- General Errors – Handles other system errors with customizable messaging

### Usage

```tsx
import React, { useState } from 'react';
import { ErrorMessageModal, ErrorStateManager } from 'cnd-core';

const MyApp: React.FC = () => {
  const [errorManager] = useState(() => new ErrorStateManager());

  // Handle constraint conflicts
  const handleConstraintError = (errorMessages: ErrorMessages) => {
    errorManager.setError({
      type: 'positional-error',
      messages: errorMessages
    });
  };

  // Handle parse errors
  const handleParseError = (message: string, source: string) => {
    errorManager.setError({
      type: 'parse-error',
      message,
      source
    });
  };

  return (
    <ErrorMessageContainer 
      errorManager={errorManager}
      className="my-error-styles"
    />
  );
};
```

### Props

- `errorManager: ErorStateManager` - **Required**. Manages error state and notifications
- `className?: string` - CSS class name for styling
- `messages?: ErrorMessages` - Constraint conflict details for positional errors
- `systemError?: SystemError` - Parse, group overlap, or general error information

### Integration with Custom Error Handlers

The ErrorMessageModal uses a pluggable architecture allowing developers to create custom error display components:
```tsx
// Replace the default modal with your custom component
const CustomErrorHandler: React.FC<{ errorManager: ErrorStateManager }> = ({ errorManager }) => {
  const [error, setError] = useState(errorManager.getCurrentError());
  
  useEffect(() => {
    errorManager.onErrorChange(setError);
  }, [errorManager]);

  return error ? <MyCustomErrorDisplay error={error} /> : null;
};
```

---

*Some additional sections to consider adding...*

## Testing

# Migration Guide

## Breaking Changes

## API changes and deprecations