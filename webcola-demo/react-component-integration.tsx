/**
 * Example integration of CndLayoutInterface with the demo pages.
 *
 * This file demonstrates how to mount the React components into the existing demo page
 * and integrate them with the existing JavaScript functions.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { ConstraintData, DirectiveData } from '../src/components/NoCodeView/interfaces';
import { generateLayoutSpecYaml, parseLayoutSpecToData } from '../src/components/NoCodeView';
import { createEmptyAlloyDataInstance } from '../src/data-instance/alloy-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';
import { ErrorMessageContainer, ErrorStateManager, SelectorErrorDetail } from '../src/components/ErrorMessageModal/index'
import { ErrorMessages } from '../src/layout/constraint-validator';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { EvaluatorRepl } from '../src/components/EvaluatorRepl/EvaluatorRepl';
import { IEvaluator } from '../src/evaluators';
import { RelationHighlighter } from '../src/components/RelationHighlighter/RelationHighlighter';
import { IDataInstance } from '../src/data-instance/interfaces';
import { exposeComponentBundleGlobals } from '../src/cdn-globals';

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
  private yamlChangeCallbacks: ((yamlValue: string) => void)[] = [];

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
   * Push a new YAML spec from OUTSIDE the mounted editor (host code such as a
   * "suggest layout" feature). Unlike `setYamlValue` — the editor's own outward
   * sync, which stays silent so edits don't echo back into the editor — this
   * notifies `onYamlValueChange` subscribers. A mounted editor picks the spec
   * up live through the controlled SpecEditor's external-replace path: no
   * remount, view/scroll preserved, and the change lands as one undo step.
   * @param yamlValue - New YAML string
   * @public
   */
  public updateYamlValue(yamlValue: string): void {
    this.yamlValue = yamlValue;
    this.yamlChangeCallbacks.forEach((callback) => {
      try {
        callback(yamlValue);
      } catch (error) {
        console.error('Error in YAML change callback:', error);
      }
    });
  }

  /**
   * Register a callback for external YAML pushes (see `updateYamlValue`).
   * Mirrors `InstanceStateManager.onInstanceChange`.
   * @param callback - Function to call when a spec is pushed externally
   * @returns Unsubscribe function that removes the callback
   * @public
   */
  public onYamlValueChange(callback: (yamlValue: string) => void): () => void {
    this.yamlChangeCallbacks.push(callback);
    return () => {
      this.yamlChangeCallbacks = this.yamlChangeCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
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
   * @returns Unsubscribe function that removes the callback
   * @public
   */
  public onInstanceChange(callback: (instance: IInputDataInstance) => void): () => void {
    this.instanceChangeCallbacks.push(callback);
    return () => {
      this.instanceChangeCallbacks = this.instanceChangeCallbacks.filter(
        (cb) => cb !== callback,
      );
    };
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

  // Track the shared data instance so the editor gets domain awareness
  // (type/relation dropdowns, selector completions, soft warnings). Demos
  // push instances via DataAPI.updateInstance / window.updateInstanceFromReact.
  const [instance, setInstance] = useState<IInputDataInstance>(() =>
    InstanceStateManager.getInstance().getCurrentInstance(),
  );
  useEffect(
    () => InstanceStateManager.getInstance().onInstanceChange(setInstance),
    [],
  );

  // Inbound spec pushes (DataAPI.updateSpec / window.updateSpecFromReact):
  // route into local state so the controlled SpecEditor takes the new value
  // through its external-replace path — no remount, one undo step. The
  // deprecated constraint/directive arrays are best-effort re-synced too, so
  // legacy readers (getCurrentCndSpec in No-Code view) don't go stale.
  useEffect(
    () =>
      stateManager.onYamlValueChange((yamlValue) => {
        setYamlValue(yamlValue);
        try {
          const parsed = parseLayoutSpecToData(yamlValue);
          setConstraints(parsed.constraints);
          setDirectives(parsed.directives);
        } catch {
          // Invalid YAML: leave the legacy arrays untouched; SpecEditor
          // surfaces the parse error in the code view.
        }
        window.dispatchEvent(
          new CustomEvent('cnd-spec-changed', { detail: yamlValue }),
        );
      }),
    [stateManager],
  );

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
  }, []);

  /**
   * Handle directives updates with functional setState
   */
  const handleSetDirectives = useCallback((updater: (prev: DirectiveData[]) => DirectiveData[]) => {
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
      instance={instance}
      aria-label="CND Layout Specification Editor"
    />
  );
}







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
/**
 * React roots created by `mountCndLayoutInterface`, keyed by container id, so
 * `unmountCndLayoutInterface` can tear them down and a re-mount into the same
 * container replaces the previous root instead of leaking it.
 */
const cndLayoutRoots = new Map<string, ReturnType<typeof createRoot>>();

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
    // Mounting into a container that already has a live root replaces it.
    unmountCndLayoutInterface(containerId);
    const root = createRoot(container);
    cndLayoutRoots.set(containerId, root);
    root.render(<CndLayoutInterfaceWrapper config={config} />);

    if (config) {
      console.log(`CnD Layout Interface mounted to #${containerId} with initial config:`, {
        yamlValue: config.initialYamlValue ? `${config.initialYamlValue.length} characters` : 'none',
        isNoCodeView: config.initialIsNoCodeView ?? 'default',
        constraints: config.initialConstraints?.length ?? 0,
        directives: config.initialDirectives?.length ?? 0
      });
    } else {
      console.log(`CnD Layout Interface mounted to #${containerId}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to mount CnD Layout Interface:', error);
    return false;
  }
}

/**
 * Unmount a CnD Layout Interface previously mounted with
 * `mountCndLayoutInterface`, releasing its React root and state-manager
 * subscriptions. Hosts that re-key or tear down their embedding should call
 * this instead of abandoning the root.
 *
 * @param containerId - DOM element ID the interface was mounted into
 * @returns True if a mounted root existed for the container id
 * @public
 */
export function unmountCndLayoutInterface(
  containerId: string = 'webcola-cnd-container'
): boolean {
  const root = cndLayoutRoots.get(containerId);
  if (!root) {
    return false;
  }
  cndLayoutRoots.delete(containerId);
  try {
    root.unmount();
  } catch (error) {
    console.error('Failed to unmount CnD Layout Interface:', error);
  }
  return true;
}

/**
 * Get the data instance currently held in shared state.
 */
export function getCurrentInstanceFromReact(): IInputDataInstance | undefined {
  try {
    return InstanceStateManager.getInstance().getCurrentInstance();
  } catch (error) {
    console.error('Error accessing the current data instance:', error);
    return undefined;
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
export function mountErrorMessageModal(
  containerId: string = 'error-messages',
  graphElementId: string = 'graph-container'
): boolean {
  const container = document.getElementById(containerId);

  if (!container) {
    console.error(`Error Modal: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(<ErrorMessageContainer errorManager={globalErrorManager} graphElementId={graphElementId} />);
    console.log(`Error Modal mounted to #${containerId}`);
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
    console.log(`Evaluator REPL mounted to #${containerId}`);
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
    console.log(`Relation Highlighter mounted to #${containerId}`);
    return true;
  } catch (error) {
    console.error('Failed to mount Relation Highlighter:', error);
    return false;
  }
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
   * Display hidden-node conflict errors (hideAtom vs constraint references)
   * @param errorMessages - Detailed conflict information in IIS-like format
   */
  showHiddenNodeConflict: (errorMessages: ErrorMessages): void => {
    globalErrorManager.setError({
      type: 'hidden-node-conflict',
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
   * Display selector evaluation errors
   * @param errors - Array of selector error details
   */
  showSelectorErrors: (errors: SelectorErrorDetail[]): void => {
    console.log('showSelectorErrors called with', errors.length, 'errors');
    if (errors.length === 0) return;
    
    // Deduplicate errors based on selector + context + errorMessage
    const seen = new Set<string>();
    const dedupedErrors = errors.filter(err => {
      const key = `${err.selector}|${err.context}|${err.errorMessage}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log('After dedup:', dedupedErrors.length, 'unique errors');
    
    const errorObj = {
      type: 'selector-error' as const,
      errors: dedupedErrors
    };
    console.log('Setting error:', errorObj);
    globalErrorManager.setError(errorObj);
    console.log('Error set, current error:', globalErrorManager.getCurrentError());
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
   * Get the data instance currently held in shared state
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
   * Push a new CND spec into the mounted layout editor programmatically.
   * The editor replaces its document in place — no remount, Builder/Code view
   * and scroll preserved, and the change lands in the editor's undo history.
   * Mirror of `updateInstance` for the spec side.
   * @param yamlValue - Layout-spec YAML (constraints/directives)
   */
  updateSpec: (yamlValue: string): void => {
    try {
      CndLayoutStateManager.getInstance().updateYamlValue(yamlValue);
    } catch (error) {
      console.error('Error updating CND spec:', error);
    }
  },

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
  unmountCndLayoutInterface,
  mountErrorMessageModal,
  mountEvaluatorRepl,
  mountRelationHighlighter,

  // State managers
  CndLayoutStateManager,
  InstanceStateManager,
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




// Expose to global scope.
// The runtime/browser bundle owns window.spytialcore (plus legacy aliases).
// The components bundle publishes its API under window.spytialComponents and
// augments the runtime global when it is already present.
if (typeof window !== 'undefined') {
  const globalWindow = window as any;
  exposeComponentBundleGlobals(globalWindow, CnDCore);
  
  // Legacy compatibility - expose individual functions
  globalWindow.mountCndLayoutInterface = mountCndLayoutInterface;
  globalWindow.unmountCndLayoutInterface = unmountCndLayoutInterface;
  globalWindow.mountErrorMessageModal = mountErrorMessageModal;
  globalWindow.mountEvaluatorRepl = mountEvaluatorRepl;
  globalWindow.mountRelationHighlighter = mountRelationHighlighter;

  // Expose data functions for legacy compatibility
  globalWindow.getCurrentCNDSpecFromReact = DataAPI.getCurrentCndSpec;
  globalWindow.getCurrentInstanceFromReact = DataAPI.getCurrentInstance;
  // Push a freshly parsed data instance to the shared state so the spec
  // editor picks up domain awareness (dropdowns, completions, warnings).
  globalWindow.updateInstanceFromReact = DataAPI.updateInstance;
  // Push a new spec into the mounted editor (e.g. a host's "suggest layout"
  // feature) without remounting it.
  globalWindow.updateSpecFromReact = DataAPI.updateSpec;

  // Expose error functions for legacy compatibility
  globalWindow.showParseError = ErrorAPI.showParseError;
  globalWindow.showGroupOverlapError = ErrorAPI.showGroupOverlapError;
  globalWindow.showPositionalError = ErrorAPI.showConstraintError;
  globalWindow.showHiddenNodeConflict = ErrorAPI.showHiddenNodeConflict;
  globalWindow.showGeneralError = ErrorAPI.showGeneralError;
  globalWindow.showSelectorErrors = ErrorAPI.showSelectorErrors;
  globalWindow.clearAllErrors = ErrorAPI.clearAllErrors;

  console.log(
    'spytial-core component integration ready. Mount APIs are available on window.spytialComponents and are merged into window.spytialcore when the runtime bundle is loaded.',
  );
}
