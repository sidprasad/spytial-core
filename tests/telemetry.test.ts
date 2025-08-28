/**
 * Tests for telemetry system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  TelemetryCollector, 
  initializeTelemetry, 
  track, 
  createGraphRenderEvent,
  createLayoutProcessEvent,
  createInteractionEvent,
  PerformanceTracker
} from '../src/telemetry';

describe('Telemetry System', () => {
  let collector: TelemetryCollector;
  let mockHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    collector = new TelemetryCollector();
    mockHandler = vi.fn();
  });

  describe('TelemetryCollector', () => {
    it('should be disabled by default', () => {
      expect(collector.isEnabled()).toBe(false);
    });

    it('should enable when configured', () => {
      collector.configure({ enabled: true });
      expect(collector.isEnabled()).toBe(true);
    });

    it('should not track events when disabled', () => {
      collector.addHandler(mockHandler);
      
      track({
        type: 'graph.render',
        timestamp: Date.now(),
        nodeCount: 5,
        edgeCount: 3,
        hasConstraints: false,
        isErrorState: false
      });

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should track events when enabled', () => {
      collector.configure({ enabled: true });
      collector.addHandler(mockHandler);
      
      const event = {
        type: 'graph.render' as const,
        timestamp: Date.now(),
        nodeCount: 5,
        edgeCount: 3,
        hasConstraints: false,
        isErrorState: false
      };

      collector.track(event);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...event,
          sessionId: expect.any(String)
        })
      );
    });

    it('should add session ID and user context to events', () => {
      collector.configure({ 
        enabled: true, 
        userId: 'test-user',
        context: 'test-app'
      });
      collector.addHandler(mockHandler);
      
      const event = {
        type: 'graph.render' as const,
        timestamp: Date.now(),
        nodeCount: 5,
        edgeCount: 3,
        hasConstraints: false,
        isErrorState: false
      };

      collector.track(event);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...event,
          userId: 'test-user',
          context: 'test-app',
          sessionId: expect.any(String)
        })
      );
    });
  });

  describe('Event Creation Utilities', () => {
    it('should create graph render events', () => {
      const mockWebColaLayout = {
        nodes: [{ id: '1' }, { id: '2' }],
        links: [{ id: 'edge1' }],
        groups: [],
        constraints: [{ type: 'separation' }],
        FIG_WIDTH: 800,
        FIG_HEIGHT: 600
      };

      const event = createGraphRenderEvent(mockWebColaLayout as any, {
        layoutType: 'default',
        renderDurationMs: 250
      });

      expect(event).toEqual({
        type: 'graph.render',
        timestamp: expect.any(Number),
        nodeCount: 2,
        edgeCount: 1,
        groupCount: 0,
        layoutType: 'default',
        hasConstraints: true,
        isErrorState: false,
        renderDurationMs: 250,
        dimensions: { width: 800, height: 600 },
        metadata: undefined
      });
    });

    it('should create layout process events', () => {
      const event = createLayoutProcessEvent('alloy', {
        constraintCount: 3,
        processingDurationMs: 150,
        success: true
      });

      expect(event).toEqual({
        type: 'layout.process',
        timestamp: expect.any(Number),
        sourceType: 'alloy',
        constraintCount: 3,
        processingDurationMs: 150,
        success: true,
        errorMessage: undefined
      });
    });

    it('should create interaction events', () => {
      const event = createInteractionEvent('edge.create', {
        targetId: 'node1',
        data: { relationId: 'knows' }
      });

      expect(event).toEqual({
        type: 'user.interaction',
        timestamp: expect.any(Number),
        action: 'edge.create',
        targetId: 'node1',
        data: { relationId: 'knows' }
      });
    });
  });

  describe('PerformanceTracker', () => {
    it('should track elapsed time', () => {
      const tracker = new PerformanceTracker('test-operation');
      
      // Wait a small amount
      const startTime = performance.now();
      const elapsed = tracker.finish();
      const endTime = performance.now();

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(endTime - startTime + 10); // Allow for small timing variance
    });

    it('should provide current duration without finishing', () => {
      const tracker = new PerformanceTracker('test-operation');
      
      const current = tracker.getCurrentDuration();
      expect(current).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Global Functions', () => {
    it('should initialize global telemetry', () => {
      const globalCollector = initializeTelemetry({
        enabled: true,
        debug: true
      });

      expect(globalCollector.isEnabled()).toBe(true);
      expect(globalCollector.getConfig().debug).toBe(true);
    });
  });
});