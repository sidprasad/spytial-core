import React, { useState, useEffect } from 'react';
import { ReplInterface } from './ReplInterface';
import { CndLayoutInterface } from '../CndLayoutInterface';
import { IInputDataInstance } from '../../data-instance/interfaces';

export interface ReplWithVisualizationProps {
  /** Data instance to work with */
  instance: IInputDataInstance;
  /** Callback when instance changes */
  onChange?: (instance: IInputDataInstance) => void;
  /** Initial CND layout specification */
  initialCndSpec?: string;
  /** Whether to show the CND layout interface */
  showLayoutInterface?: boolean;
  /** Custom styling for the container */
  style?: React.CSSProperties;
  /** Height of the REPL interface (default: 300px) */
  replHeight?: string;
  /** Height of the visualization area (default: 400px) */
  visualizationHeight?: string;
}

/**
 * Combined REPL and Visualization Component
 * 
 * This component provides an integrated solution that combines:
 * - ReplInterface for command-line style data entry
 * - CndLayoutInterface for layout specification
 * - Real-time visualization updates
 * 
 * Perfect for demos, tutorials, and rapid prototyping.
 * 
 * @example
 * ```tsx
 * import { ReplWithVisualization, JSONDataInstance } from 'spytial-core';
 * 
 * const instance = new JSONDataInstance({ atoms: [], relations: [] });
 * 
 * <ReplWithVisualization 
 *   instance={instance}
 *   onChange={(updated) => console.log('Updated:', updated)}
 *   showLayoutInterface={true}
 * />
 * ```
 */
export const ReplWithVisualization: React.FC<ReplWithVisualizationProps> = ({
  instance,
  onChange,
  initialCndSpec = '',
  showLayoutInterface = true,
  style,
  replHeight = '300px',
  visualizationHeight = '400px'
}) => {
  const [currentInstance, setCurrentInstance] = useState(instance);
  const [cndSpec, setCndSpec] = useState(initialCndSpec);

  // Update internal state when instance prop changes
  useEffect(() => {
    setCurrentInstance(instance);
  }, [instance]);

  const handleInstanceChange = (updatedInstance: IInputDataInstance) => {
    setCurrentInstance(updatedInstance);
    onChange?.(updatedInstance);
  };

  const handleCndSpecChange = (newSpec: string) => {
    setCndSpec(newSpec);
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden',
    ...style
  };

  const sectionStyle: React.CSSProperties = {
    padding: '16px',
    borderBottom: '1px solid #dee2e6'
  };

  const headerStyle: React.CSSProperties = {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#495057'
  };

  return (
    <div style={containerStyle}>
      {/* REPL Interface Section */}
      <div style={{ ...sectionStyle, height: replHeight, minHeight: '250px' }}>
        <h3 style={headerStyle}>Command Interface</h3>
        <div style={{ height: `calc(${replHeight} - 40px)` }}>
          <ReplInterface 
            instance={currentInstance}
            onChange={handleInstanceChange}
          />
        </div>
      </div>

      {/* Layout Interface Section (Optional) */}
      {showLayoutInterface && (
        <div style={{ ...sectionStyle, height: '200px', minHeight: '150px' }}>
          <h3 style={headerStyle}>Layout Specification</h3>
          <div style={{ height: 'calc(200px - 40px)' }}>
            <CndLayoutInterface 
              instance={currentInstance}
              value={cndSpec}
              onChange={handleCndSpecChange}
            />
          </div>
        </div>
      )}

      {/* Visualization Area */}
      <div style={{ 
        ...sectionStyle, 
        height: visualizationHeight,
        minHeight: '300px',
        borderBottom: 'none',
        flex: 1
      }}>
        <h3 style={headerStyle}>Visualization</h3>
        <div style={{ 
          height: `calc(${visualizationHeight} - 40px)`,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6c757d'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <div>
              Visualization area ready for webcola-cnd-graph integration
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              Current data: {currentInstance.getAtoms().length} atoms, {currentInstance.getRelations().length} relations
            </div>
            {cndSpec && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#28a745' }}>
                CND spec: {cndSpec.length} characters
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReplWithVisualization;