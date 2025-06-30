import React from 'react';
import { UNARY_SELECTOR_TEXT } from './constants';

interface IconSelectorProps {
  /** Selector expression */
  selector?: string;
  /** Icon path */
  path?: string;
  /** Show labels flag */
  showLabels?: boolean;
  /** Callback when selector changes */
  onSelectorChange?: (value: string) => void;
  /** Callback when path changes */
  onPathChange?: (value: string) => void;
  /** Callback when showLabels changes */
  onShowLabelsChange?: (value: boolean) => void;
}

/**
 * Minimal React component for icon directive.
 * Includes selector, path input, and show labels checkbox.
 */
export const IconSelector: React.FC<IconSelectorProps> = ({
  selector = '',
  path = '',
  showLabels = false,
  onSelectorChange,
  onPathChange,
  onShowLabelsChange
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
          <span className="input-group-text">Path</span>
        </div>
        <input
          type="text"
          name="path"
          className="form-control"
          value={path}
          onChange={(e) => onPathChange?.(e.target.value)}
          placeholder="/path/to/icon.png"
          required
        />
      </div>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text">Show Labels</span>
        </div>
        <div className="form-check ml-3">
          <input
            className="form-check-input"
            type="checkbox"
            name="showLabels"
            checked={showLabels}
            onChange={(e) => onShowLabelsChange?.(e.target.checked)}
          />
        </div>
      </div>
    </>
  );
};
