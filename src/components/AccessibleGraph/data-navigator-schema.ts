/**
 * Data Navigator Schema Generator
 * 
 * This module generates Data Navigator navigation schemas from:
 * 1. The graph structure (nodes and edges)
 * 2. The CnD layout spec (spatial constraints)
 * 
 * This allows navigation to follow the declarative spatial relationships
 * defined in the CnD spec, rather than just geometric positions.
 */

import type { InstanceLayout, LayoutConstraint } from '../../layout/interfaces';
import type { ParsedCnDSpec } from '../../layout/layoutspec';

/**
 * Data Navigator node in the navigation schema
 */
export interface NavigatorNode {
  id: string;
  label: string;
  description: string;
  /** Nodes that can be reached by going "up" */
  up?: string[];
  /** Nodes that can be reached by going "down" */
  down?: string[];
  /** Nodes that can be reached by going "left" */
  left?: string[];
  /** Nodes that can be reached by going "right" */
  right?: string[];
  /** Alternative text for screen readers */
  ariaLabel?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Data Navigator schema for graph navigation
 */
export interface NavigatorSchema {
  nodes: Map<string, NavigatorNode>;
  startNode: string;
  description: string;
}

/**
 * Extracts directional relationships from CnD constraints
 */
function extractConstraintRelationships(
  constraints: LayoutConstraint[],
  layout: InstanceLayout
): Map<string, { up: Set<string>; down: Set<string>; left: Set<string>; right: Set<string> }> {
  const relationships = new Map<string, any>();
  
  // Initialize relationships for all nodes
  layout.nodes.forEach(node => {
    relationships.set(node.id, {
      up: new Set<string>(),
      down: new Set<string>(),
      left: new Set<string>(),
      right: new Set<string>()
    });
  });
  
  // Process constraints to extract directional relationships
  constraints.forEach(constraint => {
    const sourceConstraint = (constraint as any).sourceConstraint;
    
    // Handle "top" constraints (node1 is above node2)
    if (sourceConstraint && sourceConstraint.constraint === 'top') {
      const topNode = sourceConstraint.node1;
      const bottomNode = sourceConstraint.node2;
      
      if (topNode && bottomNode) {
        // From top node, you can go down to bottom node
        const topRel = relationships.get(topNode);
        if (topRel) topRel.down.add(bottomNode);
        
        // From bottom node, you can go up to top node
        const bottomRel = relationships.get(bottomNode);
        if (bottomRel) bottomRel.up.add(topNode);
      }
    }
    
    // Handle "left" constraints (node1 is left of node2)
    if (sourceConstraint && sourceConstraint.constraint === 'left') {
      const leftNode = sourceConstraint.node1;
      const rightNode = sourceConstraint.node2;
      
      if (leftNode && rightNode) {
        // From left node, you can go right to right node
        const leftRel = relationships.get(leftNode);
        if (leftRel) leftRel.right.add(rightNode);
        
        // From right node, you can go left to left node
        const rightRel = relationships.get(rightNode);
        if (rightRel) rightRel.left.add(leftNode);
      }
    }
    
    // Handle alignment constraints (nodes are aligned on an axis)
    if (sourceConstraint && sourceConstraint.constraint === 'align') {
      const node1 = sourceConstraint.node1;
      const node2 = sourceConstraint.node2;
      const axis = sourceConstraint.axis;
      
      if (node1 && node2) {
        if (axis === 'y') {
          // Horizontally aligned - can navigate left/right
          const rel1 = relationships.get(node1);
          const rel2 = relationships.get(node2);
          
          if (rel1 && rel2) {
            // Determine which is left/right based on actual positions
            const pos1 = layout.nodes.find(n => n.id === node1);
            const pos2 = layout.nodes.find(n => n.id === node2);
            
            if (pos1 && pos2 && typeof (pos1 as any).x === 'number' && typeof (pos2 as any).x === 'number') {
              if ((pos1 as any).x < (pos2 as any).x) {
                rel1.right.add(node2);
                rel2.left.add(node1);
              } else {
                rel1.left.add(node2);
                rel2.right.add(node1);
              }
            }
          }
        } else if (axis === 'x') {
          // Vertically aligned - can navigate up/down
          const rel1 = relationships.get(node1);
          const rel2 = relationships.get(node2);
          
          if (rel1 && rel2) {
            // Determine which is up/down based on actual positions
            const pos1 = layout.nodes.find(n => n.id === node1);
            const pos2 = layout.nodes.find(n => n.id === node2);
            
            if (pos1 && pos2 && typeof (pos1 as any).y === 'number' && typeof (pos2 as any).y === 'number') {
              if ((pos1 as any).y < (pos2 as any).y) {
                rel1.down.add(node2);
                rel2.up.add(node1);
              } else {
                rel1.up.add(node2);
                rel2.down.add(node1);
              }
            }
          }
        }
      }
    }
  });
  
  return relationships;
}

/**
 * Augments constraint-based relationships with geometric fallbacks
 * for nodes without explicit constraint relationships
 */
function addGeometricFallbacks(
  relationships: Map<string, any>,
  layout: InstanceLayout
): void {
  layout.nodes.forEach(node => {
    const nodeRel = relationships.get(node.id);
    if (!nodeRel) return;
    
    const nodePos = node as any;
    if (typeof nodePos.x !== 'number' || typeof nodePos.y !== 'number') return;
    
    // For each direction, if no constraint-based neighbors exist,
    // find the nearest node geometrically
    const directions = ['up', 'down', 'left', 'right'] as const;
    
    directions.forEach(dir => {
      if (nodeRel[dir].size === 0) {
        // Find nearest node in this direction
        let nearest: string | null = null;
        let nearestDist = Infinity;
        
        layout.nodes.forEach(otherNode => {
          if (otherNode.id === node.id) return;
          
          const otherPos = otherNode as any;
          if (typeof otherPos.x !== 'number' || typeof otherPos.y !== 'number') return;
          
          const dx = otherPos.x - nodePos.x;
          const dy = otherPos.y - nodePos.y;
          
          // Check if node is in the right direction
          let inDirection = false;
          switch (dir) {
            case 'up':
              inDirection = dy < -10; // Some threshold
              break;
            case 'down':
              inDirection = dy > 10;
              break;
            case 'left':
              inDirection = dx < -10;
              break;
            case 'right':
              inDirection = dx > 10;
              break;
          }
          
          if (inDirection) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = otherNode.id;
            }
          }
        });
        
        if (nearest) {
          nodeRel[dir].add(nearest);
        }
      }
    });
  });
}

/**
 * Generates a Data Navigator schema from the layout and CnD spec
 * 
 * This leverages the declarative spatial relationships in the CnD spec
 * to create an intelligent navigation graph that follows the intended
 * layout structure rather than just geometric positions.
 * 
 * @param layout - The instance layout with nodes, edges, and constraints
 * @param cndSpec - Optional parsed CnD specification
 * @returns A Data Navigator schema for accessible navigation
 */
export function generateNavigatorSchema(
  layout: InstanceLayout,
  cndSpec?: ParsedCnDSpec
): NavigatorSchema {
  // Extract relationships from CnD constraints
  const relationships = extractConstraintRelationships(
    layout.constraints || [],
    layout
  );
  
  // Add geometric fallbacks for unconstrained nodes
  addGeometricFallbacks(relationships, layout);
  
  // Build navigator nodes
  const navigatorNodes = new Map<string, NavigatorNode>();
  
  layout.nodes.forEach(node => {
    const rel = relationships.get(node.id);
    if (!rel) return;
    
    // Get connection information
    const incomingEdges = layout.edges.filter(e => e.target.id === node.id);
    const outgoingEdges = layout.edges.filter(e => e.source.id === node.id);
    
    // Create description
    let description = `${node.label || node.id}`;
    if (node.type) {
      description += `, type: ${node.type}`;
    }
    if (incomingEdges.length > 0 || outgoingEdges.length > 0) {
      description += `. ${incomingEdges.length} incoming and ${outgoingEdges.length} outgoing connections`;
    }
    
    // List connected nodes
    if (outgoingEdges.length > 0) {
      const targets = outgoingEdges
        .map(e => e.target.label || e.target.id)
        .join(', ');
      description += `. Connected to: ${targets}`;
    }
    
    navigatorNodes.set(node.id, {
      id: node.id,
      label: node.label || node.id,
      description,
      up: Array.from(rel.up),
      down: Array.from(rel.down),
      left: Array.from(rel.left),
      right: Array.from(rel.right),
      ariaLabel: `${node.label || node.id}. Use arrow keys to navigate to connected nodes.`,
      metadata: {
        type: node.type,
        groups: node.groups,
        incomingCount: incomingEdges.length,
        outgoingCount: outgoingEdges.length
      }
    });
  });
  
  // Determine start node (prefer one with most outgoing connections or first node)
  let startNode = layout.nodes[0]?.id || '';
  let maxOutgoing = 0;
  
  navigatorNodes.forEach((navNode, id) => {
    const outgoing = (navNode.metadata?.outgoingCount || 0) as number;
    if (outgoing > maxOutgoing) {
      maxOutgoing = outgoing;
      startNode = id;
    }
  });
  
  // Create schema description
  const description = `Graph with ${layout.nodes.length} nodes and ${layout.edges.length} edges. ` +
    `Navigation follows the spatial relationships defined in the layout constraints. ` +
    `Use arrow keys to move between nodes based on their relative positions.`;
  
  return {
    nodes: navigatorNodes,
    startNode,
    description
  };
}

/**
 * Converts navigator schema to Data Navigator format
 * 
 * This creates the structure object that Data Navigator expects,
 * with nodes and their navigation connections.
 */
export function toDataNavigatorFormat(schema: NavigatorSchema): any {
  const structure = {
    name: 'Graph Navigation',
    description: schema.description,
    start: schema.startNode,
    nodes: {} as Record<string, any>
  };
  
  schema.nodes.forEach((node, id) => {
    structure.nodes[id] = {
      id: node.id,
      name: node.label,
      description: node.description,
      ariaLabel: node.ariaLabel,
      // Data Navigator format for connections
      connections: {
        up: node.up || [],
        down: node.down || [],
        left: node.left || [],
        right: node.right || []
      },
      metadata: node.metadata
    };
  });
  
  return structure;
}

/**
 * Example usage with Data Navigator:
 * 
 * ```typescript
 * import dataNavigator from 'data-navigator';
 * import { generateNavigatorSchema, toDataNavigatorFormat } from './data-navigator-schema';
 * 
 * // After rendering the graph
 * const schema = generateNavigatorSchema(layout, cndSpec);
 * const navigatorStructure = toDataNavigatorFormat(schema);
 * 
 * // Initialize Data Navigator
 * const navigator = dataNavigator.structure(navigatorStructure);
 * const input = dataNavigator.input(navigator);
 * const rendering = dataNavigator.rendering(navigator, svgElement);
 * 
 * // Navigation now follows CnD constraints!
 * ```
 */
