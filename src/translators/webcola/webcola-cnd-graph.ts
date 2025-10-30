/* eslint-disable @typescript-eslint/no-explicit-any */
import { EdgeWithMetadata, NodeWithMetadata, WebColaLayout, WebColaTranslator } from './webcolatranslator';
import { InstanceLayout, isAlignmentConstraint, isInstanceLayout, isLeftConstraint, isTopConstraint, LayoutNode } from '../../layout/interfaces';
import type { GridRouter, Group, Layout, Node, Link } from 'webcola';
import { IInputDataInstance, ITuple, IAtom } from '../../data-instance/interfaces';

let d3 = window.d3v4 || window.d3; // Use d3 v4 if available, otherwise fallback to the default window.d3
let cola = window.cola;

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
 * 
 * Features:
 * - Interactive edge input mode with keyboard shortcuts (Cmd/Ctrl)
 * - Visual edge creation by clicking and dragging between nodes
 * - Edge modification by clicking on existing edges in input mode
 * - Centralized state management for IInputDataInstance
 * - Automatic layout regeneration when data instance changes
 * - Self-loop edge support with confirmation
 * - Zoom/pan disable during input mode
 * - Comprehensive event system for external integration
 * 
 * Events Fired:
 * - 'input-mode-activated': When Cmd/Ctrl is pressed to activate input mode
 * - 'input-mode-deactivated': When Cmd/Ctrl is released to deactivate input mode  
 * - 'edge-creation-requested': When user drags between nodes to create a new edge
 *   * event.detail: { relationId: string, sourceNodeId: string, targetNodeId: string, tuple: ITuple }
 * - 'edge-modification-requested': When user clicks on existing edge to modify it
 *   * event.detail: { oldRelationId: string, newRelationId: string, sourceNodeId: string, targetNodeId: string, tuple: ITuple }
 * 
 * External State Management:
 * React components should subscribe to these events and handle:
 * 1. Updating the IInputDataInstance with new atoms/relations
 * 2. Regenerating CnD layout constraints from the updated data
 * 3. Calling renderLayout() to apply changes and re-render the visualization
 * 
 * This ensures React components serve as the single source of truth for state
 * while the WebCola component focuses purely on visualization and user interaction.
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
   * Configuration constants for text sizing and layout
   */
  private static readonly DEFAULT_FONT_SIZE = 10;
  private static readonly MIN_FONT_SIZE = 6;
  private static readonly MAX_FONT_SIZE = 16;
  private static readonly TEXT_PADDING = 8; // Padding inside node for text
  private static readonly LINE_HEIGHT_RATIO = 1.2;

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
   * Reduced from previous values (10, 100, 1000, 5) to improve performance
   * and prevent browser timeouts on large graphs
   */
  private static readonly INITIAL_UNCONSTRAINED_ITERATIONS = 10;
  private static readonly INITIAL_USER_CONSTRAINT_ITERATIONS = 50;
  private static readonly INITIAL_ALL_CONSTRAINTS_ITERATIONS = 200;
  private static readonly GRID_SNAP_ITERATIONS = 1; // Reduced from 5 for performance, but kept at 1 for alignment

  /**
   * Counter for edge routing iterations (for performance tracking)
   */
  private edgeRouteIdx = 0;


  // We use these to store state and references.
  private svgNodes : any;
  private svgLinkGroups : any;
  private svgGroups : any;
  private svgGroupLabels: any;
  private zoomBehavior: any;
  private storedTransform: any;
  /**
   * Stores the starting coordinates when a node begins dragging so
   * drag end events can report both the previous and new positions.
   */
  private dragStartPositions: Map<string, { x: number; y: number }> = new Map();

  /**
   * Input mode state management for edge creation and modification
   */
  private isInputModeActive: boolean = false;
  private edgeCreationState: {
    isCreating: boolean;
    sourceNode: NodeWithMetadata | null;
    temporaryEdge: any;
  } = {
    isCreating: false,
    sourceNode: null,
    temporaryEdge: null
  };

  /**
   * Temporary canvas for text measurement
   */
  private textMeasurementCanvas: HTMLCanvasElement | null = null;

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

    // Initialize input mode keyboard event handlers
    this.initializeInputModeHandlers();
  }

  /**
   * Access the layoutFormat attribute
   */
  private get layoutFormat(): string | null {
    return this.getAttribute('layoutFormat');
  }

  /**
   * Access whether this graph is a graph visualizing an unsat core.
   */
  private get isUnsatCore(): boolean {
    return this.hasAttribute('unsat');
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

    // Check if this node appear in overlapping nodes
    const overlappingNodes = this.currentLayout.overlappingNodes;

    if (conflictingNodes.length > 0 && overlappingNodes.length > 0) {
      const conflictingNodeIds = conflictingNodes.map(n => n.id);
      const overlappingNodeIds = overlappingNodes.map(n => n.id);
      throw new Error(`Layout cannot have both conflictingConstraints (${conflictingNodeIds}) and overlappingNodes ${overlappingNodeIds}`);
    }

    const errorNodes = [...conflictingNodes, ...overlappingNodes];

    return errorNodes.some((errorNode: LayoutNode) => errorNode.id === node.id); // NOTE: `id` should be unique
  }

  /**
   * Check if a node is considered "small" and needs enhanced visibility
   * Accounts for current zoom level to determine visual size on screen
   * @param node - Node object with dimensions
   * @returns True if the node appears smaller than the threshold on screen
   */
  private isSmallNode(node: any): boolean {
    const minVisualSize = 30; // Minimum visual size threshold in screen pixels
    
    // Get current zoom scale
    let zoomScale = 1;
    if (this.svg && this.svg.node()) {
      try {
        const transform = d3.zoomTransform(this.svg.node());
        zoomScale = transform.k;
      } catch (e) {
        // Fallback to scale 1 if transform is not available
        zoomScale = 1;
      }
    }
    
    // Calculate visual size (coordinate size * zoom scale)
    const visualWidth = (node.width || 0) * zoomScale;
    const visualHeight = (node.height || 0) * zoomScale;
    
    return visualWidth < minVisualSize || visualHeight < minVisualSize;
  }

  /**
   * Update node classes based on current zoom level
   * Called when zoom changes to ensure small error nodes get proper styling
   */
  private updateSmallNodeClasses(): void {
    if (!this.container) return;
    
    // Update all error nodes to check if they should have small-error-node class
    this.container.selectAll('.error-node').each((d: any, i: number, nodes: any[]) => {
      const nodeElement = d3.select(nodes[i]);
      const isSmall = this.isSmallNode(d);
      
      if (isSmall) {
        // Add small-error-node class if not present
        if (!nodeElement.classed('small-error-node')) {
          nodeElement.classed('small-error-node', true);
        }
      } else {
        // Remove small-error-node class if present
        if (nodeElement.classed('small-error-node')) {
          nodeElement.classed('small-error-node', false);
        }
      }
    });
  }

  private isErrorGroup(group: {name: string}): boolean {
    const overlappingGroups = this.currentLayout.overlappingGroups;
    if (!overlappingGroups) {
      console.error("Overlapping groups data not available in current layout");
      throw new Error("Overlapping groups data not available in current layout");
    }
    return overlappingGroups.some((g: any) => g.name === group.name);
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

  /**
   * Computes adaptive link length based on actual node dimensions and graph density
   */
  private computeAdaptiveLinkLength(nodes: any[], scaleFactor: number): number {
    if (!nodes || nodes.length === 0) {
      return 150; // fallback
    }

    // Calculate average node dimensions using actual width/height
    let totalWidth = 0;
    let totalHeight = 0;
    let validNodes = 0;

    nodes.forEach(node => {
      if (node && !this.isHiddenNode(node)) {
        totalWidth += (node.width || 100);
        totalHeight += (node.height || 60);
        validNodes++;
      }
    });

    if (validNodes === 0) {
      return 150; // fallback
    }

    const avgWidth = totalWidth / validNodes;
    const avgHeight = totalHeight / validNodes;
    const avgNodeSize = Math.max(avgWidth, avgHeight);

    // Base link length should be larger of: average node size + separation, or minimum separation
    const baseSeparation = 50; // minimum separation between nodes
    let baseLinkLength = Math.max(avgNodeSize + baseSeparation, 120);

    // Apply density factor - more nodes = slightly tighter spacing to fit better
    const densityFactor = Math.max(0.7, 1 - Math.log10(validNodes) * 0.1);
    baseLinkLength *= densityFactor;

    // Apply scale factor
    const adjustedScaleFactor = scaleFactor / 5;
    const scaledLinkLength = baseLinkLength / adjustedScaleFactor;

    // Ensure reasonable bounds - prevent tiny edges and excessive spacing
    return Math.max(60, Math.min(scaledLinkLength, 350));
  }

  private getScaledDetails(constraints: any[], scaleFactor: number = DEFAULT_SCALE_FACTOR, nodes?: any[]) {
    const adjustedScaleFactor = scaleFactor / 5;

    let groupCompactness = WebColaCnDGraph.DEFAULT_GROUP_COMPACTNESS * adjustedScaleFactor;

    // Use adaptive link length calculation if nodes are available
    let linkLength: number;
    if (nodes && nodes.length > 0) {
      linkLength = this.computeAdaptiveLinkLength(nodes, scaleFactor);
    } else {
      // Fallback to original calculation
      const min_sep = 150;
      const default_node_width = 100;
      linkLength = (min_sep + default_node_width) / adjustedScaleFactor;
    }

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
    // Get actual container dimensions for responsive sizing
    const containerRect = this.getBoundingClientRect();
    const containerWidth = containerRect.width || 800;
    const containerHeight = containerRect.height || 600;
    
    this.shadowRoot!.innerHTML = `
      <style>
      ${this.getCSS()}
      </style>
      <div id="graph-toolbar">
        <div id="zoom-controls">
          <button id="zoom-in" title="Zoom In" aria-label="Zoom in">+</button>
          <button id="zoom-out" title="Zoom Out" aria-label="Zoom out">−</button>
        </div>
      </div>
      <div id="svg-container">
      <span id="error-icon" title="This graph is depicting an error state">⚠️</span>
      <svg id="svg" viewBox="0 0 ${containerWidth} ${containerHeight}" preserveAspectRatio="xMidYMid meet">
        <defs>
        <marker id="end-arrow" markerWidth="15" markerHeight="10" refX="12" refY="5" orient="auto">
          <polygon points="0 0, 15 5, 0 10" />
        </marker>
        <marker id="start-arrow" markerWidth="15" markerHeight="10" refX="3" refY="5" orient="auto">
          <polygon points="15 0, 0 5, 15 10" />
        </marker>
        </defs>
        <g class="zoomable"></g>
      </svg>
      </div>
      <div id="loading" style="display: none;">
        <div style="text-align: center; padding: 20px; background: rgba(255, 255, 255, 0.9); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="font-size: 16px; margin-bottom: 10px;">Computing layout...</div>
          <div id="loading-progress" style="font-size: 12px; color: #666;"></div>
        </div>
      </div>
      <div id="error" style="display: none; color: red;"></div>
    `;
  }

  /**
   * Initialize D3 selections and zoom behavior
   */
  private initializeD3(): void {
    
    if (!d3) {
      d3 = window.d3;
    }

    this.svg = d3.select(this.shadowRoot!.querySelector('#svg'));
    this.container = this.svg.select('.zoomable');

    if(d3.zoom) {

    // Set up zoom behavior (D3 v4 API - matches your working pattern)
    this.zoomBehavior = d3.zoom()
      .scaleExtent([0.01, 20])
      .on('zoom', () => {
        this.container.attr('transform', d3.event.transform);
        // Update zoom control states when zoom changes
        this.updateZoomControlStates();
        // Update small node classes based on new zoom level
        this.updateSmallNodeClasses();
      });

    this.svg.call(this.zoomBehavior);
    
    // Set up zoom control event listeners
    this.initializeZoomControls();
    }
    else {
      console.warn('D3 zoom behavior not available. Ensure D3 v4+ is loaded.');
    }
  }

  /**
   * Initialize zoom control event listeners
   */
  private initializeZoomControls(): void {
    const zoomInButton = this.shadowRoot!.querySelector('#zoom-in') as HTMLButtonElement;
    const zoomOutButton = this.shadowRoot!.querySelector('#zoom-out') as HTMLButtonElement;

    if (zoomInButton) {
      zoomInButton.addEventListener('click', () => {
        this.zoomIn();
      });
    }

    if (zoomOutButton) {
      zoomOutButton.addEventListener('click', () => {
        this.zoomOut();
      });
    }

    // Initial state update
    this.updateZoomControlStates();
  }

  /**
   * Initialize keyboard event handlers for input mode activation
   */
  private initializeInputModeHandlers(): void {
    // Handle keydown for Cmd/Ctrl press
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && !this.isInputModeActive) {
        this.activateInputMode();
      }
    });

    // Handle keyup for Cmd/Ctrl release
    document.addEventListener('keyup', (event) => {
      if (!event.metaKey && !event.ctrlKey && this.isInputModeActive) {
        this.deactivateInputMode();
      }
    });

    // Handle window blur to ensure input mode is deactivated
    window.addEventListener('blur', () => {
      if (this.isInputModeActive) {
        this.deactivateInputMode();
      }
    });
  }

  /**
   * Activate input mode for edge creation and modification
   */
  private activateInputMode(): void {
    this.isInputModeActive = true;
    
    // Add input-mode class to SVG for styling
    if (this.svg) {
      this.svg.classed('input-mode', true);
    }

    // Disable node dragging and zoom/translate
    this.disableNodeDragging();
    this.disableZoom();

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('input-mode-activated', {
      detail: { active: true }
    }));
  }

  /**
   * Deactivate input mode and restore normal behavior
   */
  private deactivateInputMode(): void {
    this.isInputModeActive = false;
    
    // Remove input-mode class from SVG
    if (this.svg) {
      this.svg.classed('input-mode', false);
    }

    // Clean up any temporary edge creation state
    this.cleanupEdgeCreation();

    // Re-enable node dragging and zoom/translate
    this.enableNodeDragging();
    this.enableZoom();

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('input-mode-deactivated', {
      detail: { active: false }
    }));
  }

  /**
   * Disable node dragging when in input mode
   */
  private disableNodeDragging(): void {
    if (this.svgNodes && this.colaLayout) {
      this.svgNodes.on('.drag', null);
    }
  }

  /**
   * Re-enable node dragging when exiting input mode
   */
  private enableNodeDragging(): void {
    if (this.svgNodes && this.colaLayout && this.colaLayout.drag) {
      const nodeDrag = this.colaLayout.drag();
      this.setupNodeDragHandlers(nodeDrag);
      this.svgNodes.call(nodeDrag);
    }
  }

  /**
   * Disable zoom/translate functionality when in input mode
   */
  private disableZoom(): void {
    if (this.svg && this.zoomBehavior) {
      // Store current transform before disabling
      this.storedTransform = d3.zoomTransform(this.svg.node());
      // Disable zoom events but preserve the behavior
      this.svg.on('.zoom', null);
    }
  }

  /**
   * Re-enable zoom/translate functionality when exiting input mode
   */
  private enableZoom(): void {
    if (this.svg && this.zoomBehavior) {
      // Re-enable zoom behavior
      this.svg.call(this.zoomBehavior);
      // Restore the previous transform if we had one
      if (this.storedTransform) {
        this.svg.call(this.zoomBehavior.transform, this.storedTransform);
      }
    }
  }

  /**
   * Zoom in by a fixed scale factor
   */
  private zoomIn(): void {
    if (this.svg && this.zoomBehavior) {
      this.svg.transition().duration(200).call(
        this.zoomBehavior.scaleBy, 1.5
      );
    }
  }

  /**
   * Zoom out by a fixed scale factor
   */
  private zoomOut(): void {
    if (this.svg && this.zoomBehavior) {
      this.svg.transition().duration(200).call(
        this.zoomBehavior.scaleBy, 1 / 1.5
      );
    }
  }

  /**
   * Update zoom control button states based on current zoom level
   */
  private updateZoomControlStates(): void {
    if (!this.svg || !this.zoomBehavior) return;

    const currentTransform = d3.zoomTransform(this.svg.node());
    const currentScale = currentTransform.k;
    const [minScale, maxScale] = this.zoomBehavior.scaleExtent();

    const zoomInButton = this.shadowRoot!.querySelector('#zoom-in') as HTMLButtonElement;
    const zoomOutButton = this.shadowRoot!.querySelector('#zoom-out') as HTMLButtonElement;

    if (zoomInButton) {
      zoomInButton.disabled = currentScale >= maxScale;
    }
    
    if (zoomOutButton) {
      zoomOutButton.disabled = currentScale <= minScale;
    }
  }

  /**
   * Clean up temporary edge creation state
   */
  private cleanupEdgeCreation(): void {
    // Remove temporary edge if it exists
    if (this.edgeCreationState.temporaryEdge) {
      this.edgeCreationState.temporaryEdge.remove();
    }

    // Reset edge creation state
    this.edgeCreationState = {
      isCreating: false,
      sourceNode: null,
      temporaryEdge: null
    };
  }

  /**
   * Setup drag handlers for nodes
   */
  private setupNodeDragHandlers(nodeDrag: any): void {
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
  }

  /**
   * Start edge creation from a source node
   */
  private startEdgeCreation(sourceNode: NodeWithMetadata): void {
    if (!this.isInputModeActive) return;

    // Clean up any existing edge creation
    this.cleanupEdgeCreation();

    // Set edge creation state
    this.edgeCreationState.isCreating = true;
    this.edgeCreationState.sourceNode = sourceNode;

    // Create temporary edge line
    this.edgeCreationState.temporaryEdge = this.container
      .append('line')
      .attr('class', 'temporary-edge')
      .attr('x1', sourceNode.x)
      .attr('y1', sourceNode.y)
      .attr('x2', sourceNode.x)
      .attr('y2', sourceNode.y)
      .attr('stroke', '#007bff')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7);

    // Add mousemove listener for temporary edge visualization
    this.svg.on('mousemove.edgecreation', () => {
      if (this.edgeCreationState.isCreating && this.edgeCreationState.temporaryEdge) {
        const [mouseX, mouseY] = d3.mouse(this.container.node());
        this.edgeCreationState.temporaryEdge
          .attr('x2', mouseX)
          .attr('y2', mouseY);
      }
    });
  }

  /**
   * Finish edge creation by connecting to a target node
   */
  private async finishEdgeCreation(targetNode: NodeWithMetadata): Promise<void> {
    if (!this.isInputModeActive || !this.edgeCreationState.isCreating || !this.edgeCreationState.sourceNode) {
      return;
    }

    const sourceNode = this.edgeCreationState.sourceNode;

    // Confirm self-loop edges
    if (sourceNode.id === targetNode.id) {
      const confirmSelfLoop = await this.showConfirmDialog(
        `Are you sure you want to create a self-loop edge on "${sourceNode.label || sourceNode.id}"?`
      );
      if (!confirmSelfLoop) {
        this.cleanupEdgeCreation();
        return;
      }
    }

    // Clean up temporary edge visualization
    this.svg.on('mousemove.edgecreation', null);

    // Show edge label input dialog
    await this.showEdgeLabelInput(sourceNode, targetNode);
  }

  /**
   * Show edge label input dialog and create the edge
   */
  private async showEdgeLabelInput(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata): Promise<void> {
    const label = await this.showPromptDialog(
      `Enter label for edge from "${sourceNode.label || sourceNode.id}" to "${targetNode.label || targetNode.id}":`,
      ''
    );
    
    if (label !== null) { // User didn't cancel
      await this.createNewEdge(sourceNode, targetNode, label || '');
    }

    // Clean up edge creation state
    this.cleanupEdgeCreation();
  }

  /**
   * Create a new edge between two nodes
   */
  private async createNewEdge(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata, label: string): Promise<void> {
    if (!this.currentLayout) return;

    // Find node indices in the current layout
    const sourceIndex = this.currentLayout.nodes.findIndex(node => node.id === sourceNode.id);
    const targetIndex = this.currentLayout.nodes.findIndex(node => node.id === targetNode.id);

    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('Could not find node indices for edge creation');
      return;
    }

    // Generate unique edge ID
    const edgeId = `edge_${sourceNode.id}_${targetNode.id}_${Date.now()}`;

    // Create new edge object
    const newEdge: EdgeWithMetadata = {
      id: edgeId,
      source: sourceIndex,
      target: targetIndex,
      label: label,
      relName: label,
      color: '#333',
      isUserCreated: true
    } as EdgeWithMetadata;

    // Add edge to current layout
    this.currentLayout.links.push(newEdge);

    // Update external state with the new edge
    await this.updateExternalStateForNewEdge(sourceNode, targetNode, label);

    // Dispatch event for external listeners
    this.dispatchEvent(new CustomEvent('edge-created', {
      detail: { 
        edge: newEdge,
        sourceNode: sourceNode,
        targetNode: targetNode
      }
    }));

    // Re-render the graph to show the new edge
    this.rerenderGraph();
  }

  /**
   * Update external state for a new edge through the external state management system
   * @param sourceNode - Source node of the edge
   * @param targetNode - Target node of the edge 
   * @param relationName - Name/label of the relation
   */
  private async updateExternalStateForNewEdge(sourceNode: NodeWithMetadata, targetNode: NodeWithMetadata, relationName: string): Promise<void> {
    if (!relationName.trim()) {
      return;
    }

    try {
      // Create a tuple representing the edge/relation
      const tuple: ITuple = {
        atoms: [sourceNode.id, targetNode.id],
        types: [sourceNode.type || 'untyped', targetNode.type || 'untyped']
      };

      console.log(`Dispatching edge creation request: ${relationName}(${sourceNode.id}, ${targetNode.id})`);
      
      // Dispatch edge creation event for React components to handle
      const edgeCreationEvent = new CustomEvent('edge-creation-requested', {
        detail: {
          relationId: relationName,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          tuple: tuple
        },
        bubbles: true
      });
      this.dispatchEvent(edgeCreationEvent);
    } catch (error) {
      console.error('Failed to update external state for new edge:', error);
    }
  }

  /**
   * Re-render the graph with current layout data
   */
  private rerenderGraph(): void {
    if (!this.currentLayout || !this.colaLayout) return;

    // Update links in the layout
    this.colaLayout.links(this.currentLayout.links);

    // Re-render links
    this.container.selectAll('.link-group').remove();
    this.renderLinks(this.currentLayout.links, this.colaLayout);

    // Restart the layout
    this.colaLayout.start();
  }

  /**
   * Edit the label of an existing edge
   */
  private async editEdgeLabel(edgeData: EdgeWithMetadata): Promise<void> {
    if (!this.isInputModeActive) return;

    const currentLabel = edgeData.label || edgeData.relName || '';
    const newLabel = await this.showPromptDialog(`Edit edge label:`, currentLabel);
    
    if (newLabel !== null && newLabel !== currentLabel) {
      // Get source and target nodes for data instance update
      const sourceNode = this.getNodeFromEdge(edgeData, 'source');
      const targetNode = this.getNodeFromEdge(edgeData, 'target');

      // Update external state if available
      await this.updateExternalStateForEdgeModification(sourceNode, targetNode, currentLabel, newLabel);

      // Update edge data
      edgeData.label = newLabel;
      edgeData.relName = newLabel;

      // Dispatch event for external listeners
      this.dispatchEvent(new CustomEvent('edge-modified', {
        detail: { 
          edge: edgeData,
          oldLabel: currentLabel,
          newLabel: newLabel
        }
      }));

      // Re-render to show updated label
      this.rerenderGraph();
    }
  }

  /**
   * Get node from edge data based on source or target
   * @param edgeData - Edge data
   * @param position - 'source' or 'target'
   * @returns Node data or null
   */
  private getNodeFromEdge(edgeData: EdgeWithMetadata, position: 'source' | 'target'): NodeWithMetadata | null {
    if (!this.currentLayout) return null;
    
    const nodeIndex = typeof edgeData[position] === 'number' ? edgeData[position] : edgeData[position].index;
    return this.currentLayout.nodes[nodeIndex] || null;
  }

  /**
   * Update external state for an edge modification through the external state management system
   * @param sourceNode - Source node of the edge
   * @param targetNode - Target node of the edge 
   * @param oldRelationName - Old relation name/label
   * @param newRelationName - New relation name/label
   */
  private async updateExternalStateForEdgeModification(
    sourceNode: NodeWithMetadata | null, 
    targetNode: NodeWithMetadata | null, 
    oldRelationName: string, 
    newRelationName: string
  ): Promise<void> {
    if (!sourceNode || !targetNode) {
      return;
    }

    try {
      // Create tuple for the relation
      const tuple: ITuple = {
        atoms: [sourceNode.id, targetNode.id],
        types: [sourceNode.type || 'untyped', targetNode.type || 'untyped']
      };

      console.log(`Dispatching edge modification request: ${oldRelationName} -> ${newRelationName}`);

      // Dispatch edge modification event for React components to handle
      const edgeModificationEvent = new CustomEvent('edge-modification-requested', {
        detail: {
          oldRelationId: oldRelationName,
          newRelationId: newRelationName,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          tuple: tuple
        },
        bubbles: true
      });
      this.dispatchEvent(edgeModificationEvent);
    } catch (error) {
      console.error('Failed to update external state for edge modification:', error);
    }
  }

  /**
   * Render layout using WebCola constraint solver
   * @param instanceLayout - The layout instance to render
   * @param inputDataInstance - Optional input data instance for edge modifications
   */
  public async renderLayout(instanceLayout: InstanceLayout): Promise<void> {

    if (! isInstanceLayout(instanceLayout)) {
      throw new Error('Invalid instance layout provided. Expected an InstanceLayout instance.');
    }

    // Reset zoom transform to identity on each render for a fresh start
    if (this.svg && this.zoomBehavior && d3) {
      try {
        const identity = d3.zoomIdentity;
        this.svg.call(this.zoomBehavior.transform, identity);
      } catch (error) {
        console.warn('Failed to reset zoom transform:', error);
      }
    }

    try {

      // Check if D3 and WebCola are available
      if (!d3) {
        throw new Error('D3 library not available. Please ensure D3 v4 is loaded from CDN.');
      }
      if (!cola) {
        if(!window.cola) {

          throw new Error('WebCola library not available. Please ensure vendor/cola.js is loaded.');
        }
        cola = window.cola;
      }

      // Ensure D3 and container are properly initialized
      if (!this.container || !this.svg) {

        this.initializeD3();
      }
      
      // Double-check that container is now available
      if (!this.container) {
        throw new Error('Failed to initialize D3 container. SVG elements may not be available.');
      }

      this.showLoading();
      this.updateLoadingProgress('Translating layout...');

      // Get actual container dimensions for responsive layout
      const svgContainer = this.shadowRoot!.querySelector('#svg-container') as HTMLElement;
      const containerRect = svgContainer.getBoundingClientRect();
      const containerWidth = containerRect.width || 800; // fallback to default
      const containerHeight = containerRect.height || 600; // fallback to default

      // Translate to WebCola format with actual container dimensions
      const translator = new WebColaTranslator();
      const webcolaLayout = await translator.translate(instanceLayout, containerWidth, containerHeight);

      this.updateLoadingProgress(`Computing layout for ${webcolaLayout.nodes.length} nodes...`);

      // Adaptive iteration counts based on graph size for better performance
      // For small graphs, use default values. For large graphs, reduce iterations.
      const nodeCount = webcolaLayout.nodes.length;
      let unconstrainedIters = WebColaCnDGraph.INITIAL_UNCONSTRAINED_ITERATIONS;
      let userConstraintIters = WebColaCnDGraph.INITIAL_USER_CONSTRAINT_ITERATIONS;
      let allConstraintIters = WebColaCnDGraph.INITIAL_ALL_CONSTRAINTS_ITERATIONS;
      
      if (nodeCount > 100) {
        // For large graphs (>100 nodes), reduce iterations more aggressively
        unconstrainedIters = Math.max(5, Math.floor(unconstrainedIters * 0.5));
        userConstraintIters = Math.max(25, Math.floor(userConstraintIters * 0.5));
        allConstraintIters = Math.max(100, Math.floor(allConstraintIters * 0.5));
      } else if (nodeCount > 50) {
        // For medium graphs (>50 nodes), reduce iterations moderately
        unconstrainedIters = Math.max(8, Math.floor(unconstrainedIters * 0.8));
        userConstraintIters = Math.max(40, Math.floor(userConstraintIters * 0.8));
        allConstraintIters = Math.max(150, Math.floor(allConstraintIters * 0.75));
      }


      // Get scaled constraints and link length
      const { scaledConstraints, linkLength, groupCompactness } = this.getScaledDetails(webcolaLayout.constraints, DEFAULT_SCALE_FACTOR, webcolaLayout.nodes);

      this.updateLoadingProgress('Applying constraints and initializing...');

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

      // Track iteration progress
      let tickCount = 0;
      const totalIterations = unconstrainedIters + userConstraintIters + allConstraintIters;

      // Start the layout with specific iteration counts and proper event handling
      layout
        .on('tick', () => {
          tickCount++;
          if (tickCount % 20 === 0) {
            // Update progress every 20 ticks to avoid excessive DOM updates
            const progress = Math.min(95, Math.round((tickCount / totalIterations) * 100));
            this.updateLoadingProgress(`Computing layout... ${progress}%`);
          }
          
          if (this.layoutFormat === 'default' || !this.layoutFormat || this.layoutFormat === null) {
            this.updatePositions();
          } else if (this.layoutFormat === 'grid') {
            this.gridUpdatePositions();
          } else {
            console.warn(`Unknown layout format: ${this.layoutFormat}. Skipping position updates.`);
          }
        })
        .on('end', () => {
          this.updateLoadingProgress('Finalizing...');

          // Call advanced edge routing after layout converges
          if (this.layoutFormat === 'default' || !this.layoutFormat ) {
            this.routeEdges();
          } else if (this.layoutFormat === 'grid') {
            this.gridify(10, 25, 10);
          } else {
            console.warn(`Unknown layout format: ${this.layoutFormat}. Skipping edge routing.`);
          }

          // Check if it's an unsat core layout
          if (this.isUnsatCore) {
            this.showErrorIcon();
          }

          // Dispatch relations-available event after layout is complete
          this.dispatchRelationsAvailableEvent();

          this.hideLoading();
        });

      // Start the layout with error handling for D3/WebCola compatibility issues
      try {
        layout.start(
          unconstrainedIters,
          userConstraintIters,
          allConstraintIters,
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
   * Add a control element to the graph toolbar
   * @param element - The HTML element to add to the toolbar
   */
  public addToolbarControl(element: any): void {
    const toolbar = this.shadowRoot?.querySelector('#graph-toolbar');
    if (toolbar) {
      toolbar.appendChild(element);
    }
  }

  /**
   * Get the graph toolbar element for more advanced control manipulation
   * @returns The toolbar element or null if not found
   */
  public getToolbar(): any {
    return this.shadowRoot?.querySelector('#graph-toolbar') || null;
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
        return "url(#end-arrow)";
      })
      .attr("marker-start", (d: any) => {
        // Add marker-start for bidirectional edges
        if (this.isAlignmentEdge(d) || !d.bidirectional) return "none";
        return  "url(#start-arrow)";
      })
      .on('click.inputmode', (d: any) => {
        if (this.isInputModeActive && !this.isAlignmentEdge(d)) {
          d3.event.stopPropagation();
          // Handle async operation without blocking the event
          this.editEdgeLabel(d).catch(error => {
            console.error('Error editing edge label:', error);
          });
        }
      })
      .style('cursor', () => {
        return this.isInputModeActive ? 'pointer' : 'default';
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
      //.attr("font-size", "8px")
      //.attr("fill", "#555")
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
        if (this.isDisconnectedGroup(d))
          return "disconnectedNode"
        else if (this.isErrorGroup(d)) {
          return "error-group";
        } else {
          return "group";
        }
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
    this.setupNodeDragHandlers(nodeDrag);

    const nodeSelection = this.container
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", (d: any) => {
        const baseClass = this.isErrorNode(d) ? "error-node" : "node";
        if (this.isErrorNode(d) && this.isSmallNode(d)) {
          return baseClass + " small-error-node";
        }
        return baseClass;
      })
      .call(nodeDrag)
      .on('mousedown.inputmode', (d: any) => {
        if (this.isInputModeActive) {
          d3.event.stopPropagation();
          this.startEdgeCreation(d);
        }
      })
      .on('mouseup.inputmode', (d: any) => {
        if (this.isInputModeActive && this.edgeCreationState.isCreating) {
          d3.event.stopPropagation();
          // Handle async operation without blocking the event
          this.finishEdgeCreation(d).catch(error => {
            console.error('Error finishing edge creation:', error);
          });
        }
      })
    // Show tooltip with node ID only when not in input mode
      .on('mouseover', function(d: any) {
          d3.select(this)
            .append('title')
            .attr('class', 'node-tooltip')
            .text(`ID: ${d.id}`);
        
      })
      .on('mouseout', function() {
        d3.select(this).select('title.node-tooltip').remove();
      });

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
   * Gets a canvas context for text measurement
   */
  private getTextMeasurementContext(): CanvasRenderingContext2D {
    if (!this.textMeasurementCanvas) {
      this.textMeasurementCanvas = document.createElement('canvas');
    }
    return this.textMeasurementCanvas.getContext('2d')!;
  }

  /**
   * Measures the width of text at a given font size
   */
  private measureTextWidth(text: string, fontSize: number, fontFamily: string = 'system-ui'): number {
    const context = this.getTextMeasurementContext();
    context.font = `${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  }

  /**
   * Calculates the optimal font size to fit text within given dimensions
   */
  private calculateOptimalFontSize(
    text: string, 
    maxWidth: number, 
    maxHeight: number, 
    fontFamily: string = 'system-ui'
  ): number {
    let fontSize = WebColaCnDGraph.DEFAULT_FONT_SIZE;
    
    // Start with default size and scale down if needed
    while (fontSize > WebColaCnDGraph.MIN_FONT_SIZE) {
      const textWidth = this.measureTextWidth(text, fontSize, fontFamily);
      const lineHeight = fontSize * WebColaCnDGraph.LINE_HEIGHT_RATIO;
      
      if (textWidth <= maxWidth && lineHeight <= maxHeight) {
        break;
      }
      
      fontSize -= 0.5;
    }
    
    // Scale up if there's room
    while (fontSize < WebColaCnDGraph.MAX_FONT_SIZE) {
      const testSize = fontSize + 0.5;
      const textWidth = this.measureTextWidth(text, testSize, fontFamily);
      const lineHeight = testSize * WebColaCnDGraph.LINE_HEIGHT_RATIO;
      
      if (textWidth > maxWidth || lineHeight > maxHeight) {
        break;
      }
      
      fontSize = testSize;
    }
    
    return Math.max(WebColaCnDGraph.MIN_FONT_SIZE, Math.min(fontSize, WebColaCnDGraph.MAX_FONT_SIZE));
  }

  /**
   * Wraps text to fit within given width, returning array of lines
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, fontFamily: string = 'system-ui'): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const lineWidth = this.measureTextWidth(testLine, fontSize, fontFamily);
      
      if (lineWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is too long for the line, we'll have to break it
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }



  /**
   * Creates main node labels with attributes using dynamic sizing and expansion
   */
  private setupNodeLabelsWithDynamicSizing(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    nodeSelection
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-family", "system-ui")
      .attr("fill", "black")
      .each((d: any, i: number, nodes: SVGTextElement[]) => {
        if (this.isHiddenNode(d)) {
          return;
        }

        const shouldShowLabels = d.showLabels;
        if (!shouldShowLabels) {
          return;
        }

        const textElement = d3.select(nodes[i]);
        const nodeWidth = d.width || 100;
        const nodeHeight = d.height || 60;
        const maxTextWidth = nodeWidth - WebColaCnDGraph.TEXT_PADDING * 2;
        const maxTextHeight = nodeHeight - WebColaCnDGraph.TEXT_PADDING * 2;
        
        const displayLabel = d.label || d.name || d.id || "Node";
        const attributes = d.attributes || {};
        const attributeEntries = Object.entries(attributes);
        
        // Allocate space: prioritize main label, but allow attributes to use remaining space
        // If there are attributes, reserve some space for them
        const hasAttributes = attributeEntries.length > 0;
        const mainLabelMaxHeight = hasAttributes ? maxTextHeight * 0.6 : maxTextHeight;
        
        // Calculate font size based on available space (for consistency across similar-sized nodes)
        // Use a representative text length for sizing rather than the actual text
        // This ensures nodes of similar size have consistent font sizes
        const representativeText = "SampleText"; // Standard length for sizing
        const mainLabelFontSize = this.calculateOptimalFontSize(
          representativeText,
          maxTextWidth,
          mainLabelMaxHeight,
          'system-ui'
        );
        
        textElement.attr("font-size", `${mainLabelFontSize}px`);
        
        // Add main name label on a single line
        const lineHeight = mainLabelFontSize * WebColaCnDGraph.LINE_HEIGHT_RATIO;
        
        textElement
          .append("tspan")
          .attr("x", 0)
          .attr("dy", "0em")
          .style("font-weight", "bold")
          .style("font-size", `${mainLabelFontSize}px`)
          .text(displayLabel);

        // Handle attributes (show all that fit)
        if (hasAttributes) {
          const remainingHeight = maxTextHeight - lineHeight;
          
          // Calculate font size based on available space for consistency
          const attributeFontSize = this.calculateOptimalFontSize(
            representativeText,
            maxTextWidth,
            remainingHeight / attributeEntries.length,
            'system-ui'
          );
          
          for (let i = 0; i < attributeEntries.length; i++) {
            const [key, value] = attributeEntries[i];
            const attributeText = `${key}: ${value}`;
            
            textElement
              .append("tspan")
              .attr("x", 0)
              .attr("dy", `${attributeFontSize * WebColaCnDGraph.LINE_HEIGHT_RATIO}px`)
              .style("font-size", `${attributeFontSize}px`)
              .text(attributeText);
          }
        }
      });
  }

  /**
   * Creates main node labels with attributes using tspan elements.
   * Handles conditional label display and multi-line attribute rendering.
   * 
   * @param nodeSelection - D3 selection of node groups
   */
  private setupNodeLabels(nodeSelection: d3.Selection<SVGGElement, any, any, unknown>): void {
    // Use the new dynamic sizing implementation
    this.setupNodeLabelsWithDynamicSizing(nodeSelection);
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
        return 'url(#end-arrow)';
      })
      .attr('marker-start', (d: EdgeWithMetadata) => {
        // Add marker-start for bidirectional edges
        if (this.isAlignmentEdge(d) || !d.bidirectional) return 'none';
        return 'url(#start-arrow)';
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
        return d.bounds.y + 5; // Slight padding from top
      })
      .attr('text-anchor', 'middle')
      .lower();

    // Ensure proper layering - raise important elements
    this.svgLinkGroups.selectAll('marker').raise();
    this.svgLinkGroups.selectAll('.linklabel').raise();
    this.svgGroups.selectAll('.error-group').raise();
    this.svgNodes.selectAll('.error-node').raise();
  }

  private gridUpdatePositions() {

    
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
   * Update the positions of edge markers (clickable circles at endpoints)
   */
  private routeEdges(): void {
    try {
      // Prepare edge routing with margin
      if (typeof (this.colaLayout as any)?.prepareEdgeRouting === 'function') {
        (this.colaLayout as any).prepareEdgeRouting(
          WebColaCnDGraph.VIEWBOX_PADDING / WebColaCnDGraph.EDGE_ROUTE_MARGIN_DIVISOR
        );
      }



      // Route all link paths with advanced logic
      this.routeLinkPaths(); 

      // Update link labels with proper positioning
      this.updateLinkLabelsAfterRouting();

      // Auto-fit viewport to content
      this.fitViewportToContent();
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

      // Dispatch event that relations are available
      this.dispatchEvent(new Event('relationsAvailable', ));

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

  }

  /**
   * Fits the viewport to show all content with padding.
   * Uses manual calculation of bounds from all nodes and edges to ensure complete coverage.
   */
  private fitViewportToContent(): void {
    const svgElement = this.svg.node();
    if (!svgElement) return;

    // First try to get bounds from manual calculation of all elements
    const manualBounds = this.calculateContentBounds();
    
    // Fallback to SVG getBBox if manual calculation fails
    const bbox = manualBounds || svgElement.getBBox();
    const padding = WebColaCnDGraph.VIEWBOX_PADDING;
    
    // Calculate smart bottom padding based on bottom-most node
    let extraBottomPadding = 50; // Default fallback
    if (this.currentLayout?.nodes) {
      const bottomNode = this.currentLayout.nodes.reduce((bottom: any, node: any) => {
        if (typeof node.x === 'number' && typeof node.y === 'number') {
          const nodeBottom = node.y + (node.height || 0);
          const currentBottom = bottom ? (bottom.y + (bottom.height || 0)) : -Infinity;
          return nodeBottom > currentBottom ? node : bottom;
        }
        return bottom;
      }, null);
      
      if (bottomNode && bottomNode.height) {
        extraBottomPadding = Math.min(50, bottomNode.height / 1.5);
      }
    }

    const viewBox = [
      bbox.x - padding,
      bbox.y - padding,
      bbox.width + 2 * padding,
      bbox.height + 2 * padding + extraBottomPadding
    ].join(' ');



    this.svg.attr('viewBox', viewBox);
  }

  /**
   * Manually calculates the bounding box of all content to ensure accurate viewport fitting.
   * This method examines all nodes, edges, and groups to determine the true content bounds.
   * @returns Bounding box with x, y, width, height properties or null if calculation fails
   */
  private calculateContentBounds(): { x: number; y: number; width: number; height: number } | null {
    try {
      if (!this.currentLayout || !this.container) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Check all nodes
      const nodes = this.currentLayout.nodes;
      if (nodes && nodes.length > 0) {
        
        nodes.forEach((node: NodeWithMetadata, index: number) => {
          if (typeof node.x === 'number' && typeof node.y === 'number') {
            const nodeWidth = node.width || 0;
            const nodeHeight = node.height || 0;
            
            // Calculate node bounds (nodes are positioned from top-left)
            const nodeMinX = node.x;
            const nodeMaxX = node.x + nodeWidth;
            const nodeMinY = node.y;
            const nodeMaxY = node.y + nodeHeight;


            const prevMinY = minY;
            const prevMaxY = maxY;
            
            minX = Math.min(minX, nodeMinX);
            maxX = Math.max(maxX, nodeMaxX);
            minY = Math.min(minY, nodeMinY);
            maxY = Math.max(maxY, nodeMaxY);
          }
        });
        
        // Find and log the node with the highest Y (bottom-most)
        const bottomMostNode = nodes.reduce((bottom, node) => {
          if (typeof node.x === 'number' && typeof node.y === 'number') {
            const nodeBottom = node.y + (node.height || 0);
            const currentBottom = bottom ? (bottom.y + (bottom.height || 0)) : -Infinity;
            return nodeBottom > currentBottom ? node : bottom;
          }
          return bottom;
        }, null as NodeWithMetadata | null);
      }

      // Check all edge paths by examining actual DOM elements
      const linkGroups = this.container.selectAll('.link-group');
      if (!linkGroups.empty()) {
        linkGroups.each(function(this: SVGGElement) {
          try {
            const bbox = this.getBBox();
            if (bbox.width > 0 && bbox.height > 0) {
              minX = Math.min(minX, bbox.x);
              maxX = Math.max(maxX, bbox.x + bbox.width);
              minY = Math.min(minY, bbox.y);
              maxY = Math.max(maxY, bbox.y + bbox.height);
            }
          } catch (e) {
            // Skip elements that can't provide bbox
          }
        });
      }

      // Check all node groups by examining actual DOM elements
      const nodeGroups = this.container.selectAll('.node, .error-node');
      if (!nodeGroups.empty()) {
        nodeGroups.each(function(this: SVGGElement) {
          try {
            const bbox = this.getBBox();
            if (bbox.width > 0 && bbox.height > 0) {
              minX = Math.min(minX, bbox.x);
              maxX = Math.max(maxX, bbox.x + bbox.width);
              minY = Math.min(minY, bbox.y);
              maxY = Math.max(maxY, bbox.y + bbox.height);
            }
          } catch (e) {
            // Skip elements that can't provide bbox
          }
        });
      }

      // Check all text elements separately for better text bounds calculation
      const textElements = this.container.selectAll('text');
      if (!textElements.empty()) {
        let textBoundsFound = 0;
        
        textElements.each(function(this: SVGTextElement) {
          try {
            const bbox = this.getBBox();
            if (bbox.width > 0 && bbox.height > 0) {
              textBoundsFound++;
              
              // Add extra padding for text elements due to font metrics
              const textPadding = 5;
              const textMinY = bbox.y - textPadding;
              const textMaxY = bbox.y + bbox.height + textPadding;
              
              // Log text elements that might extend the bottom boundary

              
              const prevMaxY = maxY;
              
              minX = Math.min(minX, bbox.x - textPadding);
              maxX = Math.max(maxX, bbox.x + bbox.width + textPadding);
              minY = Math.min(minY, textMinY);
              maxY = Math.max(maxY, textMaxY);
              


            }
          } catch (e) {
            // Skip elements that can't provide bbox
          }
        });
        

      }

      // Check for any group elements
      const groupElements = this.container.selectAll('.group');
      if (!groupElements.empty()) {
        groupElements.each(function(this: SVGGElement) {
          try {
            const bbox = this.getBBox();
            if (bbox.width > 0 && bbox.height > 0) {
              minX = Math.min(minX, bbox.x);
              maxX = Math.max(maxX, bbox.x + bbox.width);
              minY = Math.min(minY, bbox.y);
              maxY = Math.max(maxY, bbox.y + bbox.height);
            }
          } catch (e) {
            // Skip elements that can't provide bbox
          }
        });
      }

      // Return null if no valid bounds were found
      if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
        console.warn('Could not calculate content bounds - no valid elements found');
        return null;
      }

      const bounds = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
      
      return bounds;

    } catch (error) {
      console.error('Error calculating content bounds:', error);
      return null;
    }
  }

  /**
   * Dispatches a custom event when relations become available after layout rendering.
   * Includes all available relations in the event detail for external listeners.
   * 
   * @private
   */
  private dispatchRelationsAvailableEvent(): void {
    // Get all available relations
    const relations = this.getAllRelations();
    
    // Create custom event with comprehensive details
    const event = new CustomEvent('relations-available', {
      detail: {
        relations: relations,           // Yes, include all relations
        count: relations.length,        // Convenient count property
        timestamp: Date.now(),          // When the event was created
        graphId: this.id || 'unknown'   // Which graph instance
      },
      bubbles: true,    // Allow event to bubble up the DOM tree
      cancelable: true  // Allow event to be cancelled by listeners
    });

    // Dispatch the event from this element
    this.dispatchEvent(event);
    
    // console.log('🎯 Dispatched relations-available event:', {
    //   relations,
    //   count: relations.length
    // });
  }

  /** Public API for relation highlighting */

  /**
   * Gets all unique relation names from the current layout.
   * @returns An array of the set of relation names in the current layout.
   */
  public getAllRelations(): string[] {
    if (!this.currentLayout?.links) return [];

    const relNames = new Set(
      this.currentLayout.links
        .filter((edge: any) => !this.isAlignmentEdge(edge))
        .map((edge: any) => edge.relName)
        .filter(Boolean)
    );

    return Array.from(relNames);
  }

  /**
   * Highlights all the links or inferred links by its relation name.
   * @param relName - The name of the relation to highlight
   * @returns True if the relation was successfully highlighted, false otherwise
   */
  public highlightRelation(relName: string): boolean {
    if (!this.currentLayout?.links) return false;

    (this.svgLinkGroups as d3.Selection<SVGGElement, any, any, unknown>)
      .filter((d) => d.relName === relName && !this.isAlignmentEdge(d))
      .selectAll('path')
      .classed('highlighted', true);
    
    return true;
  }

  /**
   * Clears highlighting of the given relation name.
   * @param relName - The name of the relation to clear highlighting for
   * @returns True if the relation highlighting was successfully cleared, false otherwise
   */
  public clearHighlightRelation(relName: string): boolean {
    if (!this.currentLayout?.links) return false;

    (this.svgLinkGroups as d3.Selection<SVGGElement, any, any, unknown>)
      .filter((d) => d.relName === relName && !this.isAlignmentEdge(d))
      .selectAll('path')
      .classed('highlighted', false);
    
    return true;
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
        position: relative; /* Make this the positioning context for zoom controls */
        width: 100%;
        height: 100%;
        border: 1px solid #ccc;
        overflow: hidden;
      }
      
      /* Make SVG fill the container completely */
      svg {
        width: 100%;          /* Fill container width */
        height: 100%;         /* Fill container height */
        display: block;       /* Remove inline spacing */
        cursor: grab;
      }
      
      svg:active {
        cursor: grabbing;
      }
      
      .node rect {
        cursor: move;
      }

      .error-node rect, .error-group {
        stroke-width: 2px;
        stroke-dasharray: 5 5;
        animation: dash 1s linear infinite;
      }

      /* Enhanced visibility for small error nodes */
      .small-error-node rect {
        stroke-width: 4px !important; /* Thicker stroke for visibility */
        stroke-dasharray: 8 4 !important; /* Larger dash pattern */
        animation: dash 1s linear infinite, pulse-bg 2s ease-in-out infinite !important;
        fill: rgba(225, 112, 46, 0.46) !important; /* Light reddish background */
      }

      @keyframes dash {
        to {
          stroke-dashoffset: -10;
        }
      }

      /* Pulsing background animation for small error nodes */
      @keyframes pulse-bg {
        0%, 100% { 
          fill-opacity: 0.15; 
        }
        50% { 
          fill-opacity: 0.55; 
        }
      }
      
      .link {
        stroke-width: 1px;
        fill: none;
        marker-end: url(#end-arrow);
      }
      
      .inferredLink {
        stroke-width: 1.5px;
        fill: none;
        marker-end: url(#end-arrow);
      }


    .alignmentLink {
            stroke: transparent !important;    /* make the stroke invisible */
            stroke-width: 0 !important;        /* ensure no visible thickness */
            stroke-opacity: 0 !important;      /* defensive */
            fill: none !important;
            pointer-events: none !important;   /* don't block mouse events */
          }


      .link.highlighted {
        stroke: black; /* Change this to your desired highlight color */
        stroke-width: 3px; /* Change this to your desired highlight width */
      }

      .inferredLink.highlighted {
        stroke:#666666; /* Change this to your desired highlight color */
        stroke-width: 3px; /* Change this to your desired highlight width */
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
        font-size: 12px;
        fill: #161616ff;
        pointer-events: none;
        font-family: system-ui;
        stroke: white; /* Add white shadow */
        stroke-width: 0.2px; /* Reduced thickness of the shadow */
        stroke-opacity: 0.7; /* Added opacity to make the shadow less intense */
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

      /* Input mode styles */
      svg.input-mode {
        cursor: crosshair !important;
      }

      svg.input-mode .node rect {
        cursor: crosshair !important;
      }

      svg.input-mode:active {
        cursor: crosshair !important;
      }

      .temporary-edge {
        pointer-events: none;
        z-index: 1000;
      }

      svg.input-mode .link {
        cursor: pointer;
      }

      svg.input-mode .link:hover {
        opacity: 0.8;
      }

      /* Error icon positioning - bottom area to avoid header overlap */
      #error-icon {
        margin: 5px;
        padding: 8px 12px;
        font-size: 16px;
        position: absolute;
        bottom: 10px; /* Position at bottom instead of top */
        left: 10px;
        z-index: 1000;
        cursor: help;
        background-color: rgba(220, 53, 69, 0.95);
        color: white;
        border-radius: 6px;
        border: none;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
        visibility: hidden; /* Use visibility instead of display */
      }
      
      #error-icon.visible {
        visibility: visible;
      }

      #error-icon::before {
        content: "⚠️";
        font-size: 18px;
      }

      /* Graph toolbar styling */
      #graph-toolbar {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 6px;
        margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(4px);
      }

      /* Zoom controls styling */
      #zoom-controls {
        display: flex;
        flex-direction: row;
        gap: 4px;
        align-items: center;
      }

      #zoom-controls button {
        width: 24px;
        height: 24px;
        border: 1px solid #d1d5db;
        background: #f9fafb;
        color: #374151;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        user-select: none;
        line-height: 1;
      }

      #zoom-controls button:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
        color: #111827;
      }

      #zoom-controls button:active {
        background: #e5e7eb;
        border-color: #6b7280;
        transform: translateY(0.5px);
      }

      #zoom-controls button:disabled {
        background: #f9fafb;
        border-color: #e5e7eb;
        color: #9ca3af;
        cursor: not-allowed;
      }

      #zoom-controls button:disabled:hover {
        background: #f9fafb;
        border-color: #e5e7eb;
        color: #9ca3af;
        transform: none;
      }

      /* Modal Overlay and Dialog */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
      }

      .modal-dialog {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
      }

      .modal-header {
        margin-bottom: 16px;
      }

      .modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
      }

      .modal-body {
        margin-bottom: 20px;
      }

      .modal-message {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: #555;
        line-height: 1.5;
      }

      .modal-input {
        width: 100%;
        padding: 8px 12px;
        border: 2px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }

      .modal-input:focus {
        outline: none;
        border-color: #007acc;
      }

      .modal-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .modal-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .modal-button.primary {
        background: #007acc;
        color: white;
      }

      .modal-button.primary:hover {
        background: #005fa3;
      }

      .modal-button.secondary {
        background: #f8f9fa;
        color: #666;
        border: 1px solid #ddd;
      }

      .modal-button.secondary:hover {
        background: #e9ecef;
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
    loading.style.display = 'flex';
    loading.style.justifyContent = 'center';
    loading.style.alignItems = 'center';
    loading.style.position = 'absolute';
    loading.style.top = '50%';
    loading.style.left = '50%';
    loading.style.transform = 'translate(-50%, -50%)';
    loading.style.zIndex = '1000';
    error.style.display = 'none';
  }

  /**
   * Update loading progress message
   */
  private updateLoadingProgress(message: string): void {
    const progressEl = this.shadowRoot!.querySelector('#loading-progress') as HTMLElement;
    if (progressEl) {
      progressEl.textContent = message;
    }
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

  /**
   * Show error icon
   */
  private showErrorIcon(): void {
    const errorIcon = this.shadowRoot!.querySelector('#error-icon') as HTMLElement;
    errorIcon.classList.add('visible');
  }

  /**
   * Hide error icon
   */
  private hideErrorIcon(): void {
    const errorIcon = this.shadowRoot!.querySelector('#error-icon') as HTMLElement;
    errorIcon.classList.remove('visible');
  }

  // =========================================
  // MODAL DIALOG METHODS
  // =========================================

  /**
   * Show a confirmation dialog
   */
  private showConfirmDialog(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      overlay.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Confirm Action</h3>
          </div>
          <div class="modal-body">
            <p class="modal-message">${message}</p>
          </div>
          <div class="modal-footer">
            <button class="modal-button secondary" data-action="cancel">Cancel</button>
            <button class="modal-button primary" data-action="confirm">Confirm</button>
          </div>
        </div>
      `;

      // Add event listeners
      overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('modal-overlay')) {
          // Clicked outside dialog
          this.shadowRoot!.removeChild(overlay);
          resolve(false);
        } else if (target.dataset.action === 'cancel') {
          this.shadowRoot!.removeChild(overlay);
          resolve(false);
        } else if (target.dataset.action === 'confirm') {
          this.shadowRoot!.removeChild(overlay);
          resolve(true);
        }
      });

      // Handle escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          this.shadowRoot!.removeChild(overlay);
          document.removeEventListener('keydown', handleKeydown);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      this.shadowRoot!.appendChild(overlay);
      
      // Focus the confirm button
      const confirmBtn = overlay.querySelector('[data-action="confirm"]') as HTMLButtonElement;
      confirmBtn?.focus();
    });
  }

  /**
   * Show a prompt dialog for text input
   */
  private showPromptDialog(message: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';

      overlay.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Input Required</h3>
          </div>
          <div class="modal-body">
            <p class="modal-message">${message}</p>
            <input type="text" class="modal-input" value="${defaultValue}" placeholder="Enter text...">
          </div>
          <div class="modal-footer">
            <button class="modal-button secondary" data-action="cancel">Cancel</button>
            <button class="modal-button primary" data-action="ok">OK</button>
          </div>
        </div>
      `;

      const input = overlay.querySelector('.modal-input') as HTMLInputElement;

      // Add event listeners
      overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('modal-overlay')) {
          // Clicked outside dialog
          this.shadowRoot!.removeChild(overlay);
          resolve(null);
        } else if (target.dataset.action === 'cancel') {
          this.shadowRoot!.removeChild(overlay);
          resolve(null);
        } else if (target.dataset.action === 'ok') {
          const value = input.value;
          this.shadowRoot!.removeChild(overlay);
          resolve(value);
        }
      });

      // Handle enter and escape keys
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          const value = input.value;
          this.shadowRoot!.removeChild(overlay);
          document.removeEventListener('keydown', handleKeydown);
          resolve(value);
        } else if (e.key === 'Escape') {
          this.shadowRoot!.removeChild(overlay);
          document.removeEventListener('keydown', handleKeydown);
          resolve(null);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      this.shadowRoot!.appendChild(overlay);
      
      // Focus and select the input
      input.focus();
      input.select();
    });
  }

  // =========================================
  // EVENT-BASED STATE INTEGRATION API
  // =========================================

}

// Register the custom element only in browser environments
if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  customElements.define('webcola-cnd-graph', WebColaCnDGraph);
}