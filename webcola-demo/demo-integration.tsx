/**
 * Example integration of CndLayoutInterface with webcola-demo.html
 * 
 * This file demonstrates how to mount the React component into the existing demo page
 * and integrate it with the existing JavaScript functions.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';

class CndLayoutStateManager {
  private static instance: CndLayoutStateManager;
  private constraints: ConstraintData[] = [];
  private directives: DirectiveData[] = [];
  private yamlValue: string = '';

  public constructor() {}

  /**
   * Get singleton instance of state manager
   * @returns The global state manager instance
   */
  public static getInstance(): CndLayoutStateManager {
    if (!CndLayoutStateManager.instance) {
      CndLayoutStateManager.instance = new CndLayoutStateManager();
    }
    return CndLayoutStateManager.instance;
  }

  /**
   * Update constraints array
   * @param constraints - New constraints array
   */
  public setConstraints(constraints: ConstraintData[]): void {
    this.constraints = constraints;
  }

  /**
   * Update directives array
   * @param directives - New directives array
   */
  public setDirectives(directives: DirectiveData[]): void {
    this.directives = directives;
  }

  /**
   * Update YAML value
   * @param yamlValue - New YAML string
   */
  public setYamlValue(yamlValue: string): void {
    this.yamlValue = yamlValue;
  }

  /**
   * Generate YAML spec from current constraints and directives
   * @returns Generated YAML specification string
   */
  public generateCurrentYamlSpec(): string {
    try {
      return generateLayoutSpecYaml(this.constraints, this.directives);
    } catch (error) {
      console.error('Failed to generate YAML spec from state:', error);
      return '';
    }
  }

  /**
   * Get the most current CND specification
   * Prioritizes manual YAML input over generated spec
   * @returns Current CND specification string
   */
  public getCurrentCndSpec(): string {
    // If user has manually entered YAML, use that
    if (this.yamlValue.trim()) {
      return this.yamlValue;
    }
    
    // Otherwise generate from constraints/directives
    return this.generateCurrentYamlSpec();
  }
}

/**
 * Integration wrapper component that connects the React component
 * with the existing demo page's JavaScript functions
 */
function CndLayoutInterfaceWrapper() {
  const [yamlValue, setYamlValue] = React.useState<string>('');
  const [isNoCodeView, setIsNoCodeView] = React.useState<boolean>(false);
  const [constraints, setConstraints] = React.useState<ConstraintData[]>([]);
  const [directives, setDirectives] = React.useState<DirectiveData[]>([]);

  /** Get state manager instance */
  const stateManager = React.useMemo(() => CndLayoutStateManager.getInstance(), []);

  /** Sync with class state variables */
  React.useEffect(() => {
    stateManager.setConstraints(constraints);
  }, [constraints]);

  React.useEffect(() => {
    stateManager.setDirectives(directives);
  }, [directives]);

  React.useEffect(() => {
    stateManager.setYamlValue(yamlValue);
  }, [yamlValue]);

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

  /**
   * Handle constraints updates with functional setState
   */
  const handleSetConstraints = React.useCallback((updater: (prev: ConstraintData[]) => ConstraintData[]) => {
    setConstraints(updater);
  }, []);

  /**
   * Handle directives updates with functional setState
   */
  const handleSetDirectives = React.useCallback((updater: (prev: DirectiveData[]) => DirectiveData[]) => {
    setDirectives(updater);
  }, []);

  return (
    <CndLayoutInterface
      yamlValue={yamlValue}
      onChange={handleYamlChange}
      isNoCodeView={isNoCodeView}
      onViewChange={handleViewChange}
      constraints={constraints}
      setConstraints={handleSetConstraints}
      directives={directives}
      setDirectives={handleSetDirectives}
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
 * Get current CND specification from React component state
 * This function provides access to the most current specification
 * 
 * @returns Current CND specification string or undefined if not available
 * 
 * @example
 * ```javascript
 * // In your demo page JavaScript:
 * const cndSpec = getCurrentCNDSpecFromReact();
 * if (cndSpec) {
 *   console.log('Current spec:', cndSpec);
 * }
 * ```
 */
export function getCurrentCNDSpecFromReact(): string | undefined {
  try {
    const stateManager = CndLayoutStateManager.getInstance();
    const currentSpec = stateManager.generateCurrentYamlSpec();

    if (currentSpec.trim()) {
      return currentSpec;
    }
  
    // Fallback: Try to get value from the DOM
    const reactTextarea = document.querySelector('#webcola-cnd-container textarea');
    if (reactTextarea && reactTextarea instanceof HTMLTextAreaElement) {
      return reactTextarea.value.trim();
    }
  
    // Error handling if React component is not found
    console.warn('CndLayoutInterface textarea not found');
  } catch (error) {
    console.error('Error accessing CndLayoutInterface instance:', error);
  }
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
