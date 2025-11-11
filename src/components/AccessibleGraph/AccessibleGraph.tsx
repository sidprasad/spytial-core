/// <reference path="./custom-elements.d.ts" />
import React, { useEffect, useRef, useState } from 'react';
import type { InstanceLayout } from '../../layout/interfaces';
import type { ParsedCnDSpec } from '../../layout/layoutspec';
import { generateNavigatorSchema, type NavigatorSchema } from './data-navigator-schema';

/**
 * AccessibleGraph Component
 * 
 * An accessible wrapper around the webcola-cnd-graph custom element that provides
 * enhanced accessibility features for visually-impaired users.
 * 
 * Features:
 * - ARIA labels and descriptions for screen readers
 * - Keyboard navigation following CnD constraint relationships
 * - Live region announcements for graph changes
 * - Alternative text descriptions of spatial relationships
 * - Data Navigator schema generation from CnD spec
 * 
 * The navigation follows the declarative spatial relationships defined in the CnD spec,
 * not just geometric positions. For example, if the CnD spec says "A is left of B",
 * then pressing right arrow on A will navigate to B.
 * 
 * @example
 * ```tsx
 * <AccessibleGraph
 *   width={800}
 *   height={600}
 *   layoutFormat="default"
 *   cndSpec={parsedCnDSpec}
 *   onLayoutReady={(layout) => console.log('Layout ready')}
 * />
 * ```
 */
export interface AccessibleGraphProps {
  /** Width of the graph visualization */
  width?: number;
  /** Height of the graph visualization */
  height?: number;
  /** Layout format: 'default' or 'grid' */
  layoutFormat?: 'default' | 'grid';
  /** Parsed CnD specification for constraint-based navigation */
  cndSpec?: ParsedCnDSpec;
  /** Callback when layout is ready */
  onLayoutReady?: (layout: InstanceLayout, schema?: NavigatorSchema) => void;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for the graph */
  ariaLabel?: string;
  /** Detailed description of the graph for screen readers */
  ariaDescription?: string;
  /** ID for the graph element */
  id?: string;
  /** Enable Data Navigator integration */
  enableDataNavigator?: boolean;
}

/**
 * Hook to manage constraint-based keyboard navigation within the graph
 * Navigation follows the CnD spec relationships, not just geometric positions
 */
function useGraphKeyboardNavigation(
  graphRef: React.RefObject<any>,
  currentLayout: InstanceLayout | null,
  navigatorSchema: NavigatorSchema | null
) {
  const [focusedNodeId, setFocusedNodeId] = useState<string>('');
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (!graphRef.current || !currentLayout || !navigatorSchema) return;

    // Initialize with start node from schema
    if (!focusedNodeId && navigatorSchema.startNode) {
      setFocusedNodeId(navigatorSchema.startNode);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle navigation when the graph is focused
      if (!isNavigating) return;

      const currentNode = navigatorSchema.nodes.get(focusedNodeId);
      if (!currentNode) return;

      let nextNodeId: string | null = null;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          // Follow "right" connections from navigator schema
          if (currentNode.right && currentNode.right.length > 0) {
            nextNodeId = currentNode.right[0];
            announceToScreenReader(`Moving right to ${navigatorSchema.nodes.get(nextNodeId)?.label || nextNodeId}`);
          } else {
            announceToScreenReader('No nodes to the right');
          }
          break;
          
        case 'ArrowLeft':
          event.preventDefault();
          // Follow "left" connections from navigator schema
          if (currentNode.left && currentNode.left.length > 0) {
            nextNodeId = currentNode.left[0];
            announceToScreenReader(`Moving left to ${navigatorSchema.nodes.get(nextNodeId)?.label || nextNodeId}`);
          } else {
            announceToScreenReader('No nodes to the left');
          }
          break;
          
        case 'ArrowDown':
          event.preventDefault();
          // Follow "down" connections from navigator schema
          if (currentNode.down && currentNode.down.length > 0) {
            nextNodeId = currentNode.down[0];
            announceToScreenReader(`Moving down to ${navigatorSchema.nodes.get(nextNodeId)?.label || nextNodeId}`);
          } else {
            announceToScreenReader('No nodes below');
          }
          break;
          
        case 'ArrowUp':
          event.preventDefault();
          // Follow "up" connections from navigator schema
          if (currentNode.up && currentNode.up.length > 0) {
            nextNodeId = currentNode.up[0];
            announceToScreenReader(`Moving up to ${navigatorSchema.nodes.get(nextNodeId)?.label || nextNodeId}`);
          } else {
            announceToScreenReader('No nodes above');
          }
          break;
          
        case 'Enter':
        case ' ':
          event.preventDefault();
          announceNodeDetails(currentNode);
          break;
          
        case 'Escape':
          event.preventDefault();
          setIsNavigating(false);
          announceToScreenReader('Navigation mode deactivated');
          break;
      }

      if (nextNodeId && nextNodeId !== focusedNodeId) {
        setFocusedNodeId(nextNodeId);
        const nextNode = navigatorSchema.nodes.get(nextNodeId);
        if (nextNode) {
          announceNodeFocus(nextNode);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [graphRef, currentLayout, navigatorSchema, focusedNodeId, isNavigating]);

  return { focusedNodeId, setFocusedNodeId, isNavigating, setIsNavigating };
}

/**
 * Announces node focus to screen readers
 */
function announceNodeFocus(node: any) {
  const label = node.label || node.id || 'node';
  const description = node.description || '';
  const announcement = `Focused on ${label}. ${description} Press Enter for more details.`;
  announceToScreenReader(announcement);
}

/**
 * Announces detailed node information to screen readers
 */
function announceNodeDetails(node: any) {
  const announcement = node.description || `Node: ${node.label || node.id}`;
  announceToScreenReader(announcement);
}

/**
 * Announces a message to screen readers via ARIA live region
 */
function announceToScreenReader(message: string) {
  // Find or create live region
  let liveRegion = document.getElementById('graph-aria-live');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'graph-aria-live';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.left = '-10000px';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    document.body.appendChild(liveRegion);
  }
  
  // Clear and set new message
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion!.textContent = message;
  }, 100);
}

/**
 * AccessibleGraph Component
 */
export const AccessibleGraph: React.FC<AccessibleGraphProps> = ({
  width = 800,
  height = 600,
  layoutFormat = 'default',
  cndSpec,
  onLayoutReady,
  className = '',
  ariaLabel = 'Interactive graph visualization',
  ariaDescription,
  id = 'accessible-graph',
  enableDataNavigator = false
}) => {
  const graphRef = useRef<any>(null);
  const [currentLayout, setCurrentLayout] = useState<InstanceLayout | null>(null);
  const [navigatorSchema, setNavigatorSchema] = useState<NavigatorSchema | null>(null);
  
  const { focusedNodeId, isNavigating, setIsNavigating } = useGraphKeyboardNavigation(
    graphRef,
    currentLayout,
    navigatorSchema
  );

  useEffect(() => {
    if (!graphRef.current) return;

    // Listen for layout changes
    const handleLayoutComplete = () => {
      announceToScreenReader('Graph layout updated');
    };

    // Listen for relations-available event
    const handleRelationsAvailable = (event: CustomEvent) => {
      const { relations, count } = event.detail;
      announceToScreenReader(`Graph loaded with ${count} relation types`);
    };

    const graphElement = graphRef.current;
    graphElement.addEventListener('end', handleLayoutComplete);
    graphElement.addEventListener('relations-available', handleRelationsAvailable);

    return () => {
      graphElement.removeEventListener('end', handleLayoutComplete);
      graphElement.removeEventListener('relations-available', handleRelationsAvailable);
    };
  }, []);

  /**
   * Renders the graph and stores the layout
   * Generates Data Navigator schema from CnD constraints
   */
  const renderLayout = async (layout: InstanceLayout) => {
    if (graphRef.current && graphRef.current.renderLayout) {
      await graphRef.current.renderLayout(layout);
      setCurrentLayout(layout);
      
      // Generate navigator schema from layout and CnD spec
      const schema = generateNavigatorSchema(layout, cndSpec);
      setNavigatorSchema(schema);
      
      if (onLayoutReady) {
        onLayoutReady(layout, schema);
      }

      // Announce graph structure
      const nodeCount = layout.nodes?.length || 0;
      const edgeCount = layout.edges?.length || 0;
      announceToScreenReader(
        `Graph rendered with ${nodeCount} nodes and ${edgeCount} edges. ` +
        `Navigation follows the spatial relationships from your layout constraints. ` +
        `Press Tab to enable keyboard navigation.`
      );
    }
  };

  /**
   * Gets a text description of the graph structure
   */
  const getGraphDescription = (): string => {
    if (!currentLayout) {
      return 'Graph not yet loaded';
    }

    const nodeCount = currentLayout.nodes?.length || 0;
    const edgeCount = currentLayout.edges?.length || 0;
    const groupCount = currentLayout.groups?.length || 0;

    let description = `A graph visualization with ${nodeCount} nodes and ${edgeCount} edges`;
    
    if (groupCount > 0) {
      description += ` organized into ${groupCount} groups`;
    }

    description += '. Use arrow keys to navigate between nodes. Press Enter to hear node details. Press Escape to exit navigation mode.';

    return description;
  };

  /**
   * Handle focus on the graph container
   */
  const handleFocus = () => {
    setIsNavigating(true);
    announceToScreenReader('Keyboard navigation enabled. Use arrow keys to move between nodes.');
  };

  /**
   * Handle blur on the graph container
   */
  const handleBlur = () => {
    setIsNavigating(false);
  };

  // Expose renderLayout method to parent components
  useEffect(() => {
    if (graphRef.current) {
      (graphRef.current as any).renderLayoutAccessible = renderLayout;
    }
  }, []);

  return (
    <div 
      className={`accessible-graph-container ${className}`}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Screen reader instructions */}
      <div
        id={`${id}-instructions`}
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        <h2>Graph Keyboard Navigation Instructions</h2>
        <ul>
          <li>Press Tab to focus on the graph</li>
          <li>Use Arrow keys to navigate between nodes</li>
          <li>Press Enter or Space to hear detailed node information</li>
          <li>Press Escape to exit navigation mode</li>
        </ul>
      </div>

      {/* Accessible wrapper around webcola-cnd-graph */}
      <div
        role="application"
        aria-label={ariaLabel}
        aria-describedby={ariaDescription ? `${id}-description` : `${id}-instructions`}
        tabIndex={0}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      >
        {ariaDescription && (
          <div
            id={`${id}-description`}
            className="sr-only"
            style={{
              position: 'absolute',
              left: '-10000px',
              width: '1px',
              height: '1px',
              overflow: 'hidden'
            }}
          >
            {ariaDescription}
          </div>
        )}

        {/* WebCola graph custom element */}
        <webcola-cnd-graph
          ref={graphRef}
          id={id}
          width={width.toString()}
          height={height.toString()}
          layoutFormat={layoutFormat}
          aria-hidden="false"
          role="img"
          aria-label={getGraphDescription()}
        />
      </div>

      {/* Navigation status indicator */}
      {isNavigating && currentLayout && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            background: 'rgba(0, 123, 255, 0.9)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            zIndex: 1000,
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        >
          🎯 Keyboard Navigation Active
        </div>
      )}
    </div>
  );
};

export default AccessibleGraph;
