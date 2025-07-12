import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PyretInputController, PyretInputControllerProps } from '../src/components/PyretInputController/PyretInputController';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { IInputDataInstance } from '../src/data-instance/interfaces';

/**
 * Integrated demo that combines PyretInputController with live Pyret code output
 * Shows real-time code generation as users build Pyret data structures
 */

interface PyretDemoState {
  instance: IInputDataInstance | null;
  pyretCode: string;
  isBuilderMode: boolean;
}

/**
 * PyretInputController wrapper that connects to the global demo state
 */
const ConnectedPyretInputController: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance | null>(null);
  const [pyretCode, setPyretCode] = useState<string>('// Build a Pyret data structure using the controller on the left\n// The generated Pyret code will appear here automatically\n\n');

  // Connect to global state
  useEffect(() => {
    // Expose instance to global scope for the HTML demo
    if (typeof window !== 'undefined') {
      (window as any).currentPyretInstance = instance;
      (window as any).currentPyretCode = pyretCode;
      
      // Trigger update in the HTML demo
      if ((window as any).updateFromPyretBuilder) {
        (window as any).updateFromPyretBuilder();
      }
    }
  }, [instance, pyretCode]);

  // Listen for external updates
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Register a function to update the builder from external sources
      (window as any).updatePyretBuilderInstance = (newInstance: IInputDataInstance) => {
        setInstance(newInstance);
      };
      
      // Expose a getter for the React instance
      (window as any).getCurrentPyretInstanceFromReact = () => instance;
      (window as any).getCurrentPyretCodeFromReact = () => pyretCode;
    }
  }, [instance, pyretCode]);

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    // Generate Pyret code from the instance
    try {
      const code = newInstance.reify() as string;
      setPyretCode(code.length > 0 ? code : '// No root value selected yet\n// Use the star (☆/★) button to set a root value');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setPyretCode(`// Error generating Pyret code:\n// ${errorMsg}\n\n// This is usually because no root value is selected\n// or the data structure is incomplete`);
    }
    
    // Notify the HTML demo
    if (typeof window !== 'undefined' && (window as any).updateFromPyretBuilder) {
      (window as any).updateFromPyretBuilder();
    }
  };

  const config = {
    compactDisplay: true,
    allowExpressions: true,
    autoGenerateIds: true,
    showBuiltinTypes: true
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
 * Live Pyret code output display with syntax highlighting
 */
const PyretCodeOutput: React.FC = () => {
  const [pyretCode, setPyretCode] = useState<string>('// Build a Pyret data structure using the controller on the left\n// The generated Pyret code will appear here automatically');
  const [instance, setInstance] = useState<IInputDataInstance | null>(null);
  const codeRef = useRef<HTMLPreElement>(null);

  // Listen for updates from the PyretInputController
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create update function that can be called from the builder
      (window as any).updatePyretCodeDisplay = (newCode: string, newInstance: IInputDataInstance | null) => {
        setPyretCode(newCode);
        setInstance(newInstance);
      };

      // Create a polling mechanism to get updates from the connected builder
      const pollForUpdates = () => {
        const currentCode = (window as any).getCurrentPyretCodeFromReact?.();
        const currentInstance = (window as any).getCurrentPyretInstanceFromReact?.();
        
        if (currentCode && currentCode !== pyretCode) {
          setPyretCode(currentCode);
        }
        if (currentInstance !== instance) {
          setInstance(currentInstance);
        }
      };

      const intervalId = setInterval(pollForUpdates, 500); // Poll every 500ms
      
      return () => clearInterval(intervalId);
    }
  }, [pyretCode, instance]);

  // Copy to clipboard functionality
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pyretCode);
      
      // Show brief success message
      if (codeRef.current) {
        const originalBg = codeRef.current.style.backgroundColor;
        codeRef.current.style.backgroundColor = '#d4edda';
        setTimeout(() => {
          if (codeRef.current) {
            codeRef.current.style.backgroundColor = originalBg;
          }
        }, 200);
      }
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  // Get statistics about the current instance
  const getInstanceStats = () => {
    if (!instance) return null;
    
    const atoms = instance.getAtoms();
    const relations = instance.getRelations();
    const types = instance.getTypes();
    
    return {
      atomCount: atoms.length,
      relationCount: relations.length,
      typeCount: types.length
    };
  };

  const stats = getInstanceStats();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ 
        padding: '10px 15px', 
        borderBottom: '1px solid #ddd', 
        backgroundColor: '#f8f9fa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h6 style={{ margin: 0, color: '#495057' }}>Generated Pyret Code</h6>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {stats && (
            <small style={{ color: '#6c757d' }}>
              {stats.atomCount} atoms, {stats.relationCount} relations, {stats.typeCount} types
            </small>
          )}
          <button
            onClick={handleCopyCode}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
            title="Copy code to clipboard"
          >
            Copy
          </button>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        <pre
          ref={codeRef}
          style={{
            margin: 0,
            padding: '15px',
            backgroundColor: '#2d3748',
            color: '#e2e8f0',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            height: '100%',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {pyretCode}
        </pre>
      </div>
    </div>
  );
};

/**
 * Mount the React components into the HTML demo
 */
export function mountPyretDemo() {
  // Mount PyretInputController
  const builderContainer = document.getElementById('pyret-builder-container');
  if (builderContainer) {
    const builderRoot = createRoot(builderContainer);
    builderRoot.render(<ConnectedPyretInputController />);
  }

  // Mount PyretCodeOutput
  const outputContainer = document.getElementById('pyret-output-container');
  if (outputContainer) {
    const outputRoot = createRoot(outputContainer);
    outputRoot.render(<PyretCodeOutput />);
  }

  console.log('✅ Pyret demo components mounted');
}

/**
 * Example of full integration - can be used as a standalone React app
 */
export const FullPyretDemo: React.FC = () => {
  const [instance, setInstance] = useState<IInputDataInstance | null>(null);
  const [pyretCode, setPyretCode] = useState<string>('// No data structure built yet');

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    setInstance(newInstance);
    
    try {
      const code = newInstance.reify() as string;
      setPyretCode(code.length > 0 ? code : '// No root value selected');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setPyretCode(`// Error: ${errorMsg}`);
    }
  };

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: '1fr 1fr', 
      gap: '20px', 
      height: '600px',
      padding: '20px'
    }}>
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        overflow: 'hidden',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ 
          padding: '10px 15px', 
          borderBottom: '1px solid #ddd', 
          backgroundColor: '#f8f9fa' 
        }}>
          <h6 style={{ margin: 0 }}>Pyret Data Structure Builder</h6>
        </div>
        <div style={{ height: 'calc(100% - 45px)', overflow: 'auto' }}>
          <PyretInputController
            instance={instance || undefined}
            onChange={handleInstanceChange}
            config={{
              compactDisplay: true,
              allowExpressions: true,
              autoGenerateIds: true
            }}
          />
        </div>
      </div>
      
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        overflow: 'hidden',
        backgroundColor: '#2d3748'
      }}>
        <div style={{ 
          padding: '10px 15px', 
          borderBottom: '1px solid #4a5568', 
          backgroundColor: '#1a202c',
          color: 'white'
        }}>
          <h6 style={{ margin: 0 }}>Generated Pyret Code</h6>
        </div>
        <pre style={{
          margin: 0,
          padding: '15px',
          color: '#e2e8f0',
          backgroundColor: '#2d3748',
          fontFamily: 'Monaco, Menlo, monospace',
          fontSize: '14px',
          height: 'calc(100% - 45px)',
          overflow: 'auto',
          whiteSpace: 'pre-wrap'
        }}>
          {pyretCode}
        </pre>
      </div>
    </div>
  );
};