import React, { useCallback } from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';

interface OrientationSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/**
 * Minimal React component for orientation/direction constraint configuration.
 * Includes selector input and multi-select direction dropdown.
 */
export const OrientationSelector: React.FC<OrientationSelectorProps> = (props: OrientationSelectorProps) => {
  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: value
      }
    });
  }, [props.onUpdate]);

  const handleSelectChange = useCallback((event) => {
    const { name } = event.target;
    const selectedValues = Array.from(event.target.selectedOptions, (option) => option.value);
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: selectedValues
      }
    });
  }, [props.onUpdate, props.constraintData.params]);

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
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
          <span className="input-group-text">Directions</span>
        </div>
        <select
          name="directions"
          className="form-control"
          multiple
          defaultValue={(props.constraintData.params.directions as string[]) || []}
          onChange={handleSelectChange}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="above">Above</option>
          <option value="below">Below</option>
          <option value="directlyLeft">Directly Left</option>
          <option value="directlyRight">Directly Right</option>
          <option value="directlyAbove">Directly Above</option>
          <option value="directlyBelow">Directly Below</option>
        </select>
      </div>
    </>
  );
};
