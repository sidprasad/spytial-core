import { WebColaTranslator } from './webcolatranslator';
import { InstanceLayout } from '../../layout/interfaces';
import * as cola from 'webcola';
import * as d3 from 'd3';

const DEFAULT_SCALE_FACTOR = 5;

/**
 * WebCola CnD Graph Custom Element
 * Full implementation using WebCola constraint-based layout with D3 integration
 */
export class WebColaCnDGraph extends HTMLElement {
  private svg!: any;
  private container!: any;
  private currentLayout: any = null;
  private readonly lineFunction: d3.Line<{ x: number; y: number }>;

  /**
   * Configuration constants for node visualization
   */
  private static readonly SMALL_IMG_SCALE_FACTOR = 0.3;
  private static readonly NODE_BORDER_RADIUS = 3;
  private static readonly NODE_STROKE_WIDTH = 1.5;

  /**
   * Configuration constants for group visualization
   */
  private static readonly DISCONNECTED_NODE_GROUP = "_d_";
  private static readonly GROUP_BORDER_RADIUS = 8;
  private static readonly GROUP_FILL_OPACITY = 0.25;
  private static readonly GROUP_LABEL_PADDING = 20;

  /**
   * Configuration constants for edge routing
   */
  private static readonly EDGE_ROUTE_MARGIN_DIVISOR = 3;
  private static readonly CURVATURE_BASE_MULTIPLIER = 0.15;
  private static readonly MIN_EDGE_DISTANCE = 10;
  private static readonly SELF_LOOP_CURVATURE_SCALE = 0.2;
  private static readonly VIEWBOX_PADDING = 10;

  /**
   * Configuration constants for WebCola layout iterations
   */
  private static readonly INITIAL_UNCONSTRAINED_ITERATIONS = 10;
  private static readonly INITIAL_USER_CONSTRAINT_ITERATIONS = 100;
  private static readonly INITIAL_ALL_CONSTRAINTS_ITERATIONS = 1000;
  private static readonly GRID_SNAP_ITERATIONS = 5; // Set to 0 to disable grid snapping

  /**
   * Counter for edge routing iterations (for performance tracking)
   */
  private edgeRouteIdx = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.initializeDOM();
    this.initializeD3();

    // TODO: I'd like to make this better.
    this.lineFunction = d3.line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveBasis);
  }

  /**
   * Determines if an edge is used for alignment purposes.
   * Alignment edges are identified by IDs starting with "_alignment_".
   * 
   * @param edge - Edge object to check
   * @returns True if the edge is an alignment constraint edge
   * 
   * @example
   * ```typescript
   * const alignEdge = { id: "_alignment_nodes_1_2" };
   * const isAlign = this.isAlignmentEdge(alignEdge); // returns true
   * ```
   */
  private isAlignmentEdge(edge: { id: string }): boolean {
    return edge.id.startsWith("_alignment_");
  }

  /**
   * Determines if a node is hidden based on naming convention.
   * Hidden nodes are identified by names starting with underscore.
   * 
   * @param node - Node object to check
   * @returns True if the node should be hidden from display
   */
  private isHiddenNode(node: { name: string }): boolean {
    return node.name.startsWith("_");
  }

  /**
   * Determines if an edge represents an inferred relationship.
   * Inferred edges are identified by specific properties or naming conventions.
   * 
   * @param edge - Edge object to check
   * @returns True if the edge is an inferred relationship
   * 
   * @example
   * ```typescript
   * const inferredEdge = { isInferred: true };
   * const isInferred = this.isInferredEdge(inferredEdge); // returns true
   * ```
   */
  private isInferredEdge(edge: { isInferred?: boolean }): boolean {
    return Boolean(edge.isInferred);
  }

  /**
   * Determines if a group represents disconnected nodes.
   * Disconnected node groups are identified by names starting with "_d_".
   * 
   * @param group - Group object to check
   * @returns True if the group contains disconnected nodes
   * 
   * @example
   * ```typescript
   * const disconnectedGroup = { name: "_d_isolated_nodes" };
   * const isDisconnected = this.isDisconnectedGroup(disconnectedGroup); // returns true
   * ```
   */
  private isDisconnectedGroup(group: { name: string }): boolean {
    return group.name.startsWith(WebColaCnDGraph.DISCONNECTED_NODE_GROUP);
  }

  private getScaledDetails(constraints: any[], scaleFactor: number = DEFAULT_SCALE_FACTOR) {
    const adjustedScaleFactor = scaleFactor / 5;
    const min_sep = 150;
    const default_node_width = 100;

    let linkLength = (min_sep + default_node_width) / adjustedScaleFactor;

    /*
    For each constraint, if it is a separation constraint, adjust the distance by the scale factor.
    */
    function getScaledConstraints(constraints: any[]): any[] {
      return constraints.map(constraint => {
        if (constraint.type === "separation" && typeof constraint.gap === "number") {
          const oldgap = constraint.gap;
          const newgap = oldgap / adjustedScaleFactor; // or * scaleFactor, depending on your UI logic
          //console.log(`Scaling constraint gap from ${oldgap} to ${newgap} with scale factor ${adjustedScaleFactor}`);

          return {
            ...constraint,
            gap: newgap
          };
        }
        return constraint;
      });
    }

    return {
      scaledConstraints: getScaledConstraints(constraints),
      linkLength: linkLength
    }
  }

  /**
   * Initialize the Shadow DOM structure
   */
  private initializeDOM(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        ${this.getCSS()}
      </style>
      <div id="svg-container">
        <svg id="svg" width="800" height="600">
          <defs>
            <marker id="end-arrow" markerWidth="15" markerHeight="10" refX="12" refY="5" orient="auto">
              <polygon points="0 0, 15 5, 0 10" />
            </marker>
            <marker id="hand-drawn-arrow" markerWidth="15" markerHeight="10" refX="12" refY="5" orient="auto">
              <polygon points="0 0, 15 5, 0 10" fill="#666666" />
            </marker>
          </defs>
          <g class="zoomable"></g>
        </svg>
      </div>
      <div id="loading" style="display: none;">Loading...</div>
      <div id="error" style="display: none; color: red;"></div>
    `;
  }

  /**
   * Initialize D3 selections and zoom behavior
   */
  private initializeD3(): void {
    this.svg = d3.select(this.shadowRoot!.querySelector('#svg'));
    this.container = this.svg.select('.zoomable');

    // Set up zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: any) => {
        this.container.attr('transform', event.transform);
      });

    this.svg.call(zoom);
  }

  /**
   * Render layout using WebCola constraint solver
   * @param instanceLayout - The layout instance to render
   */
  public async renderLayout(instanceLayout: InstanceLayout): Promise<void> {
    try {
      this.showLoading();

      // Translate to WebCola format
      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      console.log('🔄 Starting WebCola layout with cola.d3adaptor');
      console.log('Layout data:', webcolaLayout);

      // Get scaled constraints and link length
      const { scaledConstraints, linkLength } = this.getScaledDetails(webcolaLayout.constraints, DEFAULT_SCALE_FACTOR);

      // Create WebCola layout using d3adaptor
      const layout = cola.d3adaptor()
        .linkDistance(linkLength)
        .convergenceThreshold(1e-3)
        .avoidOverlaps(true)
        .handleDisconnected(true)
        .nodes(webcolaLayout.nodes)
        .links(webcolaLayout.links)
        .constraints(scaledConstraints)
        .groups(webcolaLayout.groups || [])
        .size([webcolaLayout.FIG_WIDTH, webcolaLayout.FIG_HEIGHT]);

      // Store current layout
      this.currentLayout = webcolaLayout;

      // Clear existing visualization
      this.container.selectAll('*').remove();

      // Create D3 selections for data binding
      this.renderGroups(this.currentLayout.groups);
      this.renderLinks(this.currentLayout.links, layout);
      this.renderNodes(this.currentLayout.nodes, layout);

      // Start the layout with specific iteration counts and proper event handling
      layout
        .on('tick', () => {
          this.updatePositions();
        })
        .on('end', () => {
          console.log('✅ WebCola layout converged');
          // Call advanced edge routing after layout converges
          this.routeEdges();
          this.hideLoading();
        })
        .start(
          WebColaCnDGraph.INITIAL_UNCONSTRAINED_ITERATIONS,
          WebColaCnDGraph.INITIAL_USER_CONSTRAINT_ITERATIONS,
          WebColaCnDGraph.INITIAL_ALL_CONSTRAINTS_ITERATIONS,
          WebColaCnDGraph.GRID_SNAP_ITERATIONS
        );

    } catch (error) {
      console.error('Error rendering layout:', error);
      this.showError(`Layout rendering failed: ${(error as Error).message}`);
    }
  }

  /**
   * Render groups using D3 data binding
   */
  private renderGroups(groups: any[]): void {
    if (!this.currentLayout?.nodes) {
      console.warn("Cannot render groups: nodes not available");
      return;
    }
    
    this.setupGroups(groups, this.currentLayout.nodes, null);
  }

  /**
   * Renders link elements with proper grouping, styling, and labels.
   * Creates link groups containing paths and optional text labels for non-alignment edges.
   * Handles different edge types (alignment, inferred, standard) with appropriate styling.
   * 
   * @param links - Array of edge objects to render
   * @param layout - WebCola layout instance (unused but maintained for API consistency)
   * @returns D3 selection of created link groups
   * 
   * @example
   * ```typescript
   * const linkSelection = this.setupLinks(this.currentLayout.links, layout);
   * ```
   */
  private setupLinks(
    links: any[], 
    layout: any
  ): d3.Selection<SVGGElement, any, any, unknown> {
    // Create link groups for each edge
    const linkGroups = this.container
      .selectAll<SVGGElement, any>(".link-group")
      .data(links)
      .enter()
      .append("g")
      .attr("class", "link-group");

    // Add path elements to each link group with dynamic styling
    this.setupLinkPaths(linkGroups);

    // Add labels to non-alignment links
    this.setupLinkLabels(linkGroups);

    return linkGroups;
  }

  /**
   * Creates path elements for links with appropriate CSS classes and styling.
   * Assigns different classes based on edge type for targeted styling.
   * 
   * @param linkGroups - D3 selection of link group elements
   */
  private setupLinkPaths(
    linkGroups: d3.Selection<SVGGElement, any, any, unknown>
  ): void {
    linkGroups
      .append("path")
      .attr("class", (d: any) => {
        if (this.isAlignmentEdge(d)) return "alignmentLink";
        if (this.isInferredEdge(d)) return "inferredLink";
        return "link";
      })
      .attr("data-link-id", (d: any) => d.id || "")
      .attr("fill", "none")
      .attr("stroke-width", 1)
      .attr("marker-end", (d: any) => {
        if (this.isAlignmentEdge(d)) return "none";
        return this.isInferredEdge(d) ? "url(#hand-drawn-arrow)" : "url(#end-arrow)";
      });
  }

  /**
   * Adds text labels to link groups for non-alignment edges.
   * Labels are positioned at the midpoint of each link path.
   * 
   * @param linkGroups - D3 selection of link group elements
   */
  private setupLinkLabels(
    linkGroups: d3.Selection<SVGGElement, any, any, unknown>
  ): void {
    linkGroups
      .filter((d: any) => !this.isAlignmentEdge(d))
      .append("text")
      .attr("class", "linklabel")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-family", "system-ui")
      .attr("font-size", "8px")
      .attr("fill", "#555")
      .attr("pointer-events", "none")
      .text((d: any) => d.label || d.relName || "");
  }

  /**
   * Sets up SVG group elements with rectangles and labels for WebCola layout.
   * Creates visual containers for node groups with proper styling and interactivity.
   * Handles both regular groups and disconnected node groups with different styling.
   * 
   * @param groups - Array of group objects to render
   * @param nodes - Array of nodes for color lookup via keyNode
   * @param layout - WebCola layout instance for drag behavior
   * @returns D3 selection of created group rectangles
   * 
   * @example
   * ```typescript
   * const groupSelection = this.setupGroups(this.currentLayout.groups, this.currentLayout.nodes, layout);
   * ```
   */
  private setupGroups(
    groups: any[], 
    nodes: any[], 
    layout: any
  ): d3.Selection<SVGRectElement, any, any, unknown> {
    // Create group rectangles with dynamic styling
    const groupRects = this.setupGroupRectangles(groups, nodes, layout);

    // Add labels to groups that should display them
    this.setupGroupLabels(groups, layout);

    return groupRects;
  }

  /**
   * Creates rectangle elements for groups with proper styling and drag behavior.
   * Handles different group types with appropriate visual styling.
   * 
   * @param groups - Array of group objects to render
   * @param nodes - Array of nodes for color lookup via keyNode
   * @param layout - WebCola layout instance for drag behavior
   * @returns D3 selection of created group rectangles
   */
  private setupGroupRectangles(
    groups: any[], 
    nodes: any[], 
    layout: any
  ): d3.Selection<SVGRectElement, any, any, unknown> {
    return this.container
      .selectAll<SVGRectElement, any>(".group")
      .data(groups)
      .enter()
      .append("rect")
      .attr("class", (d: any) => {
        return this.isDisconnectedGroup(d) ? "disconnectedNode" : "group";
      })
      .attr("rx", WebColaCnDGraph.GROUP_BORDER_RADIUS)
      .attr("ry", WebColaCnDGraph.GROUP_BORDER_RADIUS)
      .style("fill", (d: any) => {
        // Disconnected groups are transparent
        if (this.isDisconnectedGroup(d)) {
          return "transparent";
        }

        // Use key node color for regular groups
        const targetNode = nodes[d.keyNode];
        return targetNode?.color || "#cccccc";
      })
      .attr("fill-opacity", WebColaCnDGraph.GROUP_FILL_OPACITY)
      .attr("stroke", (d: any) => {
        if (this.isDisconnectedGroup(d)) {
          return "none";
        }
        const targetNode = nodes[d.keyNode];
        return targetNode?.color || "#999999";
      })
      .attr("stroke-width", 1)
      .call(this.createDragBehavior(layout));
  }

  /**
   * Adds text labels to groups that should display them.
   * Labels are positioned at the top of each group with proper spacing.
   * 
   * @param groups - Array of group objects to render
   * @param layout - WebCola layout instance for drag behavior
   * @returns D3 selection of created group labels
   */
  private setupGroupLabels(
    groups: any[], 
    layout: any
  ): d3.Selection<SVGTextElement, any, any, unknown> {
    return this.container
      .selectAll<SVGTextElement, any>(".groupLabel")
      .data(groups)
      .enter()
      .append("text")
      .attr("class", "groupLabel")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "hanging")
      .attr("font-family", "system-ui")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#333")
      .attr("pointer-events", "none")
      .text((d: any) => {
        const shouldShowGroupLabel = d.showLabel || false;
        
        if (shouldShowGroupLabel) {
          // Ensure adequate padding for label display
          if (d.padding) {
            d.padding = Math.max(d.padding, WebColaCnDGraph.GROUP_LABEL_PADDING);
          }
          return d.name || "";
        }
        
        return "";
      })
      .call(this.createDragBehavior(layout));
  }

  /**
   * Render links using D3 data binding with enhanced grouping and labeling
   */
  private renderLinks(links: any[], layout: any): void {
    this.setupLinks(links, layout);
  }

  /**
   * Sets up SVG node elements with rectangles, icons, and labels for WebCola layout.
   * Creates a complete node visualization with proper centering, styling, and interactivity.
   * 
   * @param nodes - Array of nodes with metadata to visualize
   * @param layout - WebCola layout instance for drag behavior
   * @returns D3 selection of created node groups
   */
  private setupNodes(nodes: any[], layout: any): d3.Selection<SVGGElement, any, any, unknown> {
    // Create node groups with drag behavior
    const nodeSelection = this.container
      .selectAll<SVGGElement, any>(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(this.createDragBehavior(layout));

    // Add rectangle backgrounds for nodes
    this.setupNodeRectangles(nodeSelection);

    // Add icons for nodes that have them
    this.setupNodeIcons(nodeSelection);

    // Add most specific type labels
    this.setupMostSpecificTypeLabels(nodeSelection);

    // Add main node labels with attributes
    this.setupNodeLabels(nodeSelection);

    return nodeSelection;
  }

  /**
   * Creates rectangle backgrounds for nodes with proper centering and styling.
   * Handles hidden nodes and icon-only nodes with transparent fills.
   * 
   * @param nodeSelection - D3 selection of node groups
   */
  private setupNodeRectangles(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodeSelection
      .append("rect")
      .attr("width", (d: any) => d.width || 60)
      .attr("height", (d: any) => d.height || 30)
      .attr("x", (d: any) => -(d.width || 60) / 2) // Center on node's x position
      .attr("y", (d: any) => -(d.height || 30) / 2) // Center on node's y position
      .attr("stroke", (d: any) => d.color || "black")
      .attr("rx", WebColaCnDGraph.NODE_BORDER_RADIUS)
      .attr("ry", WebColaCnDGraph.NODE_BORDER_RADIUS)
      .attr("stroke-width", WebColaCnDGraph.NODE_STROKE_WIDTH)
      .attr("fill", (d: any) => {
        const isHidden = this.isHiddenNode(d);
        const hasIcon = d.icon != null;
        return isHidden || hasIcon ? "transparent" : "white";
      });
  }

  /**
   * Adds icon images to nodes that have icon properties.
   * Handles scaling and positioning based on label visibility.
   * Includes error handling for failed icon loads.
   * 
   * @param nodeSelection - D3 selection of node groups
   */
  private setupNodeIcons(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodeSelection
      .filter((d: any) => d.icon) // Only nodes with icons
      .append("image")
      .attr("xlink:href", (d: any) => d.icon)
      .attr("width", (d: any) => {
        return d.showLabels
          ? (d.width || 60) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR
          : (d.width || 60);
      })
      .attr("height", (d: any) => {
        return d.showLabels
          ? (d.height || 30) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR
          : (d.height || 30);
      })
      .attr("x", (d: any) => {
        const width = d.width || 60;
        if (d.showLabels) {
          // Position in top-right corner when labels are shown
          return d.x + width - (width * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR);
        }
        // Center horizontally when no labels
        return d.x - width / 2;
      })
      .attr("y", (d: any) => {
        const height = d.height || 30;
        // Always align with top edge
        return d.y - height / 2;
      })
      .append("title")
      .text((d: any) => d.name || d.id || "Node")
      .on("error", function(this: SVGImageElement, event: any, d: any) {
        d3.select(this).attr("xlink:href", "img/default.png");
        console.error(`Failed to load icon for node ${d.id}: ${d.icon}`);
      });
  }

  /**
   * Adds most specific type labels to nodes with proper styling.
   * 
   * @param nodeSelection - D3 selection of node groups
   */
  private setupMostSpecificTypeLabels(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodeSelection
      .append("text")
      .attr("class", "mostSpecificTypeLabel")
      .style("fill", (d: any) => d.color || "black")
      .text((d: any) => d.mostSpecificType || "");
  }

  /**
   * Creates main node labels with attributes using tspan elements.
   * Handles conditional label display and multi-line attribute rendering.
   * 
   * @param nodeSelection - D3 selection of node groups
   */
  private setupNodeLabels(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodeSelection
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-family", "system-ui")
      .attr("font-size", "10px")
      .attr("fill", "black")
      .each((d: any, i: number, nodes: any[]) => {
        if (this.isHiddenNode(d)) {
          return;
        }

        const shouldShowLabels = d.showLabels;
        const displayLabel = shouldShowLabels ? (d.name || d.id || "Node") : "";
        const textElement = d3.select(nodes[i]);

        // Add main name label
        textElement
          .append("tspan")
          .attr("x", 0)
          .attr("dy", "0em")
          .style("font-weight", "bold")
          .text(displayLabel);

        // Add attribute labels if labels should be shown
        if (shouldShowLabels && d.attributes) {
          let lineOffset = 1; // Start from next line

          Object.entries(d.attributes).forEach(([key, value]: [string, any]) => {
            textElement
              .append("tspan")
              .attr("x", 0)
              .attr("dy", `${lineOffset}em`)
              .text(`${key}: ${value}`);
            lineOffset += 1;
          });
        }
      });
  }

  /**
   * Render nodes using D3 data binding with drag behavior
   */
  private renderNodes(nodes: any[], layout: any): void {
    this.setupNodes(nodes, layout);
  }

  /**
   * Extracts group-on and add-to-group indices from group edge ID.
   * Group edges follow the pattern "_g_{groupOnIndex}_{addToGroupIndex}".
   * 
   * @param edgeId - The edge ID to parse
   * @returns Object containing groupOnIndex and addToGroupIndex
   * 
   * @example
   * ```typescript
   * const result = this.getGroupOnAndAddToGroupIndices("_g_5_10");
   * // Returns: { groupOnIndex: 5, addToGroupIndex: 10 }
   * ```
   */
  private getGroupOnAndAddToGroupIndices(edgeId: string): { groupOnIndex: number; addToGroupIndex: number } {
    const parts = edgeId.split('_');
    if (parts.length < 4 || parts[0] !== '' || parts[1] !== 'g') {
      throw new Error(`Invalid group edge ID format: ${edgeId}`);
    }
    
    return {
      groupOnIndex: parseInt(parts[2], 10),
      addToGroupIndex: parseInt(parts[3], 10)
    };
  }

  /**
   * Finds all groups that contain the specified node.
   * 
   * @param groups - Array of group objects
   * @param node - Node to find containing groups for
   * @returns Array of groups that contain the node
   * 
   * @example
   * ```typescript
   * const containingGroups = this.getContainingGroups(groups, targetNode);
   * ```
   */
  private getContainingGroups(groups: any[], node: any): any[] {
    return groups.filter(group => {
      if (!group.leaves) return false;
      return group.leaves.some((leaf: any) => leaf.id === node.id);
    });
  }

  /**
   * Gets the index of a node in the current layout's nodes array.
   * 
   * @param node - Node object to find index for
   * @returns Index of the node, or -1 if not found
   */
  private getNodeIndex(node: any): number {
    if (!this.currentLayout?.nodes) return -1;
    return this.currentLayout.nodes.findIndex((n: any) => n.id === node.id);
  }

  /**
   * Update positions of all visual elements during layout animation.
   * Implements the complete WebCola tick behavior with proper bounds handling,
   * group edge routing, and element layering.
   */
  private updatePositions(): void {
    // Update group positions and sizes first (lower layer)
    this.container.selectAll('.group, .disconnectedNode')
      .attr('x', (d: any) => d.bounds?.x || 0)
      .attr('y', (d: any) => d.bounds?.y || 0)
      .attr('width', (d: any) => d.bounds?.width() || 0)
      .attr('height', (d: any) => d.bounds?.height() || 0)
      .lower();

    // Update node rectangles using bounds
    this.container.selectAll('.node rect')
      .each((d: any) => {
        if (d.bounds) {
          d.innerBounds = d.bounds.inflate(-1);
        }
      })
      .attr('x', (d: any) => d.bounds?.x || d.x - (d.width || 60) / 2)
      .attr('y', (d: any) => d.bounds?.y || d.y - (d.height || 30) / 2)
      .attr('width', (d: any) => d.bounds?.width() || d.width || 60)
      .attr('height', (d: any) => d.bounds?.height() || d.height || 30);

    // Update node icons with proper positioning
    this.container.selectAll('.node image')
      .attr('x', (d: any) => {
        if (d.showLabels) {
          // Move to the top-right corner
          return d.x + (d.width || 60) / 2 - ((d.width || 60) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR);
        } else {
          // Align with bounds if available, otherwise center
          return d.bounds?.x || (d.x - (d.width || 60) / 2);
        }
      })
      .attr('y', (d: any) => {
        if (d.showLabels) {
          // Align with the top edge
          return d.y - (d.height || 30) / 2;
        } else {
          // Align with bounds if available, otherwise center
          return d.bounds?.y || (d.y - (d.height || 30) / 2);
        }
      });

    // Update most specific type labels
    this.container.selectAll('.mostSpecificTypeLabel')
      .attr('x', (d: any) => d.x - (d.width || 60) / 2 + 5)
      .attr('y', (d: any) => d.y - (d.height || 30) / 2 + 10)
      .raise();

    // Update main node labels with tspan positioning
    this.container.selectAll('.node .label')
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y)
      .each((d: any, i: number, nodes: any[]) => {
        let lineOffset = 0;
        d3.select(nodes[i])
          .selectAll('tspan')
          .attr('x', d.x)
          .attr('dy', () => {
            lineOffset += 1;
            return lineOffset === 1 ? '0em' : '1em';
          });
      })
      .raise();

    // Update link paths with advanced routing for group edges
    this.container.selectAll('.link-group path')
      .attr('d', (d: any) => {
        let source = d.source;
        let target = d.target;

        // Handle group edges with special routing
        if (d.id?.startsWith('_g_')) {
          const { groupOnIndex, addToGroupIndex } = this.getGroupOnAndAddToGroupIndices(d.id);
          const addSourceToGroup = groupOnIndex >= addToGroupIndex;
          const addTargetToGroup = groupOnIndex < addToGroupIndex;

          if (addTargetToGroup) {
            const potentialGroups = this.getContainingGroups(this.currentLayout.groups || [], target);
            const targetGroup = potentialGroups.find(group => group.keyNode === this.getNodeIndex(source));
            
            if (targetGroup) {
              target = targetGroup;
              target.innerBounds = targetGroup.bounds?.inflate(-1 * (targetGroup.padding || 10));
            } else {
              console.log('Target group not found', potentialGroups, this.getNodeIndex(target));
            }
          } else if (addSourceToGroup) {
            const potentialGroups = this.getContainingGroups(this.currentLayout.groups || [], source);
            const sourceGroup = potentialGroups.find(group => group.keyNode === this.getNodeIndex(target));
            
            if (sourceGroup) {
              source = sourceGroup;
              source.innerBounds = sourceGroup.bounds?.inflate(-1 * (sourceGroup.padding || 10));
            } else {
              console.log('Source group not found', potentialGroups, this.getNodeIndex(source));
            }
          } else {
            console.log('This is a group edge (on tick), but neither source nor target is a group.', d);
          }
        }

        // Use WebCola's edge routing if available and nodes have innerBounds
        if (typeof (cola as any).makeEdgeBetween === 'function' && 
            source.innerBounds && target.innerBounds) {
          const route = (cola as any).makeEdgeBetween(source.innerBounds, target.innerBounds, 5);
          return this.lineFunction([route.sourceIntersection, route.arrowStart]);
        }

        // Fallback to simple line routing
        return this.lineFunction([
          { x: source.x || 0, y: source.y || 0 },
          { x: target.x || 0, y: target.y || 0 }
        ]);
      })
      .attr('marker-end', (d: any) => {
        if (this.isAlignmentEdge(d)) return 'none';
        return this.isInferredEdge(d) ? 'url(#hand-drawn-arrow)' : 'url(#end-arrow)';
      })
      .raise();

    // Update link labels using path midpoint calculation
    this.container.selectAll('.link-group .linklabel')
      .attr('x', (d: any) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        return pathElement ? this.calculateNewPosition(d.x, pathElement, 'x') : (d.source.x + d.target.x) / 2;
      })
      .attr('y', (d: any) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        return pathElement ? this.calculateNewPosition(d.y, pathElement, 'y') : (d.source.y + d.target.y) / 2;
      })
      .raise();

    // Update group labels (center top of each group)
    this.container.selectAll('.groupLabel')
      .attr('x', (d: any) => {
        if (!d.bounds) return 0;
        return d.bounds.x + (d.bounds.width() / 2);
      })
      .attr('y', (d: any) => {
        if (!d.bounds) return 0;
        return d.bounds.y + 12;
      })
      .attr('text-anchor', 'middle')
      .lower();

    // Ensure proper layering - raise important elements
    this.container.selectAll('marker').raise();
    this.container.selectAll('.link-group .linklabel').raise();
  }

  /**
   * Advanced edge routing with curvature calculation and overlap handling.
   * Implements sophisticated routing for multiple edges between nodes, self-loops,
   * and group edges with proper collision detection and label positioning.
   */
  private routeEdges(): void {
    try {
      // Prepare edge routing with margin
      if (typeof (this.currentLayout as any)?.prepareEdgeRouting === 'function') {
        (this.currentLayout as any).prepareEdgeRouting(
          WebColaCnDGraph.VIEWBOX_PADDING / WebColaCnDGraph.EDGE_ROUTE_MARGIN_DIVISOR
        );
      }

      console.log('Routing edges for the nth time', ++this.edgeRouteIdx);

      // Route all link paths with advanced logic
      this.routeLinkPaths();

      // Update link labels with proper positioning
      this.updateLinkLabelsAfterRouting();

      // Auto-fit viewport to content
      this.fitViewportToContent();

      // Setup relation highlighting (if needed for your use case)
      this.setupRelationHighlighting();

    } catch (error) {
      console.error('Error in edge routing:', error);
      this.showError(`Edge routing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Routes all link paths with advanced curvature and collision handling.
   */
  private routeLinkPaths(): void {
    this.container.selectAll('.link-group path')
      .attr('d', (d: any) => {
        try {
          return this.routeSingleEdge(d);
        } catch (error) {
          console.error(`Error routing edge ${d.id} from ${d.source.id} to ${d.target.id}:`, error);
          this.showRuntimeAlert(d.source.id, d.target.id);
          
          // Fallback to simple line
          return this.lineFunction([
            { x: d.source.x || 0, y: d.source.y || 0 },
            { x: d.target.x || 0, y: d.target.y || 0 }
          ]);
        }
      });
  }

  /**
   * Routes a single edge with advanced logic for different edge types.
   * 
   * @param edgeData - The edge data object
   * @returns SVG path string for the edge
   */
  private routeSingleEdge(edgeData: any): string | null {
    let route: Array<{ x: number; y: number }>;

    // Get initial route from WebCola
    if (typeof (this.currentLayout as any)?.routeEdge === 'function') {
      route = (this.currentLayout as any).routeEdge(edgeData);
    } else {
      // Fallback route
      route = [
        { x: edgeData.source.x || 0, y: edgeData.source.y || 0 },
        { x: edgeData.target.x || 0, y: edgeData.target.y || 0 }
      ];
    }

    // Handle self-loops
    if (edgeData.source.id === edgeData.target.id) {
      route = this.createSelfLoopRoute(edgeData);
    }

    // Handle group edges
    if (edgeData.id?.startsWith('_g_')) {
      route = this.routeGroupEdge(edgeData, route);
    }

    // Handle multiple edges between same nodes
    if (!this.isAlignmentEdge(edgeData)) {
      route = this.handleMultipleEdgeRouting(edgeData, route);
    }

    return this.lineFunction(route);
  }

  /**
   * Creates a self-loop route for edges that connect a node to itself.
   * 
   * @param edgeData - The edge data object
   * @returns Array of route points for the self-loop
   */
  private createSelfLoopRoute(edgeData: any): Array<{ x: number; y: number }> {
    const source = edgeData.source;
    const bounds = source.bounds;

    if (!bounds) {
      // Fallback for missing bounds
      return [
        { x: source.x, y: source.y },
        { x: source.x + 20, y: source.y - 20 },
        { x: source.x, y: source.y }
      ];
    }

    const width = bounds.X - bounds.x;
    const height = bounds.Y - bounds.y;

    const startPoint = {
      x: bounds.x + width / 2, // Center of top edge
      y: bounds.y
    };

    const endPoint = {
      x: bounds.X, // Center of right edge
      y: bounds.y + height / 2
    };

    // Dynamic control point based on self-loop index
    const selfLoopIndex = edgeData.selfLoopIndex || 0;
    const curvatureScale = 1 + selfLoopIndex * WebColaCnDGraph.SELF_LOOP_CURVATURE_SCALE;
    
    const controlPoint = {
      x: bounds.X + (width / 2) * curvatureScale,
      y: bounds.y - (height / 2) * curvatureScale
    };

    return [startPoint, controlPoint, endPoint];
  }

  /**
   * Routes group edges with special handling for group boundaries.
   * 
   * @param edgeData - The edge data object
   * @param route - Initial route points
   * @returns Modified route points for group edge
   */
  private routeGroupEdge(edgeData: any, route: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    const { groupOnIndex, addToGroupIndex } = this.getGroupOnAndAddToGroupIndices(edgeData.id);
    const addTargetToGroup = groupOnIndex < addToGroupIndex;
    const addSourceToGroup = groupOnIndex >= addToGroupIndex;

    if (addTargetToGroup) {
      const sourceIndex = this.getNodeIndex(edgeData.source);
      const potentialGroups = this.getContainingGroups(this.currentLayout.groups || [], edgeData.target);
      const targetGroup = potentialGroups.find(group => group.keyNode === sourceIndex);
      
      if (targetGroup) {
        const newTargetCoords = this.closestPointOnRect(targetGroup.bounds, route[0]);
        route[route.length - 1] = newTargetCoords;
      } else {
        console.log('Target group not found', potentialGroups, this.getNodeIndex(edgeData.target), edgeData.id);
      }
    } else if (addSourceToGroup) {
      const targetIndex = this.getNodeIndex(edgeData.target);
      const potentialGroups = this.getContainingGroups(this.currentLayout.groups || [], edgeData.source);
      const sourceGroup = potentialGroups.find(group => group.keyNode === targetIndex);
      
      if (sourceGroup) {
        const inflatedBounds = sourceGroup.bounds?.inflate(-1);
        const newSourceCoords = this.closestPointOnRect(inflatedBounds || sourceGroup.bounds, route[route.length - 1]);
        route[0] = newSourceCoords;
      } else {
        console.log('Source group not found', potentialGroups, sourceIndex, targetIndex, edgeData.id);
      }
    }

    // Simplify route for group edges (remove intermediate points)
    if (route.length > 2) {
      route.splice(1, route.length - 2);
    }

    return route;
  }

  /**
   * Handles routing for multiple edges between the same pair of nodes.
   * Applies curvature and offset to prevent edge overlap.
   * 
   * @param edgeData - The edge data object
   * @param route - Initial route points
   * @returns Modified route points with curvature and offset
   */
  private handleMultipleEdgeRouting(edgeData: any, route: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    const allEdgesBetweenNodes = this.getAllEdgesBetweenNodes(edgeData.source.id, edgeData.target.id);
    
    // Add midpoint if route only has start and end
    if (route.length === 2) {
      const midpoint = {
        x: (route[0].x + route[1].x) / 2,
        y: (route[0].y + route[1].y) / 2
      };
      route.splice(1, 0, midpoint);
    }

    // Calculate direction and distance
    const dx = route[1].x - route[0].x;
    const dy = route[1].y - route[0].y;
    const angle = Math.atan2(dy, dx);
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Apply offset for multiple edges
    if (allEdgesBetweenNodes.length > 1) {
      route = this.applyEdgeOffset(edgeData, route, allEdgesBetweenNodes, angle);
    }

    // Apply curvature
    const curvature = this.calculateCurvature(allEdgesBetweenNodes, edgeData.source.id, edgeData.target.id, edgeData.id);
    route = this.applyCurvatureToRoute(route, curvature, angle, distance);

    return route;
  }

  /**
   * Gets all non-alignment edges between two nodes (bidirectional).
   * 
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @returns Array of edges between the nodes
   */
  private getAllEdgesBetweenNodes(sourceId: string, targetId: string): any[] {
    if (!this.currentLayout?.links) return [];
    
    return this.currentLayout.links.filter((edge: any) => {
      return !this.isAlignmentEdge(edge) && (
        (edge.source.id === sourceId && edge.target.id === targetId) ||
        (edge.source.id === targetId && edge.target.id === sourceId)
      );
    });
  }

  /**
   * Calculates curvature for an edge based on the number of edges between nodes.
   * 
   * @param allEdges - All edges between the nodes
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   * @param edgeId - Current edge ID
   * @returns Curvature value for the edge
   */
  private calculateCurvature(allEdges: any[], sourceId: string, targetId: string, edgeId: string): number {
    if (edgeId.startsWith('_alignment_')) {
      return 0;
    }

    const edgeCount = allEdges.length;
    const edgeIndex = allEdges.findIndex(edge => edge.id === edgeId);

    if (edgeCount <= 1) {
      return 0;
    }

    return (edgeIndex % 2 === 0 ? 1 : -1) * 
           (Math.floor(edgeIndex / 2) + 1) * 
           WebColaCnDGraph.CURVATURE_BASE_MULTIPLIER * 
           edgeCount;
  }

  /**
   * Applies offset to edge points to prevent overlap between multiple edges.
   * 
   * @param edgeData - The edge data object
   * @param route - Route points
   * @param allEdges - All edges between the nodes
   * @param angle - Edge angle
   * @returns Modified route with offset applied
   */
  private applyEdgeOffset(edgeData: any, route: Array<{ x: number; y: number }>, allEdges: any[], angle: number): Array<{ x: number; y: number }> {
    const edgeIndex = allEdges.findIndex(edge => edge.id === edgeData.id);
    const offset = (edgeIndex % 2 === 0 ? 1 : -1) * 
                   (Math.floor(edgeIndex / 2) + 1) * 
                   WebColaCnDGraph.MIN_EDGE_DISTANCE;

    const direction = this.getDominantDirection(angle);
    
    if (direction === 'right' || direction === 'left') {
      route[0].y += offset;
      route[route.length - 1].y += offset;
    } else if (direction === 'up' || direction === 'down') {
      route[0].x += offset;
      route[route.length - 1].x += offset;
    }

    // Ensure points stay on rectangle perimeter
    if (edgeData.source.innerBounds) {
      route[0] = this.adjustPointToRectanglePerimeter(route[0], edgeData.source.innerBounds);
    }
    if (edgeData.target.innerBounds) {
      route[route.length - 1] = this.adjustPointToRectanglePerimeter(route[route.length - 1], edgeData.target.innerBounds);
    }

    return route;
  }

  /**
   * Applies curvature to control points in the route.
   * 
   * @param route - Route points
   * @param curvature - Curvature value
   * @param angle - Edge angle
   * @param distance - Edge distance
   * @returns Route with curvature applied
   */
  private applyCurvatureToRoute(route: Array<{ x: number; y: number }>, curvature: number, angle: number, distance: number): Array<{ x: number; y: number }> {
    if (curvature === 0) return route;

    route.forEach((point, index) => {
      if (index > 0 && index < route.length - 1) {
        const offsetX = curvature * Math.abs(Math.sin(angle)) * distance;
        const offsetY = curvature * Math.abs(Math.cos(angle)) * distance;
        
        point.x += offsetX;
        point.y += offsetY;
      }
    });

    return route;
  }

  /**
   * Gets the dominant direction of an edge based on its angle.
   * 
   * @param angle - Edge angle in radians
   * @returns Dominant direction string
   */
  private getDominantDirection(angle: number): 'right' | 'up' | 'left' | 'down' | null {
    // Normalize angle between -π and π
    angle = ((angle + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (angle >= -Math.PI / 4 && angle <= Math.PI / 4) {
      return 'right';
    } else if (angle > Math.PI / 4 && angle < 3 * Math.PI / 4) {
      return 'up';
    } else if (angle >= 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) {
      return 'left';
    } else if (angle > -3 * Math.PI / 4 && angle < -Math.PI / 4) {
      return 'down';
    }
    
    return null;
  }

  /**
   * Finds the closest point on a rectangle to a given point.
   * 
   * @param bounds - Rectangle bounds with x, y, X, Y properties
   * @param point - Point to find closest position for
   * @returns Closest point on rectangle perimeter
   */
  private closestPointOnRect(bounds: any, point: { x: number; y: number }): { x: number; y: number } {
    if (!bounds) return point;

    const { x, y, X, Y } = bounds;
    const closestX = Math.max(x, Math.min(point.x, X));
    const closestY = Math.max(y, Math.min(point.y, Y));

    return { x: closestX, y: closestY };
  }

  /**
   * Adjusts a point to lie on the perimeter of a rectangle.
   * 
   * @param point - Point to adjust
   * @param bounds - Rectangle bounds
   * @returns Point on rectangle perimeter
   */
  private adjustPointToRectanglePerimeter(point: { x: number; y: number }, bounds: any): { x: number; y: number } {
    if (!bounds) return point;

    // Implementation would adjust point to rectangle edge
    // This is a simplified version - full implementation would calculate
    // the exact perimeter intersection
    return this.closestPointOnRect(bounds, point);
  }

  /**
   * Updates link label positions after edge routing is complete.
   */
  private updateLinkLabelsAfterRouting(): void {
    this.container.selectAll('.link-group .linklabel')
      .attr('x', (d: any) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        if (!pathElement) return 0;
        
        const pathLength = pathElement.getTotalLength();
        const midpoint = pathElement.getPointAtLength(pathLength / 2);
        return midpoint.x;
      })
      .attr('y', (d: any) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        if (!pathElement) return 0;
        
        const pathLength = pathElement.getTotalLength();
        const midpoint = pathElement.getPointAtLength(pathLength / 2);
        return midpoint.y;
      })
      .attr('text-anchor', 'middle')
      .each((d: any, i: number, nodes: any[]) => {
        this.handleLabelOverlap(nodes[i] as SVGTextElement);
      })
      .raise();
  }

  /**
   * Handles overlap detection and resolution for link labels.
   * 
   * @param currentLabel - The current label element
   */
  private handleLabelOverlap(currentLabel: SVGTextElement): void {
    const overlapsWith: SVGTextElement[] = [];

    this.container.selectAll('.linklabel').each(function(this: SVGTextElement) {
      if (this !== currentLabel && this.isOverlapping && this.isOverlapping(currentLabel)) {
        overlapsWith.push(this);
      }
    });

    if (overlapsWith.length > 0) {
      this.minimizeOverlap(currentLabel, overlapsWith);
    }
  }

  /**
   * Checks if two SVG elements are overlapping.
   * 
   * @param element1 - First element
   * @param element2 - Second element
   * @returns True if elements overlap
   */
  private isOverlapping(element1: SVGElement, element2: SVGElement): boolean {
    const bbox1 = element1.getBBox();
    const bbox2 = element2.getBBox();
    
    return !(bbox2.x > bbox1.x + bbox1.width ||
             bbox2.x + bbox2.width < bbox1.x ||
             bbox2.y > bbox1.y + bbox1.height ||
             bbox2.y + bbox2.height < bbox1.y);
  }

  /**
   * Minimizes overlap between labels by repositioning.
   * 
   * @param currentLabel - Current label to reposition
   * @param overlappingLabels - Array of overlapping labels
   */
  private minimizeOverlap(currentLabel: SVGTextElement, overlappingLabels: SVGTextElement[]): void {
    // Implementation would reposition labels to minimize overlap
    // This is a placeholder for the actual overlap resolution algorithm
    console.log('Minimizing label overlap for', overlappingLabels.length, 'labels');
  }

  /**
   * Fits the viewport to show all content with padding.
   */
  private fitViewportToContent(): void {
    const svgElement = this.svg.node();
    if (!svgElement) return;

    const bbox = svgElement.getBBox();
    const padding = WebColaCnDGraph.VIEWBOX_PADDING;

    const viewBox = [
      bbox.x - padding,
      bbox.y - padding,
      bbox.width + 2 * padding,
      bbox.height + 2 * padding
    ].join(' ');

    this.svg.attr('viewBox', viewBox);
  }

  /**
   * Sets up relation highlighting functionality.
   */
  private setupRelationHighlighting(): void {
    if (!this.currentLayout?.links) return;

    const relNames = new Set(
      this.currentLayout.links
        .filter((edge: any) => !this.isAlignmentEdge(edge))
        .map((edge: any) => edge.relName)
        .filter(Boolean)
    );

    // This would integrate with your relation list UI if needed
    console.log('Available relations:', Array.from(relNames));
  }

  /**
   * Shows a runtime alert for edge routing errors.
   * 
   * @param sourceId - Source node ID
   * @param targetId - Target node ID
   */
  private showRuntimeAlert(sourceId: string, targetId: string): void {
    console.warn(`Runtime (WebCola) error when laying out an edge from ${sourceId} to ${targetId}. You may have to click and drag these nodes slightly to un-stick layout.`);
  }

  /**
   * Get CSS styles for the component
   */
  private getCSS(): string {
    return `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      #svg-container {
        width: 100%;
        height: 100%;
        border: 1px solid #ccc;
        overflow: hidden;
      }
      
      svg {
        width: 100%;
        height: 100%;
        cursor: grab;
      }
      
      svg:active {
        cursor: grabbing;
      }
      
      .node rect {
        cursor: move;
      }
      
      .link {
        stroke: #333;
        stroke-width: 1px;
        fill: none;
        marker-end: url(#end-arrow);
      }
      
      .inferredLink {
        stroke: #666;
        stroke-width: 1px;
        stroke-dasharray: 5,5;
        fill: none;
        marker-end: url(#hand-drawn-arrow);
      }

      .alignmentLink {
        stroke: #999;
        stroke-width: 0.5px;
        stroke-dasharray: 2,2;
        fill: none;
        opacity: 0.6;
      }
      
      .group {
        fill: rgba(200, 200, 200, 0.3);
        stroke: #666;
        stroke-width: 1px;
      }
      
      .label {
        text-anchor: middle;
        dominant-baseline: middle;
        font-size: 10px;
        pointer-events: none;
      }

      .linklabel {
        text-anchor: middle;
        dominant-baseline: middle;
        font-size: 8px;
        fill: #555;
        pointer-events: none;
        font-family: system-ui;
      }
      
      .mostSpecificTypeLabel {
        font-size: 8px;
        font-weight: bold;
        pointer-events: none;
      }
      
      #loading, #error {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
    `;
  }


  private calculateNewPosition(previousPosition : any, pathElement : any, axis : 'x' | 'y'): number {
        const pathLength = pathElement.getTotalLength();
        const midpointLength = pathLength / 2;
        const offset = 0; //getRandomOffsetAlongPath(); // commenting out to remove jitter

        let targetLength = midpointLength + offset;

        if (targetLength >= pathLength) {
            targetLength = midpointLength;
        }

        const point = pathElement.getPointAtLength(targetLength);
        return axis === 'x' ? point.x : point.y;
    }

  /**
   * Create drag behavior for nodes and groups
   * 
   * @param layout - WebCola layout instance
   * @returns D3 drag behavior for interactive node manipulation
   * 
   * @example
   * ```typescript
   * const dragBehavior = this.createDragBehavior(layout);
   * nodeSelection.call(dragBehavior);
   * ```
   */
  private createDragBehavior(layout: any): any {
    return d3.drag()
      .on('start', (event: any, d: any) => {
        if (!event.active && layout) layout.alpha(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: any) => {
        if (!event.active && layout) layout.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  /**
   * Show loading indicator
   */
  private showLoading(): void {
    const loading = this.shadowRoot!.querySelector('#loading') as HTMLElement;
    const error = this.shadowRoot!.querySelector('#error') as HTMLElement;
    loading.style.display = 'block';
    error.style.display = 'none';
  }

  /**
   * Hide loading indicator
   */
  private hideLoading(): void {
    const loading = this.shadowRoot!.querySelector('#loading') as HTMLElement;
    loading.style.display = 'none';
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const loading = this.shadowRoot!.querySelector('#loading') as HTMLElement;
    const error = this.shadowRoot!.querySelector('#error') as HTMLElement;
    loading.style.display = 'none';
    error.style.display = 'block';
    error.textContent = message;
  }
}

// Register the custom element
customElements.define('webcola-cnd-graph', WebColaCnDGraph);