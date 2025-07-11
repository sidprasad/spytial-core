/**
 * Example integration of CndLayoutInterface and InstanceBuilder with webcola-integrated-demo.html
 * 
 * This file demonstrates how to mount the React components into the existing demo page
 * and integrate them with the existing JavaScript functions.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { InstanceBuilder } from '../src/components/InstanceBuilder/InstanceBuilder';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';
import { generateLayoutSpecYaml } from '../src/components/NoCodeView/CodeView';
import { createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';
import { ErrorMessageContainer, ErrorStateManager } from '../src/components/ErrorMessageModal/index'
import { ErrorMessages } from '../src/layout/constraint-validator';

/**
 * Configuration options for mounting CndLayoutInterface
 * @public
 */
export interface CndLayoutMountConfig {
  /** Initial YAML specification value */
  initialYamlValue?: string;
  /** Initial view mode - true for No-Code, false for Code */
  initialIsNoCodeView?: boolean;
  /** Initial constraints array */
  initialConstraints?: ConstraintData[];
  /** Initial directives array */
  initialDirectives?: DirectiveData[];
}

/****
 * 
 * STATE MANAGERS
 * 
 */


/**
 * Singleton state manager for CnD layout specifications
 * Handles constraints, directives, and YAML generation
 * 
 * @public
 */
export class CndLayoutStateManager {
  private static instance: CndLayoutStateManager;
  private constraints: ConstraintData[] = [];
  private directives: DirectiveData[] = [];
  private yamlValue: string = '';
  private isNoCodeView: boolean = false;

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
   * Initialize state manager with configuration values
   * Overrides existing values completely
   * @param config - Configuration object
   * @public
   */
  public initializeWithConfig(config: CndLayoutMountConfig): void {
    if (config.initialYamlValue !== undefined) {
      this.yamlValue = config.initialYamlValue;
    }
    if (config.initialIsNoCodeView !== undefined) {
      this.isNoCodeView = config.initialIsNoCodeView;
    }
    if (config.initialConstraints !== undefined) {
      this.constraints = [...config.initialConstraints];
    }
    if (config.initialDirectives !== undefined) {
      this.directives = [...config.initialDirectives];
    }
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
   * Update layout view mode
   * @param isNoCodeView - Whether to use No-Code view
   * @public
   */
  public setIsNoCodeView(isNoCodeView: boolean): void {
    this.isNoCodeView = isNoCodeView;
  }

  /**
   * Get current layout view mode
   * @returns True if in No-Code view, false for Code view
   * @public
   */
  public getIsNoCodeView(): boolean {
    return this.isNoCodeView;
  }

  /**
   * Get current constraints
   * @returns Current constraints array
   * @public
   */
  public getConstraints(): ConstraintData[] {
    return [...this.constraints];
  }

  /**
   * Get current directives
   * @returns Current directives array
   * @public
   */
  public getDirectives(): DirectiveData[] {
    return [...this.directives];
  }

  /**
   * Get current YAML value
   * @returns Current YAML string
   * @public
   */
  public getYamlValue(): string {
    return this.yamlValue;
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
 * Singleton state manager for data instances
 * Manages current data instance and change notifications
 * 
 * @public
 */
export class InstanceStateManager {
  private static instance: InstanceStateManager;
  private currentInstance: IInputDataInstance;
  private instanceChangeCallbacks: ((instance: IInputDataInstance) => void)[] = [];

  private constructor() {
    this.currentInstance = createEmptyAlloyDataInstance();
  }

  /**
   * Get singleton instance
   * @returns The global instance state manager
   * @public
   */
  public static getInstance(): InstanceStateManager {
    if (!InstanceStateManager.instance) {
      InstanceStateManager.instance = new InstanceStateManager();
    }
    return InstanceStateManager.instance;
  }

  /**
   * Get current data instance
   * @returns Current data instance
   * @public
   */
  public getCurrentInstance(): IInputDataInstance {
    return this.currentInstance;
  }

  /**
   * Set current data instance and notify callbacks
   * @param instance - New data instance
   * @public
   */
  public setCurrentInstance(instance: IInputDataInstance): void {
    this.currentInstance = instance;
    this.notifyInstanceChange();
  }

  /**
   * Register callback for instance changes
   * @param callback - Function to call when instance changes
   * @public
   */
  public onInstanceChange(callback: (instance: IInputDataInstance) => void): void {
    this.instanceChangeCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks of instance change
   * @private
   */
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
 * Global error state manager instance
 * Singleton for managing error display across the application
 * 
 * @public
 */
export const globalErrorManager = new ErrorStateManager();

/****
 * REACT COMPONENT WRAPPERS
 */

/**
 * React wrapper component for CndLayoutInterface
 * Integrates with global state management and provides compatibility hooks
 * 
 * @private
 */
const CndLayoutInterfaceWrapper: React.FC<{ config?: CndLayoutMountConfig }> = ({ config }) => {
  /** Get state manager instance */
  const stateManager = useMemo(() => CndLayoutStateManager.getInstance(), []);
  
  /** Initialize state with config values or state manager values */
  // Initialize state with config values or state manager values
  const [yamlValue, setYamlValue] = useState<string>(() => {
    if (config?.initialYamlValue !== undefined) {
      return config.initialYamlValue;
    }
    return stateManager.getYamlValue();
  });
  
  const [isNoCodeView, setIsNoCodeView] = useState<boolean>(() => {
    if (config?.initialIsNoCodeView !== undefined) {
      return config.initialIsNoCodeView;
    }
    return stateManager.getIsNoCodeView();
  });
  
  const [constraints, setConstraints] = useState<ConstraintData[]>(() => {
    if (config?.initialConstraints !== undefined) {
      return [...config.initialConstraints];
    }
    return stateManager.getConstraints();
  });
  
  const [directives, setDirectives] = useState<DirectiveData[]>(() => {
    if (config?.initialDirectives !== undefined) {
      return [...config.initialDirectives];
    }
    return stateManager.getDirectives();
  });

  // Initialize state manager with config on mount
  useEffect(() => {
    if (config) {
      stateManager.initializeWithConfig(config);
    }
  }, [config, stateManager]);

  /** Sync with class state variables */
  useEffect(() => {
    stateManager.setConstraints(constraints);
  }, [constraints, stateManager]);

  useEffect(() => {
    stateManager.setDirectives(directives);
  }, [directives, stateManager]);

  useEffect(() => {
    stateManager.setYamlValue(yamlValue);
  }, [yamlValue, stateManager]);

  useEffect(() => {
    stateManager.setIsNoCodeView(isNoCodeView);
  }, [isNoCodeView, stateManager]);

  /**
   * Handle YAML value changes and update the global state
   * This ensures compatibility with the existing getCurrentCNDSpec() function
   */
  const handleYamlChange = useCallback((newValue: string) => {
    setYamlValue(newValue);
    
    // ENFORCE CnD constraints on every spec change
    if ((window as any).updateFromCnDSpec) {
      (window as any).updateFromCnDSpec();
    }
    
    // Dispatch custom event for other listeners
    window.dispatchEvent(new CustomEvent('cnd-spec-changed', { detail: newValue }));
  }, []);

  /**
   * Handle view mode changes
   */
  const handleViewChange = useCallback((newIsNoCodeView: boolean) => {
    setIsNoCodeView(newIsNoCodeView);
    console.log(`Switched to ${newIsNoCodeView ? 'No Code' : 'Code'} View`);
  }, []);

  /**
   * Handle constraints updates with functional setState
   */
  const handleSetConstraints = useCallback((updater: (prev: ConstraintData[]) => ConstraintData[]) => {
    setConstraints(updater);
    
    // ENFORCE CnD constraints when constraints change in No-Code view
    if ((window as any).updateFromCnDSpec) {
      setTimeout(() => (window as any).updateFromCnDSpec(), 100);
    }
  }, []);

  /**
   * Handle directives updates with functional setState
   */
  const handleSetDirectives = useCallback((updater: (prev: DirectiveData[]) => DirectiveData[]) => {
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
 * React wrapper component for InstanceBuilder
 * Connects with global instance state management
 * 
 * @private
 */
const InstanceBuilderWrapper: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance>(() => 
    InstanceStateManager.getInstance().getCurrentInstance()
  );

  useEffect(() => {
    const stateManager = InstanceStateManager.getInstance();
    
    const handleInstanceChange = (newInstance: IInputDataInstance) => {
      setInstance(newInstance);
    };
    
    stateManager.onInstanceChange(handleInstanceChange);
    
    // Expose to global scope for legacy compatibility
    (window as any).currentInstance = instance;
    
    // Trigger legacy update functions
    if ((window as any).updateFromBuilder) {
      (window as any).updateFromBuilder();
    }
  }, [instance]);

  const handleInstanceChange = useCallback((newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Update global state
    InstanceStateManager.getInstance().setCurrentInstance(newInstance);
    
    // Update global reference for legacy compatibility
    (window as any).currentInstance = newInstance;
    
    // Notify legacy demo code
    if ((window as any).updateFromBuilder) {
      (window as any).updateFromBuilder();
    }
    
    // Auto-render with delay for smooth updates
    if ((window as any).autoRenderGraph) {
      setTimeout(() => (window as any).autoRenderGraph(), 50);
    }
  }, []);

  return (
    <InstanceBuilder
      instance={instance}
      onChange={handleInstanceChange}
      className="cnd-integrated-builder"
    />
  );
};

/****
 * 
 * PUBLIC MOUNTING FUNCTIONS
 * 
 */

/**
 * Mount CndLayoutInterface component into specified container
 * 
 * @param containerId - DOM element ID to mount into (default: 'webcola-cnd-container')
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Mount into default container
 * CnDCore.mountLayoutInterface();
 * 
 * // Mount into custom container
 * CnDCore.mountLayoutInterface('my-custom-container');
 * ```
 * 
 * @public
 */
export function mountCnDLayoutInterface(
  containerId: string = 'webcola-cnd-container',
  config?: CndLayoutMountConfig
): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`CnD Layout Interface: Container '${containerId}' not found`);
    return false;
  }

  // TODO: Write an actual YAML validator
  function validateYamlValue(yaml: string): boolean {
    return true;
  }

  if (config?.initialYamlValue && !validateYamlValue(config.initialYamlValue)) {
    console.error('Invalid YAML value provided in configuration');
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<CndLayoutInterfaceWrapper config={config} />);

    if (config) {
      console.log(`✅ CnD Layout Interface mounted to #${containerId} with initial config:`, {
        yamlValue: config.initialYamlValue ? `${config.initialYamlValue.length} characters` : 'none',
        isNoCodeView: config.initialIsNoCodeView ?? 'default',
        constraints: config.initialConstraints?.length ?? 0,
        directives: config.initialDirectives?.length ?? 0
      });
    } else {
      console.log(`✅ CnD Layout Interface mounted to #${containerId}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to mount CnD Layout Interface:', error);
    return false;
  }
}

/**
 * Mount InstanceBuilder component into specified container
 * 
 * @param containerId - DOM element ID to mount into (default: 'instance-builder-container')
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Mount into default container  
 * CnDCore.mountInstanceBuilder();
 * 
 * // Mount into custom container
 * CnDCore.mountInstanceBuilder('my-builder-container');
 * ```
 * 
 * @public
 */
export function mountInstanceBuilder(containerId: string = 'instance-builder-container'): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Instance Builder: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<InstanceBuilderWrapper />);
    console.log(`✅ Instance Builder mounted to #${containerId}`);

    // Expose instance update function globally for legacy compatibility
    (window as any).updateBuilderInstance = (newInstance: IInputDataInstance) => {
      InstanceStateManager.getInstance().setCurrentInstance(newInstance);
    };

    return true;
  } catch (error) {
    console.error('Failed to mount Instance Builder:', error);
    return false;
  }
}

/**
 * Get current instance from InstanceBuilder component
 */
export function getCurrentInstanceFromReact(): IInputDataInstance | undefined {
  try {
    return InstanceStateManager.getInstance().getCurrentInstance();
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
 * Mount ErrorMessageModal component into specified container
 * 
 * @param containerId - DOM element ID to mount into (default: 'error-messages')
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Mount into default container
 * CnDCore.mountErrorModal();
 * 
 * // Mount into custom container
 * CnDCore.mountErrorModal('my-error-container');
 * ```
 * 
 * @public
 */
export function mountErrorMessageModal(containerId: string = 'error-messages'): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Error Modal: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<ErrorMessageContainer errorManager={globalErrorManager} />);
    console.log(`✅ Error Modal mounted to #${containerId}`);
    return true;
  } catch (error) {
    console.error('Failed to mount Error Modal:', error);
    return false;
  }
}

/**
 * Mount all CnD components into their default containers
 * Convenience function for quick setup
 * 
 * @returns Object with success status for each component
 * 
 * @example
 * ```javascript
 * // Mount all components at once
 * const results = CnDCore.mountAllComponents();
 * console.log('Mount results:', results);
 * ```
 * 
 * @public
 */
export function mountAllComponents(): {
  layoutInterface: boolean;
  instanceBuilder: boolean;
  errorModal: boolean;
} {
  console.log('🚀 Mounting all CnD components...');
  
  const results = {
    layoutInterface: mountCnDLayoutInterface(),
    instanceBuilder: mountInstanceBuilder(),
    errorModal: mountErrorMessageModal()
  };

  const successCount = Object.values(results).filter(Boolean).length;
  console.log(`✅ Successfully mounted ${successCount}/3 CnD components`);
  
  return results;
}

/****
 * ERROR MANAGEMENT API
 */

/**
 * Error management functions for CDN users
 * Provides a clean API for displaying different types of errors
 * 
 * @public
 */
export const ErrorAPI = {
  /**
   * Display a parse error with optional source context
   * @param message - Error message
   * @param source - Optional source context (e.g., "Layout Specification")
   */
  showParseError: (message: string, source?: string): void => {
    globalErrorManager.setError({
      type: 'parse-error',
      message,
      source
    });
  },

  /**
   * Display a group overlap error
   * @param message - Error message
   * @param source - Optional source context
   */
  showGroupOverlapError: (message: string, source?: string): void => {
    globalErrorManager.setError({
      type: 'group-overlap-error',
      message,
      source
    });
  },

  /**
   * Display constraint conflict errors
   * @param errorMessages - Detailed constraint conflict information
   */
  showConstraintError: (errorMessages: ErrorMessages): void => {
    globalErrorManager.setError({
      type: 'positional-error',
      messages: errorMessages
    });
  },

  /**
   * Display general error message
   * @param message - Error message
   */
  showGeneralError: (message: string): void => {
    globalErrorManager.setError({
      type: 'general-error',
      message
    });
  },

  /**
   * Clear all error messages
   */
  clearAllErrors: (): void => {
    globalErrorManager.clearError();
  },

  /**
   * Check if there are active errors
   * @returns True if there are active errors
   */
  hasActiveErrors: (): boolean => {
    return globalErrorManager.hasError();
  }
};

/****
 * DATA ACCESS API  
 */

/**
 * Data access functions for CDN users
 * Provides access to current state and instances
 * 
 * @public
 */
export const DataAPI = {
  /**
   * Get current CND specification from React component state
   * @returns Current CND specification string or undefined if not available
   */
  getCurrentCndSpec: (): string | undefined => {
    try {
      const stateManager = CndLayoutStateManager.getInstance();
      const currentSpec = stateManager.getCurrentCndSpec();

      if (currentSpec.trim()) {
        return currentSpec;
      }

      // Fallback: Try to get value from DOM
      const reactTextarea = document.querySelector('#webcola-cnd-container textarea');
      if (reactTextarea instanceof HTMLTextAreaElement) {
        return reactTextarea.value.trim();
      }

      console.warn('CndLayoutInterface not found or empty');
      return undefined;
    } catch (error) {
      console.error('Error accessing CND specification:', error);
      return undefined;
    }
  },

  /**
   * Get current data instance from InstanceBuilder component
   * @returns Current data instance or undefined if not available
   */
  getCurrentInstance: (): IInputDataInstance | undefined => {
    try {
      return InstanceStateManager.getInstance().getCurrentInstance();
    } catch (error) {
      console.error('Error accessing current instance:', error);
      return undefined;
    }
  },

  /**
   * Update current data instance programmatically
   * @param instance - New data instance
   */
  updateInstance: (instance: IInputDataInstance): void => {
    try {
      InstanceStateManager.getInstance().setCurrentInstance(instance);
    } catch (error) {
      console.error('Error updating instance:', error);
    }
  }
};

/****
 * GLOBAL EXPOSURE FOR CDN
 */

/**
 * Global CnDCore object for CDN usage
 * Exposes all public functions and classes in a clean namespace
 * 
 * @public
 */
export const CnDCore = {
  // Mounting functions
  mountCnDLayoutInterface,
  mountInstanceBuilder, 
  mountErrorMessageModal,
  mountAllComponents,

  // State managers
  CndLayoutStateManager,
  InstanceStateManager,
  globalErrorManager,

  // API namespaces
  ErrorAPI,
  DataAPI,
};

// Expose to global scope for legacy usage
if (typeof window !== 'undefined') {
  (window as any).CnDCore = CnDCore;
  
  // Legacy compatibility - expose individual functions
  (window as any).mountCnDLayoutInterface = mountCnDLayoutInterface;
  (window as any).mountInstanceBuilder = mountInstanceBuilder;
  (window as any).mountErrorMessageModal = mountErrorMessageModal;
  (window as any).mountIntegratedComponents = mountAllComponents;

  // Expose data functions for legacy compatibility
  (window as any).getCurrentCNDSpecFromReact = DataAPI.getCurrentCndSpec;
  (window as any).getCurrentInstanceFromReact = DataAPI.getCurrentInstance;
  
  // Expose error functions for legacy compatibility
  (window as any).showParseError = ErrorAPI.showParseError;
  (window as any).showGroupOverlapError = ErrorAPI.showGroupOverlapError;
  (window as any).showPositionalError = ErrorAPI.showConstraintError;
  (window as any).showGeneralError = ErrorAPI.showGeneralError;
  (window as any).clearAllErrors = ErrorAPI.clearAllErrors;

  console.log('🎉 CnD-Core CDN integration ready! Use window.CnDCore to access all features.');
}
