import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT, TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';

interface GroupBySelectorSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * Minimal React component for group-by-selector constraint configuration.
 * Groups elements based on a Forge selector expression.
 */
export const GroupBySelectorSelector: React.FC<GroupBySelectorSelectorProps> = (props: GroupBySelectorSelectorProps) => {
  const handleParamsChange = (event: any) => {
    const { name, value, type, checked } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: type === 'checkbox' ? checked : value,
      },
    });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={`${UNARY_SELECTOR_TEXT} or ${TUPLE_SELECTOR_TEXT}`}>
            Selector
          </span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          value={props.constraintData.params.selector as string || ''}
          onChange={handleParamsChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Group Name</span>
        </div>
        <input
          type="text"
          name="name"
          className="form-control"
          value={props.constraintData.params.name as string || ''}
          onChange={handleParamsChange}
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <div className="input-group-text">
            <input
              type="checkbox"
              name="addEdge"
              checked={props.constraintData.params.addEdge as boolean || false}
              onChange={handleParamsChange}
            />
          </div>
        </div>
        <div className="form-control-static" style={{ padding: '0.375rem 0.75rem', backgroundColor: '#f8f9fa' }}>
          Add Edge Between Groups
        </div>
      </div>
    </>
  );
};
