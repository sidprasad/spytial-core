import React, { useCallback } from 'react';
import { ConstraintData } from '../interfaces';

interface GroupByFieldSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * Minimal React component for group-by-field constraint configuration.
 * Groups elements based on a field with configurable indices.
 */
export const GroupByFieldSelector: React.FC<GroupByFieldSelectorProps> = (props: GroupByFieldSelectorProps) => {
  const handleInputChange = (event) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: event.target.type === 'number' ? Number(value) : value
      }
    });
  };

  return (
    <>
      <div className="field-group">
        <label className="field-label">Field</label>
        <input
          type="text"
          name="field"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label">Selector</label>
        <input
          type="text"
          name="selector"
          className="code-input"
          defaultValue={props.constraintData.params.selector as string || ''}
          placeholder="Optional: target specific atoms (e.g., Person)"
          onChange={handleInputChange}
        />
      </div>
      <div className="field-group">
        <label className="field-label infolabel" title="Which 0-indexed element of the field to use as the group key.">
          Group On
        </label>
        <input
          type="number"
          name="groupOn"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="field-group">
        <label className="field-label infolabel" title="Which 0-indexed element of the field are group members.">
          Add to Group
        </label>
        <input
          type="number"
          name="addToGroup"
          onChange={handleInputChange}
          required
        />
      </div>
    </>
  );
};
