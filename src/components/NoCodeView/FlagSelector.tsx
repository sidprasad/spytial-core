import React from 'react';

interface FlagSelectorProps {
  /** Flag value */
  flag?: string;
  /** Callback when flag changes */
  onFlagChange?: (value: string) => void;
}

/**
 * Minimal React component for visibility flag directive.
 * Dropdown for predefined visibility flag options.
 */
export const FlagSelector: React.FC<FlagSelectorProps> = ({
  flag = '',
  onFlagChange
}) => {
  return (
    <div className="input-group">
      <select
        name="flag"
        className="form-control"
        value={flag}
        onChange={(e) => onFlagChange?.(e.target.value)}
      >
        <option value="">Select flag...</option>
        <option value="hideDisconnectedBuiltIns">Hide disconnected built ins.</option>
        <option value="hideDisconnected">Hide all disconnected.</option>
      </select>
    </div>
  );
};
