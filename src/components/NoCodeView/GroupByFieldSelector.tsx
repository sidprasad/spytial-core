import React from 'react';
import { ConstraintData } from './interfaces';

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
  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Field</span>
        </div>
        <input
          type="text"
          name="field"
          className="form-control"
          onChange={(event) => {
            const { name, value } = event.target;
            props.onUpdate({
              params: {
                ...props.constraintData.params,
                [name]: value
              }
            });
          }}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title="Which 0-indexed element of the field to use as the group key.">
            Group On
          </span>
        </div>
        <input
          type="number"
          name="groupOn"
          className="form-control"
          onChange={(event) => {
            const { name, value } = event.target;
            props.onUpdate({
              params: {
                ...props.constraintData.params,
                [name]: Number(value)
              }
            });
          }}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title="Which 0-indexed element of the field are group members.">
            Add to Group
          </span>
        </div>
        <input
          type="number"
          name="addToGroup"
          className="form-control"
          onChange={(event) => {
            const { name, value } = event.target;
            props.onUpdate({
              params: {
                ...props.constraintData.params,
                [name]: Number(value)
              }
            });
          }}
          required
        />
      </div>
    </>
  );
};
