/**
 * Example integration of CndLayoutInterface with webcola-demo.html
 * 
 * This file demonstrates how to mount the React component into the existing demo page
 * and integrate it with the existing JavaScript functions.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { CndLayoutInterface } from './CndLayoutInterface';

/**
 * Integration wrapper component that connects the React component
 * with the existing demo page's JavaScript functions
 */
function CndLayoutInterfaceWrapper() {
  const [yamlValue, setYamlValue] = React.useState<string>('');
  const [isNoCodeView, setIsNoCodeView] = React.useState<boolean>(false);

  /**
   * Handle YAML value changes and update the global state
   * This ensures compatibility with the existing getCurrentCNDSpec() function
   */
  const handleYamlChange = React.useCallback((newValue: string) => {
    setYamlValue(newValue);
    
    // Optionally trigger any global state updates needed by the demo
    // For example, if there's a global event system:
    // window.dispatchEvent(new CustomEvent('cnd-spec-changed', { detail: newValue }));
  }, []);

  /**
   * Handle view mode changes
   */
  const handleViewChange = React.useCallback((newIsNoCodeView: boolean) => {
    setIsNoCodeView(newIsNoCodeView);
    console.log(`Switched to ${newIsNoCodeView ? 'No Code' : 'Code'} View`);
  }, []);

  return (
    <CndLayoutInterface
      value={yamlValue}
      onChange={handleYamlChange}
      isNoCodeView={isNoCodeView}
      onViewChange={handleViewChange}
      aria-label="CND Layout Specification Editor"
    />
  );
}

/**
 * Mount the React component into the demo page
 * Call this function after the DOM is loaded
 */
export function mountCndLayoutInterface(): void {
  const container = document.getElementById('webcola-cnd-container');
  
  if (!container) {
    console.error('Container #webcola-cnd-container not found');
    return;
  }

  try {
    const root = createRoot(container);
    root.render(<CndLayoutInterfaceWrapper />);
    console.log('✅ CndLayoutInterface mounted successfully');
  } catch (error) {
    console.error('Failed to mount CndLayoutInterface:', error);
  }
}

/**
 * Update the existing getCurrentCNDSpec function to work with React component
 * This maintains compatibility with the existing demo JavaScript
 */
export function getCurrentCNDSpecFromReact(): string | undefined {
  // Try to get value from React component's textarea first
  const reactTextarea = document.querySelector('#webcola-cnd-container textarea');
  if (reactTextarea && reactTextarea instanceof HTMLTextAreaElement) {
    return reactTextarea.value.trim();
  }

  // Error handling if React component is not found
  console.error('CndLayoutInterface textarea not found');
}

/**
 * Example of how to update the demo page's JavaScript to use the React component
 * 
 * Replace the original getCurrentCNDSpec function with:
 * 
 * function getCurrentCNDSpec() {
 *   return getCurrentCNDSpecFromReact();
 * }
 * 
 * And add this to the window load event:
 * 
 * window.addEventListener('load', () => {
 *   initializePipeline();
 *   mountCndLayoutInterface();
 * });
 */

// For global access in the demo page
if (typeof window !== 'undefined') {
  (window as any).mountCndLayoutInterface = mountCndLayoutInterface;
  (window as any).getCurrentCNDSpecFromReact = getCurrentCNDSpecFromReact;
}
