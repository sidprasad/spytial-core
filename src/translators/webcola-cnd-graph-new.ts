/**
 * WebColaCnDGraph - Custom HTML Element for rendering CND layouts with WebCola
 * 
 * This element takes an InstanceLayout as input, translates it to WebCola format,
 * and uses the full WebCola constraint solver with D3.js for interactive visualization.
 * 
 * Usage:
 * <webcola-cnd-graph width="800" height="600"></webcola-cnd-graph>
 * 
 * Then call: element.renderLayout(instanceLayout)
 */

import { InstanceLayout } from '../layout/interfaces';
import { WebColaLayout, NodeWithMetadata, EdgeWithMetadata } from './webcolatranslator';
import * as cola from 'webcola';
import * as d3 from 'd3';

// Constants from webcolasiderenderer.js
const initialUnconstrainedIterations = 10;
const initialUserConstraintIterations = 100; 
const initialAllConstraintsIterations = 1000;
const gridSnapIterations = 5;
const margin = 10;

/**
 * Check if an edge is inferred (helper edge)
 */
function isInferredEdge(edge: any): boolean {
  const helperPrefix = "_inferred_";
  return edge.id.includes(helperPrefix);
}

/**
 * Check if an edge is a group edge
 */
function isGroupEdge(edge: any): boolean {
  const groupPrefix = "_g_";
  return edge.id.startsWith(groupPrefix);
}

/**
 * Check if an edge is an alignment edge
 */
function isAlignmentEdge(edge: any): boolean {
  return edge.id.startsWith("_alignment_");
}

/**
 * Adjust constraints and link lengths based on scale factor
 */
function adjustLinkLengthsAndSeparationConstraintsToScaleFactor(constraints: any[], scaleFactor: number) {
  const adjustedScaleFactor = scaleFactor / 5;
  const min_sep = 150;
  const default_node_width = 100;
  const linkLength = (min_sep + default_node_width) / adjustedScaleFactor;

  const getScaledConstraints = (constraints: any[]) => {
    return constraints.map(constraint => {
      if (constraint.type === "separation" && typeof constraint.gap === "number") {
        const oldgap = constraint.gap;
        const newgap = oldgap / adjustedScaleFactor;
        return { ...constraint, gap: newgap };
      }
      return constraint;
    });
  };

  return {
    scaledConstraints: getScaledConstraints(constraints),
    linkLength: linkLength
  };
}

/**
 * Custom HTML Element for WebCola CND Graph visualization
 */
export class WebColaCnDGraph extends globalThis.HTMLElement {
  private _width: number = 800;
  private _height: number = 600;
  private _rendered: boolean = false;
  
  // WebCola and D3 properties
  private colaLayout: cola.Layout | null = null;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private zoomableGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  
  // Data properties
  private nodes: NodeWithMetadata[] = [];
  private edges: EdgeWithMetadata[] = [];
  private constraints: any[] = [];
  private groups: any[] = [];
  
  // UI elements
  private link: d3.Selection<SVGPathElement, any, SVGGElement, unknown> | null = null;
  private node: d3.Selection<SVGGElement, any, SVGGElement, unknown> | null = null;
  private group: d3.Selection<SVGRectElement, any, SVGGElement, unknown> | null = null;

  static get observedAttributes(): string[] {
    return ['width', 'height'];
  }

  constructor() {
    super();
    
    // Create shadow DOM
    const shadow = this.attachShadow({ mode: 'open' });
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    shadow.appendChild(style);
    
    // Create the SVG container structure
    this.createSVGStructure(shadow);
  }

  private createSVGStructure(container: ShadowRoot): void {
    // Create the main container
    const svgContainer = document.createElement('div');
    svgContainer.id = 'svg-container';
    svgContainer.className = 'webcola-container';
    
    // Create SVG element
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.id = 'svg';
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';
    
    // Create defs for markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // End arrow marker
    const endArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    endArrow.id = 'end-arrow';
    endArrow.setAttribute('markerWidth', '15');
    endArrow.setAttribute('markerHeight', '10');
    endArrow.setAttribute('refX', '12');
    endArrow.setAttribute('refY', '5');
    endArrow.setAttribute('orient', 'auto');
    
    const endArrowPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    endArrowPolygon.setAttribute('points', '0 0, 15 5, 0 10');
    endArrow.appendChild(endArrowPolygon);
    defs.appendChild(endArrow);

    // Hand-drawn arrow marker  
    const handDrawnArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    handDrawnArrow.id = 'hand-drawn-arrow';
    handDrawnArrow.setAttribute('markerWidth', '15');
    handDrawnArrow.setAttribute('markerHeight', '10');
    handDrawnArrow.setAttribute('refX', '12');
    handDrawnArrow.setAttribute('refY', '5');
    handDrawnArrow.setAttribute('orient', 'auto');
    
    const handDrawnPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    handDrawnPolygon.setAttribute('points', '0 0, 15 5, 0 10');
    handDrawnPolygon.setAttribute('fill', '#666666');
    handDrawnArrow.appendChild(handDrawnPolygon);
    defs.appendChild(handDrawnArrow);
    
    svgElement.appendChild(defs);
    
    // Create zoomable group
    const zoomableGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    zoomableGroup.setAttribute('class', 'zoomable');
    svgElement.appendChild(zoomableGroup);
    
    svgContainer.appendChild(svgElement);
    container.appendChild(svgContainer);
  }

  // Getters and setters
  get width(): number { return this._width; }
  set width(value: number) { 
    this._width = value; 
    this.setAttribute('width', value.toString());
  }

  get height(): number { return this._height; }
  set height(value: number) { 
    this._height = value; 
    this.setAttribute('height', value.toString());
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'width':
        this._width = parseInt(newValue) || 800;
        break;
      case 'height':
        this._height = parseInt(newValue) || 600;
        break;
    }
    
    // Update SVG dimensions if already rendered
    if (this.svg) {
      this.svg.attr('width', this._width).attr('height', this._height);
      if (this.colaLayout) {
        this.colaLayout.size([this._width, this._height]);
      }
    }
  }

  connectedCallback(): void {
    // Initialize D3 and WebCola when element is connected
    this.initializeD3();
  }

  private initializeD3(): void {
    const svgElement = this.shadowRoot?.querySelector('#svg') as SVGSVGElement;
    if (!svgElement) return;

    // Setup D3 zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5])
      .on('zoom', (event) => {
        if (this.zoomableGroup) {
          this.zoomableGroup.attr('transform', event.transform);
        }
      });

    // Select SVG with D3 and apply zoom
    this.svg = d3.select(svgElement).call(this.zoom);
    this.zoomableGroup = this.svg.select('.zoomable');
  }

  /**
   * Main method to render an InstanceLayout using WebCola
   */
  async renderLayout(instanceLayout: InstanceLayout): Promise<void> {
    try {
      this.showLoading();
      
      // Convert to WebCola format using our translator
      const webColaLayout = new WebColaLayout(instanceLayout, this._height, this._width);
      
      this.nodes = webColaLayout.colaNodes;
      this.edges = webColaLayout.colaEdges;  
      this.constraints = webColaLayout.colaConstraints;
      this.groups = webColaLayout.groupDefinitions;
      
      console.log('🔧 WebCola data prepared:', {
        nodes: this.nodes.length,
        edges: this.edges.length, 
        constraints: this.constraints.length,
        groups: this.groups.length
      });
      
      // Setup WebCola layout with the full renderer logic
      await this.setupWebColaLayout();
      
      this._rendered = true;
    } catch (error) {
      console.error('WebColaCnDGraph render error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.showError(`Rendering failed: ${errorMessage}`);
    }
  }

  /**
   * Setup WebCola layout with full renderer logic from webcolasiderenderer.js
   */
  private async setupWebColaLayout(): Promise<void> {
    if (!this.svg || !this.zoomableGroup) {
      throw new Error('SVG not initialized');
    }

    // Prepare nodes - add name property required by WebCola
    this.nodes.forEach(node => {
      (node as any).name = node.id;
    });

    const linkDistance = Math.min(this._width, this._height) / Math.sqrt(this.nodes.length);

    // Create WebCola layout
    this.colaLayout = cola.d3adaptor(d3)
      .convergenceThreshold(1e-3)
      .avoidOverlaps(true)
      .handleDisconnected(true)
      .size([this._width, this._height])
      .nodes(this.nodes)
      .links(this.edges)
      .constraints(this.constraints)
      .groups(this.groups)
      .groupCompactness(1e-3)
      .linkDistance(linkDistance);

    // Scale constraints (default scale factor of 1)
    const scaleFactor = 1;
    const { scaledConstraints, linkLength } = adjustLinkLengthsAndSeparationConstraintsToScaleFactor(this.constraints, scaleFactor);
    
    this.colaLayout.linkDistance(linkLength);
    this.colaLayout.constraints(scaledConstraints);

    // Create D3 line function for edge routing
    const lineFunction = d3.line<any>()
      .x(d => d.x)
      .y(d => d.y)
      .curve(d3.curveBasis);

    // Setup edge routing function
    const routeEdges = () => {
      try {
        if (!this.colaLayout) return;
        this.colaLayout.prepareEdgeRouting(margin / 3);
        console.log('Routing edges...');

        // Update edge paths with routing
        if (this.link) {
          this.link.attr('d', (d: any) => {
            try {
              if (!this.colaLayout) return '';
              let route = this.colaLayout.routeEdge(d);
              
              // Handle self-loops
              if (d.source.id === d.target.id) {
                const source = d.source;
                const bounds = source.bounds;
                const width = bounds.X - bounds.x;
                const height = bounds.Y - bounds.y;

                const startPoint = { x: bounds.x + width / 2, y: bounds.y };
                const endPoint = { x: bounds.X, y: bounds.y + height / 2 };
                const controlPoint = { x: bounds.X + width / 2, y: bounds.y - height / 2 };

                route = [startPoint, controlPoint, endPoint];
              }
              
              return lineFunction(route);
            } catch (e) {
              console.warn('Error routing edge', d.id, e);
              // Fallback to straight line
              return `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`;
            }
          });
        }
        
      } catch (e) {
        console.error('Error in routeEdges:', e);
      }
    };

    // Create groups
    this.group = this.zoomableGroup.selectAll('.group')
      .data(this.groups)
      .enter().append('rect')
      .attr('class', 'group')
      .attr('rx', 5)
      .attr('ry', 5);

    // Create links
    this.link = this.zoomableGroup.selectAll('.link')
      .data(this.edges)
      .enter().append('path')
      .attr('class', (d: any) => {
        if (isInferredEdge(d)) return 'inferredLink';
        if (isAlignmentEdge(d)) return 'alignmentLink';
        return 'link';
      });

    // Create nodes
    this.node = this.zoomableGroup.selectAll('.node')
      .data(this.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!this.colaLayout) return;
          if (!event.active) this.colaLayout.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!this.colaLayout) return;
          if (!event.active) this.colaLayout.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    // Add rectangles to nodes
    this.node.append('rect')
      .attr('width', (d: any) => d.width || 100)
      .attr('height', (d: any) => d.height || 60)
      .attr('fill', (d: any) => d.color || '#4CAF50')
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .attr('rx', 5);

    // Add labels to nodes
    this.node.append('text')
      .attr('class', 'label')
      .attr('x', (d: any) => (d.width || 100) / 2)
      .attr('y', (d: any) => (d.height || 60) / 2)
      .attr('dy', '0.35em')
      .text((d: any) => d.id);

    // Add edge labels
    const linkLabels = this.zoomableGroup.selectAll('.linklabel')
      .data(this.edges.filter((d: any) => d.label))
      .enter().append('text')
      .attr('class', 'linklabel')
      .text((d: any) => d.label);

    // Update function for layout iterations
    const updateLayout = () => {
      // Update node positions
      this.node?.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
      
      // Update group positions and sizes
      this.group?
        .attr('x', (d: any) => d.bounds.x)
        .attr('y', (d: any) => d.bounds.y)
        .attr('width', (d: any) => d.bounds.width())
        .attr('height', (d: any) => d.bounds.height());

      // Update edge positions (will be routed later)
      this.link?
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      // Update link label positions
      linkLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);
    };

    // Start the layout with the iterative approach from webcolasiderenderer.js
    this.colaLayout
      .on('tick', updateLayout)
      .on('end', routeEdges);

    // Run the layout with specific iteration counts
    this.colaLayout.start(
      initialUnconstrainedIterations,
      initialUserConstraintIterations, 
      initialAllConstraintsIterations,
      gridSnapIterations
    );

    console.log('🚀 WebCola layout started with', {
      nodes: this.nodes.length,
      edges: this.edges.length,
      constraints: this.constraints.length,
      groups: this.groups.length
    });
  }

  /**
   * Clear the visualization
   */
  clear(): void {
    if (this.colaLayout) {
      this.colaLayout.stop();
      this.colaLayout = null;
    }
    
    if (this.zoomableGroup) {
      this.zoomableGroup.selectAll('*').remove();
    }
    
    this.nodes = [];
    this.edges = [];
    this.constraints = [];
    this.groups = [];
    this._rendered = false;
  }

  /**
   * Show loading state
   */
  private showLoading(): void {
    const container = this.shadowRoot?.querySelector('#svg-container');
    if (container) {
      const loading = document.createElement('div');
      loading.className = 'loading';
      loading.textContent = 'Initializing WebCola layout engine...';
      container.innerHTML = '';
      container.appendChild(loading);
    }
  }

  /**
   * Show error state  
   */
  private showError(message: string): void {
    const container = this.shadowRoot?.querySelector('#svg-container');
    if (container) {
      const error = document.createElement('div');
      error.className = 'error';
      error.textContent = `Error: ${message}`;
      container.innerHTML = '';
      container.appendChild(error);
    }
  }

  /**
   * Component styles - combining your CSS with container styles
   */
  private getStyles(): string {
    return `
      .webcola-container {
        width: 100%;
        height: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
        background: white;
        position: relative;
      }
      
      #svg-container {
        width: 100%;
        height: 100%;
        position: relative;
      }
      
      #svg {
        width: 100%;
        height: 100%;
        min-width: 30vw;
        max-width: 95vw;
        min-height: 80vh;
        max-height: 95vh;
      }

      .node {
        stroke-width: 1.5px;
        cursor: move;
      }

      .group {
        stroke: black;
        stroke-width: 1px;
        cursor: move;
        opacity: 0.4;
      }

      .disconnectedNode {
        stroke: transparent;
        fill: transparent;
        cursor: move;
      }

      .link {
        stroke: #333330;
        fill: none;
        stroke-width: 1px;
        stroke-opacity: 1;
        marker-end: url(#end-arrow);
      }

      .inferredLink {
        stroke: #666666;
        fill: none;
        stroke-width: 1px;
        stroke-opacity: 0.8;
        stroke-dasharray: 4, 2;
        marker-end: url(#hand-drawn-arrow);
      }

      .linkoutline {
        stroke: white;
        stroke-width: 4px;
        fill: none;
      }

      .label {
        fill: black;
        font-family: system-ui;
        font-size: 10px;
        text-anchor: middle;
        cursor: move;
      }

      .mostSpecificTypeLabel {
        font-family: system-ui;
        font-size: 10px;
        text-anchor: start;
        cursor: move;
      }

      .icon {
        fill: transparent;
      }

      .linklabel {
        fill: black;
        font-family: Verdana;
        font-size: 10px;
        cursor: move;
        stroke: white;
        stroke-width: 1px;
        paint-order: stroke;
      }

      .groupLabel {
        fill: black;
        font-family: Verdana;
        font-size: 10px;
        text-anchor: middle;
        cursor: move;
      }

      .link.highlighted {
        stroke: black;
        stroke-width: 3px;
      }

      .inferredLink.highlighted {
        stroke: #666666;
        stroke-width: 3px;
      }

      .alignmentLink {
        stroke: transparent;
        fill: none;
        stroke-width: 1px;
        stroke-opacity: 0;
        marker-end: none;
      }
      
      .loading, .error {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-family: Arial, sans-serif;
      }
      
      .error {
        color: #d32f2f;
        background: #ffebee;
      }
      
      .loading {
        color: #1976d2;
        background: #e3f2fd;
      }
    `;
  }
}

// Register the custom element (only if in browser environment)
if (typeof globalThis !== 'undefined' && 
    typeof globalThis.customElements !== 'undefined' && 
    !globalThis.customElements.get('webcola-cnd-graph')) {
  globalThis.customElements.define('webcola-cnd-graph', WebColaCnDGraph);
}

// Export for module usage
export default WebColaCnDGraph;
