/**
 * Combined Input Component
 * 
 * A simplified component that combines REPL, layout interface, and visualization
 * into a single, easy-to-use component with automatic synchronization.
 * 
 * This component eliminates the need for users to write complex sync logic
 * between PyretReplInterface, CndLayoutInterface, and webcola-cnd-graph.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PyretReplInterface } from '../ReplInterface/PyretReplInterface';
import { CndLayoutInterface } from '../CndLayoutInterface';
import { PyretDataInstance } from '../../data-instance/pyret/pyret-data-instance';
import { PyretEvaluator } from '../ReplInterface/parsers/PyretExpressionParser';
import { SGraphQueryEvaluator } from '../../evaluators/sgq-evaluator';
import { LayoutInstance } from '../../layout/layoutinstance';
import { parseLayoutSpec } from '../../layout/layoutspec';
import { ConstraintData, DirectiveData } from '../NoCodeView/interfaces';

export interface CombinedInputConfig {
  /** Initial CnD specification */
  cndSpec?: string;
  /** Initial Pyret data instance */
  dataInstance?: PyretDataInstance;
  /** External Pyret evaluator (e.g., window.__internalRepl) */
  pyretEvaluator?: PyretEvaluator;
  /** Projection atoms for layout generation */
  projections?: Record<string, any>;
  /** Container height (default: 600px) */
  height?: string;
  /** Container width (default: 100%) */
  width?: string;
  /** Whether to show layout interface (default: true) */
  showLayoutInterface?: boolean;
  /** Whether to auto-apply layout changes (default: true) */
  autoApplyLayout?: boolean;
  /** Custom styling */
  style?: React.CSSProperties;
  /** CSS class name */
  className?: string;
}

export interface CombinedInputProps extends CombinedInputConfig {
  /** Callback when data instance changes */
  onInstanceChange?: (instance: PyretDataInstance) => void;
  /** Callback when CnD spec changes */
  onSpecChange?: (spec: string) => void;
  /** Callback when layout is applied */
  onLayoutApplied?: (layout: any) => void;
}

/**
 * Combined Input Component
 * 
 * Provides a complete data visualization setup with REPL, layout interface,
 * and graph visualization with automatic synchronization.
 * 
 * @example
 * ```tsx
 * import { CombinedInputComponent, PyretDataInstance } from 'cnd-core';
 * 
 * const initialInstance = new PyretDataInstance(myPyretData);
 * const evaluator = window.__internalRepl;
 * 
 * <CombinedInputComponent
 *   dataInstance={initialInstance}
 *   pyretEvaluator={evaluator}
 *   cndSpec="nodes:\n  - { id: node, type: atom }"
 *   onInstanceChange={(instance) => console.log('Data updated:', instance)}
 * />
 * ```
 */
export const CombinedInputComponent: React.FC<CombinedInputProps> = ({
  cndSpec = '',
  dataInstance,
  pyretEvaluator,
  projections = {},
  height = '600px',
  width = '100%',
  showLayoutInterface = true,
  autoApplyLayout = true,
  style,
  className,
  onInstanceChange,
  onSpecChange,
  onLayoutApplied,
}) => {
  // State management
  const [currentInstance, setCurrentInstance] = useState<PyretDataInstance>(() => {
    return dataInstance || new PyretDataInstance();
  });
  
  const [currentSpec, setCurrentSpec] = useState<string>(cndSpec);
  const [constraints, setConstraints] = useState<ConstraintData[]>([]);
  const [directives, setDirectives] = useState<DirectiveData[]>([]);
  const [isNoCodeView, setIsNoCodeView] = useState<boolean>(false);
  const [layoutStale, setLayoutStale] = useState<boolean>(false);
  const [currentLayout, setCurrentLayout] = useState<any>(null);
  
  // Refs for managing the graph element
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphElementRef = useRef<HTMLElement | null>(null);

  // Initialize or update data instance
  useEffect(() => {
    if (dataInstance && dataInstance !== currentInstance) {
      setCurrentInstance(dataInstance);
    }
  }, [dataInstance, currentInstance]);

  // Initialize or update CnD spec
  useEffect(() => {
    if (cndSpec !== currentSpec) {
      setCurrentSpec(cndSpec);
    }
  }, [cndSpec, currentSpec]);

  // Handle instance changes from REPL
  const handleInstanceChange = useCallback((newInstance: PyretDataInstance) => {
    setCurrentInstance(newInstance);
    setLayoutStale(true);
    onInstanceChange?.(newInstance);
    
    // Auto-apply layout if enabled
    if (autoApplyLayout && newInstance.getAtoms().length > 0) {
      setTimeout(() => applyLayout(newInstance, currentSpec), 100);
    }
  }, [autoApplyLayout, currentSpec, onInstanceChange]);

  // Handle CnD spec changes from layout interface
  const handleSpecChange = useCallback((newSpec: string) => {
    setCurrentSpec(newSpec);
    setLayoutStale(true);
    onSpecChange?.(newSpec);
    
    // Auto-apply layout if enabled
    if (autoApplyLayout && currentInstance.getAtoms().length > 0) {
      setTimeout(() => applyLayout(currentInstance, newSpec), 100);
    }
  }, [autoApplyLayout, currentInstance, onSpecChange]);

  // Apply layout using the CnD pipeline
  const applyLayout = useCallback(async (instance: PyretDataInstance, spec: string) => {
    try {
      console.log('Applying layout with SGraphQueryEvaluator...');
      
      // Step 1: Create evaluation context
      const evaluationContext = {
        sourceData: instance
      };

      // Step 2: Create and initialize SGraphQueryEvaluator
      const sgqEvaluator = new SGraphQueryEvaluator();
      sgqEvaluator.initialize(evaluationContext);

      // Step 3: Parse layout specification
      const layoutSpec = parseLayoutSpec(spec || "");

      // Step 4: Create LayoutInstance with SGraphQueryEvaluator
      const layoutInstance = new LayoutInstance(layoutSpec, sgqEvaluator, 0, true);

      // Step 5: Generate layout
      const layoutResult = layoutInstance.generateLayout(instance, projections);
      const newLayout = layoutResult.layout;
      
      setCurrentLayout(newLayout);
      setLayoutStale(false);
      onLayoutApplied?.(newLayout);

      // Step 6: Update the graph visualization if available
      if (graphElementRef.current && typeof (graphElementRef.current as any).renderLayout === 'function') {
        await (graphElementRef.current as any).renderLayout(newLayout);
        console.log('Graph updated successfully');
      }

    } catch (error) {
      console.error('Failed to apply layout:', error);
      setLayoutStale(true);
    }
  }, [projections, onLayoutApplied]);

  // Manual layout application
  const handleApplyLayout = useCallback(() => {
    applyLayout(currentInstance, currentSpec);
  }, [applyLayout, currentInstance, currentSpec]);

  // Clear all data
  const handleClear = useCallback(() => {
    const emptyInstance = new PyretDataInstance();
    setCurrentInstance(emptyInstance);
    setCurrentLayout(null);
    onInstanceChange?.(emptyInstance);
    
    if (graphElementRef.current && typeof (graphElementRef.current as any).clear === 'function') {
      (graphElementRef.current as any).clear();
    }
  }, [onInstanceChange]);

  // Initialize graph element when container is available
  useEffect(() => {
    if (graphContainerRef.current && !graphElementRef.current) {
      // Create webcola-cnd-graph custom element
      const graphElement = document.createElement('webcola-cnd-graph');
      graphElement.setAttribute('width', '100%');
      graphElement.setAttribute('height', '400');
      graphElement.setAttribute('layoutFormat', 'default');
      graphElement.style.width = '100%';
      graphElement.style.height = '400px';
      graphElement.style.border = '2px solid #007acc';
      graphElement.style.borderRadius = '8px';
      
      graphContainerRef.current.appendChild(graphElement);
      graphElementRef.current = graphElement;
      
      // Apply initial layout if we have data
      if (currentInstance.getAtoms().length > 0) {
        setTimeout(() => applyLayout(currentInstance, currentSpec), 500);
      }
    }
  }, [currentInstance, currentSpec, applyLayout]);

  const containerStyle: React.CSSProperties = {
    width,
    height,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    ...style,
  };

  return (
    <div className={className} style={containerStyle}>
      {/* Header with controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '10px',
        backgroundColor: '#fff',
        borderRadius: '6px',
        border: '1px solid #e0e0e0'
      }}>
        <h3 style={{ margin: 0, color: '#333' }}>CnD Combined Input</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {layoutStale && (
            <span style={{ 
              color: '#ff6b35', 
              fontSize: '12px', 
              fontWeight: 'bold',
              padding: '4px 8px',
              backgroundColor: '#fff3cd',
              borderRadius: '4px',
              border: '1px solid #ffeacc'
            }}>
              Layout Stale
            </span>
          )}
          <button
            onClick={handleApplyLayout}
            disabled={!layoutStale}
            style={{
              backgroundColor: layoutStale ? '#ff6b35' : '#28a745',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: layoutStale ? 'pointer' : 'not-allowed',
              fontSize: '12px'
            }}
          >
            {layoutStale ? 'Apply Layout' : 'Layout Current'}
          </button>
          <button
            onClick={handleClear}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1, gap: '10px' }}>
        {/* Left side: REPL and Layout Interface */}
        <div style={{ 
          width: showLayoutInterface ? '50%' : '30%', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px' 
        }}>
          {/* Pyret REPL */}
          <div style={{ 
            flex: 1, 
            border: '1px solid #ddd', 
            borderRadius: '6px',
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: '#f8f9fa', 
              borderBottom: '1px solid #e0e0e0',
              borderRadius: '6px 6px 0 0',
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#495057'
            }}>
              Pyret REPL
            </div>
            <div style={{ flex: 1, padding: '8px' }}>
              <PyretReplInterface
                initialInstance={currentInstance}
                onChange={handleInstanceChange}
                externalEvaluator={pyretEvaluator}
              />
            </div>
          </div>

          {/* Layout Interface (if enabled) */}
          {showLayoutInterface && (
            <div style={{ 
              flex: 1, 
              border: '1px solid #ddd', 
              borderRadius: '6px',
              backgroundColor: '#fff',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ 
                padding: '8px 12px', 
                backgroundColor: '#f8f9fa', 
                borderBottom: '1px solid #e0e0e0',
                borderRadius: '6px 6px 0 0',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#495057'
              }}>
                CnD Layout Interface
              </div>
              <div style={{ flex: 1, padding: '8px' }}>
                <CndLayoutInterface
                  yamlValue={currentSpec}
                  onChange={handleSpecChange}
                  isNoCodeView={isNoCodeView}
                  onViewChange={setIsNoCodeView}
                  constraints={constraints}
                  setConstraints={setConstraints}
                  directives={directives}
                  setDirectives={setDirectives}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right side: Graph visualization */}
        <div style={{ 
          flex: 1, 
          border: '1px solid #ddd', 
          borderRadius: '6px',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '8px 12px', 
            backgroundColor: '#f8f9fa', 
            borderBottom: '1px solid #e0e0e0',
            borderRadius: '6px 6px 0 0',
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#495057'
          }}>
            Graph Visualization
            <span style={{ 
              fontSize: '12px', 
              fontWeight: 'normal', 
              color: '#6c757d',
              marginLeft: '10px'
            }}>
              {currentInstance.getAtoms().length} atoms, {currentInstance.getRelations().length} relations
            </span>
          </div>
          <div 
            ref={graphContainerRef}
            style={{ 
              flex: 1, 
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px'
            }}
          >
            {/* Graph element will be created here */}
            {!graphElementRef.current && (
              <div style={{ color: '#6c757d', textAlign: 'center' }}>
                <p>Loading graph visualization...</p>
                <small>Add data using the REPL to see the visualization</small>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ 
        padding: '8px 12px', 
        backgroundColor: '#fff',
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        fontSize: '12px',
        color: '#6c757d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>
          Ready • {currentInstance.getAtoms().length} atoms • {currentInstance.getRelations().length} relations
          {pyretEvaluator && ' • External evaluator connected'}
        </span>
        <span>
          {layoutStale ? 'Layout needs update' : 'Layout synchronized'}
        </span>
      </div>
    </div>
  );
};

export default CombinedInputComponent;