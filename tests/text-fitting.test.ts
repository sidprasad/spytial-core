import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock the WebColaCnDGraph for testing text fitting
class MockWebColaCnDGraph {
  private textMeasurementCanvas: HTMLCanvasElement | null = null;
  
  // Constants copied from the actual implementation
  private static readonly DEFAULT_FONT_SIZE = 10;
  private static readonly MIN_FONT_SIZE = 6;
  private static readonly MAX_FONT_SIZE = 16;
  private static readonly LINE_HEIGHT_RATIO = 1.2;
  private static readonly MAX_VISIBLE_LINES = 3;

  private getTextMeasurementContext(): CanvasRenderingContext2D {
    if (!this.textMeasurementCanvas) {
      this.textMeasurementCanvas = document.createElement('canvas');
    }
    return this.textMeasurementCanvas.getContext('2d')!;
  }

  private measureTextWidth(text: string, fontSize: number, fontFamily: string = 'system-ui'): number {
    const context = this.getTextMeasurementContext();
    context.font = `${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  }

  public calculateOptimalFontSize(
    text: string, 
    maxWidth: number, 
    maxHeight: number, 
    fontFamily: string = 'system-ui'
  ): number {
    let fontSize = MockWebColaCnDGraph.DEFAULT_FONT_SIZE;
    
    // Start with default size and scale down if needed
    while (fontSize > MockWebColaCnDGraph.MIN_FONT_SIZE) {
      const textWidth = this.measureTextWidth(text, fontSize, fontFamily);
      const lineHeight = fontSize * MockWebColaCnDGraph.LINE_HEIGHT_RATIO;
      
      if (textWidth <= maxWidth && lineHeight <= maxHeight) {
        break;
      }
      
      fontSize -= 0.5;
    }
    
    // Scale up if there's room
    while (fontSize < MockWebColaCnDGraph.MAX_FONT_SIZE) {
      const testSize = fontSize + 0.5;
      const textWidth = this.measureTextWidth(text, testSize, fontFamily);
      const lineHeight = testSize * MockWebColaCnDGraph.LINE_HEIGHT_RATIO;
      
      if (textWidth > maxWidth || lineHeight > maxHeight) {
        break;
      }
      
      fontSize = testSize;
    }
    
    return Math.max(MockWebColaCnDGraph.MIN_FONT_SIZE, Math.min(fontSize, MockWebColaCnDGraph.MAX_FONT_SIZE));
  }

  public wrapText(text: string, maxWidth: number, fontSize: number, fontFamily: string = 'system-ui'): string[] {
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

  public shouldMakeTextExpandable(nodeData: any): boolean {
    if (!nodeData.showLabels) return false;
    
    const mainLabel = nodeData.label || nodeData.name || nodeData.id || "Node";
    const attributes = nodeData.attributes || {};
    const totalLines = 1 + Object.keys(attributes).length;
    
    return totalLines > MockWebColaCnDGraph.MAX_VISIBLE_LINES || mainLabel.length > 30;
  }
}

describe('Text Fitting in WebCola Nodes', () => {
  let dom: JSDOM;
  let mockGraph: MockWebColaCnDGraph;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      pretendToBeVisual: true,
      resources: 'usable'
    });
    global.document = dom.window.document;
    global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
    global.CanvasRenderingContext2D = dom.window.CanvasRenderingContext2D;
    
    mockGraph = new MockWebColaCnDGraph();
  });

  it('should calculate optimal font size for short text', () => {
    const text = "Node A";
    const maxWidth = 100;
    const maxHeight = 60;
    
    const fontSize = mockGraph.calculateOptimalFontSize(text, maxWidth, maxHeight);
    
    expect(fontSize).toBeGreaterThanOrEqual(6); // MIN_FONT_SIZE
    expect(fontSize).toBeLessThanOrEqual(16); // MAX_FONT_SIZE
  });

  it('should scale down font size for long text', () => {
    const shortText = "A";
    const longText = "This is a very long node label that should require smaller font";
    const maxWidth = 100;
    const maxHeight = 60;
    
    const shortFontSize = mockGraph.calculateOptimalFontSize(shortText, maxWidth, maxHeight);
    const longFontSize = mockGraph.calculateOptimalFontSize(longText, maxWidth, maxHeight);
    
    expect(longFontSize).toBeLessThanOrEqual(shortFontSize);
  });

  it('should wrap text into multiple lines', () => {
    const text = "This is a long text that should be wrapped into multiple lines";
    const maxWidth = 80; // Narrow width to force wrapping
    const fontSize = 10;
    
    const lines = mockGraph.wrapText(text, maxWidth, fontSize);
    
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(line => line.length > 0)).toBe(true);
  });

  it('should identify nodes that need expand/collapse functionality', () => {
    const simpleNode = {
      id: 'simple',
      label: 'A',
      showLabels: true,
      attributes: {}
    };
    
    const complexNode = {
      id: 'complex',
      label: 'Node with many attributes',
      showLabels: true,
      attributes: {
        attr1: 'value1',
        attr2: 'value2',
        attr3: 'value3',
        attr4: 'value4'
      }
    };
    
    const longLabelNode = {
      id: 'long',
      label: 'This is a very long node label that exceeds the normal length threshold',
      showLabels: true,
      attributes: {}
    };
    
    expect(mockGraph.shouldMakeTextExpandable(simpleNode)).toBe(false);
    expect(mockGraph.shouldMakeTextExpandable(complexNode)).toBe(true);
    expect(mockGraph.shouldMakeTextExpandable(longLabelNode)).toBe(true);
  });

  it('should not make expandable nodes when labels are hidden', () => {
    const nodeWithHiddenLabels = {
      id: 'hidden',
      label: 'Very long label',
      showLabels: false,
      attributes: {
        attr1: 'value1',
        attr2: 'value2'
      }
    };
    
    expect(mockGraph.shouldMakeTextExpandable(nodeWithHiddenLabels)).toBe(false);
  });
});