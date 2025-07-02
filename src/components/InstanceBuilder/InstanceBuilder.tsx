import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { IAtom, IRelation, ITuple, IInputDataInstance } from '../../data-instance/interfaces';
import './InstanceBuilder.css';

/**
 * Generate a unique atom ID based on existing atoms in the instance
 */
function generateAtomId(instance: IInputDataInstance, typeName : string): string {
  const existingAtoms = instance.getAtoms();
  const existingIds = new Set(existingAtoms.map(atom => atom.id));
  
  let counter = 1;
  let candidateId = `${typeName}-${counter}`;
  
  while (existingIds.has(candidateId)) {
    counter++;
    candidateId = `${typeName}-${counter}`;
  }
  
  return candidateId;
}

export interface InstanceBuilderProps {
  /** The data instance to build/modify - REQUIRED */
  instance: IInputDataInstance;
  /** Callback when the instance changes */
  onChange?: (instance: IInputDataInstance) => void;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** CSS class name for styling */
  className?: string;
}

interface AtomForm {
  id: string;
  label: string;
  type: string;
}

interface RelationForm {
  name: string;
  sourceId: string;
  targetId: string;
}

/**
 * InstanceBuilder - A reusable React component for constructing IDataInstance objects
 * 
 * Provides forms to add/remove atoms and relations, working directly with the provided instance.
 * The parent component is responsible for providing and managing the instance.
 */
export const InstanceBuilder: React.FC<InstanceBuilderProps> = ({
  instance,
  onChange,
  disabled = false,
  className = ''
}) => {
  // Form state for adding atoms
  const [atomForm, setAtomForm] = useState<AtomForm>({
    id: '',
    label: '',
    type: 'Entity'
  });

  // Compute a suggested ID based on type and current atoms
  const suggestedId = generateAtomId(instance, atomForm.type.trim() || 'Entity');

  // Form state for adding relations
  const [relationForm, setRelationForm] = useState<RelationForm>({
    name: '',
    sourceId: '',
    targetId: ''
  });

  // Error state
  const [error, setError] = useState<string>('');

  // Get current atoms and relations from instance
  const atoms = instance.getAtoms();
  const relations = instance.getRelations();

  // Notify parent when instance changes (optional callback)
  const notifyChange = useCallback(() => {
    if (onChange) {
      onChange(instance);
    }
  }, [instance, onChange]);

  /**
   * Add a new atom to the instance
   */
  const handleAddAtom = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!atomForm.label.trim()) {
      setError('Atom label is required');
      return;
    }
    const typeInfo = atomForm.type.trim() || 'Entity';
    // Use user-provided ID if present, otherwise use suggested
    const id = atomForm.id.trim() || generateAtomId(instance, typeInfo);
    if (!id) {
      setError('Atom ID could not be generated');
      return;
    }
    // Check for duplicate ID
    if (instance.getAtoms().some(atom => atom.id === id)) {
      setError('Atom ID already exists');
      return;
    }
    try {
      const newAtom: IAtom = {
        id,
        label: atomForm.label.trim(),
        type: typeInfo
      };
      instance.addAtom(newAtom);
      setAtomForm({ id: '', label: '', type: 'Entity' });
      setError('');
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add atom');
    }
  }, [atomForm, instance, notifyChange]);

  /**
   * Remove an atom from the instance
   */
  const handleRemoveAtom = useCallback((atomId: string) => {
    try {
      instance.removeAtom(atomId);
      setError('');
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove atom');
    }
  }, [instance, notifyChange]);

  /**
   * Add a new relation tuple to the instance
   */
  const handleAddRelation = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!relationForm.name.trim() || !relationForm.sourceId.trim() || !relationForm.targetId.trim()) {
      setError('Relation name, source, and target are required');
      return;
    }

    try {
      const tuple: ITuple = {
        atoms: [relationForm.sourceId.trim(), relationForm.targetId.trim()],
        types: ['unknown', 'unknown'] // Types will be inferred from actual atoms
      };

      instance.addRelationTuple(relationForm.name.trim(), tuple);
      setRelationForm({ name: '', sourceId: '', targetId: '' });
      setError('');
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add relation');
    }
  }, [relationForm, instance, notifyChange]);

  /**
   * Remove a relation tuple from the instance
   */
  const handleRemoveRelationTuple = useCallback((relationId: string, tuple: ITuple) => {
    try {
      instance.removeRelationTuple(relationId, tuple);
      setError('');
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove relation');
    }
  }, [instance, notifyChange]);

  /**
   * Clear all data from the instance
   */
  const handleClear = useCallback(() => {
    try {
      // Remove all atoms and relations from the current instance
      const atomIds = instance.getAtoms().map(atom => atom.id);
      atomIds.forEach(id => instance.removeAtom(id));
      
      const relationIds = instance.getRelations().map(rel => rel.id);
      relationIds.forEach(id => {
        const relation = instance.getRelations().find(r => r.id === id);
        if (relation) {
          relation.tuples.forEach(tuple => instance.removeRelationTuple(id, tuple));
        }
      });
      
      setError('');
      notifyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear instance');
    }
  }, [instance, notifyChange]);

  // State for re-ify result
  const [reifyResult, setReifyResult] = useState<any>(null);

  // Handler for re-ify button
  const handleReify = useCallback(() => {
    // Debug: log the instance and its methods
    // eslint-disable-next-line no-console
    console.log('Instance in handleReify:', instance);
    // eslint-disable-next-line no-console
    console.log('typeof instance.reify:', typeof (instance as any).reify);
    if (typeof instance.reify === 'function') {
      try {
        const result = instance.reify();
        setReifyResult(result);
      } catch (err) {
        setReifyResult('Re-ify failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      setReifyResult('Re-ify not supported on this instance.');
    }
  }, [instance]);

  return (
    <div className={`instance-builder ${className}`}>
      <div className="instance-builder__header">
        <h2>Instance Builder</h2>
        <div className="instance-builder__stats">
          <span>{atoms.length} atoms</span>
          <span>{relations.reduce((sum, rel) => sum + rel.tuples.length, 0)} relations</span>
        </div>
      </div>

      {error && (
        <div className="instance-builder__error">
          {error}
          <button 
            type="button" 
            onClick={() => setError('')}
            aria-label="Clear error"
          >
            ×
          </button>
        </div>
      )}

      <div className="instance-builder__content">
        {/* Atom Management Section */}
        <section className="instance-builder__section">
          <h3>Atoms</h3>
          
          {/* Add Atom Form */}
          <form onSubmit={handleAddAtom} className="instance-builder__form">
            <div className="form-row">
              <input
                type="text"
                placeholder={`ID (suggested: ${suggestedId})`}
                value={atomForm.id}
                onChange={(e: any) => setAtomForm(prev => ({ ...prev, id: e.target.value }))}
                disabled={disabled}
                aria-label="Atom ID"
              />
              <input
                type="text"
                placeholder="Label"
                value={atomForm.label}
                onChange={(e) => setAtomForm(prev => ({ ...prev, label: e.target.value }))}
                disabled={disabled}
                required
              />
              <input
                type="text"
                placeholder="Type"
                value={atomForm.type}
                onChange={(e) => setAtomForm(prev => ({ ...prev, type: e.target.value }))}
                disabled={disabled}
              />
              <button type="submit" disabled={disabled}>
                Add Atom
              </button>
            </div>
            {atomForm.id === '' && (
              <div style={{ fontSize: '0.85em', color: '#888', marginTop: 2 }}>
                Suggested ID: <code>{suggestedId}</code>
              </div>
            )}
          </form>

          {/* Atoms List */}
          <div className="instance-builder__list">
            {atoms.length === 0 ? (
              <p className="empty-state">No atoms yet. Add one above.</p>
            ) : (
              atoms.map((atom) => (
                <div key={atom.id} className="list-item">
                  <div className="item-info">
                    <strong>{atom.id}</strong>
                    <span className="item-label">{atom.label}</span>
                    <span className="item-type">{atom.type}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAtom(atom.id)}
                    disabled={disabled}
                    className="remove-button"
                    aria-label={`Remove atom ${atom.id}`}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Relation Management Section */}
        <section className="instance-builder__section">
          <h3>Relations</h3>
          
          {/* Add Relation Form */}
          <form onSubmit={handleAddRelation} className="instance-builder__form">
            <div className="form-row">
              <input
                type="text"
                placeholder="Relation Name"
                value={relationForm.name}
                onChange={(e) => setRelationForm(prev => ({ ...prev, name: e.target.value }))}
                disabled={disabled}
                required
              />
              <select
                value={relationForm.sourceId}
                onChange={(e) => setRelationForm(prev => ({ ...prev, sourceId: e.target.value }))}
                disabled={disabled}
                required
              >
                <option value="">Select Source</option>
                {atoms.map(atom => (
                  <option key={atom.id} value={atom.id}>{atom.id} ({atom.label})</option>
                ))}
              </select>
              <select
                value={relationForm.targetId}
                onChange={(e) => setRelationForm(prev => ({ ...prev, targetId: e.target.value }))}
                disabled={disabled}
                required
              >
                <option value="">Select Target</option>
                {atoms.map(atom => (
                  <option key={atom.id} value={atom.id}>{atom.id} ({atom.label})</option>
                ))}
              </select>
              <button type="submit" disabled={disabled}>
                Add Relation
              </button>
            </div>
          </form>

          {/* Relations List */}
          <div className="instance-builder__list">
            {relations.length === 0 ? (
              <p className="empty-state">No relations yet. Add one above.</p>
            ) : (
              relations.map((relation) => (
                <div key={relation.id} className="relation-group">
                  <h4>{relation.name}</h4>
                  {relation.tuples.map((tuple, tupleIndex) => (
                    <div key={tupleIndex} className="list-item">
                      <div className="item-info">
                        <span>{tuple.atoms[0]} → {tuple.atoms[tuple.atoms.length - 1]}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveRelationTuple(relation.id, tuple)}
                        disabled={disabled}
                        className="remove-button"
                        aria-label={`Remove relation ${relation.name} from ${tuple.atoms[0]} to ${tuple.atoms[tuple.atoms.length - 1]}`}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Actions Section */}
        <section className="instance-builder__actions">
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="clear-button"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleReify}
            disabled={disabled}
            className="reify-button"
            style={{ marginLeft: 8 }}
          >
            Re-ify
          </button>
        </section>
        {/* Re-ify Result Display */}
        {reifyResult !== null && (
          <section className="instance-builder__reify-result" style={{ marginTop: 12, background: '#f8f8f8', border: '1px solid #eee', borderRadius: 4, padding: 10 }}>
            <strong>Re-ify Result:</strong>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {typeof reifyResult === 'string' ? reifyResult : JSON.stringify(reifyResult, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
};
