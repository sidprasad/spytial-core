import * as React from 'react';
import { useState } from 'react';
import { PyretDataInstance } from '../src/data-instance/pyret/pyret-data-instance';
import { ReplInterface } from '../src/components/ReplInterface/ReplInterface';

/**
 * Demo component showcasing the REPL Interface with PyretDataInstance
 */
export const ReplInterfaceDemo: React.FC = () => {
  // Create a PyretDataInstance for the demo starting empty
  const [instance, setInstance] = useState(() => {
    return new PyretDataInstance();
  });

  const handleInstanceChange = (updatedInstance: PyretDataInstance) => {
    console.log('Pyret instance updated - atoms:', updatedInstance.getAtoms().length, 'relations:', updatedInstance.getRelations().length);
    setInstance(updatedInstance);
  };

  const loadSampleData = () => {
    const samplePyretData = {
      dict: {
        people: {
          dict: {
            alice: { dict: { name: "Alice", age: 25 }, brands: { "$brandPerson": true } },
            bob: { dict: { name: "Bob", age: 30 }, brands: { "$brandPerson": true } },
            charlie: { dict: { name: "Charlie", age: 28 }, brands: { "$brandPerson": true } }
          },
          brands: { "$brandDict": true }
        },
        projects: {
          dict: {
            proj1: { dict: { title: "WebApp", lead: "alice" }, brands: { "$brandProject": true } },
            proj2: { dict: { title: "MobileApp", lead: "bob" }, brands: { "$brandProject": true } }
          },
          brands: { "$brandDict": true }
        }
      },
      brands: { "$brandData": true }
    };
    
    const newInstance = new PyretDataInstance(samplePyretData);
    setInstance(newInstance);
  };

  const clearData = () => {
    const newInstance = new PyretDataInstance();
    setInstance(newInstance);
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '20px', color: '#333' }}>
        Pyret REPL Interface Demo
      </h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0, color: '#555' }}>Instructions</h2>
        <p>This demo shows the REPL-like interface for building Pyret data instances with command-line style input.</p>
        
        <h3>Data Controls:</h3>
        <div style={{ marginBottom: '15px' }}>
          <button 
            onClick={loadSampleData}
            style={{ 
              marginRight: '10px', 
              padding: '8px 16px', 
              backgroundColor: '#007bff', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Load Sample Data
          </button>
          <button 
            onClick={clearData}
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#dc3545', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Data
          </button>
        </div>

        <h3>Try these commands:</h3>
        <div style={{ fontFamily: 'monospace', backgroundColor: '#f8f8f8', padding: '10px', borderRadius: '4px' }}>
          <strong>Unified Terminal (supports all command types):</strong><br/>
          <br/>
          <strong>Atom Commands:</strong><br/>
          • add Charlie:Person<br/>
          • add p4=David:Person<br/>
          • add tree1=Node:TreeNode<br/>
          <br/>
          <strong>Relation Commands:</strong><br/>
          • add likes:alice-&gt;bob<br/>
          • add knows:alice-&gt;bob-&gt;charlie<br/>
          • add left:tree1-&gt;alice<br/>
          <br/>
          <strong>Pyret Extension Commands:</strong><br/>
          • add [list: 1,2,3,4]:numberList<br/>
          • add [list: alice,bob]:personList<br/>
          • add [list: red,green,blue]:colors<br/>
          <br/>
          <strong>Utility Commands:</strong><br/>
          • help<br/>
          • status<br/>
          • list<br/>
          • clear<br/>
        </div>
      </div>

      <ReplInterface 
        instance={instance}
        onChange={handleInstanceChange}
      />
      
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '8px' }}>
        <h3>Current Pyret Instance Stats</h3>
        <pre style={{ backgroundColor: '#f8f8f8', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
          Atoms: {instance.getAtoms().length}, Relations: {instance.getRelations().length}
        </pre>
        <h4>Pyret Reification</h4>
        <pre style={{ backgroundColor: '#f0f8ff', padding: '10px', borderRadius: '4px', overflow: 'auto', color: '#333' }}>
          {instance.reify()}
        </pre>
      </div>
    </div>
  );
};