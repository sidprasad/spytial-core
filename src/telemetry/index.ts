/**
 * Telemetry module for tracking graph rendering and user interaction events
 * 
 * @example
 * ```typescript
 * import { initializeTelemetry, track, createGraphRenderEvent } from 'cnd-core/telemetry';
 * 
 * // Initialize telemetry
 * initializeTelemetry({
 *   enabled: true,
 *   debug: true,
 *   endpoint: 'https://analytics.example.com/events',
 *   userId: 'user123'
 * });
 * 
 * // Track a graph render event
 * track(createGraphRenderEvent(webcolaLayout, {
 *   layoutType: 'default',
 *   renderDurationMs: 250
 * }));
 * ```
 */

// Export interfaces
export type {
  TelemetryConfig,
  TelemetryEvent,
  GraphRenderEvent,
  LayoutProcessEvent,
  InteractionEvent,
  AnyTelemetryEvent,
  TelemetryEventHandler,
  ITelemetryCollector
} from './interfaces';

// Export collector implementation
export {
  TelemetryCollector,
  getTelemetryCollector,
  initializeTelemetry,
  track
} from './collector';

// Export utility functions
export {
  createGraphRenderEvent,
  createGraphRenderEventFromInstanceLayout,
  createLayoutProcessEvent,
  createInteractionEvent,
  PerformanceTracker,
  inferSourceType
} from './utils';