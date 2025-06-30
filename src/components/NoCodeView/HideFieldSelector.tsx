import React from 'react';

interface HideFieldSelectorProps {
  /** Field name */
  field?: string;
  /** Callback when field changes */
  onFieldChange?: (value: string) => void;
}

/**
 * Minimal React component for hide field directive.
 * Simple field input to specify which field to hide.
 */
export const HideFieldSelector: React.FC<HideFieldSelectorProps> = ({
  field = '',
  onFieldChange
}) => {
  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <span className="input-group-text">Field</span>
      </div>
      <input
        type="text"
        name="field"
        className="form-control"
        value={field}
        onChange={(e) => onFieldChange?.(e.target.value)}
        required
      />
    </div>
  );
};
