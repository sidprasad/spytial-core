/**
 * Example integration of CndLayoutInterface and InstanceBuilder with webcola-integrated-demo.html
 * 
 * This file demonstrates how to mount the React components into the existing demo page
 * and integrate them with the existing JavaScript functions.
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { InstanceBuilder } from '../src/components/InstanceBuilder/InstanceBuilder';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';
import { createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';
import { ErrorMessageModal } from '../src/components/ErrorMessageModal/ErrorMessageModal';
import { ErrorMessages } from '../src/layout/constraint-validator';

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
 * Global state manager for the integrated demo
 */
class IntegratedDemoStateManager {
  private static instance: IntegratedDemoStateManager;
  private currentInstance: IInputDataInstance;
  private instanceChangeCallbacks: ((instance: IInputDataInstance) => void)[] = [];

  constructor() {
    this.currentInstance = createEmptyAlloyDataInstance();
  }

  public static getInstance(): IntegratedDemoStateManager {
    if (!IntegratedDemoStateManager.instance) {
      IntegratedDemoStateManager.instance = new IntegratedDemoStateManager();
    }
    return IntegratedDemoStateManager.instance;
  }

  public getCurrentInstance(): IInputDataInstance {
    return this.currentInstance;
  }

  public setCurrentInstance(instance: IInputDataInstance): void {
    this.currentInstance = instance;
    this.notifyInstanceChange();
  }

  public onInstanceChange(callback: (instance: IInputDataInstance) => void): void {
    this.instanceChangeCallbacks.push(callback);
  }

  private notifyInstanceChange(): void {
    this.instanceChangeCallbacks.forEach(callback => {
      try {
        callback(this.currentInstance);
      } catch (error) {
        console.error('Error in instance change callback:', error);
      }
    });
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
    
    // ENFORCE CnD constraints on every spec change
    if ((window as any).updateFromCnDSpec) {
      (window as any).updateFromCnDSpec();
    }
    
    // Also trigger custom event for other listeners
    window.dispatchEvent(new CustomEvent('cnd-spec-changed', { detail: newValue }));
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
    
    // ENFORCE CnD constraints when constraints change in No-Code view
    if ((window as any).updateFromCnDSpec) {
      setTimeout(() => (window as any).updateFromCnDSpec(), 100);
    }
  }, []);

  /**
   * Handle directives updates with functional setState
   */
  const handleSetDirectives = React.useCallback((updater: (prev: DirectiveData[]) => DirectiveData[]) => {
    setDirectives(updater);
    
    // ENFORCE CnD constraints when directives change in No-Code view
    if ((window as any).updateFromCnDSpec) {
      setTimeout(() => (window as any).updateFromCnDSpec(), 100);
    }
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
 * React component wrapper for InstanceBuilder with integrated demo state
 */
const IntegratedInstanceBuilder: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance>(() => 
    IntegratedDemoStateManager.getInstance().getCurrentInstance()
  );

  useEffect(() => {
    const stateManager = IntegratedDemoStateManager.getInstance();
    
    // Listen for external instance changes
    const handleInstanceChange = (newInstance: IInputDataInstance) => {
      setInstance(newInstance);
    };
    
    stateManager.onInstanceChange(handleInstanceChange);
    
    // Expose instance to global scope for the HTML demo
    (window as any).currentInstance = instance;
    
    // Trigger update in the HTML demo
    if ((window as any).updateFromBuilder) {
      (window as any).updateFromBuilder();
    }
  }, [instance]);

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Update global state
    IntegratedDemoStateManager.getInstance().setCurrentInstance(newInstance);
    
    // Update global reference
    (window as any).currentInstance = newInstance;
    
    // Notify the HTML demo
    if ((window as any).updateFromBuilder) {
      (window as any).updateFromBuilder();
    }
    
    // Auto-render for smooth updates
    if ((window as any).autoRenderGraph) {
      setTimeout(() => (window as any).autoRenderGraph(), 50);
    }
  };

  return (
    <InstanceBuilder
      instance={instance}
      onChange={handleInstanceChange}
      className="integrated-demo-builder"
    />
  );
};

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
 * Mount InstanceBuilder component into the demo page
 * 
 * @example
 * ```javascript
 * // In your demo page JavaScript:
 * window.addEventListener('load', () => {
 *   mountInstanceBuilder();
 * });
 * ```
 */
export function mountInstanceBuilder(): void {
  try {
    const container = document.getElementById('instance-builder-container');
    if (!container) {
      console.error('InstanceBuilder container not found. Make sure element with id "instance-builder-container" exists.');
      return;
    }

    console.log('Mounting InstanceBuilder component...');
    const root = createRoot(container);
    root.render(<IntegratedInstanceBuilder />);
    console.log('✅ InstanceBuilder mounted successfully');

    // Expose instance update function globally
    (window as any).updateBuilderInstance = (newInstance: IInputDataInstance) => {
      IntegratedDemoStateManager.getInstance().setCurrentInstance(newInstance);
    };

  } catch (error) {
    console.error('Failed to mount InstanceBuilder:', error);
  }
}

/**
 * Get current instance from InstanceBuilder component
 */
export function getCurrentInstanceFromReact(): IInputDataInstance | undefined {
  try {
    return IntegratedDemoStateManager.getInstance().getCurrentInstance();
  } catch (error) {
    console.error('Error accessing InstanceBuilder instance:', error);
    return undefined;
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
 * Mount both InstanceBuilder and CndLayoutInterface components
 */
export function mountIntegratedComponents(): void {
  console.log('Mounting integrated demo components...');
  
  try {
    mountInstanceBuilder();
    mountCndLayoutInterface();
    console.log('✅ All integrated components mounted successfully');
  } catch (error) {
    console.error('Failed to mount integrated components:', error);
  }
}

/**
 * Mount the ErrorMessageModal React component to replace the error-messages div
 * @param containerId - ID of the container element (default: 'error-messages')
 */
export function mountErrorMessageModal(messages: ErrorMessages, containerId: string = 'error-messages'): void {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Error messages container with ID '${containerId}' not found`);
    return;
  }

  // Create React root and render the component
  const root = createRoot(container);
  root.render(<ErrorMessageModal messages={messages} />);

  console.log(`ErrorMessageModal component mounted to #${containerId}`);
}

// For global access in the demo page
if (typeof window !== 'undefined') {
  (window as any).mountCndLayoutInterface = mountCndLayoutInterface;
  (window as any).getCurrentCNDSpecFromReact = getCurrentCNDSpecFromReact;
  (window as any).mountInstanceBuilder = mountInstanceBuilder;
  (window as any).getCurrentInstanceFromReact = getCurrentInstanceFromReact;
  (window as any).mountIntegratedComponents = mountIntegratedComponents;
  (window as any).mountErrorMessageModal = mountErrorMessageModal;
  
  // Auto-mount components when page loads
  window.addEventListener('load', () => {
    // Give the page time to initialize
    setTimeout(() => {
      mountIntegratedComponents();
    }, 1000);
  });
}
