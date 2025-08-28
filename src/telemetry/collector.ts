/**
 * Default telemetry collector implementation
 */

import { ITelemetryCollector, TelemetryConfig, AnyTelemetryEvent, TelemetryEventHandler } from './interfaces';

/**
 * Default telemetry collector that handles event collection, storage, and optional HTTP transmission
 */
export class TelemetryCollector implements ITelemetryCollector {
  private config: TelemetryConfig;
  private handlers: Set<TelemetryEventHandler>;
  private sessionId: string;

  constructor(initialConfig?: Partial<TelemetryConfig>) {
    this.config = {
      enabled: false,
      debug: false,
      ...initialConfig
    };
    this.handlers = new Set();
    this.sessionId = this.generateSessionId();
  }

  /**
   * Configure the telemetry collector
   */
  configure(config: TelemetryConfig): void {
    this.config = { ...config };
  }

  /**
   * Track a telemetry event
   */
  track(event: AnyTelemetryEvent): void {
    if (!this.config.enabled) {
      return;
    }

    // Enhance event with session and user data
    const enhancedEvent: AnyTelemetryEvent = {
      ...event,
      sessionId: event.sessionId || this.sessionId,
      userId: event.userId || this.config.userId,
      context: event.context || this.config.context,
      timestamp: event.timestamp || Date.now()
    };

    // Log to console if debug mode is enabled
    if (this.config.debug) {
      console.log('📊 Telemetry Event:', enhancedEvent);
    }

    // Call all registered handlers
    this.handlers.forEach(handler => {
      try {
        handler(enhancedEvent);
      } catch (error) {
        console.error('Error in telemetry handler:', error);
      }
    });

    // Send to endpoint if configured
    if (this.config.endpoint) {
      this.sendToEndpoint(enhancedEvent);
    }
  }

  /**
   * Add an event handler
   */
  addHandler(handler: TelemetryEventHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Remove an event handler
   */
  removeHandler(handler: TelemetryEventHandler): void {
    this.handlers.delete(handler);
  }

  /**
   * Get current configuration
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send telemetry event to configured endpoint
   */
  private async sendToEndpoint(event: AnyTelemetryEvent): Promise<void> {
    if (!this.config.endpoint) {
      return;
    }

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        console.error('Failed to send telemetry event:', response.status, response.statusText);
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Error sending telemetry event to endpoint:', error);
      }
    }
  }
}

// Global instance for easy access
let globalTelemetryCollector: TelemetryCollector | null = null;

/**
 * Get the global telemetry collector instance
 */
export function getTelemetryCollector(): TelemetryCollector {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = new TelemetryCollector();
  }
  return globalTelemetryCollector;
}

/**
 * Initialize telemetry with configuration
 */
export function initializeTelemetry(config: TelemetryConfig): TelemetryCollector {
  const collector = getTelemetryCollector();
  collector.configure(config);
  return collector;
}

/**
 * Track a telemetry event using the global collector
 */
export function track(event: AnyTelemetryEvent): void {
  getTelemetryCollector().track(event);
}