import { DataInstanceEvent, DataInstanceEventType, DataInstanceEventListener } from './interfaces';

/**
 * Shared event plumbing for the mutable data instances (JSON, Alloy, Pyret,
 * DOT). Each adapter used to carry its own copy of this listener map and the
 * three methods around it; they all extend this class instead.
 *
 * `emitEvent` is protected: only the instance itself decides when a change
 * happened. A listener that throws is logged and skipped so one bad listener
 * cannot starve the others.
 */
export abstract class DataInstanceEventEmitter {
  private eventListeners = new Map<DataInstanceEventType, Set<DataInstanceEventListener>>();

  /**
   * Add an event listener for data instance changes
   */
  addEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  /**
   * Remove an event listener for data instance changes
   */
  removeEventListener(type: DataInstanceEventType, listener: DataInstanceEventListener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  /**
   * Emit an event to all registered listeners
   */
  protected emitEvent(event: DataInstanceEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in data instance event listener:', error);
        }
      }
    }
  }
}
