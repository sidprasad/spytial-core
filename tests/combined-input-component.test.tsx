/**
 * Test for CombinedInputComponent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CombinedInputComponent } from '../src/components/CombinedInput/CombinedInputComponent';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

// Mock the custom element
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
      return element;
    }
    return originalCreateElement.call(document, tagName);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CombinedInputComponent', () => {
  it('renders without crashing', () => {
    render(<CombinedInputComponent />);
    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
  });

  it('shows REPL and layout interface by default', () => {
    render(<CombinedInputComponent />);
    expect(screen.getByText('Pyret REPL')).toBeInTheDocument();
    expect(screen.getByText('CnD Layout Interface')).toBeInTheDocument();
    expect(screen.getByText('Graph Visualization')).toBeInTheDocument();
  });

  it('hides layout interface when showLayoutInterface is false', () => {
    render(<CombinedInputComponent showLayoutInterface={false} />);
    expect(screen.getByText('Pyret REPL')).toBeInTheDocument();
    expect(screen.queryByText('CnD Layout Interface')).not.toBeInTheDocument();
    expect(screen.getByText('Graph Visualization')).toBeInTheDocument();
  });

  it('accepts initial data instance', () => {
    const testInstance = new PyretDataInstance();
    render(<CombinedInputComponent dataInstance={testInstance} />);
    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
  });

  it('accepts initial CnD spec', () => {
    const testSpec = 'nodes:\n  - { id: node, type: atom }';
    render(<CombinedInputComponent cndSpec={testSpec} />);
    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
  });

  it('shows status information', () => {
    render(<CombinedInputComponent />);
    expect(screen.getByText(/Ready/)).toBeInTheDocument();
    expect(screen.getByText(/0 atoms/)).toBeInTheDocument();
    expect(screen.getByText(/0 relations/)).toBeInTheDocument();
  });

  it('shows layout controls', () => {
    render(<CombinedInputComponent />);
    expect(screen.getByText('Apply Layout')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('applies custom styling', () => {
    const testStyle = { backgroundColor: 'red' };
    render(<CombinedInputComponent style={testStyle} />);
    const container = screen.getByText('CnD Combined Input').closest('div');
    expect(container).toHaveStyle('background-color: red');
  });

  it('accepts custom dimensions', () => {
    render(<CombinedInputComponent width="800px" height="400px" />);
    const container = screen.getByText('CnD Combined Input').closest('div');
    expect(container).toHaveStyle('width: 800px');
    expect(container).toHaveStyle('height: 400px');
  });
});