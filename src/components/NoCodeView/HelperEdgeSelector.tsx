import React from 'react';
import { TUPLE_SELECTOR_TEXT } from './constants';

interface HelperEdgeSelectorProps {
  /** Selector expression */
  selector?: string;
  /** Edge name */
  name?: string;
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when name changes */
  onNameChange?: (value: string) => void;
}

/**
 * Minimal React component for helper/inferred edge directive.
 * Includes selector input and edge name field.
 */
export const HelperEdgeSelector: React.FC<HelperEdgeSelectorProps> = ({
  selector = '',
  name = '',
  onSelectorChange,
  onNameChange
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
          <span className="input-group-text">Edge Name</span>
        </div>
        <input
          type="text"
          name="name"
          className="form-control"
          value={name}
          onChange={(e) => onNameChange?.(e.target.value)}
          required
        />
      </div>
    </>
  );
};
