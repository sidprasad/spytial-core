/// <reference path="./custom-elements.d.ts" />
import React, { useEffect, useRef, useState } from 'react';
import type { InstanceLayout } from '../../layout/interfaces';

/**
 * AccessibleGraph Component
 * 
 * An accessible wrapper around the webcola-cnd-graph custom element that provides
 * enhanced accessibility features for visually-impaired users.
 * 
 * Features:
 * - ARIA labels and descriptions for screen readers
 * - Keyboard navigation (arrow keys to navigate between nodes)
 * - Live region announcements for graph changes
 * - Alternative text descriptions of spatial relationships
 * - Integration with Data Navigator best practices
 * 
 * @example
 * ```tsx
 * <AccessibleGraph
 *   width={800}
 *   height={600}
 *   layoutFormat="default"
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
  /** Callback when layout is ready */
  onLayoutReady?: (layout: InstanceLayout) => void;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for the graph */
  ariaLabel?: string;
  /** Detailed description of the graph for screen readers */
  ariaDescription?: string;
  /** ID for the graph element */
  id?: string;
}

/**
 * Hook to manage keyboard navigation within the graph
 */
function useGraphKeyboardNavigation(
  graphRef: React.RefObject<any>,
  currentLayout: InstanceLayout | null
) {
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (!graphRef.current || !currentLayout) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle navigation when the graph is focused
      if (!isNavigating) return;

      const nodes = currentLayout.nodes;
      if (!nodes || nodes.length === 0) return;

      let newIndex = focusedNodeIndex;

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          newIndex = (focusedNodeIndex + 1) % nodes.length;
          break;
        case 'ArrowLeft':
          event.preventDefault();
          newIndex = (focusedNodeIndex - 1 + nodes.length) % nodes.length;
          break;
        case 'ArrowDown':
          event.preventDefault();
          // Find node below current (by y-coordinate)
          newIndex = findNodeInDirection(nodes, focusedNodeIndex, 'down');
          break;
        case 'ArrowUp':
          event.preventDefault();
          // Find node above current (by y-coordinate)
          newIndex = findNodeInDirection(nodes, focusedNodeIndex, 'up');
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          announceNodeDetails(nodes[focusedNodeIndex]);
          break;
        case 'Escape':
          event.preventDefault();
          setIsNavigating(false);
          break;
      }

      if (newIndex !== focusedNodeIndex) {
        setFocusedNodeIndex(newIndex);
        announceNodeFocus(nodes[newIndex]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [graphRef, currentLayout, focusedNodeIndex, isNavigating]);

  return { focusedNodeIndex, setFocusedNodeIndex, isNavigating, setIsNavigating };
}

/**
 * Finds the nearest node in a given direction
 */
function findNodeInDirection(
  nodes: any[],
  currentIndex: number,
  direction: 'up' | 'down' | 'left' | 'right'
): number {
  if (!nodes || nodes.length === 0) return currentIndex;
  
  const currentNode = nodes[currentIndex];
  if (!currentNode || typeof currentNode.x !== 'number' || typeof currentNode.y !== 'number') {
    return currentIndex;
  }

  let nearestIndex = currentIndex;
  let nearestDistance = Infinity;

  nodes.forEach((node, index) => {
    if (index === currentIndex || !node || typeof node.x !== 'number' || typeof node.y !== 'number') return;

    const dx = node.x - currentNode.x;
    const dy = node.y - currentNode.y;

    // Check if node is in the right direction
    let isInDirection = false;
    switch (direction) {
      case 'up':
        isInDirection = dy < 0;
        break;
      case 'down':
        isInDirection = dy > 0;
        break;
      case 'left':
        isInDirection = dx < 0;
        break;
      case 'right':
        isInDirection = dx > 0;
        break;
    }

    if (isInDirection) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
  });

  return nearestIndex;
}

/**
 * Announces node focus to screen readers
 */
function announceNodeFocus(node: any) {
  const announcement = `Focused on ${node.label || node.id || 'node'}. Type: ${node.type || 'unknown'}. Press Enter for details.`;
  announceToScreenReader(announcement);
}

/**
 * Announces detailed node information to screen readers
 */
function announceNodeDetails(node: any) {
  const label = node.label || node.id || 'node';
  const type = node.type || 'unknown';
  const position = node.x && node.y ? `at position x: ${Math.round(node.x)}, y: ${Math.round(node.y)}` : '';
  
  const announcement = `Node details: ${label}, type ${type} ${position}`;
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
  onLayoutReady,
  className = '',
  ariaLabel = 'Interactive graph visualization',
  ariaDescription,
  id = 'accessible-graph'
}) => {
  const graphRef = useRef<any>(null);
  const [currentLayout, setCurrentLayout] = useState<InstanceLayout | null>(null);
  const { focusedNodeIndex, isNavigating, setIsNavigating } = useGraphKeyboardNavigation(
    graphRef,
    currentLayout
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
   */
  const renderLayout = async (layout: InstanceLayout) => {
    if (graphRef.current && graphRef.current.renderLayout) {
      await graphRef.current.renderLayout(layout);
      setCurrentLayout(layout);
      
      if (onLayoutReady) {
        onLayoutReady(layout);
      }

      // Announce graph structure
      const nodeCount = layout.nodes?.length || 0;
      const edgeCount = layout.edges?.length || 0;
      announceToScreenReader(
        `Graph rendered with ${nodeCount} nodes and ${edgeCount} edges. Press Tab to enable keyboard navigation.`
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
