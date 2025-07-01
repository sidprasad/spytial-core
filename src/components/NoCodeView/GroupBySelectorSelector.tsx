import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT, TUPLE_SELECTOR_TEXT } from './constants';
import { ConstraintData } from './interfaces';

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
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: value,
      },
    });
  }, [props.onUpdate, props.constraintData]);

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
          className="form-control"
          defaultValue={props.constraintData.params.selector as string || ''}
          onChange={handleInputChange}
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
          defaultValue={props.constraintData.params.name as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
    </>
  );
};
