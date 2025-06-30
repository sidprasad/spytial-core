import React from 'react';
import { UNARY_SELECTOR_TEXT, TUPLE_SELECTOR_TEXT } from './constants';

interface GroupBySelectorSelectorProps {
  /** Selector expression */
  selector?: string;
  /** Group name */
  name?: string;
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when name changes */
  onNameChange?: (value: string) => void;
}

/**
 * Minimal React component for group-by-selector constraint configuration.
 * Groups elements based on a Forge selector expression.
 */
export const GroupBySelectorSelector: React.FC<GroupBySelectorSelectorProps> = ({
  selector = '',
  name = '',
  onSelectorChange,
  onNameChange
}) => {
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
          value={selector}
          onChange={(e) => onSelectorChange?.(e.target.value)}
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
          value={name}
          onChange={(e) => onNameChange?.(e.target.value)}
          required
        />
      </div>
    </>
  );
};
