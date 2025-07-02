import React, { useState } from 'react';
import { InstanceBuilder } from './src/components/InstanceBuilder/InstanceBuilder';
import { DotDataInstance } from './src/data-instance/dot/dot-data-instance';
import { IInputDataInstance } from './src/data-instance/interfaces';

/**
 * Example usage of the InstanceBuilder component with DotDataInstance
 */
export const InstanceBuilderExample: React.FC = () => {
  // Initialize with an empty DOT instance
  const [instance, setInstance] = useState<IInputDataInstance>(
    () => new DotDataInstance('digraph G {}')
  );

  const handleInstanceChange = (newInstance: IInputDataInstance) => {
    console.log('Instance changed:', newInstance);
    // The instance is already modified in place, but we can trigger re-renders
    setInstance(newInstance);
  };

  const handleCreateEmpty = () => {
    return new DotDataInstance('digraph G {}');
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Instance Builder Example</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Current Instance Summary:</h2>
        <p>Atoms: {instance.getAtoms().length}</p>
        <p>Relations: {instance.getRelations().length}</p>
      </div>

      <InstanceBuilder
        instance={instance}
        onChange={handleInstanceChange}
        disabled={false}
        className="my-custom-style"
      />

      <div style={{ marginTop: '20px' }}>
        <h2>Instance Data:</h2>
        <pre style={{ 
          background: '#f5f5f5', 
          padding: '10px', 
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto'
        }}>
          {JSON.stringify({
            atoms: instance.getAtoms(),
            relations: instance.getRelations()
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
};

/**
 * Example with a custom IInputDataInstance implementation
 */
class MockDataInstance implements IInputDataInstance {
  private atoms: any[] = [];
  private relations: any[] = [];

  getAtoms() { return this.atoms; }
  getRelations() { return this.relations; }
  getTypes() { return []; }

  addAtom(atom: any) {
    this.atoms.push(atom);
  }

  removeAtom(atomId: string) {
    this.atoms = this.atoms.filter(a => a.id !== atomId);
  }

  addRelationTuple(relationName: string, tuple: any) {
    let relation = this.relations.find(r => r.name === relationName);
    if (!relation) {
      relation = { id: relationName, name: relationName, tuples: [] };
      this.relations.push(relation);
    }
    relation.tuples.push(tuple);
  }

  removeRelationTuple(relationId: string, tuple: any) {
    const relation = this.relations.find(r => r.id === relationId);
    if (relation) {
      relation.tuples = relation.tuples.filter((t: any) => 
        JSON.stringify(t) !== JSON.stringify(tuple)
      );
      if (relation.tuples.length === 0) {
        this.relations = this.relations.filter(r => r.id !== relationId);
      }
    }
  }
}

export const InstanceBuilderWithMockExample: React.FC = () => {
  const [instance] = useState<IInputDataInstance>(() => new MockDataInstance());

  return (
    <div style={{ padding: '20px' }}>
      <h1>Instance Builder with Mock Implementation</h1>
      
      <InstanceBuilder
        instance={instance}
        onChange={(inst) => console.log('Mock instance changed:', inst)}
      />
    </div>
  );
};
