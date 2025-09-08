/**
 * Data Navigator Accessibility Translator
 * 
 * Converts CnD layout instances to Data Navigator schema for visual accessibility.
 * Based on Data Navigator types from https://github.com/cmudig/data-navigator
 */

import { InstanceLayout, LayoutNode, LayoutEdge, LayoutGroup } from '../../layout/interfaces';

/**
 * Data Navigator types (simplified subset for CnD integration)
 */
export interface DataNavigatorNode {
  id: string;
  edges: string[];
  renderId?: string;
  renderingStrategy?: 'outlineEach' | 'convexHull' | 'singleSquare';
  [key: string]: any;
}

export interface DataNavigatorEdge {
  source: string;
  target: string;
  navigationRules: string[];
  edgeId?: string;
}

export interface NavigationRule {
  direction: 'target' | 'source';
  key?: string;
}

export interface SpatialProperties {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface SemanticProperties {
  label?: string;
  elementType?: string;
  role?: string;
  attributes?: Record<string, string>;
}

export interface RenderObject {
  cssClass?: string;
  spatialProperties?: SpatialProperties;
  semantics?: SemanticProperties;
  showText?: boolean;
}

export interface DataNavigatorStructure {
  nodes: Record<string, DataNavigatorNode>;
  edges: Record<string, DataNavigatorEdge>;
  navigationRules?: Record<string, NavigationRule>;
  elementData?: Record<string, RenderObject>;
  dimensions?: Record<string, any>; // For groups/hierarchy
}

/**
 * Options for configuring the Data Navigator translation
 */
export interface AccessibilityTranslatorOptions {
  /** Whether to include spatial positioning information */
  includeSpatialProperties?: boolean;
  /** Whether to generate navigation rules from layout constraints */
  generateNavigationRules?: boolean;
  /** Whether to create hierarchical dimensions from groups */
  createDimensions?: boolean;
  /** Custom semantic label generator for nodes */
  nodeSemanticGenerator?: (node: LayoutNode) => SemanticProperties;
  /** Custom spatial property generator for nodes */
  spatialPropertyGenerator?: (node: LayoutNode) => SpatialProperties;
}

/**
 * Translates CnD layout instances to Data Navigator accessible structure
 */
export class DataNavigatorTranslator {
  private options: Required<AccessibilityTranslatorOptions>;

  constructor(options: AccessibilityTranslatorOptions = {}) {
    this.options = {
      includeSpatialProperties: true,
      generateNavigationRules: true,
      createDimensions: true,
      nodeSemanticGenerator: this.defaultSemanticGenerator.bind(this),
      spatialPropertyGenerator: this.defaultSpatialGenerator.bind(this),
      ...options
    };
  }

  /**
   * Translates a CnD InstanceLayout to Data Navigator structure
   */
  public translate(layout: InstanceLayout): DataNavigatorStructure {
    const structure: DataNavigatorStructure = {
      nodes: {},
      edges: {},
      navigationRules: {},
      elementData: {}
    };

    // Convert nodes
    this.translateNodes(layout.nodes, structure);
    
    // Convert edges
    this.translateEdges(layout.edges, structure);
    
    // Generate navigation rules from constraints
    if (this.options.generateNavigationRules) {
      this.generateNavigationRules(layout, structure);
    }
    
    // Create dimensions from groups
    if (this.options.createDimensions) {
      structure.dimensions = layout.groups.length > 0 
        ? this.translateGroups(layout.groups, structure)
        : {};
    }

    return structure;
  }

  /**
   * Translates CnD nodes to Data Navigator nodes
   */
  private translateNodes(nodes: LayoutNode[], structure: DataNavigatorStructure): void {
    for (const node of nodes) {
      const dataNavNode: DataNavigatorNode = {
        id: node.id,
        edges: [], // Will be populated when processing edges
        renderId: node.id, // Use same ID for rendering
        renderingStrategy: 'outlineEach'
      };

      // Add any additional properties from the original node
      if (node.groups) {
        dataNavNode.groups = node.groups;
      }
      
      if (node.mostSpecificType) {
        dataNavNode.type = node.mostSpecificType;
      }

      structure.nodes[node.id] = dataNavNode;

      // Create render object for accessibility
      const renderObject: RenderObject = {
        semantics: this.options.nodeSemanticGenerator(node),
        showText: node.showLabels
      };

      if (this.options.includeSpatialProperties) {
        renderObject.spatialProperties = this.options.spatialPropertyGenerator(node);
      }

      structure.elementData![node.id] = renderObject;
    }
  }

  /**
   * Translates CnD edges to Data Navigator edges
   */
  private translateEdges(edges: LayoutEdge[], structure: DataNavigatorStructure): void {
    for (const edge of edges) {
      const edgeId = edge.id || `edge_${edge.source.id}_${edge.target.id}`;
      
      const dataNavEdge: DataNavigatorEdge = {
        source: edge.source.id,
        target: edge.target.id,
        navigationRules: [`nav_${edgeId}`],
        edgeId
      };

      structure.edges[edgeId] = dataNavEdge;

      // Update node edge lists
      if (structure.nodes[edge.source.id]) {
        structure.nodes[edge.source.id].edges.push(edgeId);
      }
      if (structure.nodes[edge.target.id]) {
        structure.nodes[edge.target.id].edges.push(edgeId);
      }

      // Create navigation rule for this edge
      structure.navigationRules![`nav_${edgeId}`] = {
        direction: 'target',
        key: edge.relationName
      };
    }
  }

  /**
   * Generates navigation rules from layout constraints
   */
  private generateNavigationRules(layout: InstanceLayout, structure: DataNavigatorStructure): void {
    // Create spatial navigation rules based on constraints
    for (const constraint of layout.constraints) {
      // Check if constraint has sourceConstraint property
      const sourceConstraint = (constraint as any).sourceConstraint;
      const constraintType = sourceConstraint?.type;
      
      if (constraintType === 'orientation') {
        // Create directional navigation rules
        this.createDirectionalNavigationRule(constraint, structure);
      } else if (constraintType === 'alignment') {
        // Create alignment-based navigation rules
        this.createAlignmentNavigationRule(constraint, structure);
      }
    }
  }

  /**
   * Creates directional navigation rules from orientation constraints
   */
  private createDirectionalNavigationRule(constraint: any, structure: DataNavigatorStructure): void {
    // Extract direction information from the constraint
    const ruleId = `orientation_${constraint.id || Math.random().toString(36).substr(2, 9)}`;
    
    structure.navigationRules![ruleId] = {
      direction: 'target',
      key: 'spatial'
    };
  }

  /**
   * Creates alignment-based navigation rules
   */
  private createAlignmentNavigationRule(constraint: any, structure: DataNavigatorStructure): void {
    const ruleId = `alignment_${constraint.id || Math.random().toString(36).substr(2, 9)}`;
    
    structure.navigationRules![ruleId] = {
      direction: 'target',
      key: 'aligned'
    };
  }

  /**
   * Translates CnD groups to Data Navigator dimensions (hierarchical structures)
   */
  private translateGroups(groups: LayoutGroup[], structure: DataNavigatorStructure): Record<string, any> {
    const dimensions: Record<string, any> = {};

    for (const group of groups) {
      const dimensionId = `group_${group.name}`;
      
      dimensions[dimensionId] = {
        nodeId: group.keyNodeId,
        dimensionKey: group.name,
        divisions: this.createGroupDivisions(group, structure),
        operations: {
          compressSparseDivisions: true
        },
        behavior: {
          extents: 'terminal' as const,
          childmostNavigation: 'within' as const
        },
        navigationRules: {
          sibling_sibling: ['nav_sibling_next', 'nav_sibling_prev'],
          parent_child: ['nav_child_enter', 'nav_parent_exit']
        }
      };

      // Create navigation rules for group navigation
      this.createGroupNavigationRules(group, structure);
    }

    return dimensions;
  }

  /**
   * Creates division structure for a group
   */
  private createGroupDivisions(group: LayoutGroup, structure: DataNavigatorStructure): Record<string, any> {
    const divisions: Record<string, any> = {};
    
    // Create a single division containing all group members
    const divisionId = `div_${group.name}`;
    divisions[divisionId] = {
      id: divisionId,
      values: group.nodeIds.reduce((acc, nodeId) => {
        if (structure.nodes[nodeId]) {
          acc[nodeId] = structure.nodes[nodeId];
        }
        return acc;
      }, {} as Record<string, DataNavigatorNode>)
    };

    return divisions;
  }

  /**
   * Creates navigation rules for group interactions
   */
  private createGroupNavigationRules(group: LayoutGroup, structure: DataNavigatorStructure): void {
    // Sibling navigation within group
    structure.navigationRules!['nav_sibling_next'] = {
      direction: 'target',
      key: 'ArrowRight'
    };
    
    structure.navigationRules!['nav_sibling_prev'] = {
      direction: 'source', 
      key: 'ArrowLeft'
    };
    
    // Parent-child navigation
    structure.navigationRules!['nav_child_enter'] = {
      direction: 'target',
      key: 'ArrowDown'
    };
    
    structure.navigationRules!['nav_parent_exit'] = {
      direction: 'source',
      key: 'ArrowUp'
    };
  }

  /**
   * Default semantic property generator for nodes
   */
  private defaultSemanticGenerator(node: LayoutNode): SemanticProperties {
    const semantics: SemanticProperties = {
      label: this.generateNodeLabel(node),
      elementType: 'button',
      role: 'button'
    };

    // Add attributes as aria attributes
    if (node.attributes) {
      semantics.attributes = {};
      for (const [key, values] of Object.entries(node.attributes)) {
        semantics.attributes[`aria-${key}`] = values.join(', ');
      }
    }

    // Add type information
    if (node.types && node.types.length > 0) {
      semantics.attributes = semantics.attributes || {};
      semantics.attributes['aria-describedby'] = `Node of type ${node.mostSpecificType || node.types[0]}`;
    }

    return semantics;
  }

  /**
   * Default spatial property generator for nodes
   */
  private defaultSpatialGenerator(node: LayoutNode): SpatialProperties {
    return {
      width: node.width || 50,
      height: node.height || 30,
      // x and y would need to be provided by the layout engine
      // These are placeholders - actual positions would come from WebCola or similar
      x: 0,
      y: 0
    };
  }

  /**
   * Generates a comprehensive label for a node
   */
  private generateNodeLabel(node: LayoutNode): string {
    let label = node.label || node.id;
    
    // Add type information if available
    if (node.mostSpecificType && node.mostSpecificType !== node.label && node.mostSpecificType !== node.id) {
      label += ` (${node.mostSpecificType})`;
    }
    
    // Add attributes as part of the label
    if (node.attributes && Object.keys(node.attributes).length > 0) {
      const attributeStrings = Object.entries(node.attributes)
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .join('; ');
      label += `. Attributes: ${attributeStrings}`;
    }

    // Add group information
    if (node.groups && node.groups.length > 0) {
      label += `. Member of groups: ${node.groups.join(', ')}`;
    }

    return label;
  }

  /**
   * Get the current options
   */
  public getOptions(): Required<AccessibilityTranslatorOptions> {
    return { ...this.options };
  }

  /**
   * Update translator options
   */
  public updateOptions(newOptions: Partial<AccessibilityTranslatorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}

/**
 * Helper function to create a Data Navigator translator with default options
 */
export function createDataNavigatorTranslator(options?: AccessibilityTranslatorOptions): DataNavigatorTranslator {
  return new DataNavigatorTranslator(options);
}

/**
 * Utility function to translate a layout directly
 */
export function translateToDataNavigator(
  layout: InstanceLayout, 
  options?: AccessibilityTranslatorOptions
): DataNavigatorStructure {
  const translator = new DataNavigatorTranslator(options);
  return translator.translate(layout);
}