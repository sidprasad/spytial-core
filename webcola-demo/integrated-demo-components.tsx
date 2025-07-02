import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { InstanceBuilder, InstanceBuilderProps } from '../src/components/InstanceBuilder/InstanceBuilder';
import { CndLayoutInterface } from '../src/components/CndLayoutInterface';
import { DotDataInstance } from '../src/data-instance/dot/dot-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';

/**
 * Integrated demo that combines InstanceBuilder with CndLayoutInterface
 * and connects to the webcola-integrated-demo.html page
 */

interface IntegratedDemoState {
  instance: IInputDataInstance;
  cndSpec: string;
  isBuilderMode: boolean;
}

/**
 * InstanceBuilder wrapper that connects to the global demo state
 */
const ConnectedInstanceBuilder: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance>(
    () => new DotDataInstance('digraph G {}')
  );

  // Connect to global state
  useEffect(() => {
    // Expose instance to global scope for the HTML demo
    if (typeof window !== 'undefined') {
      (window as any).currentInstance = instance;
      
      // Trigger update in the HTML demo
      if ((window as any).updateFromBuilder) {
        (window as any).updateFromBuilder();
      }
    }
  }, [instance]);

  // Listen for external updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register a function to update the builder from external sources
      (window as any).updateBuilderInstance = (newInstance: IInputDataInstance) => {
        setInstance(newInstance);
      };
    }
  }, []);

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Notify the HTML demo
    if (typeof window !== 'undefined' && (window as any).updateFromBuilder) {
      (window as any).updateFromBuilder();
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <InstanceBuilder
        instance={instance}
        onChange={handleInstanceChange}
        className="integrated-demo-builder"
      />
    </div>
  );
};

/**
 * CndLayoutInterface wrapper that connects to the global demo state
 */
const ConnectedLayoutInterface: React.FC = () => {
  const [cndSpec, setCndSpec] = useState('');
  const [isNoCodeView, setIsNoCodeView] = useState(false);
  const [constraints, setConstraints] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);

  // Connect to global CND textarea
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Sync with the CND textarea in the HTML demo
      const cndTextarea = document.getElementById('webcola-cnd') as HTMLTextAreaElement;
      if (cndTextarea) {
        setCndSpec(cndTextarea.value);
        
        // Listen for changes
        const handleTextareaChange = () => {
          setCndSpec(cndTextarea.value);
        };
        
        cndTextarea.addEventListener('input', handleTextareaChange);
        return () => cndTextarea.removeEventListener('input', handleTextareaChange);
      }
    }
  }, []);

  const handleCndSpecChange = (newSpec: string) => {
    setCndSpec(newSpec);
    
    // Update the textarea in the HTML demo
    if (typeof window !== 'undefined') {
      const cndTextarea = document.getElementById('webcola-cnd') as HTMLTextAreaElement;
      if (cndTextarea) {
        cndTextarea.value = newSpec;
      }
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
export function mountIntegratedDemo() {
  // Mount InstanceBuilder
  const builderContainer = document.getElementById('instance-builder-container');
  if (builderContainer) {
    const builderRoot = createRoot(builderContainer);
    builderRoot.render(<ConnectedInstanceBuilder />);
  }

  // Mount CndLayoutInterface
  const layoutContainer = document.getElementById('layout-interface-container');
  if (layoutContainer) {
    const layoutRoot = createRoot(layoutContainer);
    layoutRoot.render(<ConnectedLayoutInterface />);
  }

  console.log('✅ Integrated demo components mounted');
}

/**
 * Example of full integration - can be used as a standalone React app
 */
export const FullIntegratedDemo: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance>(
    () => new DotDataInstance('digraph G {}')
  );
  const [cndSpec, setCndSpec] = useState('');
  const [currentTab, setCurrentTab] = useState<'builder' | 'layout' | 'visualization'>('builder');

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
  };

  const handleRenderGraph = async () => {
    try {
      // This would integrate with the actual rendering pipeline
      console.log('Rendering graph with:', {
        atoms: instance.getAtoms().length,
        relations: instance.getRelations().length,
        cndSpec: cndSpec.length
      });
      
      // TODO: Integrate with actual WebCola rendering
      
    } catch (error) {
      console.error('Error rendering graph:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      <h1>🚀 Full Integrated CND Demo</h1>
      
      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #ddd', marginBottom: '20px' }}>
        {[
          { key: 'builder' as const, label: '🏗️ Build Instance' },
          { key: 'layout' as const, label: '🎨 Configure Layout' },
          { key: 'visualization' as const, label: '📊 Visualize' }
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
              <h3>🏗️ Instance Builder</h3>
              <InstanceBuilder
                instance={instance}
                onChange={handleInstanceChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <h3>📊 Instance Summary</h3>
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '4px' }}>
                <p><strong>Atoms:</strong> {instance.getAtoms().length}</p>
                <p><strong>Relations:</strong> {instance.getRelations().length}</p>
                <p><strong>Total Tuples:</strong> {
                  instance.getRelations().reduce((sum, rel) => sum + rel.tuples.length, 0)
                }</p>
              </div>
            </div>
          </>
        )}

        {currentTab === 'layout' && (
          <div style={{ flex: 1 }}>
            <h3>🎨 Layout Configuration</h3>
            <CndLayoutInterface
              yamlValue={cndSpec}
              onChange={setCndSpec}
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
            <h3>📊 Visualization</h3>
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
    setTimeout(mountIntegratedDemo, 1000);
  });
}
