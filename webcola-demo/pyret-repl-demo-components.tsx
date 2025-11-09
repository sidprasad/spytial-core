import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ReplInterface } from '../src/components/ReplInterface/ReplInterface';
import { SpytialLayoutInterface } from '../src/components/SpytialLayoutInterface';
import { PyretDataInstance, createPyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';

/**
 * Pyret REPL demo that combines ReplInterface with SpytialLayoutInterface
 * and connects to the webcola-pyret-repl-demo.html page
 * Uses PyretDataInstance for Pyret-specific functionality
 */

interface PyretReplDemoState {
  instance: IInputDataInstance;
  cndSpec: string;
  isBuilderMode: boolean;
}

/**
 * Create an empty PyretDataInstance for the demo
 */
function createEmptyPyretDataInstance(): PyretDataInstance {
  // Create a truly empty PyretDataInstance without any initial objects
  return new PyretDataInstance();
}

/**
 * ReplInterface wrapper that connects to the global demo state
 */
const ConnectedReplInterface: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance>(
    () => createEmptyPyretDataInstance()
  );

  // Connect to global state
  useEffect(() => {
    // Expose instance to global scope for the HTML demo
    if (typeof window !== 'undefined') {
      (window as any).currentInstance = instance;
      
      // Trigger update in the HTML demo
      if ((window as any).updateFromRepl) {
        (window as any).updateFromRepl();
      }
    }
  }, [instance]);

  // Listen for external updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register a function to update the repl from external sources
      (window as any).updateReplInstance = (newInstance: IInputDataInstance) => {
        setInstance(newInstance);
      };
      
      // Expose a getter for the React instance
      (window as any).getCurrentInstanceFromReact = () => instance;
      
      // Expose a function to update React state from edge events
      (window as any).updateInstanceFromEdgeEvent = (updatedInstance: IInputDataInstance) => {
        console.log('🔗 Updating React state from edge event - atoms:', updatedInstance.getAtoms().length, 'relations:', updatedInstance.getRelations().length);
        setInstance(updatedInstance);
      };
    }
  }, [instance]);

  const handleInstanceChange = (updatedInstance: IInputDataInstance) => {
    console.log('REPL Instance updated - atoms:', updatedInstance.getAtoms().length, 'relations:', updatedInstance.getRelations().length);
    setInstance(updatedInstance);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h5 style={{ margin: 0, color: '#495057' }}>Pyret REPL Interface</h5>
        <small style={{ color: '#6c757d' }}>
          Build Pyret data instances using command-line syntax
        </small>
      </div>
      
      <div style={{ flex: 1 }}>
        <ReplInterface 
          instance={instance}
          onChange={handleInstanceChange}
          disabled={false}
        />
      </div>
      
      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <small style={{ color: '#6c757d' }}>
          Current: {instance.getAtoms().length} atoms, {instance.getRelations().length} relations
        </small>
      </div>
    </div>
  );
};

/**
 * SpytialLayoutInterface wrapper that connects to the global demo state
 */
const ConnectedSpytialLayoutInterface: React.FC = () => {
  const [cndSpec, setCndSpec] = useState<string>('');
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
    console.log('CND spec updated:', newSpec);
    setCndSpec(newSpec);
    
    // Trigger graph update
    if (typeof window !== 'undefined' && (window as any).loadInstanceData) {
      (window as any).loadInstanceData();
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h5 style={{ margin: 0, color: '#495057' }}>Spytial Layout Interface</h5>
        <small style={{ color: '#6c757d' }}>
          Configure visual layout constraints
        </small>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SpytialLayoutInterface 
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
    </div>
  );
};

/**
 * Initialize React components when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing Pyret REPL demo React components...');
  
  // Mount ReplInterface
  const replContainer = document.getElementById('repl-interface-container');
  if (replContainer) {
    const replRoot = createRoot(replContainer);
    replRoot.render(<ConnectedReplInterface />);
    console.log('ReplInterface mounted successfully');
  } else {
    console.warn('REPL interface container not found');
  }

  // Mount SpytialLayoutInterface  
  const layoutContainer = document.getElementById('layout-interface-container');
  if (layoutContainer) {
    const layoutRoot = createRoot(layoutContainer);
    layoutRoot.render(<ConnectedSpytialLayoutInterface />);
    console.log('SpytialLayoutInterface mounted successfully');
  } else {
    console.warn('Layout interface container not found');
  }
});

// Export for potential external use
export { ConnectedReplInterface, ConnectedSpytialLayoutInterface };