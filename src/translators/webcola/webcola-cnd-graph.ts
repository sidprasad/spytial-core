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


  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.initializeDOM();
    this.initializeD3();
  }



  
private getScaledDetails(constraints : any[], scaleFactor : number = DEFAULT_SCALE_FACTOR) {

    const adjustedScaleFactor = scaleFactor / 5;
    const min_sep = 150;
    const default_node_width = 100;

    let linkLength = (min_sep + default_node_width) / adjustedScaleFactor;



    /*
    For each constraint, if it is a separation constraint, adjust the distance by the scale factor.
    */
    function getScaledConstraints(constraints : any[]) : any[] {
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
        .linkDistance(linkLength) // this has to become something else.
        .avoidOverlaps(true)
        .handleDisconnected(true)
        .nodes(webcolaLayout.nodes)
        .links(webcolaLayout.links)
        .constraints(scaledConstraints)
        .groups(webcolaLayout.groups || [])
        .size([webcolaLayout.FIG_WIDTH, webcolaLayout.FIG_HEIGHT]) // Set the size of the layout area

      
      // Clear existing visualization
      this.container.selectAll('*').remove();

      // Create D3 selections for data binding
      this.renderGroups(this.currentLayout.groups);
      this.renderLinks(this.currentLayout.links, layout);
      this.renderNodes(this.currentLayout.nodes, layout);

      // Start the layout with proper event handling
      layout
        .on('tick', () => {
          this.updatePositions();
        })
        .on('end', () => {
          console.log('✅ WebCola layout converged');
          this.hideLoading();
        })
        .start(10, 15, 20);

    } catch (error) {
      console.error('Error rendering layout:', error);
      this.showError(`Layout rendering failed: ${(error as Error).message}`);
    }
  }

  /**
   * Render groups using D3 data binding
   */
  private renderGroups(groups: any[]): void {
    this.container
      .selectAll('.group')
      .data(groups)
      .enter()
      .append('rect')
      .attr('class', 'group')
      .attr('fill', 'rgba(200, 200, 200, 0.3)')
      .attr('stroke', 'black')
      .attr('stroke-width', 1);
  }

  /**
   * Render links using D3 data binding
   */
  private renderLinks(links: any[], layout: any): void {
    this.container
      .selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', (d: any) => d.isInferred ? 'inferredLink' : 'link')
      .attr('stroke', (d: any) => d.isInferred ? '#666666' : '#333330')
      .attr('stroke-width', 1)
      .attr('fill', 'none')
      .attr('marker-end', (d: any) => 
        d.isInferred ? 'url(#hand-drawn-arrow)' : 'url(#end-arrow)'
      );
  }

  /**
   * Render nodes using D3 data binding with drag behavior
   */
  private renderNodes(nodes: any[], layout: any): void {
    const nodeSelection = this.container
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(this.createDragBehavior(layout));

    // Add node rectangles
    nodeSelection
      .append('rect')
      .attr('width', (d: any) => d.width || 60)
      .attr('height', (d: any) => d.height || 30)
      .attr('x', (d: any) => -(d.width || 60) / 2)
      .attr('y', (d: any) => -(d.height || 30) / 2)
      .attr('fill', (d: any) => d.color || 'white')
      .attr('stroke', 'black')
      .attr('stroke-width', 1.5);

    // Add node labels
    nodeSelection
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', 'system-ui')
      .attr('font-size', '10px')
      .attr('fill', 'black')
      .text((d: any) => d.name || d.id || 'Node');
  }

  /**
   * Create drag behavior that integrates with WebCola layout
   */
  private createDragBehavior(layout: any): any {
    return d3.drag()
      .on('start', (event: any, d: any) => {
        if (!event.active) layout.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: any) => {
        if (!event.active) layout.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  /**
   * Update positions during WebCola layout iterations
   */
  private updatePositions(): void {
    if (!this.currentLayout || !this.container) return;

    // Update node positions
    this.container.selectAll('.node')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);

    // Update link paths
    this.container.selectAll('.link, .inferredLink')
      .attr('d', (d: any) => this.createEdgePath(d));

    // Update group boundaries if WebCola provides them
    this.container.selectAll('.group')
      .attr('x', (d: any) => d.bounds ? d.bounds.x : 0)
      .attr('y', (d: any) => d.bounds ? d.bounds.y : 0)
      .attr('width', (d: any) => d.bounds ? d.bounds.width() : 0)
      .attr('height', (d: any) => d.bounds ? d.bounds.height() : 0);
  }

  /**
   * Create SVG path for edges
   */
  private createEdgePath(edge: any): string {
    const source = edge.source;
    const target = edge.target;
    
    // Use WebCola's routing if available
    if (edge.route && edge.route.length > 0) {
      let path = `M ${edge.route[0].x} ${edge.route[0].y}`;
      for (let i = 1; i < edge.route.length; i++) {
        path += ` L ${edge.route[i].x} ${edge.route[i].y}`;
      }
      return path;
    }

    // Fallback to simple line
    return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  }

  /**
   * Show loading indicator
   */
  private showLoading(): void {
    const loading = this.shadowRoot!.querySelector('#loading') as HTMLElement;
    if (loading) loading.style.display = 'block';
  }

  /**
   * Hide loading indicator
   */
  private hideLoading(): void {
    const loading = this.shadowRoot!.querySelector('#loading') as HTMLElement;
    if (loading) loading.style.display = 'none';
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const errorDiv = this.shadowRoot!.querySelector('#error') as HTMLElement;
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
    this.hideLoading();
  }

  /**
   * Get CSS styles for the component
   */
  private getCSS(): string {
    return `
      #svg-container {
        width: 100%;
        height: 100%;
        position: relative;
      }

      #svg {
        width: 100%;
        height: 100%;
        border: 1px solid #ddd;
      }

      .zoomable {
        transform-origin: 0 0;
      }

      .node {
        cursor: pointer;
      }

      .node:hover rect {
        stroke-width: 2px;
        stroke: #1976d2;
      }

      .link {
        fill: none;
        stroke: #333;
        stroke-width: 1.5px;
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

      .group {
        fill: rgba(200, 200, 200, 0.3);
        stroke: black;
        stroke-width: 1px;
      }

      .label {
        fill: black;
        font-family: system-ui;
        font-size: 10px;
        text-anchor: middle;
        cursor: move;
      }

      #loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 16px;
        color: #1976d2;
        background: white;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      #error {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 14px;
        color: red;
        background: white;
        padding: 10px;
        border: 1px solid red;
        border-radius: 4px;
        max-width: 80%;
      }
    `;
  }
}

// Register the custom element
if (typeof customElements !== 'undefined') {
  customElements.define('webcola-cnd-graph', WebColaCnDGraph);
}
