import { WebColaTranslator } from './webcolatranslator';
import { InstanceLayout } from '../../layout/interfaces';
import * as cola from 'webcola';
import * as d3 from 'd3';

const DEFAULT_SCALE_FACTOR = 5;

/**
 * WebColaCnDGraph - A factory function that creates WebCola visualizations
 * No custom elements - just a simple function that creates and manages a visualization
 */
export function createWebColaCnDGraph(container: string | HTMLElement, options?: {
  width?: number;
  height?: number;
  margin?: number;
}) {
  const config = {
    width: options?.width || 800,
    height: options?.height || 600,
    margin: options?.margin || 20
  };

  // Get the container element
  const containerElement = typeof container === 'string' 
    ? document.querySelector(container) as HTMLElement
    : container;

  if (!containerElement) {
    throw new Error('Container element not found');
  }

  // Create the SVG structure
  containerElement.innerHTML = `
    <div style="position: relative; width: 100%; height: 100%;">
      <svg width="${config.width}" height="${config.height}" style="border: 1px solid #ccc; background: white;">
        <defs>
          <marker id="end-arrow" markerWidth="15" markerHeight="10" refX="12" refY="5" orient="auto">
            <polygon points="0 0, 15 5, 0 10" fill="#333" />
          </marker>
          <marker id="hand-drawn-arrow" markerWidth="15" markerHeight="10" refX="12" refY="5" orient="auto">
            <polygon points="0 0, 15 5, 0 10" fill="#666" />
          </marker>
        </defs>
        <g class="zoom-container"></g>
      </svg>
      <div class="loading" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                  background: white; padding: 20px; border: 1px solid #ccc; border-radius: 4px;">
        Loading...
      </div>
      <div class="error" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                background: #ffe6e6; color: #cc0000; padding: 20px; border: 1px solid #cc0000; border-radius: 4px;">
      </div>
    </div>
  `;

  const svg = d3.select(containerElement).select('svg');
  const zoomContainer = svg.select('.zoom-container');
  const loadingDiv = containerElement.querySelector('.loading') as HTMLElement;
  const errorDiv = containerElement.querySelector('.error') as HTMLElement;

  // Set up zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event: any) => {
      zoomContainer.attr('transform', event.transform);
    });

  svg.call(zoom as any);

  // Line function for drawing edges
  const lineFunction = d3.line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveBasis);

  let currentLayout: any = null;

  // API object to return
  const api = {
    /**
     * Render a layout using WebCola
     */
    async renderLayout(instanceLayout: InstanceLayout): Promise<void> {
      try {
        showLoading();

        // Translate to WebCola format
        const translator = new WebColaTranslator();
        const webcolaLayout = await translator.translate(instanceLayout);

        console.log('🔄 Starting WebCola layout');

        // Create WebCola layout
        const layout = cola.d3adaptor()
          .linkDistance(100)
          .convergenceThreshold(1e-3)
          .avoidOverlaps(true)
          .handleDisconnected(true)
          .nodes(webcolaLayout.nodes)
          .links(webcolaLayout.links)
          .constraints(webcolaLayout.constraints || [])
          .groups(webcolaLayout.groups || [])
          .size([config.width - config.margin * 2, config.height - config.margin * 2]);

        currentLayout = webcolaLayout;

        // Clear existing content
        zoomContainer.selectAll('*').remove();

        // Render elements
        renderGroups(webcolaLayout.groups || []);
        renderLinks(webcolaLayout.links || []);
        renderNodes(webcolaLayout.nodes || []);

        // Start layout
        layout
          .on('tick', updatePositions)
          .on('end', () => {
            console.log('✅ WebCola layout converged');
            hideLoading();
          })
          .start(10, 15, 20);

      } catch (error) {
        console.error('Error rendering layout:', error);
        showError(`Layout rendering failed: ${(error as Error).message}`);
      }
    },

    /**
     * Clear the visualization
     */
    clear(): void {
      zoomContainer.selectAll('*').remove();
      hideLoading();
      hideError();
    },

    /**
     * Get the SVG element
     */
    getSVG(): SVGSVGElement {
      return svg.node() as SVGSVGElement;
    },

    /**
     * Fit content to viewport
     */
    fitToContent(): void {
      const svgNode = svg.node() as SVGSVGElement;
      if (!svgNode) return;

      try {
        const bbox = svgNode.getBBox();
        const padding = 20;
        const viewBox = [
          bbox.x - padding,
          bbox.y - padding,
          bbox.width + 2 * padding,
          bbox.height + 2 * padding
        ].join(' ');
        svg.attr('viewBox', viewBox);
      } catch (e) {
        console.warn('Could not fit to content:', e);
      }
    }
  };

  // Helper functions
  function showLoading() {
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
  }

  function hideLoading() {
    loadingDiv.style.display = 'none';
  }

  function showError(message: string) {
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'block';
    errorDiv.textContent = message;
  }

  function hideError() {
    errorDiv.style.display = 'none';
  }

  function renderNodes(nodes: any[]) {
    const nodeGroups = zoomContainer
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(createDragBehavior() as any);

    // Add rectangles
    nodeGroups
      .append('rect')
      .attr('width', (d: any) => d.width || 60)
      .attr('height', (d: any) => d.height || 30)
      .attr('x', (d: any) => -(d.width || 60) / 2)
      .attr('y', (d: any) => -(d.height || 30) / 2)
      .attr('fill', 'white')
      .attr('stroke', (d: any) => d.color || 'black')
      .attr('stroke-width', 1.5)
      .attr('rx', 3)
      .attr('ry', 3);

    // Add labels
    nodeGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '12px')
      .attr('fill', 'black')
      .text((d: any) => d.name || d.id || 'Node');
  }

  function renderLinks(links: any[]) {
    zoomContainer
      .selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('stroke', '#333')
      .attr('stroke-width', 1)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#end-arrow)');
  }

  function renderGroups(groups: any[]) {
    zoomContainer
      .selectAll('.group')
      .data(groups)
      .enter()
      .append('rect')
      .attr('class', 'group')
      .attr('fill', 'rgba(200, 200, 200, 0.3)')
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('rx', 8)
      .attr('ry', 8);
  }

  function updatePositions() {
    // Update nodes
    zoomContainer.selectAll('.node')
      .attr('transform', (d: any) => `translate(${d.x || 0},${d.y || 0})`);

    // Update links
    zoomContainer.selectAll('.link')
      .attr('d', (d: any) => {
        const source = d.source;
        const target = d.target;
        return lineFunction([
          { x: source.x || 0, y: source.y || 0 },
          { x: target.x || 0, y: target.y || 0 }
        ]);
      });

    // Update groups
    zoomContainer.selectAll('.group')
      .attr('x', (d: any) => (d.bounds?.x || 0))
      .attr('y', (d: any) => (d.bounds?.y || 0))
      .attr('width', (d: any) => (d.bounds?.width?.() || 0))
      .attr('height', (d: any) => (d.bounds?.height?.() || 0));
  }

  function createDragBehavior() {
    return d3.drag()
      .on('start', (event: any, d: any) => {
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: any) => {
        d.fx = null;
        d.fy = null;
      });
  }

  return api;
}

/**
 * Type definition for the WebColaCnDGraph API
 */
export type WebColaCnDGraphAPI = ReturnType<typeof createWebColaCnDGraph>;
