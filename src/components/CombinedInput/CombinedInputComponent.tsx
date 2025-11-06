/**
 * Combined Input Component
 * 
 * A simplified component that combines REPL, layout interface, and visualization
 * into a single, easy-to-use component with automatic synchronization.
 * 
 * This component eliminates the need for users to write complex sync logic
 * between PyretReplInterface, CndLayoutInterface, and webcola-cnd-graph.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
 * import { CombinedInputComponent, PyretDataInstance } from 'spytial-core';
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
  const [extractedSpecs, setExtractedSpecs] = useState<string[]>([]); // Store extracted specs
  const [constraints, setConstraints] = useState<ConstraintData[]>([]);
  const [directives, setDirectives] = useState<DirectiveData[]>([]);
  const [isNoCodeView, setIsNoCodeView] = useState<boolean>(false);
  const [layoutStale, setLayoutStale] = useState<boolean>(false);
  const [currentLayout, setCurrentLayout] = useState<any>(null);
  
  // Collapsible section states
  const [replCollapsed, setReplCollapsed] = useState<boolean>(true);
  const [layoutCollapsed, setLayoutCollapsed] = useState<boolean>(false);
  const [graphCollapsed, setGraphCollapsed] = useState<boolean>(false);
  const [reifyHidden, setReifyHidden] = useState<boolean>(false);
  
  // Refs for managing the graph element and current instance access
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphElementRef = useRef<HTMLElement | null>(null);
  const currentInstanceRef = useRef<PyretDataInstance>(currentInstance);

  // Initialize or update data instance
  useEffect(() => {
    if (dataInstance && dataInstance !== currentInstance) {
      setCurrentInstance(dataInstance);
      currentInstanceRef.current = dataInstance;
    }
  }, [dataInstance, currentInstance]);

  // Keep the ref in sync with the current instance
  useEffect(() => {
    currentInstanceRef.current = currentInstance;
  }, [currentInstance]);

  // Compose CnD specs by concatenating them with newlines
  const composeCndSpecs = useCallback((baseSpec: string, extractedSpecs: string[]): string => {
    const specs = [baseSpec, ...extractedSpecs].filter(spec => spec && spec.trim());
    
    if (specs.length === 0) {
      return '';
    }
    
    if (specs.length === 1) {
      return specs[0];
    }
    
    // Join specs with newlines
    return specs.join('\n');
  }, []);

  // Compute the complete spec by combining the base spec with all extracted specs
  const completeSpec = useMemo(() => {
    return composeCndSpecs(cndSpec, extractedSpecs);
  }, [cndSpec, extractedSpecs]);

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

  // Update current spec when complete spec changes and auto-apply layout
  useEffect(() => {
    if (completeSpec !== currentSpec) {
      setCurrentSpec(completeSpec);
      setLayoutStale(true);
      onSpecChange?.(completeSpec);
      
      // Auto-apply layout if enabled and we have data
      if (autoApplyLayout && currentInstance.getAtoms().length > 0) {
        setTimeout(() => applyLayout(currentInstance, completeSpec), 100);
      }
    }
  }, [completeSpec, currentSpec, onSpecChange, autoApplyLayout, currentInstance, applyLayout]);

  // Handle instance changes from REPL
  const handleInstanceChange = useCallback((newInstance: PyretDataInstance) => {
    setCurrentInstance(newInstance);
    currentInstanceRef.current = newInstance; // Keep ref in sync
    setLayoutStale(true);
    onInstanceChange?.(newInstance);
    
    // Auto-apply layout if enabled and we have data - use debounced approach
    if (autoApplyLayout && newInstance.getAtoms().length > 0) {
      setTimeout(() => {
        // Use the most up-to-date spec (completeSpec at time of execution)
        const finalSpec = composeCndSpecs(cndSpec, extractedSpecs);
        applyLayout(newInstance, finalSpec);
      }, 100);
    }
  }, [autoApplyLayout, cndSpec, extractedSpecs, composeCndSpecs, applyLayout, onInstanceChange]);

  // Handle CnD spec changes from layout interface
  const handleSpecChange = useCallback((newSpec: string) => {
    setCurrentSpec(newSpec);
    setLayoutStale(true);
    onSpecChange?.(newSpec);
    
    // Auto-apply layout if enabled and we have data - use debounced approach
    if (autoApplyLayout && currentInstance.getAtoms().length > 0) {
      setTimeout(() => applyLayout(currentInstance, newSpec), 100);
    }
  }, [autoApplyLayout, currentInstance, applyLayout, onSpecChange]);

  // Handle CnD spec extraction from REPL expressions
  const handleCndSpecExtracted = useCallback((extractedSpec: string) => {
    console.log('CnD spec extracted from expression:', extractedSpec);
    
    // Add to extracted specs list (avoid duplicates)
    setExtractedSpecs(prev => {
      if (!prev.includes(extractedSpec)) {
        console.log('Adding new extracted spec:', extractedSpec, 'to list:', prev);
        const newSpecs = [...prev, extractedSpec];
        
        // Immediately apply layout if auto-apply is enabled and we have data
        if (autoApplyLayout && currentInstance.getAtoms().length > 0) {
          setTimeout(() => {
            const finalSpec = composeCndSpecs(cndSpec, newSpecs);
            applyLayout(currentInstance, finalSpec);
          }, 100);
        }
        
        return newSpecs;
      }
      return prev;
    });
  }, [autoApplyLayout, currentInstance, cndSpec, composeCndSpecs, applyLayout]);

  // Manual layout application
  const handleApplyLayout = useCallback(() => {
    applyLayout(currentInstance, currentSpec);
  }, [applyLayout, currentInstance, currentSpec]);

  // Clear all data
  const handleClear = useCallback(() => {
    const emptyInstance = new PyretDataInstance();
    setCurrentInstance(emptyInstance);
    currentInstanceRef.current = emptyInstance; // Keep ref in sync
    setCurrentLayout(null);
    setLayoutStale(false); // No need to apply layout to empty data
    onInstanceChange?.(emptyInstance);
    
    // Clear the graph and force re-render with empty data
    if (graphElementRef.current) {
      if (typeof (graphElementRef.current as any).clear === 'function') {
        (graphElementRef.current as any).clear();
      }
      // Also try to render empty layout to ensure graph updates
      if (typeof (graphElementRef.current as any).renderLayout === 'function') {
        (graphElementRef.current as any).renderLayout(null);
      }
    }
  }, [onInstanceChange]);

  // Initialize graph element when container is available (runs only once)
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
      
      // Set up edge input mode event listeners
      const handleEdgeCreationRequested = (event: Event) => {
        const customEvent = event as CustomEvent;
        console.log('🔗 Edge creation requested in CombinedInput:', customEvent.detail);
        const { relationId, sourceNodeId, targetNodeId, tuple } = customEvent.detail;
        
        try {
          // Get the current instance and add the relation
          const currentInstanceValue = currentInstanceRef.current;
          currentInstanceValue.addRelationTuple(relationId, tuple);
          console.log(`✅ Added relation tuple: ${relationId}(${tuple.atoms.join(', ')})`);
          
          // Trigger the handleInstanceChange callback 
          handleInstanceChange(currentInstanceValue);
        } catch (error) {
          console.error('Failed to add edge relation:', error);
        }
      };

      const handleEdgeModificationRequested = (event: Event) => {
        const customEvent = event as CustomEvent;
        console.log('🔗 Edge modification requested in CombinedInput:', customEvent.detail);
        const { oldRelationId, newRelationId, sourceNodeId, targetNodeId, tuple } = customEvent.detail;
        
        try {
          const currentInstanceValue = currentInstanceRef.current;
          
          // If we're renaming to the same relation ID, no need to modify data
          if (oldRelationId.trim() === newRelationId.trim()) {
            console.log('⏭️ Same relation name, no data changes needed');
            return;
          }
          
          // Remove old relation tuple if it exists and has a valid name
          if (oldRelationId.trim()) {
            const oldRelation = currentInstanceValue.getRelations().find(r => r.id === oldRelationId);
            if (oldRelation) {
              currentInstanceValue.removeRelationTuple(oldRelationId, tuple);
              console.log(`🗑️ Removed from ${oldRelationId}`);
            }
          }
          
          // Add new relation tuple if it has a valid name
          if (newRelationId.trim()) {
            currentInstanceValue.addRelationTuple(newRelationId, tuple);
            console.log(`➕ Added to ${newRelationId}`);
          }
          
          // Trigger the handleInstanceChange callback 
          handleInstanceChange(currentInstanceValue);
        } catch (error) {
          console.error('Failed to modify edge relation:', error);
        }
      };

      // Confirmation event listeners for completeness
      const handleEdgeCreated = (event: Event) => {
        const customEvent = event as CustomEvent;
        console.log('✅ Edge created confirmation:', customEvent.detail);
      };

      const handleEdgeModified = (event: Event) => {
        const customEvent = event as CustomEvent;
        console.log('✅ Edge modified confirmation:', customEvent.detail);
      };

      // Add event listeners for both request and confirmation events
      graphElement.addEventListener('edge-creation-requested', handleEdgeCreationRequested);
      graphElement.addEventListener('edge-modification-requested', handleEdgeModificationRequested);
      graphElement.addEventListener('edge-created', handleEdgeCreated);
      graphElement.addEventListener('edge-modified', handleEdgeModified);
      
      graphContainerRef.current.appendChild(graphElement);
      graphElementRef.current = graphElement;

      // Clean up event listeners when component unmounts
      return () => {
        if (graphElement) {
          graphElement.removeEventListener('edge-creation-requested', handleEdgeCreationRequested);
          graphElement.removeEventListener('edge-modification-requested', handleEdgeModificationRequested);
          graphElement.removeEventListener('edge-created', handleEdgeCreated);
          graphElement.removeEventListener('edge-modified', handleEdgeModified);
        }
      };
    }
  }, []); // Only run once when component mounts

  // Handle data and layout updates with proper dependency tracking
  useEffect(() => {
    if (graphElementRef.current && currentInstance.getAtoms().length > 0 && autoApplyLayout) {
      // Apply layout when either instance or spec changes
      const finalSpec = composeCndSpecs(cndSpec, extractedSpecs);
      setTimeout(() => applyLayout(currentInstance, finalSpec), 150);
    }
  }, [currentInstance.getAtoms().length, extractedSpecs.length]); // React to both atom count and spec changes

  const containerStyle: React.CSSProperties = {
    width,
    height,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '12px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    backgroundColor: '#fafafa',
    ...style,
  };

  // Detect the platform
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  return (
    <div className={className} style={containerStyle}>
      {/* Minimal header with essential controls only */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        alignItems: 'center',
        padding: '4px 8px',
        backgroundColor: 'transparent',
        gap: '8px'
      }}>
        {layoutStale && (
          <button
            onClick={handleApplyLayout}
            style={{
              backgroundColor: '#ff6b35',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500'
            }}
          >
            Apply Layout
          </button>
        )}
        <button
          onClick={handleClear}
          style={{
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '500'
          }}
        >
          Clear
        </button>
      </div>

      {/* Main content area - improved spacing */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px' }}>
        
        {/* Top: Pyret REPL - simplified header */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '6px',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '6px 12px', 
            backgroundColor: '#f8f9fa', 
            borderBottom: replCollapsed ? 'none' : '1px solid #e0e0e0',
            borderRadius: '6px 6px 0 0',
            fontSize: '12px',
            fontWeight: '500',
            color: '#495057',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer'
          }} onClick={() => setReplCollapsed(!replCollapsed)}>
            <span>REPL</span>
            <span style={{ fontSize: '10px', color: '#6c757d' }}>
              {replCollapsed ? '▶' : '▼'}
            </span>
          </div>
          {!replCollapsed && (
            <div style={{ padding: '12px' }}>
              <PyretReplInterface
                initialInstance={currentInstance}
                onChange={handleInstanceChange}
                onCndSpecExtracted={handleCndSpecExtracted}
                externalEvaluator={pyretEvaluator}
              />
            </div>
          )}
        </div>

        {/* Middle: Graph visualization - better spacing and simplified header */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '6px',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
          flex: 1
        }}>
          <div style={{ 
            padding: '6px 12px', 
            backgroundColor: '#f8f9fa', 
            borderBottom: graphCollapsed ? 'none' : '1px solid #e0e0e0',
            borderRadius: '6px 6px 0 0',
            fontSize: '12px',
            fontWeight: '500',
            color: '#495057',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span 
                style={{ cursor: 'pointer', marginRight: '8px' }}
                onClick={() => setGraphCollapsed(!graphCollapsed)}
              >
                {graphCollapsed ? '▶' : '▼'}
              </span>
              <span>Diagram</span>
              <span style={{ 
                fontSize: '10px', 
                fontWeight: 'normal', 
                color: '#6c757d',
                marginLeft: '8px'
              }}>
                {currentInstance.getAtoms().length} • {currentInstance.getRelations().length}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '9px', color: '#28a745', fontWeight: '400' }}>
                <strong>{isMac ? 'Cmd' : 'Ctrl'} + Click</strong> between nodes to create edges.

              </div>
              <button
                onClick={() => setReplCollapsed(false)}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: '500'
                }}
              >
                + Add / Remove Nodes or Modify Edges
              </button>
            </div>
          </div>
          {!graphCollapsed && (
            <div 
              ref={graphContainerRef}
              style={{ 
                flex: 1, 
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px'
              }}
            >
              {/* Graph element will be created here */}
              {!graphElementRef.current && (
                <div style={{ color: '#6c757d', textAlign: 'center', fontSize: '13px' }}>
                  <p>Add data using the REPL to see visualization</p>
                  <small>
                      <strong>{isMac ? 'Cmd' : 'Ctrl'} + Click</strong> between nodes to create edges.                  </small>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom: CnD Layout Interface - simplified if shown */}
        {showLayoutInterface && (
          <div style={{ 
            border: '1px solid #ddd', 
            borderRadius: '6px',
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ 
              padding: '6px 12px', 
              backgroundColor: '#f8f9fa', 
              borderBottom: layoutCollapsed ? 'none' : '1px solid #e0e0e0',
              borderRadius: '6px 6px 0 0',
              fontSize: '12px',
              fontWeight: '500',
              color: '#495057',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer'
            }} onClick={() => setLayoutCollapsed(!layoutCollapsed)}>
              <span>Layout</span>
              <span style={{ fontSize: '10px', color: '#6c757d' }}>
                {layoutCollapsed ? '▶' : '▼'}
              </span>
            </div>
            {!layoutCollapsed && (
              <div style={{ padding: '12px' }}>
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
            )}
          </div>
        )}
      </div>

      {/* Minimal status indicator - only show reify when needed */}
      {!reifyHidden && currentInstance.getAtoms().length > 0 && (
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '6px',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '6px 12px', 
            backgroundColor: '#f8f9fa', 
            borderBottom: '1px solid #e0e0e0',
            borderRadius: '6px 6px 0 0',
            fontSize: '12px',
            fontWeight: '500',
            color: '#495057',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>Pyret Data</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => {
                  const reifiedData = currentInstance.reify();
                  navigator.clipboard.writeText(reifiedData);
                }}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                Copy
              </button>
              <button
                onClick={() => setReifyHidden(true)}
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                ×
              </button>
            </div>
          </div>
          <div style={{ padding: '8px' }}>
            <textarea
              value={currentInstance.reify()}
              readOnly
              style={{
                width: '100%',
                height: '60px',
                fontSize: '10px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                backgroundColor: '#f8f9fa',
                border: '1px solid #e0e0e0',
                borderRadius: '3px',
                padding: '6px',
                resize: 'vertical'
              }}
              placeholder="Pyret data will appear here..."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedInputComponent;