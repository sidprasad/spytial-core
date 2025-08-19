/**
 * Mounting function for PythonReplInterface
 * 
 * Provides a simple API to mount the Python REPL component into a DOM container
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { PythonReplInterface, PythonReplInterfaceProps } from './PythonReplInterface';
import { PythonDataInstance } from '../../data-instance/python/python-data-instance';
import { PythonEvaluator } from './parsers/PythonExpressionParser';

/**
 * Configuration for mounting the PythonReplInterface
 */
export interface PythonReplMountConfig {
  /** Container element ID (default: 'python-repl-container') */
  containerId?: string;
  /** Initial Python data instance */
  initialInstance?: PythonDataInstance;
  /** External Python evaluator (e.g., pyodide instance) */
  externalEvaluator?: PythonEvaluator;
  /** Container height (default: 400px) */
  height?: string;
  /** Container width (default: 100%) */
  width?: string;
  /** Custom styling */
  style?: React.CSSProperties;
  /** CSS class name */
  className?: string;
  /** Event callbacks */
  onChange?: (instance: PythonDataInstance) => void;
  onCndSpecExtracted?: (spec: string) => void;
}

/**
 * Mount PythonReplInterface into specified container
 * 
 * @param config - Configuration object
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Simple usage
 * const success = mountPythonRepl({
 *   containerId: 'my-python-repl',
 *   externalEvaluator: pyodideEvaluator
 * });
 * 
 * // With callbacks
 * mountPythonRepl({
 *   onChange: (instance) => console.log('Data updated:', instance),
 *   onCndSpecExtracted: (spec) => console.log('CnD spec:', spec)
 * });
 * ```
 */
export function mountPythonRepl(config: PythonReplMountConfig = {}): boolean {
  const {
    containerId = 'python-repl-container',
    initialInstance,
    externalEvaluator,
    height = '400px',
    width = '100%',
    style = {},
    className = '',
    onChange,
    onCndSpecExtracted,
    ...replProps
  } = config;

  // Get the container element
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Python REPL: Container '${containerId}' not found`);
    return false;
  }

  try {
    const defaultStyle: React.CSSProperties = {
      height,
      width,
      ...style
    };

    const root = createRoot(container);
    root.render(
      <PythonReplInterface
        initialInstance={initialInstance}
        externalEvaluator={externalEvaluator}
        onChange={onChange}
        onCndSpecExtracted={onCndSpecExtracted}
        style={defaultStyle}
        className={className}
        {...replProps}
      />
    );

    console.log(`✅ Python REPL Interface mounted to #${containerId}`, {
      hasInitialInstance: !!initialInstance,
      hasExternalEvaluator: !!externalEvaluator,
      height,
      width
    });

    return true;
  } catch (error) {
    console.error('Failed to mount Python REPL Interface:', error);
    return false;
  }
}

/**
 * Helper function to create an empty Python data instance
 */
export function createEmptyPythonDataInstance(): PythonDataInstance {
  return new PythonDataInstance();
}