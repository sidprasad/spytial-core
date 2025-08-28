/**
 * Telemetry interfaces for tracking graph rendering events
 */

/**
 * Configuration for telemetry collection
 */
export interface TelemetryConfig {
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

/**
 * Base telemetry event interface
 */
export interface TelemetryEvent {
  /** Event type identifier */
  type: string;
  /** Timestamp when the event occurred */
  timestamp: number;
  /** User session identifier */
  sessionId?: string;
  /** User identifier */
  userId?: string;
  /** Application context */
  context?: string;
}

/**
 * Graph rendering telemetry event
 */
export interface GraphRenderEvent extends TelemetryEvent {
  type: 'graph.render';
  /** Number of nodes in the graph */
  nodeCount: number;
  /** Number of edges in the graph */
  edgeCount: number;
  /** Number of groups in the graph */
  groupCount?: number;
  /** Layout type used (e.g., 'default', 'grid') */
  layoutType?: string;
  /** Whether the layout has constraints */
  hasConstraints: boolean;
  /** Whether this is an error/unsat core visualization */
  isErrorState: boolean;
  /** Rendering duration in milliseconds */
  renderDurationMs?: number;
  /** Graph dimensions */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Layout processing telemetry event
 */
export interface LayoutProcessEvent extends TelemetryEvent {
  type: 'layout.process';
  /** Input data source type */
  sourceType: 'alloy' | 'dot' | 'pyret' | 'json' | 'racket' | 'unknown';
  /** Number of layout constraints */
  constraintCount: number;
  /** Processing duration in milliseconds */
  processingDurationMs?: number;
  /** Whether processing succeeded */
  success: boolean;
  /** Error message if processing failed */
  errorMessage?: string;
}

/**
 * User interaction telemetry event
 */
export interface InteractionEvent extends TelemetryEvent {
  type: 'user.interaction';
  /** Interaction type */
  action: 'edge.create' | 'edge.modify' | 'node.drag' | 'zoom' | 'pan' | 'clear';
  /** Target element ID if applicable */
  targetId?: string;
  /** Additional interaction data */
  data?: Record<string, any>;
}

/**
 * Union type for all telemetry events
 */
export type AnyTelemetryEvent = GraphRenderEvent | LayoutProcessEvent | InteractionEvent;

/**
 * Telemetry event handler function
 */
export type TelemetryEventHandler = (event: AnyTelemetryEvent) => void;

/**
 * Telemetry collector interface
 */
export interface ITelemetryCollector {
  /** Configure the telemetry collector */
  configure(config: TelemetryConfig): void;
  /** Track a telemetry event */
  track(event: AnyTelemetryEvent): void;
  /** Add an event handler */
  addHandler(handler: TelemetryEventHandler): void;
  /** Remove an event handler */
  removeHandler(handler: TelemetryEventHandler): void;
  /** Get current configuration */
  getConfig(): TelemetryConfig;
  /** Check if telemetry is enabled */
  isEnabled(): boolean;
}