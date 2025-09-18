import React from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';

interface GroupsSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * React component for groups constraint configuration.
 * Creates multiple groups based on binary selectors where each unique value 
 * from the first element becomes a separate group containing the second elements.
 */
export const GroupsSelector: React.FC<GroupsSelectorProps> = (props: GroupsSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: value,
      },
    });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={`${TUPLE_SELECTOR_TEXT} - Creates multiple groups based on binary selector`}>
            Selector
          </span>
        </div>
        <input
          type="text"
          name="selector"
          className="form-control code-input"
          defaultValue={props.constraintData.params.selector as string || ''}
          onChange={handleInputChange}
          placeholder="e.g., Person->Car"
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Base Name</span>
        </div>
        <input
          type="text"
          name="name"
          className="form-control"
          defaultValue={props.constraintData.params.name as string || ''}
          onChange={handleInputChange}
          placeholder="e.g., ownership (becomes ownership[key])"
          required
        />
      </div>
    </>
  );
};