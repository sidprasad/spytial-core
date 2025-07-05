/**
 * Browser entry point for WebCola CnD Graph visualization
 * This file registers the custom element and exposes it globally
 */

// Import the custom element class
import { WebColaCnDGraph } from './translators/webcola/webcola-cnd-graph';
// Import d3 and webcola to make them globally available
import * as d3 from 'd3';
import * as cola from 'webcola';

// Make d3 and webcola available globally for WebCola d3adaptor
if (typeof window !== 'undefined') {
  const globalWindow = window as any;
  globalWindow.d3 = d3;
  globalWindow.cola = cola;
}

// Define a function to register the custom element
function registerWebColaCnDGraph() {
  if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
    // Only register if not already registered
    if (!customElements.get('webcola-cnd-graph')) {
      try {
        customElements.define('webcola-cnd-graph', WebColaCnDGraph as any);
        console.log('WebCola CnD Graph custom element registered successfully');
      } catch (error) {
        console.error('Failed to register WebCola CnD Graph custom element:', error);
      }
    }
  }
}

// Auto-register when this module is loaded
registerWebColaCnDGraph();

// Export for programmatic use
export { WebColaCnDGraph, registerWebColaCnDGraph };

// Export all the main CnD Core functionality
export * from './index';

// Also expose on global object for script tag usage
if (typeof window !== 'undefined') {
  const globalWindow = window as any;
  globalWindow.WebColaCnDGraph = WebColaCnDGraph;
  globalWindow.registerWebColaCnDGraph = registerWebColaCnDGraph;
  
  // Import and expose CnD Core on the global object
  import('./index').then((CndCore) => {
    globalWindow.CndCore = CndCore;
    console.log('✅ CndCore library loaded globally with JSONDataInstance support');
  }).catch(console.error);
}
