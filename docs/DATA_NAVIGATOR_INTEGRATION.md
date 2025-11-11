# Data Navigator Integration Guide

## Overview

This document provides guidance on integrating spytial-core's accessible graph visualizations with [Data Navigator](https://github.com/cmudig/data-navigator), a toolkit developed at CMU for creating accessible data visualizations.

## What is Data Navigator?

Data Navigator is a research project and toolkit that enables non-visual access to data visualizations through:
- **Sonification**: Converting visual patterns into audio
- **Haptic Feedback**: Providing tactile responses for data exploration
- **Alternative Navigation**: Keyboard and voice-based exploration of data
- **Multi-modal Output**: Combining visual, audio, and haptic channels

## Why Integrate with Data Navigator?

Visually-impaired users benefit from multiple modalities for understanding spatial structures:

1. **Spatial Awareness**: Research shows that even congenitally blind individuals develop robust spatial awareness
2. **Multi-modal Understanding**: Combining audio, haptic, and text descriptions provides richer understanding
3. **Declarative Specifications**: SpyTial's constraint-based approach naturally maps to alternative representations
4. **Best Practices**: Data Navigator encodes years of accessibility research

## Integration Architecture

### Current Implementation

The current spytial-core accessibility implementation provides:

```
┌─────────────────────────────────────────────────┐
│         AccessibleGraph Component               │
│  - ARIA labels and live regions                │
│  - Keyboard navigation                          │
│  - Screen reader support                        │
│  - Alternative text descriptions                │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│       webcola-cnd-graph Custom Element          │
│  - SVG-based visualization                      │
│  - Accessibility API methods                    │
│  - Spatial layout information                   │
└─────────────────────────────────────────────────┘
```

### With Data Navigator Integration

```
┌─────────────────────────────────────────────────┐
│         AccessibleGraph Component               │
│  - ARIA labels and live regions                │
│  - Keyboard navigation                          │
│  - Screen reader support                        │
│  - Alternative text descriptions                │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│         Data Navigator Layer                    │
│  - Sonification of spatial relationships        │
│  - Haptic feedback on exploration               │
│  - Audio-guided navigation                      │
│  - Voice command support                        │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│       webcola-cnd-graph Custom Element          │
│  - SVG-based visualization                      │
│  - Accessibility API methods                    │
│  - Spatial layout information                   │
└─────────────────────────────────────────────────┘
```

## Integration Points

### 1. SVG Layer Access

Data Navigator can be overlaid on the SVG output from webcola-cnd-graph:

```typescript
import { AccessibleGraph } from 'spytial-core';
// Hypothetical Data Navigator import (adjust based on actual API)
import { DataNavigator } from 'data-navigator';

function MyAccessibleGraph() {
  const graphRef = useRef(null);
  
  useEffect(() => {
    if (graphRef.current) {
      // Get the SVG element from the custom element
      const svgElement = graphRef.current
        .shadowRoot
        .querySelector('svg');
      
      // Initialize Data Navigator on top of the SVG
      const navigator = new DataNavigator(svgElement, {
        // Configuration options
        sonification: true,
        haptics: true,
        voiceCommands: true
      });
    }
  }, []);
  
  return <AccessibleGraph ref={graphRef} />;
}
```

### 2. Spatial Data Export

Use the accessibility API to provide structured data to Data Navigator:

```typescript
const graphElement = document.getElementById('accessible-graph');

// Get node descriptions with positions
const nodes = graphElement.getAccessibleNodeDescriptions();
// [{
//   id: 'node1',
//   label: 'Node A',
//   type: 'Person',
//   position: { x: 100, y: 200 },
//   connections: { incoming: 2, outgoing: 3 }
// }, ...]

// Get edge descriptions with relationships
const edges = graphElement.getAccessibleEdgeDescriptions();
// [{
//   id: 'edge1',
//   source: 'Node A',
//   target: 'Node B',
//   label: 'knows',
//   type: 'standard'
// }, ...]

// Convert to Data Navigator format
const dataNavigatorGraph = {
  nodes: nodes.map(n => ({
    id: n.id,
    label: n.label,
    x: n.position.x,
    y: n.position.y,
    // Add sonification parameters
    frequency: mapToFrequency(n.connections.outgoing),
    duration: mapToDuration(n.connections.incoming)
  })),
  edges: edges.map(e => ({
    source: e.source,
    target: e.target,
    label: e.label
  }))
};
```

### 3. Event Coordination

Synchronize navigation events between AccessibleGraph and Data Navigator:

```typescript
// Listen for AccessibleGraph navigation events
graphElement.addEventListener('node-focused', (event) => {
  const nodeId = event.detail.nodeId;
  
  // Play corresponding sound in Data Navigator
  dataNavigator.playNodeSound(nodeId);
  
  // Provide haptic feedback
  dataNavigator.triggerHaptic('node-focus');
});

// Listen for Data Navigator events
dataNavigator.on('node-selected', (nodeId) => {
  // Update visual focus in graph
  graphElement.focusNode(nodeId);
  
  // Announce to screen reader
  const node = nodes.find(n => n.id === nodeId);
  announceToScreenReader(`Selected ${node.label}`);
});
```

## Sonification Strategies

### Spatial Position to Audio Mapping

Convert node positions to audio characteristics:

```typescript
function sonifyNodePosition(node) {
  return {
    // X-axis → Stereo panning (-1 left, +1 right)
    pan: (node.position.x / graphWidth) * 2 - 1,
    
    // Y-axis → Pitch (higher = higher pitch)
    frequency: mapRange(
      node.position.y,
      0, graphHeight,
      220, 880  // A3 to A5
    ),
    
    // Connections → Volume
    volume: Math.min(
      (node.connections.incoming + node.connections.outgoing) / 10,
      1.0
    )
  };
}
```

### Relationship Sonification

Convert graph relationships to audio sequences:

```typescript
function sonifyRelationship(edge) {
  const sourceNode = getNodeById(edge.source);
  const targetNode = getNodeById(edge.target);
  
  // Play source node sound
  playSound(sonifyNodePosition(sourceNode), 200);
  
  // Play connecting tone
  playConnectingTone(edge.type, 100);
  
  // Play target node sound
  playSound(sonifyNodePosition(targetNode), 200);
}
```

## Haptic Feedback Patterns

### Node Interaction

```typescript
const hapticPatterns = {
  'node-focus': {
    duration: 50,
    intensity: 0.5
  },
  'node-select': {
    duration: 100,
    intensity: 0.8
  },
  'edge-traversal': {
    duration: 150,
    intensity: 0.6,
    pattern: 'pulse'
  },
  'group-enter': {
    duration: 200,
    intensity: 0.7,
    pattern: 'ramp-up'
  }
};
```

## Voice Navigation

### Command Structure

Potential voice commands for graph navigation:

```typescript
const voiceCommands = {
  // Navigation
  'go to [node name]': (nodeName) => focusNode(nodeName),
  'next node': () => navigateToNextNode(),
  'previous node': () => navigateToPreviousNode(),
  
  // Exploration
  'describe current node': () => announceNodeDetails(),
  'list connections': () => announceNodeConnections(),
  'what group am I in': () => announceCurrentGroup(),
  
  // Global
  'overview': () => announceGraphOverview(),
  'how many nodes': () => announceNodeCount(),
  'list all nodes': () => announceAllNodeLabels()
};
```

## Research Integration: Umwelt

[Umwelt](https://github.com/jonathanzong/umwelt) by Jonathan Zong is another toolkit for accessible visualizations that could complement this work.

### Umwelt Features

Umwelt provides:
- Screen reader optimized data tables
- Keyboard navigation patterns
- Best practices for ARIA labeling
- Alternative text generation algorithms

### Integration Strategy

Umwelt could be used for:
1. **Tabular Views**: Provide table-based alternative to graph
2. **Navigation Patterns**: Adopt proven keyboard shortcuts
3. **Description Generation**: Use Umwelt's algorithms for text descriptions

Example:

```typescript
import { generateAccessibleTable } from 'umwelt';

// Generate table view of graph data
const tableView = generateAccessibleTable({
  data: nodes.map(n => ({
    'Node': n.label,
    'Type': n.type,
    'Incoming': n.connections.incoming,
    'Outgoing': n.connections.outgoing
  })),
  caption: 'Graph nodes with connection counts'
});

// Provide as alternative view
document.getElementById('table-view').innerHTML = tableView;
```

## Implementation Roadmap

### Phase 1: Basic Integration (Current)
- ✅ ARIA labels and descriptions
- ✅ Keyboard navigation
- ✅ Screen reader announcements
- ✅ Alternative text descriptions

### Phase 2: Sonification
- [ ] Install and configure Data Navigator
- [ ] Map spatial positions to audio parameters
- [ ] Implement navigation sounds
- [ ] Add relationship sonification

### Phase 3: Haptic Feedback
- [ ] Detect haptic capability
- [ ] Implement haptic patterns
- [ ] Coordinate with visual/audio feedback

### Phase 4: Voice Commands
- [ ] Integrate speech recognition
- [ ] Implement command vocabulary
- [ ] Add natural language queries

### Phase 5: Multi-modal Integration
- [ ] Synchronize all modalities
- [ ] User customization options
- [ ] Preference learning

## User Testing

### Testing Protocol

1. **Screen Reader Users**
   - Test with JAWS, NVDA, VoiceOver
   - Validate text descriptions
   - Assess navigation efficiency

2. **Keyboard-Only Users**
   - Verify all features accessible via keyboard
   - Test shortcut conflicts
   - Measure task completion time

3. **Low Vision Users**
   - Test with zoom/magnification
   - Validate high contrast modes
   - Check focus indicators

4. **Blind Users**
   - Test sonification clarity
   - Assess haptic feedback usefulness
   - Validate spatial understanding

## Resources

- [Data Navigator GitHub](https://github.com/cmudig/data-navigator)
- [Umwelt Toolkit](https://github.com/jonathanzong/umwelt)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Research on Spatial Cognition in Blind Individuals](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3693516/)

## Contributing

To contribute to accessibility features:

1. Follow WCAG 2.1 Level AA guidelines
2. Test with actual assistive technologies
3. Document all keyboard shortcuts
4. Provide alternative text for all visual content
5. Consider cognitive accessibility (simple language, clear structure)

## License

Same as spytial-core (MIT)
