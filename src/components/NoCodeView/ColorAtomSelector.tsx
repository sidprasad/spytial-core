import React from 'react';
import { UNARY_SELECTOR_TEXT } from './constants';

interface ColorAtomSelectorProps {
  /** Selector expression */
  selector?: string;
  /** Color value */
  value?: string;
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when color value changes */
  onValueChange?: (value: string) => void;
}

/**
 * Minimal React component for atom color directive.
 * Includes selector input and color picker.
 */
export const ColorAtomSelector: React.FC<ColorAtomSelectorProps> = ({
  selector = '',
  value = '#000000',
  onSelectorChange,
  onValueChange
}) => {
  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
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
