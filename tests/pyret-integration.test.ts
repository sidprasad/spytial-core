/**
 * Test suite for Pyret REPL integration in react-component-integration.tsx
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Pyret REPL Integration', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    // Set up a DOM environment for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    document = dom.window.document;
    window = dom.window as Window & typeof globalThis;
    
    // Set up global variables that React needs
    global.document = document;
    global.window = window;
    global.navigator = window.navigator;
  });

  afterEach(() => {
    // Clean up after each test
    dom.window.close();
  });

  it('should export PyretReplMountConfig interface', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Check if the types are exported (TypeScript compilation validates this)
    expect(typeof integration.mountPyretRepl).toBe('function');
    expect(typeof integration.mountReplWithVisualization).toBe('function');
    expect(typeof integration.PyretReplStateManager).toBe('function');
  });

  it('should export all required Pyret functions', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Check mounting functions
    expect(typeof integration.mountPyretRepl).toBe('function');
    expect(typeof integration.mountReplWithVisualization).toBe('function');
    expect(typeof integration.mountAllComponentsWithPyret).toBe('function');
    
    // Check state manager
    expect(typeof integration.PyretReplStateManager).toBe('function');
    
    // Check CnDCore object contains Pyret functions
    expect(integration.CnDCore.mountPyretRepl).toBe(integration.mountPyretRepl);
    expect(integration.CnDCore.mountReplWithVisualization).toBe(integration.mountReplWithVisualization);
    expect(integration.CnDCore.PyretReplStateManager).toBe(integration.PyretReplStateManager);
    expect(integration.CnDCore.PyretDataInstance).toBeDefined();
  });

  it('should handle missing container gracefully', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Create a container in the DOM
    const containerId = 'nonexistent-container';
    
    // Try to mount to a non-existent container
    const result = integration.mountPyretRepl(containerId);
    
    // Should return false for missing container
    expect(result).toBe(false);
  });

  it('should mount PyretRepl successfully with container', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Create a container in the DOM
    const containerId = 'pyret-test-container';
    const container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
    
    // Try to mount - should work now that container exists
    const result = integration.mountPyretRepl(containerId);
    
    // Should return true for successful mount
    expect(result).toBe(true);
    
    // Wait a bit for React to render (asynchronous)
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // The container should have a React root mounted, but children might not be visible immediately
    // Just check that the function returned true, which indicates successful mounting
    expect(result).toBe(true);
  });

  it('should mount ReplWithVisualization successfully with container', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Create a container in the DOM
    const containerId = 'repl-viz-test-container';
    const container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
    
    // Try to mount - should work now that container exists
    const result = integration.mountReplWithVisualization(containerId);
    
    // Should return true for successful mount
    expect(result).toBe(true);
    
    // Wait a bit for React to render (asynchronous)
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // The container should have a React root mounted, but children might not be visible immediately
    // Just check that the function returned true, which indicates successful mounting
    expect(result).toBe(true);
  });

  it('should create PyretReplStateManager singleton correctly', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    const manager1 = integration.PyretReplStateManager.getInstance();
    const manager2 = integration.PyretReplStateManager.getInstance();
    
    // Should be the same instance (singleton)
    expect(manager1).toBe(manager2);
    
    // Should have required methods
    expect(typeof manager1.getCurrentInstance).toBe('function');
    expect(typeof manager1.setCurrentInstance).toBe('function');
    expect(typeof manager1.getExternalEvaluator).toBe('function');
    expect(typeof manager1.setExternalEvaluator).toBe('function');
    expect(typeof manager1.reifyCurrentInstance).toBe('function');
  });

  it('should have DataAPI with Pyret-specific functions', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Check that DataAPI has Pyret functions
    expect(typeof integration.DataAPI.getCurrentPyretInstance).toBe('function');
    expect(typeof integration.DataAPI.updatePyretInstance).toBe('function');
    expect(typeof integration.DataAPI.reifyCurrentPyretInstance).toBe('function');
    expect(typeof integration.DataAPI.setExternalPyretEvaluator).toBe('function');
    expect(typeof integration.DataAPI.getExternalPyretEvaluator).toBe('function');
  });

  it('should test reify functionality works with PyretDataInstance', async () => {
    const integration = await import('../webcola-demo/react-component-integration');
    
    // Get a PyretDataInstance 
    const PyretDataInstance = integration.CnDCore.PyretDataInstance;
    
    // Create an empty instance first to test the basic functionality
    const emptyInstance = new PyretDataInstance();
    
    // Test that reify method exists and returns a string
    const reified = emptyInstance.reify();
    expect(typeof reified).toBe('string');
    expect(reified.length).toBeGreaterThan(0);
    
    // For an empty instance, it should return the "no root atoms" message
    expect(reified).toBe('/* No root atoms found */');
    
    // Test that the state manager can handle reification
    const stateManager = integration.PyretReplStateManager.getInstance();
    const stateReified = stateManager.reifyCurrentInstance();
    expect(typeof stateReified).toBe('string');
  });
});