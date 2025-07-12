import * as React from 'react';
import { useState } from 'react';
import { JSONDataInstance } from '../src/data-instance/json-data-instance';
import { ReplInterface } from '../src/components/ReplInterface/ReplInterface';

/**
 * Demo component showcasing the REPL Interface
 */
export const ReplInterfaceDemo: React.FC = () => {
  // Create a JSONDataInstance for the demo
  const [instance] = useState(() => new JSONDataInstance({
    atoms: [
      { id: 'alice', label: 'Alice', type: 'Person' },
      { id: 'bob', label: 'Bob', type: 'Person' }
    ],
    relations: [
      {
        id: 'friends',
        name: 'friends',
        types: ['Person', 'Person'],
        tuples: [
          { atoms: ['alice', 'bob'], types: ['Person', 'Person'] }
        ]
      }
    ]
  }));

  const handleInstanceChange = (updatedInstance: JSONDataInstance) => {
    console.log('Instance updated:', updatedInstance.getStatistics());
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '20px', color: '#333' }}>
        REPL Interface Demo
      </h1>
      
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0, color: '#555' }}>Instructions</h2>
        <p>This demo shows the REPL-like interface for building data instances with command-line style input.</p>
        
        <h3>Try these commands:</h3>
        <div style={{ fontFamily: 'monospace', backgroundColor: '#f8f8f8', padding: '10px', borderRadius: '4px' }}>
          <strong>Terminal 1 (Atoms):</strong><br/>
          • add Charlie:Person<br/>
          • add p4=David:Person<br/>
          • remove alice<br/>
          • list<br/>
          <br/>
          <strong>Terminal 2 (Relations):</strong><br/>
          • add likes:alice-&gt;bob<br/>
          • add knows:alice-&gt;bob-&gt;charlie<br/>
          • remove friends:alice-&gt;bob<br/>
          • status<br/>
          <br/>
          <strong>Terminal 3 (Extensions):</strong><br/>
          • add [list: 1,2,3,4]:numbers<br/>
          • add [list: alice,bob]:people<br/>
          • help<br/>
        </div>
      </div>

      <ReplInterface 
        instance={instance}
        onChange={handleInstanceChange}
      />
      
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'white', borderRadius: '8px' }}>
        <h3>Current Instance Stats</h3>
        <pre style={{ backgroundColor: '#f8f8f8', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
          {JSON.stringify(instance.getStatistics(), null, 2)}
        </pre>
      </div>
    </div>
  );
};