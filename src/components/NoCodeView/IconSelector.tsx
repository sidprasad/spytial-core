import React from 'react';
import { UNARY_SELECTOR_TEXT } from './constants';
import { DirectiveData } from './interfaces';

interface IconSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for icon directive.
 * Includes selector, path input, and show labels checkbox.
 */
export const IconSelector: React.FC<IconSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const selector = (directiveData.params.selector as string) || '';
  const path = (directiveData.params.path as string) || '';
  const showLabels = (directiveData.params.showLabels as boolean) || false;
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
          onChange={(e) => onUpdate({ params: { ...directiveData.params, selector: e.target.value } })}
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
          onChange={(e) => onUpdate({ params: { ...directiveData.params, path: e.target.value } })}
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
            onChange={(e) => onUpdate({ params: { ...directiveData.params, showLabels: e.target.checked } })}
          />
        </div>
      </div>
    </>
  );
};
