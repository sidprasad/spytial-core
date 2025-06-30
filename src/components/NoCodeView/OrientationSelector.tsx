import React from 'react';
import { TUPLE_SELECTOR_TEXT } from './constants';

interface OrientationSelectorProps {
  /** Selector value */
  selector?: string;
  /** Selected directions */
  directions?: string[];
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when directions change */
  onDirectionsChange?: (values: string[]) => void;
}

/**
 * Minimal React component for orientation/direction constraint configuration.
 * Includes selector input and multi-select direction dropdown.
 */
export const OrientationSelector: React.FC<OrientationSelectorProps> = ({
  selector = '',
  directions = [],
  onSelectorChange,
  onDirectionsChange
}) => {
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
          value={selector}
          onChange={(e) => onSelectorChange?.(e.target.value)}
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
          value={directions}
          onChange={(e) => {
            const selectedValues = Array.from(e.target.selectedOptions, option => option.value);
            onDirectionsChange?.(selectedValues);
          }}
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
