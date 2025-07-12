import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PyretInputController, PyretInputControllerProps } from '../src/components/PyretInputController/PyretInputController';
import { EXAMPLE_PYRET_TYPES } from '../src/components/PyretInputController/types';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';

/**
 * Integrated demo that combines PyretInputController with CndLayoutInterface
 * and connects to the pyret-input-controller-demo.html page with graph visualization
 * Uses PyretDataInstance for Pyret-specific data structures
 */

interface PyretIntegratedDemoState {
  instance: IInputDataInstance | null;
  cndSpec: string;
  isBuilderMode: boolean;
}

/**
 * PyretInputController wrapper that connects to the global demo state
 */
const ConnectedPyretInputController: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance | null>(null);

  // Connect to global state
  useEffect(() => {
    // Expose instance to global scope for the HTML demo
    if (typeof window !== 'undefined') {
      (window as any).currentPyretInstance = instance;
      
      // Trigger update in the HTML demo
      if ((window as any).updateFromPyretBuilder) {
        (window as any).updateFromPyretBuilder();
      }
    }
  }, [instance]);

  // Listen for external updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register a function to update the builder from external sources
      (window as any).updatePyretBuilderInstance = (newInstance: IInputDataInstance) => {
        setInstance(newInstance);
      };
      
      // Expose a getter for the React instance
      (window as any).getCurrentPyretInstanceFromReact = () => instance;
    }
  }, [instance]);

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Notify the HTML demo
    if (typeof window !== 'undefined' && (window as any).updateFromPyretBuilder) {
      (window as any).updateFromPyretBuilder();
    }
  };

  const config = {
    compactDisplay: true,
    allowExpressions: true,
    autoGenerateIds: true,
    customTypes: EXAMPLE_PYRET_TYPES // Provide example types for the demo
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <PyretInputController
        instance={instance || undefined}
        onChange={handleInstanceChange}
        config={config}
        className="integrated-demo-pyret-builder"
      />
    </div>
  );
};

/**
 * CndLayoutInterface wrapper that connects to the global demo state
 */
const ConnectedCndLayoutInterface: React.FC = () => {
  const [cndSpec, setCndSpec] = useState('');
  const [isNoCodeView, setIsNoCodeView] = useState(false);
  const [constraints, setConstraints] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);

  // Expose CND spec getter to global scope
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).getCurrentCNDSpecFromReact = () => cndSpec;
    }
  }, [cndSpec]);

  const handleCndSpecChange = (newSpec: string) => {
    setCndSpec(newSpec);
    
    // Trigger update in the HTML demo when CND spec changes
    if (typeof window !== 'undefined' && (window as any).updateFromCnDSpec) {
      (window as any).updateFromCnDSpec();
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <CndLayoutInterface
        yamlValue={cndSpec}
        onChange={handleCndSpecChange}
        isNoCodeView={isNoCodeView}
        onViewChange={setIsNoCodeView}
        constraints={constraints}
        setConstraints={setConstraints}
        directives={directives}
        setDirectives={setDirectives}
      />
    </div>
  );
};

/**
 * Mount the React components into the HTML demo
 */
export function mountPyretIntegratedDemo() {
  // Mount PyretInputController
  const builderContainer = document.getElementById('pyret-builder-container');
  if (builderContainer) {
    const builderRoot = createRoot(builderContainer);
    builderRoot.render(<ConnectedPyretInputController />);
  }

  // Mount CndLayoutInterface
  const layoutContainer = document.getElementById('layout-interface-container');
  if (layoutContainer) {
    const layoutRoot = createRoot(layoutContainer);
    layoutRoot.render(<ConnectedCndLayoutInterface />);
  }

  console.log('✅ Pyret integrated demo components mounted');
}

/**
 * Example of full integration - can be used as a standalone React app
 */
export const FullPyretIntegratedDemo: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance | null>(null);
  const [cndSpec, setCndSpec] = useState('');
  const [currentTab, setCurrentTab] = useState<'builder' | 'layout' | 'visualization'>('builder');

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
  };

  const handleCndSpecChange = (newSpec: string) => {
    setCndSpec(newSpec);
  };

  const handleRenderGraph = async () => {
    try {
      // This would integrate with the actual rendering pipeline
      console.log('Rendering graph with:', {
        atoms: instance?.getAtoms().length || 0,
        relations: instance?.getRelations().length || 0,
        cndSpec: cndSpec.length
      });
      
      // TODO: Integrate with actual WebCola rendering
      
    } catch (error) {
      console.error('Error rendering graph:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      <h1>🚀 Full Pyret Integrated Demo</h1>
      
      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd', marginBottom: '20px' }}>
        {[
          { key: 'builder' as const, label: '🏗️ Build Pyret Structure' },
          { key: 'layout' as const, label: '🎨 Configure CnD Layout' },
          { key: 'visualization' as const, label: '📊 Visualize Graph' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setCurrentTab(tab.key)}
            style={{
              padding: '15px 25px',
              border: 'none',
              background: currentTab === tab.key ? '#007acc' : 'transparent',
              color: currentTab === tab.key ? 'white' : '#666',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, display: 'flex', gap: '20px' }}>
        {currentTab === 'builder' && (
          <>
            <div style={{ flex: 1 }}>
              <h3>🏗️ Pyret Structure Builder</h3>
              <PyretInputController
                instance={instance || undefined}
                onChange={handleInstanceChange}
                config={{
                  customTypes: EXAMPLE_PYRET_TYPES,
                  compactDisplay: true,
                  allowExpressions: true,
                  autoGenerateIds: true
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <h3>📊 Instance Summary</h3>
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                <p><strong>Atoms:</strong> {instance?.getAtoms().length || 0}</p>
                <p><strong>Relations:</strong> {instance?.getRelations().length || 0}</p>
                <p><strong>Total Tuples:</strong> {
                  instance?.getRelations().reduce((sum, rel) => sum + rel.tuples.length, 0) || 0
                }</p>
              </div>
            </div>
          </>
        )}

        {currentTab === 'layout' && (
          <div style={{ flex: 1 }}>
            <h3>🎨 CnD Layout Configuration</h3>
            <CndLayoutInterface
              yamlValue={cndSpec}
              onChange={handleCndSpecChange}
              isNoCodeView={false}
              onViewChange={() => {}}
              constraints={[]}
              setConstraints={() => {}}
              directives={[]}
              setDirectives={() => {}}
            />
          </div>
        )}

        {currentTab === 'visualization' && (
          <div style={{ flex: 1 }}>
            <h3>📊 Graph Visualization</h3>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <button
                onClick={handleRenderGraph}
                style={{
                  background: '#007acc',
                  color: 'white',
                  border: 'none',
                  padding: '15px 30px',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                🚀 Render Graph
              </button>
              <div style={{ 
                marginTop: '20px',
                padding: '20px',
                border: '2px dashed #ddd',
                borderRadius: '8px',
                minHeight: '400px',
                background: '#fafafa'
              }}>
                <p>Graph visualization would appear here</p>
                <p><em>Integrate with WebCola custom element</em></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Auto-mount when loaded in browser
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    // Give the HTML demo time to initialize
    setTimeout(mountPyretIntegratedDemo, 1000);
  });
}