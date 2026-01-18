import React from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput, SelectorChangeEvent } from './SelectorInput';

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

  const handleSelectorChange = (event: SelectorChangeEvent) => {
    onUpdate({ params: { ...directiveData.params, selector: event.target.value } });
  };

  return (
    <>
      <div className="input-group">
        <div className="input-group-prepend">
          <span className="input-group-text infolabel" title={UNARY_SELECTOR_TEXT}>
            Selector
          </span>
        </div>
        <SelectorInput
          name="selector"
          value={selector}
          onChange={handleSelectorChange}
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
          defaultValue={path}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, path: e.target.value } })}
          placeholder="/path/to/icon.png"
          required
        />
      </div>
      <label className="inline-checkbox">
        <input
          type="checkbox"
          name="showLabels"
          defaultChecked={showLabels}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, showLabels: e.target.checked } })}
        />
        <span>Show Labels</span>
      </label>
    </>
  );
};
