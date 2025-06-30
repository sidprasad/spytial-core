import React from 'react';
import { UNARY_SELECTOR_TEXT } from './constants';

interface SizeSelectorProps {
  /** Selector expression */
  selector?: string;
  /** Width value */
  width?: number;
  /** Height value */
  height?: number;
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when width changes */
  onWidthChange?: (value: number) => void;
  /** Callback when height changes */
  onHeightChange?: (value: number) => void;
}

/**
 * Minimal React component for size directive.
 * Includes selector input and width/height number inputs.
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  selector = '',
  width = 10,
  height = 10,
  onSelectorChange,
  onWidthChange,
  onHeightChange
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
        <label>
          <span className="input-group-text">Width</span>
        </label>
        <input
          type="number"
          name="width"
          className="form-control"
          value={width}
          onChange={(e) => onWidthChange?.(Number(e.target.value))}
          required
        />
        <label>
          <span className="input-group-text">Height</span>
        </label>
        <input
          type="number"
          name="height"
          className="form-control"
          value={height}
          onChange={(e) => onHeightChange?.(Number(e.target.value))}
          required
        />
      </div>
    </>
  );
};
