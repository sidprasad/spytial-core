/**
 * WebColaCnDGraph - Custom HTML Element for rendering CND layouts with WebCola
 * 
 * This element takes an InstanceLayout as input, translates it to WebCola format,
 * and renders an interactive SVG visualization.
 * 
 * Usage:
 * <webcola-cnd-graph width="800" height="600"></webcola-cnd-graph>
 * 
 * Then call: element.renderLayout(instanceLayout)
 */

export class WebColaCnDGraph extends HTMLElement {
  private _width: number = 800;
  private _height: number = 600;
  private svg: any = null;
  private mainGroup: any = null;
  private currentLayout: any = null;

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
    
    // Create the SVG container
    this.createSVGStructure(shadow);
  }

  private createSVGStructure(container: ShadowRoot): void {
    // Create the main container
    const svgContainer = document.createElement('div');
    svgContainer.className = 'webcola-container';
    svgContainer.style.width = '100%';
    svgContainer.style.height = '100%';
    svgContainer.style.border = '1px solid #ccc';
    svgContainer.style.background = 'white';
    
    // Create SVG element
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.id = 'svg';
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';
    svgElement.setAttribute('width', this._width.toString());
    svgElement.setAttribute('height', this._height.toString());
    
    // Create defs for markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // End arrow marker
    const endArrow = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    endArrow.id = 'end-arrow';
    endArrow.setAttribute('markerWidth', '10');
    endArrow.setAttribute('markerHeight', '10');
    endArrow.setAttribute('refX', '9');
    endArrow.setAttribute('refY', '3');
    endArrow.setAttribute('orient', 'auto');
    
    const endArrowPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    endArrowPolygon.setAttribute('points', '0,0 0,6 9,3');
    endArrowPolygon.setAttribute('fill', 'black');
    endArrow.appendChild(endArrowPolygon);
    defs.appendChild(endArrow);
    
    svgElement.appendChild(defs);
    
    // Create main group
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.id = 'main-group';
    svgElement.appendChild(mainGroup);
    
    svgContainer.appendChild(svgElement);
    container.appendChild(svgContainer);
    
    // Store references
    this.svg = svgElement;
    this.mainGroup = mainGroup;
  }

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
        if (this.svg) {
          this.svg.setAttribute('width', this._width.toString());
        }
        break;
      case 'height':
        this._height = parseInt(newValue) || 600;
        if (this.svg) {
          this.svg.setAttribute('height', this._height.toString());
        }
        break;
    }
  }

  /**
   * Main method to render a layout from InstanceLayout
   */
  async renderLayout(instanceLayout: any): Promise<void> {
    try {
      this.showLoading();

      // Import WebColaTranslator from the built module
      const { WebColaTranslator } = await import('./webcolatranslator');
      
      // Create translator and convert layout
      const translator = new WebColaTranslator();
      const webColaLayout = await translator.translate(instanceLayout);
      
      // Store current layout
      this.currentLayout = webColaLayout;
      
      // Render simple SVG
      this.renderSimpleSVG(webColaLayout);
      
    } catch (error: any) {
      console.error('Error rendering layout:', error);
      this.showError(`Failed to render layout: ${error.message}`);
    }
  }

  private showLoading(): void {
    if (!this.mainGroup) return;
    
    this.mainGroup.innerHTML = '';
    
    const loadingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    loadingText.setAttribute('x', (this._width / 2).toString());
    loadingText.setAttribute('y', (this._height / 2).toString());
    loadingText.setAttribute('text-anchor', 'middle');
    loadingText.setAttribute('fill', '#1976d2');
    loadingText.textContent = 'Loading layout...';
    
    this.mainGroup.appendChild(loadingText);
  }

  private showError(message: string): void {
    if (!this.mainGroup) return;
    
    this.mainGroup.innerHTML = '';
    
    const errorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    errorText.setAttribute('x', (this._width / 2).toString());
    errorText.setAttribute('y', (this._height / 2).toString());
    errorText.setAttribute('text-anchor', 'middle');
    errorText.setAttribute('fill', '#d32f2f');
    errorText.textContent = message;
    
    this.mainGroup.appendChild(errorText);
  }

  private renderSimpleSVG(webColaLayout: any): void {
    if (!this.mainGroup || !webColaLayout) return;

    // Clear previous content
    this.mainGroup.innerHTML = '';

    const nodes = webColaLayout.nodes || [];
    const links = webColaLayout.links || [];
    const groups = webColaLayout.groups || [];

    // Simple layout algorithm - arrange nodes in a grid
    const nodePositions = this.calculateSimpleLayout(nodes);

    // Draw groups first (as backgrounds)
    groups.forEach((group: any, index: number) => {
      const groupRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      groupRect.setAttribute('x', (50 + (index * 200)).toString());
      groupRect.setAttribute('y', '50');
      groupRect.setAttribute('width', '180');
      groupRect.setAttribute('height', '120');
      groupRect.setAttribute('fill', 'rgba(173, 216, 230, 0.3)');
      groupRect.setAttribute('stroke', 'rgba(100, 149, 237, 0.8)');
      groupRect.setAttribute('stroke-width', '2');
      groupRect.setAttribute('stroke-dasharray', '5,5');
      groupRect.setAttribute('rx', '5');
      this.mainGroup.appendChild(groupRect);

      // Group label
      const groupLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      groupLabel.setAttribute('x', (50 + (index * 200) + 90).toString());
      groupLabel.setAttribute('y', '45');
      groupLabel.setAttribute('text-anchor', 'middle');
      groupLabel.setAttribute('fill', 'black');
      groupLabel.setAttribute('font-family', 'Verdana');
      groupLabel.setAttribute('font-size', '12');
      groupLabel.textContent = group.name || group.id || `Group ${index + 1}`;
      this.mainGroup.appendChild(groupLabel);
    });

    // Draw links
    links.forEach((link: any) => {
      const sourcePos = nodePositions[link.source] || { x: 100, y: 100 };
      const targetPos = nodePositions[link.target] || { x: 200, y: 200 };

      const linkLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      linkLine.setAttribute('x1', sourcePos.x.toString());
      linkLine.setAttribute('y1', sourcePos.y.toString());
      linkLine.setAttribute('x2', targetPos.x.toString());
      linkLine.setAttribute('y2', targetPos.y.toString());
      linkLine.setAttribute('stroke', 'black');
      linkLine.setAttribute('stroke-width', '2');
      linkLine.setAttribute('marker-end', 'url(#end-arrow)');
      
      // Add class based on edge type
      if (link.id && link.id.includes('_inferred_')) {
        linkLine.setAttribute('stroke', '#666666');
        linkLine.setAttribute('stroke-dasharray', '5,5');
      }
      
      this.mainGroup.appendChild(linkLine);
    });

    // Draw nodes
    nodes.forEach((node: any, index: number) => {
      const pos = nodePositions[index] || { x: 100 + (index * 100), y: 200 };

      // Node circle
      const nodeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      nodeCircle.setAttribute('cx', pos.x.toString());
      nodeCircle.setAttribute('cy', pos.y.toString());
      nodeCircle.setAttribute('r', (node.radius || 20).toString());
      nodeCircle.setAttribute('fill', node.color || '#b7e4c7');
      nodeCircle.setAttribute('stroke', '#40916c');
      nodeCircle.setAttribute('stroke-width', '2');
      this.mainGroup.appendChild(nodeCircle);

      // Node label
      const nodeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nodeLabel.setAttribute('x', pos.x.toString());
      nodeLabel.setAttribute('y', (pos.y + 4).toString());
      nodeLabel.setAttribute('text-anchor', 'middle');
      nodeLabel.setAttribute('fill', 'black');
      nodeLabel.setAttribute('font-family', 'Verdana');
      nodeLabel.setAttribute('font-size', '10');
      nodeLabel.setAttribute('pointer-events', 'none');
      nodeLabel.textContent = node.label || node.id || `Node ${index + 1}`;
      this.mainGroup.appendChild(nodeLabel);
    });

    // Add a success message
    const successText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    successText.setAttribute('x', (this._width - 10).toString());
    successText.setAttribute('y', '20');
    successText.setAttribute('text-anchor', 'end');
    successText.setAttribute('fill', '#00b894');
    successText.setAttribute('font-size', '12');
    successText.textContent = `Rendered ${nodes.length} nodes, ${links.length} edges`;
    this.mainGroup.appendChild(successText);
  }

  private calculateSimpleLayout(nodes: any[]): Record<number, {x: number, y: number}> {
    const positions: Record<number, {x: number, y: number}> = {};
    const margin = 100;
    const spacing = 120;
    
    // Arrange nodes in a grid
    const cols = Math.ceil(Math.sqrt(nodes.length));
    
    nodes.forEach((node: any, index: number) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      positions[index] = {
        x: margin + (col * spacing),
        y: margin + (row * spacing)
      };
    });
    
    return positions;
  }

  /**
   * Clear the visualization
   */
  clear(): void {
    if (this.mainGroup) {
      this.mainGroup.innerHTML = '';
    }
    this.currentLayout = null;
  }

  /**
   * Get the current layout data
   */
  getCurrentLayout(): any {
    return this.currentLayout;
  }

  private getStyles(): string {
    return `
      .webcola-container {
        width: 100%;
        height: 100%;
        border: 1px solid #ccc;
        background: white;
        position: relative;
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
