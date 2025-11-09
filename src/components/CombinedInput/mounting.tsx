/**
 * Mounting function for CombinedInputComponent
 * 
 * Provides a simple API to mount the combined input component into a DOM container
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { CombinedInputComponent, CombinedInputConfig } from './CombinedInputComponent';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { PyretEvaluator } from '../ReplInterface/parsers/PyretExpressionParser';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';

/**
 * Configuration for mounting the CombinedInputComponent
 */
export interface CombinedInputMountConfig extends CombinedInputConfig {
  /** Container element ID (default: 'combined-input-container') */
  containerId?: string;
  /** Event callbacks for integration */
  onInstanceChange?: (instance: PyretDataInstance) => void;
  onSpecChange?: (spec: string) => void;
  onLayoutApplied?: (layout: any) => void;
}

/**
 * Mount CombinedInputComponent into specified container
 * 
 * This function provides the simple API requested in the issue:
 * - Pass in initial data, evaluator, and Spytial spec
 * - Get back a fully configured component with all sync logic handled internally
 * 
 * @param config - Configuration object with all the user's inputs
 * @returns Boolean indicating success
 * 
 * @example
 * ```javascript
 * // Simple usage
 * const success = mountCombinedInput({
 *   containerId: 'my-container',
 *   cndSpec: 'nodes:\n  - { id: node, type: atom }',
 *   dataInstance: myPyretInstance,
 *   pyretEvaluator: window.__internalRepl,
 *   projections: {}
 * });
 * 
 * // With callbacks
 * mountCombinedInput({
 *   cndSpec: 'nodes:\n  - { id: node, type: atom }',
 *   onInstanceChange: (instance) => console.log('Data updated:', instance),
 *   onSpecChange: (spec) => console.log('Layout updated:', spec),
 *   height: '800px'
 * });
 * ```
 * 
 * @public
 */
export function mountCombinedInput(config: CombinedInputMountConfig = {}): boolean {
  const {
    containerId = 'combined-input-container',
    onInstanceChange,
    onSpecChange,
    onLayoutApplied,
    ...componentConfig
  } = config;

  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error(`Combined Input: Container '${containerId}' not found`);
    return false;
  }

  try {
    const root = createRoot(container);
    root.render(
      <CombinedInputComponent
        {...componentConfig}
        onInstanceChange={onInstanceChange}
        onSpecChange={onSpecChange}
        onLayoutApplied={onLayoutApplied}
      />
    );

    console.log(`✅ Combined Input Component mounted to #${containerId}`, {
      hasDataInstance: !!config.dataInstance,
      hasPyretEvaluator: !!config.pyretEvaluator,
      cndSpecLength: config.cndSpec?.length ?? 0,
      showLayoutInterface: config.showLayoutInterface ?? true,
      autoApplyLayout: config.autoApplyLayout ?? true
    });

    return true;
  } catch (error) {
    console.error('Failed to mount Combined Input Component:', error);
    return false;
  }
}

/**
 * Helper function to create a complete setup from the user's inputs
 * 
 * This function demonstrates the exact API described in the issue:
 * 1. Take cndSpec, dataInstance, evaluator, and projections
 * 2. Return a configured HTML div with everything set up
 * 
 * @param cndSpec - The initial Cope and Drag spec
 * @param dataInstance - A data instance / evaluator
 * @param pyretREPLInternal - The internal Pyret evaluator
 * @param projections - Atoms over which to project
 * @returns HTMLDivElement with everything configured
 * 
 * @example
 * ```javascript
 * const dataInstance = new window.SpytialCore.PyretDataInstance(v);
 * const evaluationContext = { sourceData: dataInstance };
 * const evaluator = new SpytialCore.Evaluators.SGraphQueryEvaluator();
 * evaluator.initialize(evaluationContext);
 * const pyretREPLInternal = window.__internalRepl;
 * const projections = {};
 * 
 * const div = createCombinedInputSetup(
 *   'nodes:\n  - { id: node, type: atom }',
 *   dataInstance,
 *   pyretREPLInternal,
 *   projections
 * );
 * 
 * document.body.appendChild(div);
 * ```
 * 
 * @public
 */
export function createCombinedInputSetup(
  cndSpec: string,
  dataInstance: PyretDataInstance,
  pyretREPLInternal?: PyretEvaluator,
  projections: Record<string, any> = {}
): HTMLDivElement {
  // Create a container div with unique ID
  const container = document.createElement('div');
  container.id = `combined-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  container.style.width = '100%';
  container.style.height = '600px';
  
  // Mount the component into the container
  const root = createRoot(container);
  root.render(
    <CombinedInputComponent
      cndSpec={cndSpec}
      dataInstance={dataInstance}
      pyretEvaluator={pyretREPLInternal}
      projections={projections}
      autoApplyLayout={true}
      showLayoutInterface={true}
    />
  );

  console.log('✅ Combined Input setup created', {
    hasDataInstance: !!dataInstance,
    hasPyretEvaluator: !!pyretREPLInternal,
    cndSpecLength: cndSpec.length,
    projectionsKeys: Object.keys(projections)
  });

  return container;
}

/**
 * Simplified API that matches the exact interface requested in the issue
 * 
 * @param containerId - Container to mount into
 * @param cndSpec - Initial Spytial spec
 * @param dataInstance - Pyret data instance
 * @param pyretREPLInternal - Internal Pyret evaluator
 * @param projections - Projection atoms
 * @returns Boolean indicating success
 * 
 * @public
 */
export function setupCombinedInput(
  containerId: string,
  cndSpec: string,
  dataInstance: PyretDataInstance,
  pyretREPLInternal?: PyretEvaluator,
  projections: Record<string, any> = {}
): boolean {
  return mountCombinedInput({
    containerId,
    cndSpec,
    dataInstance,
    pyretEvaluator: pyretREPLInternal,
    projections,
    autoApplyLayout: true,
    showLayoutInterface: true
  });
}