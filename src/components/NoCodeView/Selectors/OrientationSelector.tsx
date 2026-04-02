import React, { useCallback } from 'react';
import { TUPLE_SELECTOR_TEXT } from '../constants';
import { ConstraintData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

interface OrientationSelectorProps {
  /** Constraint data object containing type and parameters */
  constraintData: ConstraintData;
  /** Callback when constraint data is updated */
  onUpdate: (updates: Partial<Omit<ConstraintData, 'id'>>) => void;
}

/** Direction options grouped by type */
const RELATIVE_DIRECTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
];

const DIRECT_DIRECTIONS = [
  { value: 'directlyLeft', label: 'Directly Left' },
  { value: 'directlyRight', label: 'Directly Right' },
  { value: 'directlyAbove', label: 'Directly Above' },
  { value: 'directlyBelow', label: 'Directly Below' },
];

/**
 * Orientation/direction constraint configuration using pill toggle buttons.
 */
export const OrientationSelector: React.FC<OrientationSelectorProps> = (props: OrientationSelectorProps) => {
  const handleInputChange = (event: SelectorChangeEvent) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.constraintData.params,
        [name]: value
      }
    });
  };

  const handleDirectionToggle = useCallback((direction: string) => {
    const currentDirections = (props.constraintData.params.directions as string[]) || [];
    const isSelected = currentDirections.includes(direction);

    const newDirections = isSelected
      ? currentDirections.filter(d => d !== direction)
      : [...currentDirections, direction];

    props.onUpdate({
      params: {
        ...props.constraintData.params,
        directions: newDirections
      }
    });
  }, [props.constraintData.params, props.onUpdate]);

  const selectedDirections = (props.constraintData.params.directions as string[]) || [];

  return (
    <>
      <div className="field-group">
        <label className="field-label" title={TUPLE_SELECTOR_TEXT}>Selector</label>
        <SelectorInput
          name="selector"
          value={props.constraintData.params.selector as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="direction-pills">
        <div className="direction-pills__row">
          <span className="direction-pills__label">Relative</span>
          <div className="direction-pills__group">
            {RELATIVE_DIRECTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`direction-pill ${selectedDirections.includes(option.value) ? 'direction-pill--active' : ''}`}
                onClick={() => handleDirectionToggle(option.value)}
                title={`Toggle ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="direction-pills__row">
          <span className="direction-pills__label">Direct</span>
          <div className="direction-pills__group">
            {DIRECT_DIRECTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`direction-pill ${selectedDirections.includes(option.value) ? 'direction-pill--active' : ''}`}
                onClick={() => handleDirectionToggle(option.value)}
                title={`Toggle ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
