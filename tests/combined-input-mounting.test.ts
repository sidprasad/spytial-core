/**
 * Test for CombinedInput mounting functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountCombinedInput, createCombinedInputSetup, setupCombinedInput } from '../src/components/CombinedInput/mounting';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';

// Mock React DOM
vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn()
  }))
}));

describe('CombinedInput Mounting Functions', () => {
  beforeEach(() => {
    // Clean up any existing containers
    document.body.innerHTML = '';
    
    // Mock customElements if not available
    if (typeof window !== 'undefined' && !window.customElements) {
      (window as any).customElements = {
        define: vi.fn(),
        get: vi.fn(() => undefined)
      };
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('mountCombinedInput', () => {
    it('should return false when container does not exist', () => {
      const result = mountCombinedInput({
        containerId: 'nonexistent-container'
      });
      expect(result).toBe(false);
    });

    it('should return true when container exists', () => {
      // Create container
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.appendChild(container);

      const result = mountCombinedInput({
        containerId: 'test-container'
      });
      expect(result).toBe(true);
    });

    it('should use default container ID when not specified', () => {
      // Create default container
      const container = document.createElement('div');
      container.id = 'combined-input-container';
      document.body.appendChild(container);

      const result = mountCombinedInput();
      expect(result).toBe(true);
    });

    it('should accept configuration options', () => {
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.appendChild(container);

      const testInstance = new PyretDataInstance();
      const config = {
        containerId: 'test-container',
        spytialSpec: 'nodes:\n  - { id: node, type: atom }',
        dataInstance: testInstance,
        height: '800px',
        autoApplyLayout: false
      };

      const result = mountCombinedInput(config);
      expect(result).toBe(true);
    });
  });

  describe('createCombinedInputSetup', () => {
    it('should create a div element', () => {
      const testInstance = new PyretDataInstance();
      const result = createCombinedInputSetup(
        'nodes:\n  - { id: node, type: atom }',
        testInstance
      );

      expect(result).toBeInstanceOf(HTMLDivElement);
      expect(result.tagName).toBe('DIV');
    });

    it('should set proper styling on created div', () => {
      const testInstance = new PyretDataInstance();
      const result = createCombinedInputSetup(
        'nodes:\n  - { id: node, type: atom }',
        testInstance
      );

      expect(result.style.width).toBe('100%');
      expect(result.style.height).toBe('600px');
    });

    it('should generate unique IDs', () => {
      const testInstance = new PyretDataInstance();
      const div1 = createCombinedInputSetup('spec1', testInstance);
      const div2 = createCombinedInputSetup('spec2', testInstance);

      expect(div1.id).not.toBe(div2.id);
      expect(div1.id).toMatch(/^combined-input-\d+-[a-z0-9]+$/);
      expect(div2.id).toMatch(/^combined-input-\d+-[a-z0-9]+$/);
    });

    it('should accept all required parameters', () => {
      const testInstance = new PyretDataInstance();
      const mockEvaluator = { run: vi.fn() };
      const projections = { test: 'value' };

      const result = createCombinedInputSetup(
        'nodes:\n  - { id: node, type: atom }',
        testInstance,
        mockEvaluator as any,
        projections
      );

      expect(result).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('setupCombinedInput', () => {
    it('should return false when container does not exist', () => {
      const testInstance = new PyretDataInstance();
      const result = setupCombinedInput(
        'nonexistent-container',
        'nodes:\n  - { id: node, type: atom }',
        testInstance
      );
      expect(result).toBe(false);
    });

    it('should return true when container exists', () => {
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.appendChild(container);

      const testInstance = new PyretDataInstance();
      const result = setupCombinedInput(
        'test-container',
        'nodes:\n  - { id: node, type: atom }',
        testInstance
      );
      expect(result).toBe(true);
    });

    it('should accept optional parameters', () => {
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.appendChild(container);

      const testInstance = new PyretDataInstance();
      const mockEvaluator = { run: vi.fn() };
      const projections = { test: 'value' };

      const result = setupCombinedInput(
        'test-container',
        'nodes:\n  - { id: node, type: atom }',
        testInstance,
        mockEvaluator as any,
        projections
      );
      expect(result).toBe(true);
    });
  });
});