import React from 'react';

interface ColorEdgeSelectorProps {
  /** Field name */
  field?: string;
  /** Color value */
  value?: string;
  /** Callback when field changes */
  onFieldChange?: (value: string) => void;
  /** Callback when color value changes */
  onValueChange?: (value: string) => void;
}

/**
 * Minimal React component for edge color directive.
 * Includes field input and color picker.
 */
export const ColorEdgeSelector: React.FC<ColorEdgeSelectorProps> = ({
  field = '',
  value = '#000000',
  onFieldChange,
  onValueChange
}) => {
  return (
    <>
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
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Color</span>
        </div>
        <input
          type="color"
          name="value"
          className="form-control"
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          required
        />
      </div>
    </>
  );
};
