/**
 * Utility functions for creating telemetry events
 */

import { GraphRenderEvent, LayoutProcessEvent, InteractionEvent } from './interfaces';
import { InstanceLayout } from '../layout/interfaces';
import { WebColaLayout } from '../translators/webcola/webcolatranslator';

/**
 * Create a graph render telemetry event from WebCola layout data
 */
export function createGraphRenderEvent(
  webcolaLayout: WebColaLayout,
  options: {
    layoutType?: string;
    isErrorState?: boolean;
    renderDurationMs?: number;
    dimensions?: { width: number; height: number };
    metadata?: Record<string, any>;
  } = {}
): GraphRenderEvent {
  return {
    type: 'graph.render',
    timestamp: Date.now(),
    nodeCount: webcolaLayout.nodes?.length || 0,
    edgeCount: webcolaLayout.links?.length || 0,
    groupCount: webcolaLayout.groups?.length || 0,
    layoutType: options.layoutType || 'default',
    hasConstraints: (webcolaLayout.constraints?.length || 0) > 0,
    isErrorState: options.isErrorState || false,
    renderDurationMs: options.renderDurationMs,
    dimensions: options.dimensions || {
      width: webcolaLayout.FIG_WIDTH || 800,
      height: webcolaLayout.FIG_HEIGHT || 600
    },
    metadata: options.metadata
  };
}

/**
 * Create a graph render telemetry event from InstanceLayout data
 */
export function createGraphRenderEventFromInstanceLayout(
  instanceLayout: InstanceLayout,
  options: {
    layoutType?: string;
    isErrorState?: boolean;
    renderDurationMs?: number;
    dimensions?: { width: number; height: number };
    metadata?: Record<string, any>;
  } = {}
): GraphRenderEvent {
  return {
    type: 'graph.render',
    timestamp: Date.now(),
    nodeCount: instanceLayout.nodes?.length || 0,
    edgeCount: instanceLayout.edges?.length || 0,
    groupCount: instanceLayout.groups?.length || 0,
    layoutType: options.layoutType || 'default',
    hasConstraints: (instanceLayout.constraints?.length || 0) > 0,
    isErrorState: options.isErrorState || 
      (instanceLayout.conflictingNodes?.length || 0) > 0 ||
      (instanceLayout.overlappingNodes?.length || 0) > 0,
    renderDurationMs: options.renderDurationMs,
    dimensions: options.dimensions,
    metadata: options.metadata
  };
}

/**
 * Create a layout processing telemetry event
 */
export function createLayoutProcessEvent(
  sourceType: LayoutProcessEvent['sourceType'],
  options: {
    constraintCount?: number;
    processingDurationMs?: number;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  } = {}
): LayoutProcessEvent {
  return {
    type: 'layout.process',
    timestamp: Date.now(),
    sourceType,
    constraintCount: options.constraintCount || 0,
    processingDurationMs: options.processingDurationMs,
    success: options.success !== false, // Default to true unless explicitly false
    errorMessage: options.errorMessage
  };
}

/**
 * Create a user interaction telemetry event
 */
export function createInteractionEvent(
  action: InteractionEvent['action'],
  options: {
    targetId?: string;
    data?: Record<string, any>;
  } = {}
): InteractionEvent {
  return {
    type: 'user.interaction',
    timestamp: Date.now(),
    action,
    targetId: options.targetId,
    data: options.data
  };
}

/**
 * Performance measurement utility
 */
export class PerformanceTracker {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = performance.now();
  }

  /**
   * Finish tracking and return duration in milliseconds
   */
  finish(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Get current duration without finishing
   */
  getCurrentDuration(): number {
    return performance.now() - this.startTime;
  }
}

/**
 * Infer source type from data instance class name or type
 */
export function inferSourceType(dataInstance: any): LayoutProcessEvent['sourceType'] {
  if (!dataInstance) {
    return 'unknown';
  }

  const constructorName = dataInstance.constructor?.name?.toLowerCase() || '';
  
  if (constructorName.includes('alloy')) {
    return 'alloy';
  } else if (constructorName.includes('dot')) {
    return 'dot';
  } else if (constructorName.includes('pyret')) {
    return 'pyret';
  } else if (constructorName.includes('json')) {
    return 'json';
  } else if (constructorName.includes('racket')) {
    return 'racket';
  }
  
  return 'unknown';
}