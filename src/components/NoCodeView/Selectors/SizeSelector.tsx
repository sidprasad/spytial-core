import React from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';

interface SizeSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for size directive.
 * Includes selector input and width/height number inputs.
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  directiveData,
  onUpdate
}) => {
  const selector = (directiveData.params.selector as string) || '';
  const width = (directiveData.params.width as number) || 10;
  const height = (directiveData.params.height as number) || 10;

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
          className="form-control code-input"
          defaultValue={selector}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, selector: e.target.value } })}
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
          defaultValue={width}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, width: Number(e.target.value) } })}
          required
        />
        <label>
          <span className="input-group-text">Height</span>
        </label>
        <input
          type="number"
          name="height"
          className="form-control"
          defaultValue={height}
          onChange={(e) => onUpdate({ params: { ...directiveData.params, height: Number(e.target.value) } })}
          required
        />
      </div>
    </>
  );
};
