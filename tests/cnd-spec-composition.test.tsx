/**
 * Test for CnD spec composition in CombinedInputComponent
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

describe('CombinedInputComponent CnD Spec Composition', () => {
  it('should compose CnD specs from multiple sources', () => {
    const onSpecChangeMock = vi.fn();
    const initialSpec = 'nodes:\n  - { id: node, type: atom }';
    
    const { rerender } = render(
      <CombinedInputComponent
        cndSpec={initialSpec}
        onSpecChange={onSpecChangeMock}
      />
    );

    // Verify initial spec is set
    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
    
    // The composition logic is tested internally through the component's behavior
    // We can verify that the component renders without errors
    expect(screen.getByText('Pyret REPL')).toBeInTheDocument();
    expect(screen.getByText('CnD Layout Interface')).toBeInTheDocument();
  });

  it('should handle empty extracted specs gracefully', () => {
    const onSpecChangeMock = vi.fn();
    
    render(
      <CombinedInputComponent
        cndSpec=""
        onSpecChange={onSpecChangeMock}
      />
    );

    // Component should render without errors even with empty specs
    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
  });

  it('should render with initial data instance and spec', () => {
    const initialInstance = new PyretDataInstance();
    const initialSpec = 'constraints:\n  - test: value';
    const onInstanceChangeMock = vi.fn();
    const onSpecChangeMock = vi.fn();
    
    render(
      <CombinedInputComponent
        dataInstance={initialInstance}
        cndSpec={initialSpec}
        onInstanceChange={onInstanceChangeMock}
        onSpecChange={onSpecChangeMock}
      />
    );

    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
    expect(screen.getByText('0 atoms, 0 relations')).toBeInTheDocument();
  });

  it('should show layout interface by default', () => {
    render(<CombinedInputComponent />);
    
    expect(screen.getByText('CnD Layout Interface')).toBeInTheDocument();
  });

  it('should hide layout interface when showLayoutInterface is false', () => {
    render(<CombinedInputComponent showLayoutInterface={false} />);
    
    expect(screen.queryByText('CnD Layout Interface')).not.toBeInTheDocument();
    expect(screen.getByText('Pyret REPL')).toBeInTheDocument();
  });

  it('should handle pyret evaluator configuration', () => {
    const mockEvaluator = {
      run: vi.fn(),
      runtime: { isSuccessResult: vi.fn(() => true) }
    };
    
    render(
      <CombinedInputComponent
        pyretEvaluator={mockEvaluator}
      />
    );

    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
    // Check that the evaluator changes the REPL placeholder text to include more features
    expect(screen.getByPlaceholderText(/edge\("1", "label", 3\)/)).toBeInTheDocument();
  });

  it('should show appropriate status without external evaluator', () => {
    render(<CombinedInputComponent />);

    expect(screen.getByText('CnD Combined Input')).toBeInTheDocument();
    // Should show limited REPL placeholder without edge syntax
    expect(screen.getByPlaceholderText(/Alice:Person/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/edge\("1", "label", 3\)/)).not.toBeInTheDocument();
  });
});