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

/** Direction options with display labels and grouping */
const DIRECTION_OPTIONS = [
  { value: 'left', label: 'Left', group: 'relative' },
  { value: 'right', label: 'Right', group: 'relative' },
  { value: 'above', label: 'Above', group: 'relative' },
  { value: 'below', label: 'Below', group: 'relative' },
  { value: 'directlyLeft', label: 'Directly Left', group: 'direct' },
  { value: 'directlyRight', label: 'Directly Right', group: 'direct' },
  { value: 'directlyAbove', label: 'Directly Above', group: 'direct' },
  { value: 'directlyBelow', label: 'Directly Below', group: 'direct' },
];

/**
 * Minimal React component for orientation/direction constraint configuration.
 * Uses a checkbox grid for direction selection instead of a multi-select dropdown.
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
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={TUPLE_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <SelectorInput
          name="selector"
          value={props.constraintData.params.selector as string || ''}
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="direction-selector">
        <label className="direction-selector__label">Directions</label>
        <div className="direction-selector__grid">
          {DIRECTION_OPTIONS.map((option) => (
            <label 
              key={option.value} 
              className={`direction-selector__option ${selectedDirections.includes(option.value) ? 'direction-selector__option--selected' : ''}`}
              title={`Toggle ${option.label}`}
            >
              <input
                type="checkbox"
                checked={selectedDirections.includes(option.value)}
                onChange={() => handleDirectionToggle(option.value)}
                className="direction-selector__checkbox"
              />
              <span className="direction-selector__text">{option.label}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
};
