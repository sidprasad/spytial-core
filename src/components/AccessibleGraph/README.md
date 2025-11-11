# Accessible Graph Component

## Overview

The AccessibleGraph component provides enhanced accessibility features for the WebCola graph visualization, making it usable by visually-impaired users through screen readers, keyboard navigation, and alternative text descriptions.

## Features

### 🔊 Screen Reader Support
- Full ARIA labels and descriptions for all graph elements
- Live region announcements for real-time updates
- Semantic HTML structure with proper roles
- Alternative text descriptions of graph structure

### ⌨️ Keyboard Navigation
- **Tab**: Focus on the graph
- **Arrow Keys (↑↓←→)**: Navigate between nodes
- **Enter / Space**: Hear detailed information about focused node
- **Escape**: Exit navigation mode

### 📊 Alternative Text Descriptions
Three levels of verbosity:
- **Brief**: Quick overview of node and edge counts
- **Detailed**: Includes relationship types and grouping information
- **Full**: Complete listing of nodes and edges with all details

## Usage

### Basic React Component

```tsx
import { AccessibleGraph } from 'spytial-core/components/AccessibleGraph';

function MyComponent() {
  const handleLayoutReady = (layout) => {
    console.log('Layout ready:', layout);
  };

  return (
    <AccessibleGraph
      width={800}
      height={600}
      layoutFormat="default"
      ariaLabel="Network visualization of social connections"
      ariaDescription="This graph shows relationships between users in a social network"
      onLayoutReady={handleLayoutReady}
    />
  );
}
```

### Using the Custom Element Directly

```html
<webcola-cnd-graph 
  id="my-graph"
  width="800" 
  height="600"
  layoutFormat="default"
  aria-label="Interactive graph visualization"
  role="application">
</webcola-cnd-graph>

<script>
  const graphElement = document.getElementById('my-graph');
  
  // Get accessible description
  const description = graphElement.getAccessibleGraphDescription('detailed');
  console.log(description);
  
  // Get node information
  const nodes = graphElement.getAccessibleNodeDescriptions();
  console.log(`Graph has ${nodes.length} nodes`);
  
  // Get edge information
  const edges = graphElement.getAccessibleEdgeDescriptions();
  console.log(`Graph has ${edges.length} edges`);
</script>
```

## API Reference

### AccessibleGraph Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | `800` | Width of the graph visualization |
| `height` | `number` | `600` | Height of the graph visualization |
| `layoutFormat` | `'default' \| 'grid'` | `'default'` | Layout algorithm to use |
| `onLayoutReady` | `(layout: InstanceLayout) => void` | - | Callback when layout is rendered |
| `className` | `string` | `''` | Additional CSS classes |
| `ariaLabel` | `string` | `'Interactive graph visualization'` | Accessible label |
| `ariaDescription` | `string` | - | Detailed description for screen readers |
| `id` | `string` | `'accessible-graph'` | Element ID |

### WebColaCnDGraph Accessibility Methods

#### `getAccessibleGraphDescription(verbosity)`
Generates a text description of the graph structure.

```typescript
const description = graphElement.getAccessibleGraphDescription('detailed');
// Returns: "This is an interactive graph visualization. The graph contains 5 nodes..."
```

**Parameters:**
- `verbosity`: `'brief' | 'detailed' | 'full'` - Level of detail in the description

**Returns:** `string` - Accessible text description

#### `getAccessibleNodeDescriptions()`
Gets information about all nodes in the graph.

```typescript
const nodes = graphElement.getAccessibleNodeDescriptions();
// Returns: [{
//   id: 'node1',
//   label: 'Node A',
//   type: 'Person',
//   position: { x: 100, y: 200 },
//   connections: { incoming: 2, outgoing: 3 }
// }, ...]
```

**Returns:** Array of node descriptions with:
- `id`: Unique node identifier
- `label`: Human-readable label
- `type`: Node type
- `position`: x, y coordinates
- `connections`: Incoming and outgoing edge counts

#### `getAccessibleEdgeDescriptions()`
Gets information about all edges in the graph.

```typescript
const edges = graphElement.getAccessibleEdgeDescriptions();
// Returns: [{
//   id: 'edge1',
//   source: 'Node A',
//   target: 'Node B',
//   label: 'knows',
//   type: 'standard'
// }, ...]
```

**Returns:** Array of edge descriptions with:
- `id`: Unique edge identifier
- `source`: Source node label
- `target`: Target node label
- `label`: Edge label/relation name
- `type`: `'standard' | 'inferred' | 'bidirectional'`

## Best Practices

### For Developers

1. **Always provide meaningful labels**: Use the `ariaLabel` and `ariaDescription` props to give context about what the graph represents.

2. **Announce important changes**: When the graph updates, use the built-in live region or create custom announcements:
   ```typescript
   function announceToScreenReader(message: string) {
     const liveRegion = document.getElementById('aria-live');
     if (liveRegion) {
       liveRegion.textContent = message;
     }
   }
   ```

3. **Support keyboard-only users**: Ensure all interactive features can be accessed via keyboard.

4. **Provide alternative views**: Offer tabular or list views of the data for users who may struggle with spatial visualizations.

### For Users

#### Screen Reader Users
- Press Tab to focus on the graph
- The screen reader will announce the graph structure
- Use arrow keys to explore nodes
- Press Enter on a node to hear detailed information

#### Keyboard-Only Users
- All navigation can be performed without a mouse
- Tab through controls, use arrow keys within the graph
- Press Escape to exit graph navigation mode

## Accessibility Standards Compliance

This component follows:
- **WCAG 2.1 Level AA** guidelines
- **ARIA 1.2** best practices for data visualizations
- **Section 508** compliance requirements
- Best practices from the [Data Navigator project](https://github.com/cmudig/data-navigator)

## Examples

See the [accessible-graph-demo.html](../webcola-demo/accessible-graph-demo.html) file for a complete working example with all features demonstrated.

## Integration with Data Navigator

This component is designed to be compatible with the [Data Navigator](https://github.com/cmudig/data-navigator) library, which provides additional accessibility enhancements for data visualizations. Data Navigator can be layered atop the SVG output for enhanced sonification and haptic feedback capabilities.

### Future Integration Points
- Sonification of spatial relationships
- Haptic feedback for node connections
- Multi-modal output (visual + audio + haptic)
- Screen reader-optimized graph traversal algorithms

## References

- [Data Navigator](https://github.com/cmudig/data-navigator) - Accessibility toolkit for data visualizations
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Best Practices](https://www.w3.org/WAI/ARIA/apg/)
- Research on spatial awareness in visually-impaired users

## Contributing

When adding new features, please ensure:
1. Screen reader announcements are added for all state changes
2. Keyboard shortcuts are documented
3. Alternative text descriptions are provided
4. ARIA labels are meaningful and contextual

## License

MIT - Same as the parent spytial-core project
