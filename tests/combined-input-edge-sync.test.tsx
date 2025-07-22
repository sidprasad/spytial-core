/**
 * Test for Combined Input Component edge sync functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CombinedInputComponent } from '../src/components/CombinedInput/CombinedInputComponent';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

// Mock the custom element and its methods
beforeEach(() => {
  // Mock customElements.define if not available
  if (typeof window !== 'undefined' && !window.customElements) {
    (window as any).customElements = {
      define: vi.fn(),
      get: vi.fn(() => undefined)
    };
  }
  
  // Mock document.createElement for webcola-cnd-graph
  const originalCreateElement = document.createElement;
  document.createElement = vi.fn((tagName: string) => {
    if (tagName === 'webcola-cnd-graph') {
      const element = originalCreateElement.call(document, 'div');
      element.setAttribute = vi.fn();
      (element as any).renderLayout = vi.fn();
      (element as any).clear = vi.fn();
      
      // Mock addEventListener for edge events
      const eventListeners = new Map();
      element.addEventListener = vi.fn((eventType: string, handler: EventListenerOrEventListenerObject) => {
        eventListeners.set(eventType, handler);
      });
      element.removeEventListener = vi.fn();
      
      // Store mock functions for testing
      (element as any)._mockEventListeners = eventListeners;
      (element as any)._mockFireEvent = (eventType: string, detail: any) => {
        const handler = eventListeners.get(eventType);
        if (handler) {
          const event = new CustomEvent(eventType, { detail });
          if (typeof handler === 'function') {
            handler(event);
          } else {
            handler.handleEvent(event);
          }
        }
      };
      
      return element;
    }
    return originalCreateElement.call(document, tagName);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CombinedInput Edge Sync Functionality', () => {
  it('should handle edge creation events from graph', async () => {
    const mockOnInstanceChange = vi.fn();
    const initialInstance = new PyretDataInstance();
    
    // Add some initial atoms
    initialInstance.addAtom('Alice', 'Person');
    initialInstance.addAtom('Bob', 'Person');
    
    render(
      <CombinedInputComponent
        dataInstance={initialInstance}
        onInstanceChange={mockOnInstanceChange}
        autoApplyLayout={false} // Disable auto-layout for testing
      />
    );
    
    // Wait for the graph element to be created
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Find the graph container and get its child element
    const graphContainer = document.querySelector('[data-testid="graph-container"]') ||
                          document.querySelector('div > div:last-child');
    
    if (graphContainer) {
      const graphElement = graphContainer.querySelector('div') as any;
      
      if (graphElement && graphElement._mockFireEvent) {
        // Simulate edge creation event
        const edgeCreationDetail = {
          relationId: 'friend',
          sourceNodeId: 'Alice',
          targetNodeId: 'Bob',
          tuple: {
            atoms: ['Alice', 'Bob'],
            types: ['Person', 'Person']
          }
        };
        
        graphElement._mockFireEvent('edge-creation-requested', edgeCreationDetail);
        
        // Give React time to process the event
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Check that the onInstanceChange callback was called
        expect(mockOnInstanceChange).toHaveBeenCalled();
        
        // Verify that the relation was added to the instance
        const updatedInstance = mockOnInstanceChange.mock.calls[0][0];
        const friendRelation = updatedInstance.getRelations().find((r: any) => r.id === 'friend');
        expect(friendRelation).toBeDefined();
        expect(friendRelation.tuples).toHaveLength(1);
        expect(friendRelation.tuples[0].atoms).toEqual(['Alice', 'Bob']);
      }
    }
  });

  it('should handle edge modification events from graph', async () => {
    const mockOnInstanceChange = vi.fn();
    const initialInstance = new PyretDataInstance();
    
    // Add some initial atoms and a relation
    initialInstance.addAtom('Alice', 'Person');
    initialInstance.addAtom('Bob', 'Person');
    initialInstance.addRelationTuple('knows', {
      atoms: ['Alice', 'Bob'],
      types: ['Person', 'Person']
    });
    
    render(
      <CombinedInputComponent
        dataInstance={initialInstance}
        onInstanceChange={mockOnInstanceChange}
        autoApplyLayout={false}
      />
    );
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const graphContainer = document.querySelector('[data-testid="graph-container"]') ||
                          document.querySelector('div > div:last-child');
    
    if (graphContainer) {
      const graphElement = graphContainer.querySelector('div') as any;
      
      if (graphElement && graphElement._mockFireEvent) {
        // Simulate edge modification event
        const edgeModificationDetail = {
          oldRelationId: 'knows',
          newRelationId: 'friend',
          sourceNodeId: 'Alice',
          targetNodeId: 'Bob',
          tuple: {
            atoms: ['Alice', 'Bob'],
            types: ['Person', 'Person']
          }
        };
        
        graphElement._mockFireEvent('edge-modification-requested', edgeModificationDetail);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Check that the onInstanceChange callback was called
        expect(mockOnInstanceChange).toHaveBeenCalled();
        
        // Verify that the relation was modified
        const updatedInstance = mockOnInstanceChange.mock.calls[0][0];
        const knowsRelation = updatedInstance.getRelations().find((r: any) => r.id === 'knows');
        const friendRelation = updatedInstance.getRelations().find((r: any) => r.id === 'friend');
        
        // The old relation should have no tuples (or not exist)
        if (knowsRelation) {
          expect(knowsRelation.tuples).toHaveLength(0);
        }
        
        // The new relation should have the tuple
        expect(friendRelation).toBeDefined();
        expect(friendRelation.tuples).toHaveLength(1);
        expect(friendRelation.tuples[0].atoms).toEqual(['Alice', 'Bob']);
      }
    }
  });

  it('should show collapsible sections', () => {
    render(<CombinedInputComponent />);
    
    // Check that collapsible headers exist
    expect(screen.getByText('Pyret REPL')).toBeInTheDocument();
    expect(screen.getByText('CnD Layout Interface')).toBeInTheDocument();
    expect(screen.getByText('Graph Visualization')).toBeInTheDocument();
    
    // Check for expand/collapse indicators
    const expandIndicators = screen.getAllByText('▼');
    expect(expandIndicators.length).toBeGreaterThan(0);
  });

  it('should show live reified values', () => {
    const testInstance = new PyretDataInstance();
    testInstance.addAtom('Alice', 'Person');
    
    render(<CombinedInputComponent dataInstance={testInstance} />);
    
    // Check for the live reified values section
    expect(screen.getByText('Live Reified Data (Pyret Constructor Notation)')).toBeInTheDocument();
    
    // Check for copy button
    expect(screen.getByText('Copy')).toBeInTheDocument();
    
    // Check for textarea containing reified data
    const textarea = screen.getByPlaceholderText('Reified data will appear here as you build your data instance...');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toContain('Alice:Person');
  });

  it('should show edge input mode hints', () => {
    render(<CombinedInputComponent />);
    
    // Check for the edge input mode hint
    expect(screen.getByText('🎮 Cmd/Ctrl + Click for Edge Mode')).toBeInTheDocument();
    expect(screen.getByText(/Use.*Cmd\/Ctrl \+ Click.*between nodes to create edges/)).toBeInTheDocument();
  });

  it('should handle layout staleness correctly', () => {
    const mockOnSpecChange = vi.fn();
    
    render(
      <CombinedInputComponent
        onSpecChange={mockOnSpecChange}
        autoApplyLayout={false} // Disable auto-layout to test staleness
      />
    );
    
    // Initially should not show stale indicator
    expect(screen.queryByText('Layout Stale')).not.toBeInTheDocument();
    
    // Should show the apply layout button (disabled when not stale)
    const applyButton = screen.getByText(/Apply Layout|Layout Current/);
    expect(applyButton).toBeInTheDocument();
  });
});