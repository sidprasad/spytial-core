# ProjectionControls Component

## Overview

The `ProjectionControls` component provides a user-friendly interface for selecting projection atoms in Forge/Alloy instances. It dynamically examines the projected types and creates dropdown selectors for each, allowing users to choose which specific atom to project on.

## Motivation

In Forge/Alloy contexts, projection is a common operation where certain types are "projected away" to simplify the visualization. However, users need a way to dynamically select WHICH specific atom of each projected type to use. The `ProjectionControls` component fills this gap by providing an interactive UI for this selection.

## Key Features

- **Dynamic Type Examination**: Automatically detects projected types from layout generation results
- **Interactive Dropdowns**: Creates a dropdown selector for each projected type
- **Event-Driven**: Triggers callbacks when selections change, enabling live layout updates
- **Accessible**: Full ARIA support with proper labels and keyboard navigation
- **Responsive**: Adapts to different screen sizes
- **Type-Safe**: Full TypeScript support with comprehensive type definitions

## Installation

The component is exported from the main `spytial-core` package:

```typescript
import { ProjectionControls } from 'spytial-core';
```

## Usage

### Basic Example

```typescript
import { ProjectionControls, LayoutInstance } from 'spytial-core';

// Generate layout with projections
const layoutResult = layoutInstance.generateLayout(dataInstance, projections);

// Render projection controls
<ProjectionControls
  projectionData={layoutResult.projectionData}
  onProjectionChange={(type, atomId) => {
    // Update projection for this type
    projections[type] = atomId;
    // Regenerate layout with new projections
    const newLayout = layoutInstance.generateLayout(dataInstance, projections);
  }}
/>
```

### Complete Integration Example

```typescript
import React, { useState } from 'react';
import { ProjectionControls, LayoutInstance, AlloyDataInstance } from 'spytial-core';

function MyVisualization() {
  const [projections, setProjections] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState(null);
  
  const layoutInstance = new LayoutInstance(layoutSpec, evaluator);
  
  // Generate initial layout
  React.useEffect(() => {
    const result = layoutInstance.generateLayout(dataInstance, projections);
    setLayout(result.layout);
  }, []);
  
  const handleProjectionChange = (type: string, atomId: string) => {
    // Update projections
    const newProjections = { ...projections, [type]: atomId };
    setProjections(newProjections);
    
    // Regenerate layout
    const result = layoutInstance.generateLayout(dataInstance, newProjections);
    setLayout(result.layout);
  };
  
  return (
    <div>
      <ProjectionControls
        projectionData={layout?.projectionData || []}
        onProjectionChange={handleProjectionChange}
      />
      {/* Your visualization component here */}
    </div>
  );
}
```

## API Reference

### ProjectionControlsProps

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `projectionData` | `ProjectionChoice[]` | Yes | Array of projection data from layout generation |
| `onProjectionChange` | `(type: string, atomId: string) => void` | Yes | Callback when a projection selection changes |
| `className` | `string` | No | Additional CSS class name |
| `disabled` | `boolean` | No | Whether the controls are disabled |

### ProjectionChoice

| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | The type (signature) being projected |
| `projectedAtom` | `string` | The currently selected atom to project on |
| `atoms` | `string[]` | All available atoms for this type |

## Styling

The component includes default styles that follow the design patterns used elsewhere in spytial-core. You can customize the appearance using CSS:

```css
/* Override component styles */
.projection-controls {
  background: #your-color;
}

.projection-controls__select {
  border-color: #your-color;
}
```

## Accessibility

The component is fully accessible with:
- Proper ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader friendly structure
- Semantic HTML elements

## Relationship to ProjectionSelector

**Important**: The `ProjectionControls` component is different from the existing `ProjectionSelector`:

- **`ProjectionSelector`**: Used in the No Code View to specify WHICH types should be projected (adds projection directives to the spec)
- **`ProjectionControls`**: Used to select WHICH specific atom to project for each already-projected type (runtime selection)

These components serve complementary purposes in the projection workflow.

## Demo

See the interactive demo at `webcola-demo/projection-controls-demo-vanilla.html` for a working example.

## Testing

The component includes a comprehensive test suite covering:
- Component rendering with projection data
- User interaction handling
- Callback invocation with correct parameters
- Edge cases (no data, empty atoms, disabled state)

Run tests with:
```bash
npm test -- projection-controls.test.tsx
```

## Implementation Notes

### Design Decisions

1. **Separate Component**: Created as a standalone component rather than modifying existing components to maintain separation of concerns
2. **Data-Driven**: Component receives projection data and doesn't need direct access to data instances
3. **Forge/Alloy Specific**: Intentionally designed for Forge/Alloy contexts where projections are common
4. **No Core Changes**: Adds UI only - no changes to core layout logic

### Browser Compatibility

The component works in all modern browsers that support:
- ES2020+ JavaScript features
- React 19+
- CSS Grid and Flexbox

## Future Enhancements

Possible future improvements:
- Add search/filter functionality for large atom lists
- Support for multi-select projections
- Visual indicators for which atoms are currently in use
- Preset/saved projection configurations
- Integration with layout history/undo

## License

MIT License - same as spytial-core
