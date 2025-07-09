/* eslint-disable @typescript-eslint/no-explicit-any */
import { EdgeWithMetadata, NodeWithMetadata, WebColaLayout, WebColaTranslator } from './webcolatranslator';
import { InstanceLayout, isAlignmentConstraint, isLeftConstraint, isTopConstraint, LayoutNode } from '../../layout/interfaces';
import type { GridRouter, Group, Layout, Node, Link } from 'webcola';

// Import D3 v4 and WebCola from vendor files (bundled at build time)
import d3 from '../../vendor/d3.v4.min.js';
import cola from '../../vendor/cola.js';

/**
 * Checks if two SVG elements are overlapping.
 * 
 * @param element1 - First element
 * @param element2 - Second element
 * @returns True if elements overlap
 */
function isOverlapping(element1: SVGElement, element2: SVGElement): boolean {
  function hasgetBBox(target: any): target is { getBBox: any } {
    return target && typeof target === 'object' && 'getBBox' in target;
  }

  const bbox1 = hasgetBBox(element1) ? element1.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
  const bbox2 = hasgetBBox(element2) ? element2.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
  
  return !(bbox2.x > bbox1.x + bbox1.width ||
           bbox2.x + bbox2.width < bbox1.x ||
           bbox2.y > bbox1.y + bbox1.height ||
           bbox2.y + bbox2.height < bbox1.y);
}

function hasInnerBounds(target: any): target is { innerBounds: any } {
  return target && typeof target === 'object' && 'innerBounds' in target;
}


const DEFAULT_SCALE_FACTOR = 5;

/**
 * WebCola CnD Graph Custom Element
 * Full implementation using WebCola constraint-based layout with D3 integration
 * @field currentLayout - Holds the current custom WebColaLayout instance
 * @field colaLayout - Holds the current layout instance used by WebCola
 */
export class WebColaCnDGraph extends  HTMLElement { //(typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as any)) {
  private svg!: any;
  private container!: any;
  private currentLayout!: WebColaLayout;
  private colaLayout!: Layout;
  private readonly lineFunction: d3.Line<{ x: number; y: number }>;

  /**
   * Configuration constants for SVG
   */

  private static readonly DEFAULT_SVG_WIDTH = 800;
  private static readonly DEFAULT_SVG_HEIGHT = 600;

  /**
   * Configuration constants for node visualization
   */
  private static readonly SMALL_IMG_SCALE_FACTOR = 0.3;
  private static readonly NODE_BORDER_RADIUS = 3;
  private static readonly NODE_STROKE_WIDTH = 1.5;

  /**
   * Configuration constants for group visualization
   */
  private static readonly DISCONNECTED_NODE_PREFIX = "_d_";
  private static readonly GROUP_BORDER_RADIUS = 8;
  private static readonly GROUP_FILL_OPACITY = 0.25;
  private static readonly GROUP_LABEL_PADDING = 20;
  private static readonly DEFAULT_GROUP_COMPACTNESS = 1e-5;

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


  // We use these to store state and references.
  private svgNodes : any;
  private svgLinkGroups : any;
  private svgGroups : any;
  private svgGroupLabels: any;
  /**
   * Stores the starting coordinates when a node begins dragging so
   * drag end events can report both the previous and new positions.
   */
  private dragStartPositions: Map<string, { x: number; y: number }> = new Map();

  constructor() {
    super();
    
    this.attachShadow({ mode: 'open' });
    this.initializeDOM();
    this.initializeD3();

    // TODO: I'd like to make this better.
    this.lineFunction = d3.line()
      .x((d: any) => d.x)
      .y((d: any) => d.y)
      .curve(d3.curveBasis);
  }

  /**
   * Access the layoutFormat attribute
   */
  private get layoutFormat(): string | null {
    return this.getAttribute('layoutFormat');
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
  private isHiddenNode(node: { name?: string; id?: string }): boolean {
    // Check name first, fall back to id if name is not available
    const identifier = node.name || node.id;
    return identifier ? identifier.startsWith("_") : false;
  }

  /**
   * Determines if a node is an error node.
   * @param node - Node object to check
   * @returns True if the node is in the set of conflicting constraints
   */
  private isErrorNode(node: {name: string, id: string}): boolean {
    // Check if this node appears in any constraint that's in conflictingConstraints
    const conflictingNodes = this.currentLayout.conflictingNodes;
    return conflictingNodes.some((conflictingNode: LayoutNode) => 
      conflictingNode.id === node.id || (conflictingNode as any).name === node.name  // NOTE: Is `name` check necessary?
    );
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
  private isInferredEdge(edge: { id?: string }): boolean {
    const helperPrefix = "_inferred_";

    // Check if the edge contains the helper prefix
    return edge.id ? edge.id.includes(helperPrefix) : false;
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
    return group.name.startsWith(WebColaCnDGraph.DISCONNECTED_NODE_PREFIX);
  }

  private getScaledDetails(constraints: any[], scaleFactor: number = DEFAULT_SCALE_FACTOR) {
    const adjustedScaleFactor = scaleFactor / 5;
    const min_sep = 150;
    const default_node_width = 100;

    let groupCompactness = WebColaCnDGraph.DEFAULT_GROUP_COMPACTNESS * adjustedScaleFactor;

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
      linkLength: linkLength,
      groupCompactness: groupCompactness
    }
  }

  /**
   * Initialize the Shadow DOM structure
   */
  private initializeDOM(): void {
    const width = this.getAttribute('width') || WebColaCnDGraph.DEFAULT_SVG_WIDTH.toString();
    const height = this.getAttribute('height') || WebColaCnDGraph.DEFAULT_SVG_HEIGHT.toString();

    this.shadowRoot!.innerHTML = `
      <style>
      ${this.getCSS()}
      </style>
      <div id="svg-container">
      <svg id="svg" width="${width}" height="${height}">
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

    if(d3.zoom) {

    // Set up zoom behavior (D3 v4 API - matches your working pattern)
    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', () => {
        this.container.attr('transform', d3.event.transform);
      });

    this.svg.call(zoom);
    }
    else {
      console.warn('D3 zoom behavior not available. Ensure D3 v4+ is loaded.');
    }
  }

  /**
   * Render layout using WebCola constraint solver
   * @param instanceLayout - The layout instance to render
   */
  public async renderLayout(instanceLayout: InstanceLayout): Promise<void> {
    try {
      
      // Check if D3 and WebCola are available
      if (!d3) {
        throw new Error('D3 library not available. Please ensure D3 v3 is loaded from CDN.');
      }
      if (!cola) {
        throw new Error('WebCola library not available. Please ensure vendor/cola.js is loaded.');
      }

      // Ensure D3 and container are properly initialized
      if (!this.container || !this.svg) {
        console.log('Re-initializing D3 selections...');
        this.initializeD3();
      }
      
      // Double-check that container is now available
      if (!this.container) {
        throw new Error('Failed to initialize D3 container. SVG elements may not be available.');
      }

      this.showLoading();

      // Translate to WebCola format
      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout);

      console.log('🔄 Starting WebCola layout with cola.d3adaptor');
      console.log('Layout data:', webcolaLayout);

      // Get scaled constraints and link length
      const { scaledConstraints, linkLength, groupCompactness } = this.getScaledDetails(webcolaLayout.constraints, DEFAULT_SCALE_FACTOR);

      // Create WebCola layout using d3adaptor
      const layout: Layout = cola.d3adaptor(d3)
        .linkDistance(linkLength)
        .convergenceThreshold(1e-3)
        .avoidOverlaps(true)
        .handleDisconnected(true)
        .nodes(webcolaLayout.nodes)
        .links(webcolaLayout.links)
        .constraints(scaledConstraints)
        .groups(webcolaLayout.groups)
        .groupCompactness(groupCompactness)
        .size([webcolaLayout.FIG_WIDTH, webcolaLayout.FIG_HEIGHT]);

      // Store current layout
      this.currentLayout = webcolaLayout;
      this.colaLayout = layout;

      // Clear existing visualization
      this.container.selectAll('*').remove();

      // Create D3 selections for data binding
      this.renderGroups(webcolaLayout.groups, layout);
      this.renderLinks(webcolaLayout.links, layout);
      this.renderNodes(webcolaLayout.nodes, layout);

      // Start the layout with specific iteration counts and proper event handling
      layout
        .on('tick', () => {
          if (this.layoutFormat === 'default' || !this.layoutFormat || this.layoutFormat === null) {
            this.updatePositions();
          } else if (this.layoutFormat === 'grid') {
            this.gridUpdatePositions();
          } else {
            console.warn(`Unknown layout format: ${this.layoutFormat}. Skipping position updates.`);
          }
        })
        .on('end', () => {
          console.log('✅ WebCola layout converged');
          // Call advanced edge routing after layout converges
          if (this.layoutFormat === 'default' || !this.layoutFormat ) {
            this.routeEdges();
          } else if (this.layoutFormat === 'grid') {
            this.gridify(10, 25, 10);
          } else {
            console.warn(`Unknown layout format: ${this.layoutFormat}. Skipping edge routing.`);
          }
          this.hideLoading();
        });

      // Start the layout with error handling for D3/WebCola compatibility issues
      try {
        layout.start(
          WebColaCnDGraph.INITIAL_UNCONSTRAINED_ITERATIONS,
          WebColaCnDGraph.INITIAL_USER_CONSTRAINT_ITERATIONS,
          WebColaCnDGraph.INITIAL_ALL_CONSTRAINTS_ITERATIONS,
          WebColaCnDGraph.GRID_SNAP_ITERATIONS
        );
      } catch (layoutError) {
        console.warn('WebCola layout start encountered an error, trying alternative approach:', layoutError);
        // Try starting with default parameters as fallback
        try {
          layout.start();
        } catch (fallbackError) {
          console.error('Both WebCola start methods failed:', fallbackError);
          throw new Error(`WebCola layout failed to start: ${(fallbackError as Error).message}`);
        }
      }

    } catch (error) {
      console.error('Error rendering layout:', error);
      this.showError(`Layout rendering failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the current positions of all nodes in the layout.
   * Useful for reading coordinates after rendering or drag events.
   */
  public getNodePositions(): Array<{ id: string; x: number; y: number }> {
    if (!this.currentLayout?.nodes) {
      return [];
    }
    return this.currentLayout.nodes.map((n: any) => ({
      id: n.id,
      x: n.x,
      y: n.y
    }));
  }

  /**
   * Render groups using D3 data binding
   */
  private renderGroups(groups: any[], layout: Layout): void {
    if (!this.currentLayout.nodes || this.currentLayout.nodes.length === 0) {
      console.warn("Cannot render groups: nodes not available");
      return;
    }
  
    this.svgGroups = this.setupGroups(groups, this.currentLayout.nodes, layout);
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
    links: Array<EdgeWithMetadata>, 
    layout: Layout
  ) {
    // Create link groups for each edge
    const linkGroups = this.container
      .selectAll(".link-group")
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
      .attr("stroke", (d: any) => d.color)
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
   * 
   * 
   * 
   * TODO: Could the issue be that groups are NODES and not indices?
   * 
   * Why are we returning anything here?
   * ```
   */
  private setupGroups(
    groups: any[], 
    nodes: Array<NodeWithMetadata>, 
    layout: Layout
  ) {
    // Create group rectangles with dynamic styling
    const groupRects = this.setupGroupRectangles(groups, nodes, layout);

    // Add labels to groups that should display them
    this.svgGroupLabels = this.setupGroupLabels(groups, layout);

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
    nodes: Array<NodeWithMetadata>, 
    layout: Layout
  ): d3.Selection<SVGRectElement, any, any, unknown> {
    const groupRects = this.container
      .selectAll(".group")
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
      .call((layout as any).drag);


    return groupRects;
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
    layout: Layout
  ): d3.Selection<SVGTextElement, any, any, unknown> {
    return this.container
      .selectAll(".groupLabel")
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
      }).call((layout as any).drag);
  }

  /**
   * Render links using D3 data binding with enhanced grouping and labeling
   */
  private renderLinks(links: Array<EdgeWithMetadata>, layout: Layout): void {
    this.svgLinkGroups = this.setupLinks(links, layout);
  }

  /**
   * Sets up SVG node elements with rectangles, icons, and labels for WebCola layout.
   * Creates a complete node visualization with proper centering, styling, and interactivity.
   * 
   * @param nodes - Array of nodes with metadata to visualize
   * @param layout - WebCola layout instance for drag behavior
   * @returns D3 selection of created node groups
   */
  private setupNodes(nodes: Array<NodeWithMetadata>, layout: Layout): d3.Selection<SVGGElement, any, any, unknown> {
    // Create node groups with drag behavior
    const nodeDrag = layout.drag();
    nodeDrag
      .on('start.cnd', (d: any) => {
        const start = { x: d.x, y: d.y };
        this.dragStartPositions.set(d.id, start);
        this.dispatchEvent(
          new CustomEvent('node-drag-start', {
            detail: { id: d.id, position: start }
          })
        );
      })
      .on('end.cnd', (d: any) => {
        const start = this.dragStartPositions.get(d.id);
        this.dragStartPositions.delete(d.id);
        const detail = {
          id: d.id,
          previous: start,
          current: { x: d.x, y: d.y }
        };
        this.dispatchEvent(new CustomEvent('node-drag-end', { detail }));
      });

    const nodeSelection = this.container
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", (d: any) => {
        return this.isErrorNode(d) ? "error-node" : "node";
      })
      .call(nodeDrag as any);

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
      .attr("width", (d: any) => d.width )
      .attr("height", (d: any) => d.height )
      .attr("x", (d: any) => -(d.width ) / 2) // Center on node's x position
      .attr("y", (d: any) => -(d.height ) / 2) // Center on node's y position
      .attr("stroke", (d: any) => d.color || "black")
      .attr("rx", WebColaCnDGraph.NODE_BORDER_RADIUS)
      .attr("ry", WebColaCnDGraph.NODE_BORDER_RADIUS)
      .attr("stroke-width", WebColaCnDGraph.NODE_STROKE_WIDTH)
      .attr("fill", (d: any) => {
        const isHidden = this.isHiddenNode(d);
        const hasIcon = !! d.icon;
        
        const fill = isHidden || hasIcon ? "transparent" : "white";
        //console.log(`Node ${d.id} - isHidden: ${isHidden}, hasIcon: ${hasIcon} ${d.icon}, fill: ${fill}`);

        return fill;
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
          ? (d.width ) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR
          : (d.width );
      })
      .attr("height", (d: any) => {
        return d.showLabels
          ? (d.height ) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR
          : (d.height );
      })
      .attr("x", (d: any) => {
        const width = d.width ;
        if (d.showLabels) {
          // Position in top-right corner when labels are shown
          return d.x + width - (width * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR);
        }
        // Center horizontally when no labels
        return d.x - width / 2;
      })
      .attr("y", (d: any) => {
        const height = d.height ;
        // Always align with top edge
        return d.y - height / 2;
      })
      .append("title")
      .text((d: any) => d.label || d.name || d.id || "Node")
      .on("error", function(this: any, event: any, d: any) {

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
        const displayLabel = shouldShowLabels ? (d.label || d.name || d.id || "Node") : "";
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
  private renderNodes(nodes: Array<NodeWithMetadata>, layout: Layout): void {
    this.svgNodes = this.setupNodes(nodes, layout);
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
    console.log('tick - updating positions');
    
    // Update group positions and sizes first (lower layer)
    this.svgGroups
      .attr('x', (d: any) => d.bounds.x)
      .attr('y', (d: any) => d.bounds.y )
      .attr('width', (d: any) => d.bounds.width() )
      .attr('height', (d: any) => d.bounds.height() )
      .lower();

    // Update node rectangles using bounds
    this.svgNodes.select('rect')
      .each((d: any) => {
        if (d.bounds) {
          d.innerBounds = d.bounds.inflate(-1);
        }
      })
      .attr('x', (d: any) => d.bounds.x )
      .attr('y', (d: any) => d.bounds.y )
      .attr('width', (d: any) => d.bounds.width() )
      .attr('height', (d: any) => d.bounds.height());

    // Update node icons with proper positioning
    this.svgNodes.select('image')
      .attr('x', (d: any) => {
        if (d.showLabels) {
          // Move to the top-right corner
          return d.x + (d.width) / 2 - ((d.width) * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR);
        } else {
          // Align with bounds if available, otherwise center
          return d.bounds.x;
        }
      })
      .attr('y', (d: any) => {
        if (d.showLabels) {
          // Align with the top edge
          return d.y - (d.height) / 2;
        } else {
          // Align with bounds if available, otherwise center
          return d.bounds.y;
        }
      });

    // Update most specific type labels
    this.svgNodes.select('.mostSpecificTypeLabel')
      .attr('x', (d: NodeWithMetadata) => d.x - (d.width || 0) / 2 + 5)
      .attr('y', (d: NodeWithMetadata) => d.y - (d.height || 0) / 2 + 10)
      .raise();

    // Update main node labels with tspan positioning
    this.svgNodes.select('.label') // NOTE: Does this need `text.label`?
      .attr('x', (d: NodeWithMetadata) => d.x)
      .attr('y', (d: NodeWithMetadata) => d.y)
      .each((d: NodeWithMetadata, i: number, nodes: Array<NodeWithMetadata>) => {
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
    this.svgLinkGroups.select('.link')
      .attr('d', (d: EdgeWithMetadata) => {
        // console.log('Routing link:', d.id, 'Source:', d.source, 'Target:', d.target);
        let source = d.source;
        let target = d.target;

        // Handle group edges with special routing
        if (d.id?.startsWith('_g_')) {
          const { groupOnIndex, addToGroupIndex } = this.getGroupOnAndAddToGroupIndices(d.id);
          const addSourceToGroup = groupOnIndex >= addToGroupIndex;
          const addTargetToGroup = groupOnIndex < addToGroupIndex;

          if (addTargetToGroup) {
            const potentialGroups = this.getContainingGroups(this.currentLayout?.groups || [], target);
            const targetGroup = potentialGroups.find(group => group.keyNode === this.getNodeIndex(source));
            
            if (targetGroup) {
              target = targetGroup;
              // NOTE: I think this is a rectangle...
              // Just added this to the NodeWithMetadata interface
              if(hasInnerBounds(target)) {
                target.innerBounds = targetGroup.bounds?.inflate(-1 * (targetGroup.padding || 10));
              }
            } else {
              console.log('Target group not found', potentialGroups, this.getNodeIndex(target));
            }
          } else if (addSourceToGroup) {
            const potentialGroups = this.getContainingGroups(this.currentLayout?.groups || [], source);
            const sourceGroup = potentialGroups.find(group => group.keyNode === this.getNodeIndex(target));
            
            if (sourceGroup) {
              source = sourceGroup;
              if(hasInnerBounds(source)) {
                // Inflate inner bounds for source group
                source.innerBounds = sourceGroup.bounds?.inflate(-1 * (sourceGroup.padding || 10));
              }
            } else {
              console.log('Source group not found', potentialGroups, this.getNodeIndex(source));
            }
          } else {
            console.log('This is a group edge (on tick), but neither source nor target is a group.', d);
          }
        }

        // Use WebCola's edge routing if available and nodes have innerBounds
        if (typeof (cola as any).makeEdgeBetween === 'function' && hasInnerBounds(source) && hasInnerBounds(target) &&
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
      .attr('marker-end', (d: EdgeWithMetadata) => {
        if (this.isAlignmentEdge(d)) return 'none';
        return this.isInferredEdge(d) ? 'url(#hand-drawn-arrow)' : 'url(#end-arrow)';
      })
      .raise();

    // Update link labels using path midpoint calculation
    this.svgLinkGroups.select('.linklabel')
      .attr('x', (d: EdgeWithMetadata) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        return pathElement ? this.calculateNewPosition(pathElement, 'x') : (d.source.x + d.target.x) / 2;
      })
      .attr('y', (d: EdgeWithMetadata) => {
        const pathElement = this.shadowRoot?.querySelector(`path[data-link-id="${d.id}"]`) as SVGPathElement;
        return pathElement ? this.calculateNewPosition(pathElement, 'y') : (d.source.y + d.target.y) / 2;
      })
      .raise();

    // Update group labels (center top of each group)
    this.svgGroupLabels
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
    this.svgLinkGroups.selectAll('marker').raise();
    this.svgLinkGroups.selectAll('.linklabel').raise();
  }

  private gridUpdatePositions() {
    console.log('grid tick - updating positions');
    
    const node = this.container.selectAll(".node");
    const mostSpecificTypeLabel = this.container.selectAll(".mostSpecificTypeLabel");
    const label = this.container.selectAll(".label");
    const group = this.container.selectAll(".group");
    const groupLabel = this.container.selectAll(".groupLabel");

    // UPDATE NODES AND NODE LABELS
    node.select("rect")
        .each(function (d: any) { d.innerBounds = d.bounds.inflate(-1); })
        .attr("x", function (d: any) { return d.bounds.x; })
        .attr("y", function (d: any) { return d.bounds.y; })
        .attr("width", function (d: any) { return d.bounds.width(); })
        .attr("height", function (d: any) { return d.bounds.height(); });
    

    node.select("image")
        .attr("x", function (d: any) {
            if (d.showLabels) {
                // Move to the top-right corner
                return d.x + (d.width / 2) - (d.width * WebColaCnDGraph.SMALL_IMG_SCALE_FACTOR);
            } else {
                // Align with d.bounds.x
                return d.bounds.x;
            }
        })
        .attr("y", function (d: any) {
            if (d.showLabels) {
                // Align with the top edge
                return d.y - d.height / 2;
            } else {
                // Align with d.bounds.y
                return d.bounds.y;
            }
        })

    mostSpecificTypeLabel
        .attr("x", function (d: any) { return d.bounds.x + 5; })
        .attr("y", function (d: any) { return d.bounds.y + 10; })
        .raise();

    label
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y)
        .each(function (d: any) {
            var y = 0; // Initialize y offset for tspans
            d3.select(this).selectAll("tspan")
                .attr("x", d.x) // Align tspans with the node's x position
                .attr("dy", function () {
                    y += 1; // Increment y for each tspan to create line spacing
                    return y === 1 ? "0em" : "1em"; // Keep the first tspan in place, move others down
                });
        })
        .raise();

    // UPDATE GROUPS AND GROUP LABELS
    group.attr("x", function (d: any) { return d.bounds.x; })
        .attr("y", function (d: any) { return d.bounds.y; })
        .attr("width", function (d: any) { return d.bounds.width(); })
        .attr("height", function (d: any) { return d.bounds.height(); })
        .lower();

    // Render group labels
    groupLabel.attr("x", function (d: any) { return d.bounds.x + d.bounds.width() / 2; }) // Center horizontally
        .attr("y", function (d: any) { return d.bounds.y + 12; })
        .attr("text-anchor", "middle") // Center the text on its position
        .raise();

    const linkGroups = this.container.selectAll(".linkGroup");
    linkGroups.select("text.linklabel").raise(); // Ensure link labels are raised
  }

  /**
   * Advanced edge routing with curvature calculation and overlap handling.
   * Implements sophisticated routing for multiple edges between nodes, self-loops,
   * and group edges with proper collision detection and label positioning.
   */
  private routeEdges(): void {
    try {
      // Prepare edge routing with margin
      if (typeof (this.colaLayout as any)?.prepareEdgeRouting === 'function') {
        (this.colaLayout as any).prepareEdgeRouting(
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

  private route(nodes: any, groups: any, margin: number, groupMargin: number): GridRouter<any> {
    nodes.forEach((d: any) => {
        d.routerNode = {
            name: d.name,
            bounds: d.bounds || d.innerBounds
        };
    });
    groups.forEach((d: any) => {
        d.routerNode = {
            bounds: d.bounds.inflate(-groupMargin),
            children: (typeof d.groups !== 'undefined' ? d.groups.map((c: any) => nodes.length + c.id) : [])
            .concat(typeof d.leaves !== 'undefined' ? d.leaves.map((c: any) => c.index) : [])
        };
    });
    let gridRouterNodes = nodes.concat(groups).map((d: any, i: number) => {
        d.routerNode.id = i;
        return d.routerNode;
    });
    // NOTE: Router nodes are nodes needed for grid routing, which include both nodes and groups
    return new cola.GridRouter(gridRouterNodes, {
        getChildren: (v: any) => v.children,
        getBounds: (v: any) => v.bounds
    }, margin - groupMargin);
  }

  private gridify(nudgeGap: number, margin: number, groupMargin: number): void {
    try {
      console.log("Gridify");
      // Create the grid router
      const gridrouter = this.route(this.currentLayout?.nodes, this.currentLayout?.groups, margin, groupMargin);

      // Route all edges using the GridRouter
      let routes: any[] = [];
      const edges = this.currentLayout?.links || [];

      if (!edges || edges.length === 0) {
          console.warn("No edges to route in GridRouter");
          return;
      }
      
      // Route edges using the GridRouter
      routes = gridrouter.routeEdges(edges, nudgeGap, function (e: any) { return e.source.routerNode.id; }, function (e: any) { return e.target.routerNode.id; });

      console.log("GridRouter routes: ", routes);

      // Clear existing paths; 
      // NOTE: This is crucial to avoid node explosion when re-routing
      this.container.selectAll('.link-group').remove();

      // Create paths from GridRouter routes
      routes.forEach((route, index) => {
          const cornerradius = 5;
          const arrowwidth = 3; // Abitrary value (see note below)
          const arrowheight = 7; // Abitrary value (see note below)

          // Get the corresponding edge data
          // Assumption: edges are in the same order as routes
          const edgeData = edges[index];

          // Calculate the route path using the GridRouter
          // NOTE: Arrow width/height not used in our implementation
          const p = cola.GridRouter.getRoutePath(route, cornerradius, arrowwidth, arrowheight);

          // Create the link groups
          const linkGroup = this.container.append('g')
              .attr("class", "link-group")
              .datum(edgeData);

          // Create the link
          linkGroup.append('path')
              .attr("class", () => {
                  if (this.isAlignmentEdge(edgeData)) return "alignmentLink";
                  if (this.isInferredEdge(edgeData)) return "inferredLink";
                  return "link";
              })
              .attr('data-link-id', edgeData.id)
              .attr('stroke', (d: any) => d.color)
              .attr('d', p.routepath)
              .lower();
          
          // Create the link labels
          linkGroup
              .filter((d: any) => !this.isAlignmentEdge(d))
              .append("text")
              .attr("class", "linklabel")
              .text((d: any) => d.label);
      });

      // Update node positions
      // NOTE: `transition()` gives the snap-to-grid effect
      // NOTE: Uses absolute positioning to be compatible with pre-existing code (also easier to reason)
      // NOTE: Use `d.bounds` to get the bounds of the node, `d.bounds.cx()` and `d.bounds.cy()` for center coordinates
      this.container.selectAll(".node").transition()
          .attr("x", function (d: any) { return d.bounds.x; })
          .attr("y", function (d: any) { return d.bounds.y; })
          .attr("width", function (d: any) { return d.bounds.width(); })
          .attr("height", function (d: any) { return d.bounds.height(); });
      
      // Update group positions
      // var groupPadding = margin - groupMargin;
      // console.log("Group padding", groupPadding);
      this.container.selectAll(".group").transition()
          .attr("x", function (d: any) { return d.bounds.x; })
          .attr('y', function (d: any) { return d.bounds.y; })
          .attr('width', function (d: any) { return d.bounds.width(); })
          .attr('height', function (d: any) { return d.bounds.height(); });
      
      // Update label positions
      this.container.selectAll(".label").transition()
          .attr("x", function (d: any) { return d.bounds.cx(); })
          .attr("y", function (d: any) { return d.bounds.cy(); });
      
      // Position link labels at route midpoints
      this.gridUpdateLinkLabels(routes, edges);

      this.fitViewportToContent();
      this.setupRelationHighlighting();
    } catch (e) {
      console.log("Error routing edges in GridRouter");
      console.error(e);


      let runtimeMessages = document.getElementById("runtime_messages") as HTMLElement;
      let dismissableAlert = document.createElement("div");
      dismissableAlert.className = "alert alert-danger alert-dismissible fade show";
      dismissableAlert.setAttribute("role", "alert");
      dismissableAlert.innerHTML = `Runtime (WebCola) error when gridifying edges. You may have to click and drag these nodes slightly to un-stick layout.`;

      // Make sure we don't have duplicate alerts
      let existingAlerts = runtimeMessages.querySelectorAll(".alert");
      existingAlerts.forEach(alert => {
          if (alert.innerHTML === dismissableAlert.innerHTML) {
              alert.remove();
          }
      });

      runtimeMessages.appendChild(dismissableAlert);
      return;
    }
  }

  private gridUpdateLinkLabels(routes: any[], edges: any[]) {
    console.log("Updating link labels");
    routes.forEach((route: any, index: number) => {
        var edgeData = edges[index];
        
        // Calculate midpoint of the route
        let combinedSegment: any[] = [];
        let direction = []; // 'L' for left, 'R' for right, 'U' for up, 'D' for down
        route.forEach((segment: any) => {
            combinedSegment = combinedSegment.concat(segment);
        });
        // console.log("Combined segment", combinedSegment);
        const midpointIndex = Math.floor(combinedSegment.length / 2); // NOTE: Length should be even
        const midpoint = {
            x: (combinedSegment[midpointIndex - 1].x + combinedSegment[midpointIndex].x) / 2,
            y: (combinedSegment[midpointIndex - 1].y + combinedSegment[midpointIndex].y) / 2
        };

        // TODO: Compute the direction of the angle
        // This is useful for determining where to place padding around the label
        // Currently, the label is directly on the line, which can be hard to read

        // console.log(`Midpoint for edge ${edgeData.id}:`, midpoint);
        
        // Update corresponding label
        const linkGroups = this.container.selectAll(".link-group");
        linkGroups.filter(function(d: any) { return d.id === edgeData.id; })
            .select("text.linklabel")
            .attr("x", midpoint.x)
            .attr("y", midpoint.y)
            .attr("text-anchor", "middle");
    });
  }

  /**
   * Routes all link paths with advanced curvature and collision handling.
   */
  private routeLinkPaths(): void {

    // TODO: Should this use linkGroups?


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
    const defaultRoute = [
      { x: edgeData.source.x || 0, y: edgeData.source.y || 0 },
      { x: edgeData.target.x || 0, y: edgeData.target.y || 0 }
    ];
    let route: Array<{ x: number; y: number }>;

    // Get initial route from WebCola
    if (typeof (this.colaLayout as any)?.routeEdge === 'function') {
      try {
        route = (this.colaLayout as any).routeEdge(edgeData);

        // Error check the route
        // NOTE: Conditional written by Copilot, may not cover all cases
        if (!route || !Array.isArray(route) || route.length < 2 || 
            !route[0] || !route[1] || route[0].x === undefined || route[0].y === undefined) {
                throw new Error(`WebCola failed to route edge ${edgeData.id} from ${edgeData.source.id} to ${edgeData.target.id}`);
        }
      } catch (e) {
        // TODO: Display error on frontend WebCola routing failure
        console.log("Error routing edge", edgeData.id, `from ${edgeData.source.id} to ${edgeData.target.id}`);
        console.error(e);
        return this.lineFunction(defaultRoute);
      }
    } else {
      // Fallback route
      route = defaultRoute;
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
      const potentialGroups = this.getContainingGroups(this.currentLayout?.groups || [], edgeData.target);
      const targetGroup = potentialGroups.find(group => group.keyNode === sourceIndex);
      
      if (targetGroup) {
        const newTargetCoords = this.closestPointOnRect(targetGroup.bounds, route[0]);
        route[route.length - 1] = newTargetCoords;
      } else {
        console.log('Target group not found', potentialGroups, this.getNodeIndex(edgeData.target), edgeData.id);
      }
    } else if (addSourceToGroup) {
      const sourceIndex = this.getNodeIndex(edgeData.source);
      const targetIndex = this.getNodeIndex(edgeData.target);
      const potentialGroups = this.getContainingGroups(this.currentLayout?.groups || [], edgeData.source);
      const sourceGroup = potentialGroups.find(group => group.keyNode === targetIndex); // NOTE: Could the keyNode not be set?
      
      if (sourceGroup) {
        const inflatedBounds = sourceGroup.bounds?.inflate(-1);
        const newSourceCoords = this.closestPointOnRect(inflatedBounds || sourceGroup.bounds, route[route.length - 1]);
        route[0] = newSourceCoords;
      } else {
        console.log('Source group not found', potentialGroups, sourceIndex, targetIndex, edgeData.id);
      }
    } else {
      // If neither source nor target is a group, log the edge data
      console.log("This is a group edge, but neither source nor target is a group.", edgeData);
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
  private getAllEdgesBetweenNodes(sourceId: string, targetId: string): EdgeWithMetadata[] {
    if (!this.currentLayout?.links) return [];
    
    return this.currentLayout.links.filter((edge: EdgeWithMetadata) => {
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
      if (this !== currentLabel && isOverlapping(this, currentLabel)) {
        overlapsWith.push(this);
      }
    });

    if (overlapsWith.length > 0) {
      this.minimizeOverlap(currentLabel, overlapsWith);
    }
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

      .error-node rect {
        stroke: red;
        stroke-width: 2px;
        stroke-dasharray: 5 5;
        animation: dash 1s linear infinite;
      }

      @keyframes dash {
        to {
          stroke-dashoffset: -10;
        }
      }
      
      .link {
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


  private calculateNewPosition(pathElement : any, axis : 'x' | 'y'): number {
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

// Register the custom element only in browser environments
if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  customElements.define('webcola-cnd-graph', WebColaCnDGraph);
}
