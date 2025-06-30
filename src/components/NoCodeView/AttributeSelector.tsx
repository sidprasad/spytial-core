import React from 'react';

interface AttributeSelectorProps {
  /** Field name */
  field?: string;
  /** Callback when field changes */
  onFieldChange?: (value: string) => void;
}

/**
 * Minimal React component for attribute field selection.
 * Simple field input for attribute directives.
 */
export const AttributeSelector: React.FC<AttributeSelectorProps> = ({
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
