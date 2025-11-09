/**
 * Browser entry point for WebCola Spytial Graph visualization
 * This file registers the custom element and exposes it globally
 */

// Import the custom element class
import { WebColaSpytialGraph } from './translators/webcola/webcola-spytial-graph';


// Define a function to register the custom element
function registerWebColaSpytialGraph() {
  if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
    // Only register if not already registered
    if (!customElements.get('webcola-spytial-graph')) {
      try {
        customElements.define('webcola-spytial-graph', WebColaSpytialGraph as any);
        console.log('WebCola Spytial Graph custom element registered successfully');
      } catch (error) {
        console.error('Failed to register WebCola Spytial Graph custom element:', error);
      }
    }
  }
}

// Auto-register when this module is loaded
registerWebColaSpytialGraph();

// Export for programmatic use
export { WebColaSpytialGraph, registerWebColaSpytialGraph };

// Export all the main Spytial Core functionality
export * from './index';

// Also expose on global object for script tag usage
if (typeof window !== 'undefined') {
  const globalWindow = window as any;
  globalWindow.WebColaSpytialGraph = WebColaSpytialGraph;
  globalWindow.registerWebColaSpytialGraph = registerWebColaSpytialGraph;
  
  // Import and expose Spytial Core on the global object
  import('./index').then((SpytialCore) => {
    globalWindow.SpytialCore = SpytialCore;
    //console.log('✅ SpytialCore library loaded globally with JSONDataInstance support');
  }).catch(console.error);
}
