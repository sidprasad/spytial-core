import React, { useCallback } from 'react';
import { UNARY_SELECTOR_TEXT } from '../constants';
import { DirectiveData } from '../interfaces';
import { SelectorInput } from './SelectorInput';

interface ColorAtomSelectorProps {
  /** Directive data object containing type and parameters */
  directiveData: DirectiveData;
  /** Callback when directive data is updated */
  onUpdate: (updates: Partial<Omit<DirectiveData, 'id'>>) => void;
}

/**
 * Minimal React component for atom color directive.
 * Includes selector input and color picker.
 */
export const ColorAtomSelector: React.FC<ColorAtomSelectorProps> = (props: ColorAtomSelectorProps) => {
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    props.onUpdate({
      params: {
        ...props.directiveData.params,
        [name]: value
      }
    });
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
          value={props.directiveData.params.selector as string || ''}
          onChange={handleInputChange}
          required
          placeholder="e.g., Node"
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
          value={props.directiveData.params.value as string || '#000000'}
          onChange={handleInputChange}
          required
        />
      </div>
    </>
  );
};
