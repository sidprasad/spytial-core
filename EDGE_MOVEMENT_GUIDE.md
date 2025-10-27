# Edge Movement Feature - Implementation Guide

## Overview
This document describes the implementation of the edge movement feature that allows users to move edges from one node to another using Shift+Click interaction in the webcola input component.

## User Interaction Flow

### Moving an Edge
1. **Activate Selection Mode**: Hold down the `Shift` key
   - Blue circles (edge markers) appear at edge endpoints
   - Markers are semi-transparent (opacity: 0.6) to indicate interactivity
   
2. **Select Edge Endpoint**: Click on a blue circle
   - Circle represents either the source (start arrow) or target (end arrow) of an edge
   - Visual feedback: Original edge becomes highlighted in red
   - A temporary dashed red line appears from the fixed endpoint
   
3. **Drag to New Node**: Move cursor to the desired target node
   - Temporary line follows the cursor
   - Shows preview of new connection
   
4. **Complete Movement**: Click on the new target node
   - If creating a self-loop, user is prompted for confirmation
   - Edge is updated in the data instance
   - Layout regenerates to show the new connection
   
5. **Cancel Movement** (optional): Release `Shift` key before clicking a node
   - Cancels the operation
   - Returns to normal state

## Technical Architecture

### State Management

#### Edge Movement State
```typescript
private edgeMovementState: {
  isMoving: boolean;              // Whether movement is in progress
  selectedEdge: EdgeWithMetadata | null;  // The edge being moved
  selectedMarker: 'source' | 'target' | null;  // Which end is being moved
  temporaryLine: any;             // Visual feedback line
  originalSourceNode: NodeWithMetadata | null;  // Original source
  originalTargetNode: NodeWithMetadata | null;  // Original target
}
```

#### Shift Key Tracking
```typescript
private isShiftKeyPressed: boolean = false;
```

### Key Components

#### 1. Edge Markers (`setupEdgeMarkers`)
- Creates clickable circles at edge endpoints
- Positioned during each layout tick
- Visibility controlled by Shift key state

```typescript
// Marker properties:
- radius: 8px
- fill: rgba(0, 123, 255, 0.3)
- stroke: #007bff (2px)
- opacity: 0 (default), 0.6 (when Shift pressed)
```

#### 2. Movement Handlers

**`startEdgeMovement(edgeData, marker)`**
- Stores edge and marker information
- Creates temporary visual feedback line
- Highlights the selected edge
- Adds mousemove listener for line tracking

**`finishEdgeMovement(newNode)`**
- Validates the move (checks for same node, self-loops)
- Updates edge in data instance via event
- Updates local edge indices
- Dispatches `edge-moved` event
- Cleans up and re-renders

**`cancelEdgeMovement()`**
- Removes temporary visuals
- Resets edge styling
- Clears state
- Removes event listeners

**`updateEdgeMarkerPositions()`**
- Called during each layout tick
- Positions markers at edge endpoints
- Updates visibility based on Shift key state

#### 3. Event System

**Events Dispatched:**

1. `edge-movement-requested` (from WebColaCnDGraph)
```typescript
{
  relationId: string,
  oldTuple: ITuple,
  newTuple: ITuple,
  oldSourceNodeId: string,
  oldTargetNodeId: string,
  newSourceNodeId: string,
  newTargetNodeId: string
}
```

2. `edge-moved` (from WebColaCnDGraph)
```typescript
{
  edge: EdgeWithMetadata,
  marker: 'source' | 'target',
  oldNode: NodeWithMetadata,
  newNode: NodeWithMetadata
}
```

### Data Instance Updates

The `StructuredInputGraph` handles the `edge-movement-requested` event:

```typescript
async handleEdgeMovementRequest(event: CustomEvent): Promise<void> {
  const { relationId, oldTuple, newTuple } = event.detail;
  
  // Atomic operation:
  this.dataInstance.removeRelationTuple(relationId, oldTuple);
  this.dataInstance.addRelationTuple(relationId, newTuple);
  
  // Regenerate layout with constraints
  await this.enforceConstraintsAndRegenerate();
  
  // Update UI
  this.updateDeletionSelects();
}
```

### Visual Feedback

#### During Movement:
- **Selected Edge**: Red (#ff6b6b), width 3px, opacity 0.5
- **Temporary Line**: Red (#ff6b6b), width 3px, dashed (8,4 pattern), opacity 0.7
- **Edge Markers**: Blue with opacity 0.6 (visible only when Shift is pressed)

#### After Movement:
- Edge returns to normal styling with new connection
- Layout animates to new positions
- All visual elements update to reflect the change

## Integration with Existing Features

### Compatibility
- **Edge Creation** (Cmd/Ctrl + Drag): Uses different modifier key, no conflicts
- **Edge Label Editing** (Cmd/Ctrl + Click on edge): Uses different modifier key
- **Node Dragging**: Disabled during edge movement
- **Zoom/Pan**: Available when not in movement mode

### Event Coordination
The mouseup handler on nodes checks for different states:
```typescript
.on('mouseup.inputmode', (d: any) => {
  if (this.isInputModeActive && this.edgeCreationState.isCreating) {
    // Handle edge creation
    this.finishEdgeCreation(d);
  } else if (this.edgeMovementState.isMoving) {
    // Handle edge movement
    this.finishEdgeMovement(d);
  }
})
```

## Testing Strategy

### Test Coverage
1. **Edge Target Movement**: Move target from one node to another
2. **Edge Source Movement**: Move source from one node to another
3. **Data Preservation**: Verify other tuples remain unchanged
4. **Atomic Updates**: Verify old tuple removed and new tuple added

### Test Approach
- Use mocked `WebColaCnDGraph` parent class
- Create sample data instances with multiple atoms and relations
- Dispatch `edge-movement-requested` events
- Verify data instance state after movement
- Check tuple additions and removals

## Performance Considerations

### Marker Updates
- Markers update position every tick (via `updatePositions()`)
- Uses D3 selection for efficient DOM updates
- Only visible when needed (Shift key pressed)

### Layout Regeneration
- Full constraint enforcement after each move
- Uses existing optimization in `enforceConstraintsAndRegenerate()`
- Layout animates smoothly to new positions

### Memory Management
- Temporary visuals cleaned up after each operation
- Event listeners removed when cancelled or completed
- No memory leaks from incomplete operations

## Browser Compatibility

### Keyboard Events
- Shift key detection uses standard `keydown`/`keyup` events
- Works in all modern browsers
- Window blur handler prevents stuck key state

### SVG Rendering
- Edge markers use standard SVG circles
- D3 handles cross-browser compatibility
- Tested with Chrome, Firefox, Safari

## Future Enhancements

Potential improvements for future versions:

1. **Multi-select**: Allow moving multiple edges simultaneously
2. **Undo/Redo**: Add operation history for edge movements
3. **Keyboard Shortcuts**: Alternative to Shift for accessibility
4. **Edge Reconnection**: Allow reconnecting both ends in one operation
5. **Visual Preview**: Show ghosted edge at target position before confirming
6. **Batch Operations**: Move all edges from one node to another at once

## Troubleshooting

### Markers Not Visible
- Ensure Shift key is being pressed
- Check that edges exist in the graph
- Verify non-alignment edges are present

### Movement Not Working
- Verify `edge-movement-requested` event is being dispatched
- Check that `handleEdgeMovementRequest` is registered
- Ensure data instance has `removeRelationTuple` and `addRelationTuple` methods

### Layout Not Updating
- Verify `enforceConstraintsAndRegenerate` is being called
- Check that layout instance exists
- Ensure CnD spec is properly initialized

## References

- Issue: "Structured Input Updates" - Edge movement requirement
- Related: Edge creation (Cmd/Ctrl + drag)
- Related: Edge label editing (Cmd/Ctrl + click)
- Demo: `/webcola-demo/edge-movement-demo.html`
