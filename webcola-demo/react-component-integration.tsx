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
import { PyretReplInterface, PyretReplInterfaceProps } from '../src/components/ReplInterface/PyretReplInterface';
import { ReplWithVisualization, ReplWithVisualizationProps } from '../src/components/ReplInterface/ReplWithVisualization';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { PyretEvaluator } from '../src/components/ReplInterface/parsers/PyretExpressionParser';
import { CombinedInputComponent, CombinedInputConfig } from '../src/components/CombinedInput/CombinedInputComponent';
import { mountCombinedInput, CombinedInputMountConfig } from '../src/components/CombinedInput/mounting';
import { EvaluatorRepl } from '../src/components/EvaluatorRepl/EvaluatorRepl';
import { IEvaluator } from '../src/evaluators';
import { RelationHighlighter } from '../src/components/RelationHighlighter/RelationHighlighter';

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

/**
 * Configuration options for mounting PyretReplInterface
 * @public
 */
export interface PyretReplMountConfig {
  /** Initial Pyret data instance. If not provided, an empty instance will be created */
  initialInstance?: PyretDataInstance;
  /** External Pyret evaluator (e.g., window.__internalRepl) for enhanced features */
  externalEvaluator?: PyretEvaluator;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** CSS class name for styling */
  className?: string;
}

/**
 * Configuration options for mounting ReplWithVisualization
 * @public
 */
export interface ReplWithVisualizationMountConfig {
  /** Initial data instance to work with */
  initialInstance?: IInputDataInstance;
  /** Initial CND layout specification */
  initialCndSpec?: string;
  /** Whether to show the CND layout interface */
  showLayoutInterface?: boolean;
  /** Height of the REPL interface (default: 300px) */
  replHeight?: string;
  /** Height of the visualization area (default: 400px) */
  visualizationHeight?: string;
  /** Custom styling for the container */
  style?: React.CSSProperties;
}

/*******************************************************
 *                                                     *
 *                   STATE MANAGERS                    *
 *                                                     *
 *******************************************************/


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
    // If currently in Code View, return the YAML value directly
    if (!this.isNoCodeView) {
      return this.yamlValue.trim();
    } else {
      // If in No Code View, generate the spec from constraints and directives
      const generatedSpec = this.generateCurrentYamlSpec();
      return generatedSpec.trim();
    }
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
 * Singleton state manager for Pyret REPL instances
 * Manages current Pyret data instance and external evaluator
 * 
 * @public
 */
export class PyretReplStateManager {
  private static instance: PyretReplStateManager;
  private currentInstance: PyretDataInstance;
  private externalEvaluator: PyretEvaluator | null = null;
  private instanceChangeCallbacks: ((instance: PyretDataInstance) => void)[] = [];

  private constructor() {
    this.currentInstance = new PyretDataInstance();
  }

  /**
   * Get singleton instance
   * @returns The global Pyret REPL state manager
   * @public
   */
  public static getInstance(): PyretReplStateManager {
    if (!PyretReplStateManager.instance) {
      PyretReplStateManager.instance = new PyretReplStateManager();
    }
    return PyretReplStateManager.instance;
  }

  /**
   * Get current Pyret data instance
   * @returns Current Pyret data instance
   * @public
   */
  public getCurrentInstance(): PyretDataInstance {
    return this.currentInstance;
  }

  /**
   * Set current Pyret data instance and notify callbacks
   * @param instance - New Pyret data instance
   * @public
   */
  public setCurrentInstance(instance: PyretDataInstance): void {
    this.currentInstance = instance;
    this.notifyInstanceChange();
  }

  /**
   * Get current external evaluator
   * @returns Current external evaluator or null
   * @public
   */
  public getExternalEvaluator(): PyretEvaluator | null {
    return this.externalEvaluator;
  }

  /**
   * Set external evaluator
   * @param evaluator - External Pyret evaluator
   * @public
   */
  public setExternalEvaluator(evaluator: PyretEvaluator | null): void {
    this.externalEvaluator = evaluator;
  }

  /**
   * Register callback for instance changes
   * @param callback - Function to call when instance changes
   * @public
   */
  public onInstanceChange(callback: (instance: PyretDataInstance) => void): void {
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
        console.error('Error in Pyret instance change callback:', error);
      }
    });
  }

  /**
   * Get Pyret constructor notation (reify) of current instance
   * @returns Pyret constructor notation string
   * @public
   */
  public reifyCurrentInstance(): string {
    try {
      return this.currentInstance.reify();
    } catch (error) {
      console.error('Error reifying current instance:', error);
      return '/* Error generating Pyret notation */';
    }
  }
}

/**
 * Global error state manager instance
 * Singleton for managing error display across the application
 * 
 * @public
 */
export const globalErrorManager = new ErrorStateManager();





/*******************************************************
 *                                                     *
 *             REACT COMPONENT WRAPPERS                *
 *                                                     *
 *******************************************************/






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

/**
 * React wrapper component for PyretReplInterface
 * Connects with global Pyret state management and external evaluator
 * 
 * @private
 */
const PyretReplInterfaceWrapper: React.FC<{ config?: PyretReplMountConfig }> = ({ config }) => {
  const [instance, setInstance] = useState<PyretDataInstance>(() => {
    if (config?.initialInstance) {
      return config.initialInstance;
    }
    return PyretReplStateManager.getInstance().getCurrentInstance();
  });

  const [externalEvaluator, setExternalEvaluator] = useState<PyretEvaluator | null>(() => {
    if (config?.externalEvaluator) {
      return config.externalEvaluator;
    }
    return PyretReplStateManager.getInstance().getExternalEvaluator();
  });

  useEffect(() => {
    const stateManager = PyretReplStateManager.getInstance();
    
    // Initialize state manager with config
    if (config?.initialInstance) {
      stateManager.setCurrentInstance(config.initialInstance);
    }
    if (config?.externalEvaluator) {
      stateManager.setExternalEvaluator(config.externalEvaluator);
    }

    const handleInstanceChange = (newInstance: PyretDataInstance) => {
      setInstance(newInstance);
    };
    
    stateManager.onInstanceChange(handleInstanceChange);
    
    // Expose to global scope for legacy compatibility
    (window as any).currentPyretInstance = instance;
    
    return () => {
      // Cleanup would go here if we supported unsubscribing
    };
  }, [config, instance]);

  const handleInstanceChange = useCallback((newInstance: IInputDataInstance) => {
    if (newInstance instanceof PyretDataInstance) {
      setInstance(newInstance);
      
      // Update global state
      PyretReplStateManager.getInstance().setCurrentInstance(newInstance);
      
      // Update global reference for legacy compatibility
      (window as any).currentPyretInstance = newInstance;
      
      // Dispatch custom event for other listeners
      window.dispatchEvent(new CustomEvent('pyret-instance-changed', { 
        detail: { instance: newInstance } 
      }));
    }
  }, []);

  return (
    <PyretReplInterface
      initialInstance={instance}
      onChange={handleInstanceChange}
      externalEvaluator={externalEvaluator || undefined}
      disabled={config?.disabled}
      className={config?.className}
    />
  );
};

/**
 * React wrapper component for ReplWithVisualization
 * Provides integrated REPL and visualization experience
 * 
 * @private
 */
const ReplWithVisualizationWrapper: React.FC<{ config?: ReplWithVisualizationMountConfig }> = ({ config }) => {
  const [instance, setInstance] = useState<IInputDataInstance>(() => {
    if (config?.initialInstance) {
      return config.initialInstance;
    }
    return InstanceStateManager.getInstance().getCurrentInstance();
  });

  useEffect(() => {
    const stateManager = InstanceStateManager.getInstance();
    
    // Initialize with config if provided
    if (config?.initialInstance) {
      stateManager.setCurrentInstance(config.initialInstance);
    }

    const handleInstanceChange = (newInstance: IInputDataInstance) => {
      setInstance(newInstance);
    };
    
    stateManager.onInstanceChange(handleInstanceChange);
    
    // Expose to global scope for legacy compatibility
    (window as any).currentVisualizationInstance = instance;
  }, [config, instance]);

  const handleInstanceChange = useCallback((newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Update global state
    InstanceStateManager.getInstance().setCurrentInstance(newInstance);
    
    // Update global reference for legacy compatibility
    (window as any).currentVisualizationInstance = newInstance;
    
    // Auto-render with delay for smooth updates
    if ((window as any).autoRenderGraph) {
      setTimeout(() => (window as any).autoRenderGraph(), 50);
    }
    
    // Dispatch custom event for other listeners
    window.dispatchEvent(new CustomEvent('repl-visualization-changed', { 
      detail: { instance: newInstance } 
    }));
  }, []);

  return (
    <ReplWithVisualization
      instance={instance}
      onChange={handleInstanceChange}
      initialCndSpec={config?.initialCndSpec}
      showLayoutInterface={config?.showLayoutInterface}
      replHeight={config?.replHeight}
      visualizationHeight={config?.visualizationHeight}
      style={config?.style}
    />
  );
};





/*******************************************************
 *                                                     *
 *             PUBLIC MOUNTING FUNCTIONS               *
 *                                                     *
 *******************************************************/





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
export function mountCndLayoutInterface(
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

// FIXME: Can this be deleted? It seems to be unused.
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
 * Mount PyretReplInterface component into specified container
 * 
 * @param containerId - DOM element ID to mount into (default: 'pyret-repl-container')
 * @param config - Configuration options for the Pyret REPL
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Mount into default container
 * CnDCore.mountPyretRepl();
 * 
 * // Mount with external evaluator
 * CnDCore.mountPyretRepl('my-repl', { 
 *   externalEvaluator: window.__internalRepl 
 * });
 * 
 * // Mount with initial instance
 * const instance = new PyretDataInstance(myPyretData);
 * CnDCore.mountPyretRepl('my-repl', { initialInstance: instance });
 * ```
 * 
 * @public
 */
export function mountPyretRepl(
  containerId: string = 'pyret-repl-container',
  config?: PyretReplMountConfig
): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Pyret REPL: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<PyretReplInterfaceWrapper config={config} />);

    if (config) {
      console.log(`✅ Pyret REPL mounted to #${containerId} with config:`, {
        hasInitialInstance: !!config.initialInstance,
        hasExternalEvaluator: !!config.externalEvaluator,
        disabled: config.disabled ?? false,
        className: config.className ?? 'default'
      });
    } else {
      console.log(`✅ Pyret REPL mounted to #${containerId}`);
    }

    // Expose Pyret-specific functions globally for legacy compatibility
    (window as any).getCurrentPyretInstance = () => {
      return PyretReplStateManager.getInstance().getCurrentInstance();
    };
    
    (window as any).reifyCurrentPyretInstance = () => {
      return PyretReplStateManager.getInstance().reifyCurrentInstance();
    };

    (window as any).updatePyretInstance = (newInstance: PyretDataInstance) => {
      PyretReplStateManager.getInstance().setCurrentInstance(newInstance);
    };

    return true;
  } catch (error) {
    console.error('Failed to mount Pyret REPL:', error);
    return false;
  }
}

/**
 * Mount ReplWithVisualization component into specified container
 * 
 * @param containerId - DOM element ID to mount into (default: 'repl-visualization-container')
 * @param config - Configuration options for the REPL with visualization
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Mount into default container
 * CnDCore.mountReplWithVisualization();
 * 
 * // Mount with custom configuration
 * CnDCore.mountReplWithVisualization('my-container', {
 *   showLayoutInterface: true,
 *   replHeight: '400px',
 *   visualizationHeight: '600px'
 * });
 * ```
 * 
 * @public
 */
export function mountReplWithVisualization(
  containerId: string = 'repl-visualization-container',
  config?: ReplWithVisualizationMountConfig
): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`REPL with Visualization: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<ReplWithVisualizationWrapper config={config} />);

    if (config) {
      console.log(`✅ REPL with Visualization mounted to #${containerId} with config:`, {
        hasInitialInstance: !!config.initialInstance,
        initialCndSpec: config.initialCndSpec ? `${config.initialCndSpec.length} characters` : 'none',
        showLayoutInterface: config.showLayoutInterface ?? true,
        replHeight: config.replHeight ?? '300px',
        visualizationHeight: config.visualizationHeight ?? '400px'
      });
    } else {
      console.log(`✅ REPL with Visualization mounted to #${containerId}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to mount REPL with Visualization:', error);
    return false;
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
 * Mount the EvaluatorRepl component into specified container
 * @param containerId - DOM element ID to mount into
 */
export function mountEvaluatorRepl(containerId: string, evaluator: IEvaluator, instanceNumber: number): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Evaluator REPL: Container '${containerId}' not found`);
    return false;
  }

  if (!evaluator) {
    console.error('Evaluator REPL: No evaluator provided');
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<EvaluatorRepl evaluator={evaluator} instanceNumber={instanceNumber}/>);
    console.log(`✅ Evaluator REPL mounted to #${containerId}`);
    return true;
  } catch (error) {
    console.error('Failed to mount Evaluator REPL:', error);
    return false;
  }
}

/**
 * Mount the RelationHighlighter component into specified container.
 * @param containerId - DOM element ID to mount into
 * @returns Boolean indicating success
 */
export function mountRelationHighlighter(containerId: string, graphElementId: string): boolean {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Relation Highlighter: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<RelationHighlighter graphElementId={graphElementId}/>);
    console.log(`✅ Relation Highlighter mounted to #${containerId}`);
    return true;
  } catch (error) {
    console.error('Failed to mount Relation Highlighter:', error);
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
    layoutInterface: mountCndLayoutInterface(),
    instanceBuilder: mountInstanceBuilder(),
    errorModal: mountErrorMessageModal()
  };

  const successCount = Object.values(results).filter(Boolean).length;
  console.log(`✅ Successfully mounted ${successCount}/3 CnD components`);
  
  return results;
}

/**
 * Mount CombinedInputComponent into specified container
 * 
 * This provides the simple API requested in the issue:
 * - Pass in initial data, evaluator, and CnD spec
 * - Get back a fully configured component with all sync logic handled internally
 * 
 * @param containerId - DOM element ID to mount into (default: 'combined-input-container')
 * @param config - Configuration object with all the user's inputs
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Simple usage as requested in the issue
 * const dataInstance = new CndCore.PyretDataInstance(v);
 * const evaluationContext = { sourceData: dataInstance };
 * const evaluator = new CndCore.Evaluators.SGraphQueryEvaluator();
 * evaluator.initialize(evaluationContext);
 * const pyretREPLInternal = window.__internalRepl;
 * const projections = {};
 * 
 * const success = CndCore.mountCombinedInput('my-container', {
 *   cndSpec: 'nodes:\n  - { id: node, type: atom }',
 *   dataInstance: dataInstance,
 *   pyretEvaluator: pyretREPLInternal,
 *   projections: projections
 * });
 * 
 * // With callbacks
 * CndCore.mountCombinedInput('container', {
 *   cndSpec: mySpec,
 *   onInstanceChange: (instance) => console.log('Data updated:', instance),
 *   onSpecChange: (spec) => console.log('Layout updated:', spec),
 *   height: '800px'
 * });
 * ```
 * 
 * @public
 */
export function mountCombinedInputComponent(
  containerId: string = 'combined-input-container',
  config?: CombinedInputMountConfig
): boolean {
  return mountCombinedInput({
    containerId,
    ...config
  });
}

/**
 * Mount all CnD components including Pyret REPL components into their default containers
 * Convenience function for comprehensive setup
 * 
 * @returns Object with success status for each component
 * 
 * @example
 * ```javascript
 * // Mount all components including Pyret ones at once
 * const results = CnDCore.mountAllComponentsWithPyret();
 * console.log('Mount results:', results);
 * ```
 * 
 * @public
 */
export function mountAllComponentsWithPyret(): {
  layoutInterface: boolean;
  instanceBuilder: boolean;
  errorModal: boolean;
  pyretRepl: boolean;
  replWithVisualization: boolean;
  combinedInput: boolean;
} {
  console.log('🚀 Mounting all CnD components with Pyret REPL and Combined Input...');
  
  const results = {
    layoutInterface: mountCndLayoutInterface(),
    instanceBuilder: mountInstanceBuilder(),
    errorModal: mountErrorMessageModal(),
    pyretRepl: mountPyretRepl(),
    replWithVisualization: mountReplWithVisualization(),
    combinedInput: mountCombinedInputComponent()
  };

  const successCount = Object.values(results).filter(Boolean).length;
  console.log(`✅ Successfully mounted ${successCount}/6 CnD components with Pyret integration and Combined Input`);
  
  return results;
}







/*******************************************************
 *                                                     *
 *                    ERROR API                        *
 *                                                     *
 *******************************************************/





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




/*******************************************************
 *                                                     *
 *                    DATA API                         *
 *                                                     *
 *******************************************************/



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
  },

  /**
   * Get current Pyret data instance from PyretReplInterface component
   * @returns Current Pyret data instance or undefined if not available
   */
  getCurrentPyretInstance: (): PyretDataInstance | undefined => {
    try {
      return PyretReplStateManager.getInstance().getCurrentInstance();
    } catch (error) {
      console.error('Error accessing current Pyret instance:', error);
      return undefined;
    }
  },

  /**
   * Update current Pyret data instance programmatically
   * @param instance - New Pyret data instance
   */
  updatePyretInstance: (instance: PyretDataInstance): void => {
    try {
      PyretReplStateManager.getInstance().setCurrentInstance(instance);
    } catch (error) {
      console.error('Error updating Pyret instance:', error);
    }
  },

  /**
   * Get Pyret constructor notation (reify) of current Pyret instance
   * @returns Pyret constructor notation string
   */
  reifyCurrentPyretInstance: (): string => {
    try {
      return PyretReplStateManager.getInstance().reifyCurrentInstance();
    } catch (error) {
      console.error('Error reifying current Pyret instance:', error);
      return '/* Error generating Pyret notation */';
    }
  },

  /**
   * Set external Pyret evaluator for enhanced features
   * @param evaluator - External Pyret evaluator (e.g., window.__internalRepl)
   */
  setExternalPyretEvaluator: (evaluator: PyretEvaluator | null): void => {
    try {
      PyretReplStateManager.getInstance().setExternalEvaluator(evaluator);
    } catch (error) {
      console.error('Error setting external Pyret evaluator:', error);
    }
  },

  /**
   * Get current external Pyret evaluator
   * @returns Current external evaluator or null
   */
  getExternalPyretEvaluator: (): PyretEvaluator | null => {
    try {
      return PyretReplStateManager.getInstance().getExternalEvaluator();
    } catch (error) {
      console.error('Error getting external Pyret evaluator:', error);
      return null;
    }
  }
};





/*******************************************************
 *                                                     *
 *               GLOBAL CnDCore OBJECT                 *
 *                                                     *
 *******************************************************/



/**
 * Global CnDCore object for CDN usage
 * Exposes all public functions and classes in a clean namespace
 * 
 * @public
 */
export const CnDCore = {
  // Mounting functions
  mountCndLayoutInterface,
  mountInstanceBuilder, 
  mountErrorMessageModal,
  mountAllComponents,
  mountEvaluatorRepl,
  mountRelationHighlighter,
  // Pyret REPL mounting functions
  mountPyretRepl,
  mountReplWithVisualization,
  mountAllComponentsWithPyret,
  // Combined Input mounting functions
  mountCombinedInput: mountCombinedInputComponent,

  // State managers
  CndLayoutStateManager,
  InstanceStateManager,
  PyretReplStateManager,
  globalErrorManager,

  // API namespaces
  ErrorAPI,
  DataAPI,

  // Direct Pyret utilities for convenience
  PyretDataInstance,
};




/*******************************************************
 *                                                     *
 *                  LEGACY EXPORTS                     *
 *                                                     *
 *******************************************************/




// Expose to global scope for legacy usage
if (typeof window !== 'undefined') {
  (window as any).CnDCore = CnDCore;
  
  // Legacy compatibility - expose individual functions
  (window as any).mountCndLayoutInterface = mountCndLayoutInterface;
  (window as any).mountInstanceBuilder = mountInstanceBuilder;
  (window as any).mountErrorMessageModal = mountErrorMessageModal;
  (window as any).mountIntegratedComponents = mountAllComponents;
  (window as any).mountEvaluatorRepl = mountEvaluatorRepl;
  (window as any).mountRelationHighlighter = mountRelationHighlighter;
  
  // Pyret REPL functions for legacy compatibility
  (window as any).mountPyretRepl = mountPyretRepl;
  (window as any).mountReplWithVisualization = mountReplWithVisualization;
  (window as any).mountAllComponentsWithPyret = mountAllComponentsWithPyret;
  // Combined Input functions for legacy compatibility
  (window as any).mountCombinedInput = mountCombinedInputComponent;

  // Expose data functions for legacy compatibility
  (window as any).getCurrentCNDSpecFromReact = DataAPI.getCurrentCndSpec;
  (window as any).getCurrentInstanceFromReact = DataAPI.getCurrentInstance;
  
  // Pyret-specific data functions for legacy compatibility
  (window as any).getCurrentPyretInstanceFromReact = DataAPI.getCurrentPyretInstance;
  (window as any).reifyCurrentPyretInstanceFromReact = DataAPI.reifyCurrentPyretInstance;
  (window as any).updatePyretInstanceFromReact = DataAPI.updatePyretInstance;
  (window as any).setExternalPyretEvaluator = DataAPI.setExternalPyretEvaluator;
  (window as any).getExternalPyretEvaluator = DataAPI.getExternalPyretEvaluator;
  
  // Expose error functions for legacy compatibility
  (window as any).showParseError = ErrorAPI.showParseError;
  (window as any).showGroupOverlapError = ErrorAPI.showGroupOverlapError;
  (window as any).showPositionalError = ErrorAPI.showConstraintError;
  (window as any).showGeneralError = ErrorAPI.showGeneralError;
  (window as any).clearAllErrors = ErrorAPI.clearAllErrors;

  console.log('🎉 CnD-Core CDN integration ready! Use window.CnDCore to access all features including Pyret REPL.');
}
