# Telemetry System

The cnd-core library includes a comprehensive telemetry system for tracking graph rendering events, layout processing, and user interactions. This system helps developers understand usage patterns, performance characteristics, and debugging information.

## Features

- 🎯 **Graph Rendering Tracking** - Monitors every graph render with node/edge counts, performance metrics, and error states
- 📊 **Layout Processing Analytics** - Tracks layout generation duration, constraint counts, and success/failure rates  
- 🖱️ **User Interaction Events** - Captures edge creation, modifications, and other user actions
- 🔧 **Configurable Endpoints** - Send telemetry data to custom analytics services
- 🧪 **Debug Mode** - Real-time console logging for development
- 📱 **Real-time Demo** - Visual event display in demo applications

## Quick Start

### Basic Setup

```typescript
import { initializeTelemetry } from 'cnd-core';

// Initialize telemetry with basic configuration
initializeTelemetry({
  enabled: true,
  debug: true, // Enable console logging during development
  context: 'my-app',
  userId: 'user-123'
});
```

### Custom Endpoint Configuration

```typescript
import { initializeTelemetry } from 'cnd-core';

// Send telemetry data to your analytics service
initializeTelemetry({
  enabled: true,
  endpoint: 'https://analytics.example.com/events',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'X-App-Version': '1.0.0'
  },
  context: 'production-app',
  userId: getCurrentUserId()
});
```

### Manual Event Tracking

```typescript
import { track, createGraphRenderEvent, createInteractionEvent } from 'cnd-core';

// Track a custom graph render event
track(createGraphRenderEvent(webcolaLayout, {
  layoutType: 'custom',
  renderDurationMs: 250,
  isErrorState: false
}));

// Track user interactions
track(createInteractionEvent('edge.create', {
  targetId: 'node1->node2',
  data: { relationId: 'follows' }
}));
```

## Event Types

### Graph Render Events (`graph.render`)

Automatically tracked whenever a graph is rendered through the WebCola component.

**Properties:**
- `nodeCount` - Number of nodes in the graph
- `edgeCount` - Number of edges in the graph  
- `groupCount` - Number of groups/containers
- `layoutType` - Layout algorithm used ('default', 'grid', etc.)
- `hasConstraints` - Whether layout constraints were applied
- `isErrorState` - Whether this represents an error visualization
- `renderDurationMs` - Time taken to render (milliseconds)
- `dimensions` - Graph canvas dimensions

### Layout Process Events (`layout.process`)

Tracked during layout specification parsing and constraint processing.

**Properties:**
- `sourceType` - Input data source ('alloy', 'dot', 'pyret', 'json', 'racket')
- `constraintCount` - Number of layout constraints processed
- `processingDurationMs` - Processing time (milliseconds)
- `success` - Whether processing completed successfully
- `errorMessage` - Error details if processing failed

### User Interaction Events (`user.interaction`)

Captured during user interactions with the visualization.

**Actions:**
- `edge.create` - User created a new edge
- `edge.modify` - User modified an existing edge
- `node.drag` - User dragged a node
- `zoom` - User zoomed the visualization
- `pan` - User panned the visualization
- `clear` - User cleared the graph

## Configuration Options

```typescript
interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Optional endpoint URL for sending telemetry data */
  endpoint?: string;
  /** Custom headers for telemetry requests */
  headers?: Record<string, string>;
  /** Whether to log telemetry events to console (for debugging) */
  debug?: boolean;
  /** Custom user ID or session ID */
  userId?: string;
  /** Application or deployment context */
  context?: string;
}
```

## Advanced Usage

### Custom Event Handlers

```typescript
import { getTelemetryCollector } from 'cnd-core';

const collector = getTelemetryCollector();

// Add custom handler for processing events
collector.addHandler((event) => {
  if (event.type === 'graph.render' && event.nodeCount > 100) {
    console.warn('Large graph detected:', event);
    // Send alert to monitoring system
  }
});
```

### Performance Tracking

```typescript
import { PerformanceTracker, track, createLayoutProcessEvent } from 'cnd-core';

async function processComplexLayout() {
  const tracker = new PerformanceTracker('complex-layout');
  
  try {
    // ... complex layout processing ...
    
    const duration = tracker.finish();
    track(createLayoutProcessEvent('custom', {
      processingDurationMs: duration,
      success: true
    }));
  } catch (error) {
    const duration = tracker.finish();
    track(createLayoutProcessEvent('custom', {
      processingDurationMs: duration,
      success: false,
      errorMessage: error.message
    }));
  }
}
```

### Conditional Telemetry

```typescript
import { initializeTelemetry } from 'cnd-core';

// Only enable telemetry in production
initializeTelemetry({
  enabled: process.env.NODE_ENV === 'production',
  endpoint: process.env.ANALYTICS_ENDPOINT,
  context: process.env.APP_ENVIRONMENT,
  userId: getCurrentUserId()
});
```

## Demo Application

The webcola-demo includes a real-time telemetry display that shows events as they occur. Visit the demo to see telemetry in action:

1. Open `webcola-demo/webcola-demo.html`
2. The "📊 Telemetry Events" section shows real-time event tracking
3. Load a graph to see render events
4. Create edges to see interaction events
5. Use the "Clear Log" button to reset the display

## Privacy and Data Handling

- Telemetry is **disabled by default** - must be explicitly enabled
- No sensitive data is collected - only structural metrics and performance data
- All data includes only graph structure information (node/edge counts, timing)
- User interactions are anonymized (no personal identifiers)
- Custom endpoints allow full control over data routing and storage

## API Reference

See the [TypeScript interfaces](../src/telemetry/interfaces.ts) for complete API documentation.

### Core Functions

- `initializeTelemetry(config)` - Initialize global telemetry
- `getTelemetryCollector()` - Get the global collector instance
- `track(event)` - Track a telemetry event

### Event Creation Utilities

- `createGraphRenderEvent(layout, options)` - Create graph render event
- `createLayoutProcessEvent(sourceType, options)` - Create layout process event  
- `createInteractionEvent(action, options)` - Create user interaction event

### Performance Utilities

- `PerformanceTracker(operation)` - Track operation timing
- `inferSourceType(dataInstance)` - Infer data source type